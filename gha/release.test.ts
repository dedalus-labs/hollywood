import assert from "node:assert/strict";
import { test } from "vitest";

import { runAction, type Command } from "../src/index";
import { createGitHubRelease, publishNpm } from "./publish-npm";
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

test("publishing delegates to typed local actions", () => {
	const publish = publishNpm.jobs.publish;
	const releaseJob = publishNpm.jobs.release;
	assert.ok("steps" in publish);
	assert.ok(releaseJob !== undefined && "steps" in releaseJob);

	assert.deepEqual(publish.steps.at(-1), {
		name: "Publish to npm",
		uses: "./.github/actions/publish-npm",
	});
	assert.deepEqual(releaseJob.steps.at(-1), {
		name: "Create GitHub release",
		uses: "./.github/actions/create-github-release",
		with: {
			repository: "${{ github.repository }}",
			target: "${{ github.sha }}",
			token: "${{ steps.cind-token.outputs.token }}",
		},
	});
});

test("workflows bundle local actions before invoking them", () => {
	for (const job of [publishNpm.jobs.publish, publishNpm.jobs.release]) {
		assert.ok(job !== undefined && "steps" in job);
		const buildIndex = job.steps.findIndex(
			(step) => "run" in step && step.run === "npm run actions",
		);
		const localActionIndex = job.steps.findIndex(
			(step) => "uses" in step && step.uses.startsWith("./.github/actions/"),
		);

		assert.ok(buildIndex >= 0);
		assert.ok(localActionIndex > buildIndex);
	}
});

test("GitHub release creation tags the published package commit", async () => {
	const commands: Command[] = [];
	await runAction(createGitHubRelease, {
		with: {
			repository: "dedalus-labs/hollywood",
			target: "abc123",
			token: "secret",
		},
		fs: { readText: async () => JSON.stringify({ version: "0.0.1" }) },
		exec: async (file, args, options) => {
			commands.push({ file, args, ...options });
			return { exitCode: 0, stdout: "", stderr: "" };
		},
		runner: { uidGid: "1000:1000" },
	});

	assert.deepEqual(commands, [
		{
			file: "gh",
			args: [
				"release",
				"create",
				"v0.0.1",
				"--repo",
				"dedalus-labs/hollywood",
				"--target",
				"abc123",
				"--title",
				"v0.0.1",
				"--generate-notes",
			],
			env: { GH_TOKEN: "secret" },
		},
	]);
});
