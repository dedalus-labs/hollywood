import * as assert from "node:assert/strict";
import { test } from "vitest";

import {
	runGitHubAction,
	type GitHubCore,
	type GitHubExec,
	type GitHubExecOptions,
} from "./github";
import { action, integerInput, pathInput, stringInput, stringOutput } from "./script";

const publishArtifact = action({
	name: "publish-artifact",
	description: "Publish an artifact without shelling through YAML.",
	inputs: {
		artifactPath: pathInput({ description: "Path to the artifact." }),
		retryCount: integerInput({ description: "Upload retry count." }),
		channel: stringInput({ description: "Release channel.", default: "dev" }),
	},
	outputs: {
		artifactUrl: stringOutput({ description: "Published artifact URL." }),
	},
	run: async ({ exec, input }) => {
		const result = await exec(
			"publish",
			[input.artifactPath, input.retryCount.toString(), input.channel],
			{
				cwd: "/work",
				env: { HOLLYWOOD_CHANNEL: input.channel },
			},
		);
		return { artifactUrl: result.stdout.trim() };
	},
});

type CapturedCommand = Readonly<{
	file: string;
	args?: string[];
	options?: GitHubExecOptions;
}>;

type CapturedCommandDraft = {
	file: string;
	args?: string[];
	options?: GitHubExecOptions;
};

const restoreEnv = (name: string, value: string | undefined): void => {
	if (value === undefined) {
		delete process.env[name];
		return;
	}
	process.env[name] = value;
};

test("runGitHubAction binds core inputs, execs commands, and sets outputs", async () => {
	const inputs = new Map([
		["artifact-path", "/tmp/artifact.tgz"],
		["retry-count", "3"],
	]);
	const previousEnv = process.env["HOLLYWOOD_AMBIENT_TOKEN"];
	const requestedInputs: string[] = [];
	const outputs = new Map<string, string>();
	const commands: CapturedCommand[] = [];

	try {
		process.env["HOLLYWOOD_AMBIENT_TOKEN"] = "runner-token";
		const result = await runGitHubAction(publishArtifact, {
			core: {
				getInput: (name) => {
					requestedInputs.push(name);
					return inputs.get(name) ?? "";
				},
				group: async (_name, run) => run(),
				info: () => {},
				setOutput: (name, value) => {
					outputs.set(name, value);
				},
				setFailed: (message) => {
					throw new Error(`unexpected failure: ${message}`);
				},
				warning: () => {},
			},
			exec: {
				getExecOutput: async (file, args, options) => {
					const command: CapturedCommandDraft = { file };
					if (args !== undefined) {
						command.args = args;
					}
					if (options !== undefined) {
						command.options = options;
					}
					commands.push(command);
					return { exitCode: 0, stdout: "s3://bucket/artifact.tgz\n", stderr: "" };
				},
			},
			fs: { readText: async () => "" },
			runner: { uidGid: "1001:1001" },
		});

		assert.deepEqual(requestedInputs, ["artifact-path", "retry-count", "channel"]);
		assert.equal(commands.length, 1);
		assert.deepEqual(commands[0]?.file, "publish");
		assert.deepEqual(commands[0]?.args, ["/tmp/artifact.tgz", "3", "dev"]);
		assert.equal(commands[0]?.options?.cwd, "/work");
		assert.equal(commands[0]?.options?.env?.["HOLLYWOOD_AMBIENT_TOKEN"], "runner-token");
		assert.equal(commands[0]?.options?.env?.["HOLLYWOOD_CHANNEL"], "dev");
		assert.deepEqual(result, { artifactUrl: "s3://bucket/artifact.tgz" });
		assert.deepEqual([...outputs], [["artifact-url", "s3://bucket/artifact.tgz"]]);
	} finally {
		restoreEnv("HOLLYWOOD_AMBIENT_TOKEN", previousEnv);
	}
});

test("runGitHubAction marks the action failed before rethrowing", async () => {
	let failed = "";
	const core: GitHubCore = {
		getInput: (name) => {
			if (name === "artifact-path") {
				return "/tmp/artifact.tgz";
			}
			if (name === "retry-count") {
				return "3";
			}
			return "";
		},
		group: async (_name, run) => run(),
		info: () => {},
		setOutput: () => {},
		setFailed: (message) => {
			failed = message;
		},
		warning: () => {},
	};
	const exec: GitHubExec = {
		getExecOutput: async () => ({ exitCode: 1, stdout: "", stderr: "denied" }),
	};

	await assert.rejects(
		() =>
			runGitHubAction(publishArtifact, {
				core,
				exec,
				fs: { readText: async () => "" },
				runner: { uidGid: "1001:1001" },
			}),
		/publish exited 1: denied/,
	);
	assert.equal(failed, "publish exited 1: denied");
});

test("runGitHubAction tells the GitHub exec toolkit when nonzero exits are expected", async () => {
	const exitProbe = action({
		name: "exit-probe",
		description: "Exercise expected nonzero exits.",
		inputs: {},
		outputs: {
			status: stringOutput({ description: "Exit status." }),
		},
		run: async ({ exec }) => {
			const result = await exec("probe", [], { exitPolicy: "any" });
			return { status: result.exitCode.toString() };
		},
	});
	const commands: CapturedCommand[] = [];
	const outputs = new Map<string, string>();

	await runGitHubAction(exitProbe, {
		core: {
			getInput: () => "",
			group: async (_name, run) => run(),
			info: () => {},
			setOutput: (name, value) => {
				outputs.set(name, value);
			},
			setFailed: (message) => {
				throw new Error(`unexpected failure: ${message}`);
			},
			warning: () => {},
		},
		exec: {
			getExecOutput: async (file, args, options) => {
				const command: CapturedCommandDraft = { file };
				if (args !== undefined) {
					command.args = args;
				}
				if (options !== undefined) {
					command.options = options;
				}
				commands.push(command);
				return { exitCode: 7, stdout: "", stderr: "miss" };
			},
		},
		fs: { readText: async () => "" },
		runner: { uidGid: "1001:1001" },
	});

	assert.deepEqual(commands, [{ file: "probe", args: [], options: { ignoreReturnCode: true } }]);
	assert.deepEqual([...outputs], [["status", "7"]]);
});

test("runGitHubAction maps script logs to GitHub core", async () => {
	const events: string[] = [];
	const loggingAction = action({
		name: "logging-action",
		description: "Exercise GitHub logging.",
		inputs: {},
		outputs: {
			status: stringOutput({ description: "Log status." }),
		},
		run: async ({ log }) => {
			log.info("hello");
			await log.group("details", async () => {
				log.warning("careful");
			});
			return { status: "logged" };
		},
	});

	await runGitHubAction(loggingAction, {
		core: {
			getInput: () => "",
			group: async (name, run) => {
				events.push(`group:${name}`);
				return run();
			},
			info: (message) => {
				events.push(`info:${message}`);
			},
			setOutput: (name, value) => {
				events.push(`output:${name}:${value}`);
			},
			setFailed: (message) => {
				throw new Error(`unexpected failure: ${message}`);
			},
			warning: (message) => {
				events.push(`warning:${message}`);
			},
		},
		exec: { getExecOutput: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
		fs: { readText: async () => "" },
		runner: { uidGid: "1001:1001" },
	});

	assert.deepEqual(events, [
		"info:hello",
		"group:details",
		"warning:careful",
		"output:status:logged",
	]);
});
