import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import {
	buildLocalActionsCommand,
	createGitHubAppTokenAction,
	releasePleaseAction,
} from "./actions";
import { publishNpm } from "./publish-npm";
import { release } from "./release";

test("release please opens version pull requests without creating tags", () => {
	const releasePlease = release.jobs["release-please"];
	assert.ok("steps" in releasePlease);
	const step = releasePlease.steps.find(({ id }) => id === "release");

	assert.ok(step?.with !== undefined && "skip-github-release" in step.with);
	assert.equal(step.with["skip-github-release"], "true");
});

test("GitHub release finalization waits for applicable publication jobs", () => {
	assert.deepEqual(publishNpm.on.push, {
		branches: ["main"],
		paths: [".release-please-manifest.json"],
	});
	assert.deepEqual(publishNpm.jobs.release?.needs, ["detect", "publish"]);
	assert.equal(
		publishNpm.jobs.release?.if,
		"${{ always() && github.repository == 'dedalus-labs/hollywood' && needs.detect.result == 'success' && (needs.publish.result == 'success' || needs.publish.result == 'skipped') }}",
	);
});

test("release publication selects components from typed action outputs", () => {
	const detect = publishNpm.jobs.detect;
	assert.ok(detect !== undefined && "steps" in detect);
	const checkout = detect.steps[0];
	assert.ok(checkout !== undefined && "with" in checkout);
	assert.equal(checkout.with?.["fetch-depth"], 0);
	assert.deepEqual(detect.outputs, {
		hollywood: "${{ steps.components.outputs.hollywood }}",
		runner: "${{ steps.components.outputs.runner }}",
	});
	const components = detect.steps.find((step) => "id" in step && step.id === "components");
	assert.deepEqual(components, {
		id: "components",
		name: "Detect components",
		uses: "./.github/actions/detect-release-components",
		with: {
			before: "${{ github.event.before }}",
			current: "${{ github.sha }}",
		},
	});

	const publish = publishNpm.jobs.publish;
	assert.equal(publish.needs, "detect");
	assert.equal(
		publish.if,
		"${{ github.repository == 'dedalus-labs/hollywood' && needs.detect.outputs.hollywood == 'true' }}",
	);
});

test("release please owns independent npm and runner versions", async () => {
	const config = JSON.parse(await readFile("release-please-config.json", "utf8")) as Record<
		string,
		unknown
	>;
	const manifest = JSON.parse(
		await readFile(".release-please-manifest.json", "utf8"),
	) as Record<string, unknown>;

	assert.equal(config["separate-pull-requests"], true);
	assert.deepEqual(config["packages"], {
		".": { "exclude-paths": ["runner"] },
		runner: {
			component: "runner",
			"include-component-in-tag": true,
			"pull-request-title-pattern": "release(runner): ${version}",
			"release-type": "simple",
		},
	});

	const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
		version?: unknown;
	};
	const hollywoodVersion = packageJson.version;
	const runnerVersion = (await readFile("runner/version.txt", "utf8")).trim();
	assert.ok(typeof hollywoodVersion === "string");
	assert.match(hollywoodVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
	assert.match(runnerVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
	assert.deepEqual(manifest, { ".": hollywoodVersion, runner: runnerVersion });

	for (const [path, version] of [
		["CHANGELOG.md", hollywoodVersion],
		["runner/CHANGELOG.md", runnerVersion],
	] as const) {
		assert.ok((await readFile(path, "utf8")).includes(`## [${version}]`));
	}
});

test("failed npm releases can be retried from current main", () => {
	assert.deepEqual(publishNpm.on.workflow_dispatch, {});
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
		(step) => "run" in step && step.run === buildLocalActionsCommand,
	);
	const localActionIndex = publish.steps.findIndex(
		(step) => "uses" in step && step.uses.startsWith("./.github/actions/"),
	);

	assert.ok(buildIndex >= 0);
	assert.ok(localActionIndex > buildIndex);
});
