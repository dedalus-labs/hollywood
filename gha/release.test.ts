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
