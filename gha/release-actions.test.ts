import assert from "node:assert/strict";
import { test } from "vitest";

import { currentRunner, runAction } from "../src/index";
import { detectReleaseComponents, publishDraftReleases } from "./release-actions";

const before = "0123456789abcdef0123456789abcdef01234567";
const currentRevision = "89abcdef0123456789abcdef0123456789abcdef";
const current = (hollywood: string, runner: string): string =>
	JSON.stringify({ ".": hollywood, runner });
const unreleased = (hollywood: string): string => JSON.stringify({ ".": hollywood });
const releaseFiles = (
	hollywood: string,
	runner?: string,
	manifest = runner === undefined ? unreleased(hollywood) : current(hollywood, runner),
) => ({
	readText: async (path: string): Promise<string> => {
		switch (path) {
			case ".release-please-manifest.json":
				return manifest;
			case "package.json":
				return JSON.stringify({ version: hollywood });
			case "runner/version.txt":
				if (runner === undefined) {
					throw new Error("runner/version.txt does not exist");
				}
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
			return { exitCode: 0, stderr: "", stdout: unreleased("0.0.2") };
		},
		fs: releaseFiles("0.0.3"),
		runner: currentRunner(),
	});

	assert.deepEqual(outputs, {
		hollywood: "true",
		hollywoodTag: "v0.0.3",
		runner: "false",
		runnerTag: "",
	});
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

	assert.deepEqual(outputs, {
		hollywood: "false",
		hollywoodTag: "",
		runner: "true",
		runnerTag: "runner-v0.0.1",
	});
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

	assert.deepEqual(outputs, {
		hollywood: "false",
		hollywoodTag: "",
		runner: "true",
		runnerTag: "runner-v0.0.1",
	});
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
	assert.deepEqual(outputs, {
		hollywood: "false",
		hollywoodTag: "",
		runner: "true",
		runnerTag: "runner-v0.0.1",
	});
});

test("draft release publication validates and publishes each component", async () => {
	const commands: Array<readonly [string, readonly string[]]> = [];
	const releases = new Map([
		["v0.0.4", { draft: true, id: 41, immutable: false, tag_name: "v0.0.4" }],
		[
			"runner-v0.0.1",
			{ draft: true, id: 42, immutable: false, tag_name: "runner-v0.0.1" },
		],
	]);

	await runAction(publishDraftReleases, {
		with: {
			hollywoodTag: "v0.0.4",
			repository: "dedalus-labs/hollywood",
			runnerTag: "runner-v0.0.1",
			token: "token",
		},
		exec: async (file, args, options) => {
			commands.push([file, args]);
			assert.deepEqual(options, { env: { GH_TOKEN: "token" } });
			if (args.includes("PATCH")) {
				const id = Number(args[1]?.split("/").at(-1));
				const release = [...releases.values()].find((candidate) => candidate.id === id);
				assert.ok(release !== undefined);
				return {
					exitCode: 0,
					stderr: "",
					stdout: JSON.stringify({ ...release, draft: false, immutable: true }),
				};
			}
			return {
				exitCode: 0,
				stderr: "",
				stdout: JSON.stringify([[...releases.values()]]),
			};
		},
		fs: releaseFiles("0.0.4", "0.0.1"),
		runner: currentRunner(),
	});

	assert.deepEqual(commands, [
		[
			"gh",
			[
				"api",
				"--paginate",
				"--slurp",
				"repos/dedalus-labs/hollywood/releases?per_page=100",
			],
		],
		[
			"gh",
			[
				"api",
				"repos/dedalus-labs/hollywood/releases/41",
				"--method",
				"PATCH",
				"-F",
				"draft=false",
			],
		],
		[
			"gh",
			[
				"api",
				"repos/dedalus-labs/hollywood/releases/42",
				"--method",
				"PATCH",
				"-F",
				"draft=false",
			],
		],
	]);
});

test("draft release publication accepts an existing immutable release", async () => {
	let calls = 0;
	await runAction(publishDraftReleases, {
		with: {
			hollywoodTag: "",
			repository: "dedalus-labs/hollywood",
			runnerTag: "runner-v0.0.1",
			token: "token",
		},
		exec: async () => {
			calls += 1;
			return {
				exitCode: 0,
				stderr: "",
			stdout: JSON.stringify([
				[
					{
						draft: false,
						id: 42,
						immutable: true,
						tag_name: "runner-v0.0.1",
					},
				],
			]),
			};
		},
		fs: releaseFiles("0.0.4", "0.0.1"),
		runner: currentRunner(),
	});

	assert.equal(calls, 1);
});

test("draft release publication rejects a mutable published release", async () => {
	await assert.rejects(
		runAction(publishDraftReleases, {
			with: {
				hollywoodTag: "v0.0.4",
				repository: "dedalus-labs/hollywood",
				runnerTag: "",
				token: "token",
			},
			exec: async () => ({
				exitCode: 0,
				stderr: "",
				stdout: JSON.stringify([
					[
						{
							draft: false,
							id: 41,
							immutable: false,
							tag_name: "v0.0.4",
						},
					],
				]),
			}),
			fs: releaseFiles("0.0.4", "0.0.1"),
			runner: currentRunner(),
		}),
		/Release v0\.0\.4 is published but is not immutable/,
	);
});

test.each([
	{ count: 0, releases: [] },
	{
		count: 2,
		releases: [
			{ draft: true, id: 41, immutable: false, tag_name: "v0.0.4" },
			{ draft: true, id: 42, immutable: false, tag_name: "v0.0.4" },
		],
	},
])("draft release publication requires one matching release", async ({ count, releases }) => {
	await assert.rejects(
		runAction(publishDraftReleases, {
			with: {
				hollywoodTag: "v0.0.4",
				repository: "dedalus-labs/hollywood",
				runnerTag: "",
				token: "token",
			},
			exec: async () => ({
				exitCode: 0,
				stderr: "",
				stdout: JSON.stringify([releases]),
			}),
			fs: releaseFiles("0.0.4", "0.0.1"),
			runner: currentRunner(),
		}),
		new RegExp(`Expected one GitHub release for v0\\.0\\.4; found ${count}`),
	);
});

test("draft release publication requires a component tag", async () => {
	await assert.rejects(
		runAction(publishDraftReleases, {
			with: {
				hollywoodTag: "",
				repository: "dedalus-labs/hollywood",
				runnerTag: "",
				token: "token",
			},
			exec: async () => {
				throw new Error("unexpected exec");
			},
			fs: releaseFiles("0.0.4", "0.0.1"),
			runner: currentRunner(),
		}),
		/At least one release tag is required/,
	);
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

test("release component detection rejects unknown manifest components", async () => {
	await assert.rejects(
		runAction(detectReleaseComponents, {
			with: { before, current: currentRevision },
			exec: async () => ({
				exitCode: 0,
				stderr: "",
				stdout: current("0.0.2", "0.0.0"),
			}),
			fs: releaseFiles(
				"0.0.3",
				"0.0.0",
				JSON.stringify({ ".": "0.0.3", unknown: "0.0.1" }),
			),
			runner: currentRunner(),
		}),
		/Release manifest must contain '\.' and may contain 'runner'/,
	);
});

test("release component detection rejects removal as a runner release", async () => {
	await assert.rejects(
		runAction(detectReleaseComponents, {
			with: { before, current: currentRevision },
			exec: async () => ({
				exitCode: 0,
				stderr: "",
				stdout: current("0.0.2", "0.0.1"),
			}),
			fs: releaseFiles("0.0.2"),
			runner: currentRunner(),
		}),
		/Release manifest changed without changing a configured component version/,
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
