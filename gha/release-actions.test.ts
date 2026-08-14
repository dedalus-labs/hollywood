import assert from "node:assert/strict";
import { test } from "vitest";

import { currentRunner, runAction } from "../src/index";
import { detectReleaseComponents } from "./release-actions";

const before = "0123456789abcdef0123456789abcdef01234567";
const currentRevision = "89abcdef0123456789abcdef0123456789abcdef";
const current = (hollywood: string, runner: string): string =>
	JSON.stringify({ ".": hollywood, runner });
const releaseFiles = (
	hollywood: string,
	runner: string,
	manifest = current(hollywood, runner),
) => ({
	readText: async (path: string): Promise<string> => {
		switch (path) {
			case ".release-please-manifest.json":
				return manifest;
			case "package.json":
				return JSON.stringify({ version: hollywood });
			case "runner/version.txt":
				return `${runner}\n`;
			default:
				throw new Error(`unexpected file: ${path}`);
		}
	},
});

test("release component detection reports the npm package independently", async () => {
	const outputs = await runAction(detectReleaseComponents, {
		with: { before, current: currentRevision },
		exec: async (file, args) => {
			assert.equal(file, "git");
			assert.deepEqual(args, ["show", `${before}:.release-please-manifest.json`]);
			return { exitCode: 0, stderr: "", stdout: current("0.0.2", "0.0.0") };
		},
		fs: releaseFiles("0.0.3", "0.0.0"),
		runner: currentRunner(),
	});

	assert.deepEqual(outputs, { hollywood: "true", runner: "false" });
});

test("release component detection reports the runner independently", async () => {
	const outputs = await runAction(detectReleaseComponents, {
		with: { before, current: currentRevision },
		exec: async () => ({
			exitCode: 0,
			stderr: "",
			stdout: current("0.0.2", "0.0.0"),
		}),
		fs: releaseFiles("0.0.2", "0.0.1"),
		runner: currentRunner(),
	});

	assert.deepEqual(outputs, { hollywood: "false", runner: "true" });
});

test("release component detection bootstraps the first runner release", async () => {
	const outputs = await runAction(detectReleaseComponents, {
		with: { before, current: currentRevision },
		exec: async () => ({
			exitCode: 0,
			stderr: "",
			stdout: JSON.stringify({ ".": "0.0.2" }),
		}),
		fs: releaseFiles("0.0.2", "0.0.1"),
		runner: currentRunner(),
	});

	assert.deepEqual(outputs, { hollywood: "false", runner: "true" });
});

test("manual release detection resolves the current commit parent", async () => {
	const commands: Array<readonly [string, readonly string[]]> = [];
	const outputs = await runAction(detectReleaseComponents, {
		with: { current: currentRevision },
		exec: async (file, args) => {
			commands.push([file, args]);
			if (args[0] === "rev-parse") {
				return { exitCode: 0, stderr: "", stdout: `${before}\n` };
			}
			return { exitCode: 0, stderr: "", stdout: current("0.0.2", "0.0.0") };
		},
		fs: releaseFiles("0.0.2", "0.0.1"),
		runner: currentRunner(),
	});

	assert.deepEqual(commands, [
		["git", ["rev-parse", `${currentRevision}^`]],
		["git", ["show", `${before}:.release-please-manifest.json`]],
	]);
	assert.deepEqual(outputs, { hollywood: "false", runner: "true" });
});

test("release component detection rejects unrelated manifest rewrites", async () => {
	await assert.rejects(
		runAction(detectReleaseComponents, {
			with: { before, current: currentRevision },
			exec: async () => ({
				exitCode: 0,
				stderr: "",
				stdout: current("0.0.2", "0.0.0"),
			}),
			fs: releaseFiles("0.0.2", "0.0.0"),
			runner: currentRunner(),
		}),
		/Release manifest changed without changing a configured component version/,
	);
});

test("release component detection requires the complete manifest schema", async () => {
	await assert.rejects(
		runAction(detectReleaseComponents, {
			with: { before, current: currentRevision },
			exec: async () => ({
				exitCode: 0,
				stderr: "",
				stdout: current("0.0.2", "0.0.0"),
			}),
			fs: releaseFiles("0.0.3", "0.0.0", JSON.stringify({ ".": "0.0.3" })),
			runner: currentRunner(),
		}),
		/Release manifest must contain exactly '\.' and 'runner'/,
	);
});

test.each([
	{
		hollywood: "0.0.4",
		manifest: current("0.0.3", "0.0.1"),
		message: /package\.json version 0\.0\.4 does not match release manifest version 0\.0\.3/,
		runner: "0.0.1",
	},
	{
		hollywood: "0.0.3",
		manifest: current("0.0.3", "0.0.1"),
		message: /runner\/version\.txt version 0\.0\.2 does not match release manifest version 0\.0\.1/,
		runner: "0.0.2",
	},
])("release component detection rejects a mismatched version source", async (example) => {
	await assert.rejects(
		runAction(detectReleaseComponents, {
			with: { before, current: currentRevision },
			exec: async () => ({
				exitCode: 0,
				stderr: "",
				stdout: current("0.0.2", "0.0.0"),
			}),
			fs: releaseFiles(example.hollywood, example.runner, example.manifest),
			runner: currentRunner(),
		}),
		example.message,
	);
});
