import * as assert from "node:assert/strict";
import { test } from "vitest";

import { publishNpmPackage } from "../gha/publish-npm";
import { runAction, type Command } from "./script";

test("publish npm package advances latest while latest is prerelease", async () => {
	const commands = await runPublishAction({
		packageJson: { name: "@dedalus-labs/hollywood", version: "0.0.1-alpha.1" },
		latestVersion: "0.0.1-alpha.0",
		dryRun: true,
	});

	assert.deepEqual(commands, [
		{
			file: "npm",
			args: ["view", "@dedalus-labs/hollywood", "version", "--json"],
			exitPolicy: "any",
		},
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

test("publish npm package keeps prereleases off latest after stable", async () => {
	const commands = await runPublishAction({
		packageJson: { name: "@dedalus-labs/hollywood", version: "1.1.0-alpha.0" },
		latestVersion: "1.0.0",
		dryRun: false,
	});

	assert.equal(commands[1]?.file, "npm");
	assert.deepEqual(commands[1]?.args, [
		"publish",
		"--access",
		"public",
		"--tag",
		"alpha",
		"--provenance",
	]);
	assert.equal(commands.length, 2);
});

test("publish npm package seeds prerelease tag on first prerelease publish", async () => {
	const commands = await runPublishAction({
		packageJson: { name: "@dedalus-labs/hollywood", version: "0.0.1-alpha.0" },
		latestVersion: undefined,
		dryRun: false,
	});

	assert.deepEqual(commands.map((command) => command.args), [
		["view", "@dedalus-labs/hollywood", "version", "--json"],
		["publish", "--access", "public", "--tag", "latest", "--provenance"],
		["dist-tag", "add", "@dedalus-labs/hollywood@0.0.1-alpha.0", "alpha"],
	]);
});

const runPublishAction = async (options: {
	packageJson: unknown;
	latestVersion: string | undefined;
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
			if (args[0] === "view") {
				if (options.latestVersion === undefined) {
					return { exitCode: 1, stdout: "", stderr: "npm error code E404" };
				}
				return { exitCode: 0, stdout: JSON.stringify(options.latestVersion), stderr: "" };
			}
			return { exitCode: 0, stdout: "", stderr: "" };
		},
		runner: { uidGid: "1000:1000" },
	});

	return commands;
};
