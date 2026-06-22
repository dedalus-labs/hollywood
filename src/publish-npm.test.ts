import * as assert from "node:assert/strict";
import { test } from "vitest";

import { publishNpmPackage } from "../gha/publish-npm";
import { runAction, type Command } from "./script";

test("publish npm package tags stable releases as latest", async () => {
	const commands = await runPublishAction({
		packageJson: { name: "@dedalus-labs/hollywood", version: "0.0.1" },
		dryRun: true,
	});

	assert.deepEqual(commands, [
		{
			file: "npm",
			args: [
				"publish",
				"--access",
				"public",
				"--tag",
				"latest",
				"--provenance",
				"--dry-run",
			],
		},
	]);
});

test("publish npm package tags prereleases by prerelease identifier", async () => {
	const commands = await runPublishAction({
		packageJson: { name: "@dedalus-labs/hollywood", version: "1.1.0-alpha.0" },
		dryRun: false,
	});

	assert.equal(commands[0]?.file, "npm");
	assert.deepEqual(commands[0]?.args, [
		"publish",
		"--access",
		"public",
		"--tag",
		"alpha",
		"--provenance",
	]);
	assert.equal(commands.length, 1);
});

test("publish npm package rejects invalid versions before publishing", async () => {
	await assert.rejects(
		runPublishAction({
			packageJson: { name: "@dedalus-labs/hollywood", version: "banana" },
			dryRun: false,
		}),
		/package\.json version must be semver: banana/,
	);
});

test("publish npm package rejects numeric prerelease tags", async () => {
	await assert.rejects(
		runPublishAction({
			packageJson: { name: "@dedalus-labs/hollywood", version: "1.0.0-0" },
			dryRun: false,
		}),
		/npm prerelease dist-tag must not be numeric: 0/,
	);
});

test("publish npm package avoids dist-tag mutation", async () => {
	const commands = await runPublishAction({
		packageJson: { name: "@dedalus-labs/hollywood", version: "0.0.1-alpha.0" },
		dryRun: false,
	});

	assert.deepEqual(commands.map((command) => command.args), [
		["publish", "--access", "public", "--tag", "alpha", "--provenance"],
	]);
});

const runPublishAction = async (options: {
	packageJson: unknown;
	dryRun: boolean;
}): Promise<Command[]> => {
	const commands: Command[] = [];

	await runAction(publishNpmPackage, {
		with: {
			dryRun: options.dryRun ? "true" : "false",
		},
		fs: {
			readText: async () => JSON.stringify(options.packageJson),
		},
		exec: async (file, args, commandOptions) => {
			const command = { file, args, ...commandOptions };
			commands.push(command);
			return { exitCode: 0, stdout: "", stderr: "" };
		},
		runner: { uidGid: "1000:1000" },
	});

	return commands;
};
