import assert from "node:assert/strict";
import { test } from "vitest";

import { createGitHubAppTokenAction, releasePleaseAction } from "./actions";
import { publishNpm } from "./publish-npm";
import { release } from "./release";

test("release please opens version pull requests without creating tags", () => {
	const releasePlease = release.jobs["release-please"];
	assert.ok("steps" in releasePlease);
	const step = releasePlease.steps.find(({ id }) => id === "release");

	assert.ok(step?.with !== undefined && "skip-github-release" in step.with);
	assert.equal(step.with["skip-github-release"], "true");
});

test("GitHub releases require a successful npm publish", () => {
	assert.deepEqual(publishNpm.on, {
		push: { branches: ["main"], paths: [".release-please-manifest.json"] },
	});
	assert.equal(publishNpm.jobs.release?.needs, "publish");
});

test("release please finalizes the published package lifecycle", () => {
	const releaseJob = publishNpm.jobs.release;
	assert.ok(releaseJob !== undefined && "steps" in releaseJob);
	const token = releaseJob.steps.find(({ id }) => id === "cind-token");

	assert.deepEqual(token, {
		id: "cind-token",
		name: "Create Cind app token",
		uses: createGitHubAppTokenAction,
		with: {
			"client-id": "${{ secrets.CIND_BOT_CLIENT_ID }}",
			"private-key": "${{ secrets.CIND_BOT_APP_PRIVATE_KEY }}",
			owner: "${{ github.repository_owner }}",
			repositories: "hollywood",
			"permission-contents": "write",
			"permission-issues": "write",
			"permission-metadata": "read",
			"permission-pull-requests": "write",
		},
	});

	assert.deepEqual(releaseJob.steps.at(-1), {
		id: "release",
		name: "Finalize release",
		uses: releasePleaseAction,
		with: {
			token: "${{ steps.cind-token.outputs.token }}",
			"config-file": "release-please-config.json",
			"manifest-file": ".release-please-manifest.json",
			"skip-github-pull-request": "true",
		},
	});
});

test("publishing delegates to typed local actions", () => {
	const publish = publishNpm.jobs.publish;
	assert.ok("steps" in publish);

	assert.deepEqual(publish.steps.at(-1), {
		name: "Publish to npm",
		uses: "./.github/actions/publish-npm",
	});
});

test("publishing bundles its local action before invoking it", () => {
	const publish = publishNpm.jobs.publish;
	assert.ok("steps" in publish);
	const buildIndex = publish.steps.findIndex(
		(step) => "run" in step && step.run === "npm run actions",
	);
	const localActionIndex = publish.steps.findIndex(
		(step) => "uses" in step && step.uses.startsWith("./.github/actions/"),
	);

	assert.ok(buildIndex >= 0);
	assert.ok(localActionIndex > buildIndex);
});
