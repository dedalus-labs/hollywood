import * as assert from "node:assert/strict";
import { test } from "vitest";

import {
	runGitHubAction,
	type GitHubCore,
	type GitHubExec,
	type GitHubExecOptions,
} from "./github";
import {
	action,
	integerInput,
	pathInput,
	stringInput,
	stringOutput,
	summaryCode,
	summaryText,
} from "./script";

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

const deploymentSummary = action({
	name: "deployment-summary",
	description: "Write a typed deployment summary.",
	inputs: {},
	outputs: {},
	run: async ({ summary }) => {
		await summary.table("Integration <test>", [
			{ label: "Environment & scope", value: summaryCode("preview|prod") },
			{ label: "Result", value: summaryText("PASS") },
		]);
		return {};
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

test("runGitHubAction groups exec logs with command metadata and status", async () => {
	const events: string[] = [];

	await runGitHubAction(action({
		name: "readable-action",
		description: "Exercise readable command logs.",
		inputs: {},
		outputs: {
			status: stringOutput({ description: "Command status." }),
		},
		run: async ({ exec }) => {
			await exec("tool", ["hello world", "it's"], {
				cwd: "/repo",
				env: {
					ZETA: "hidden",
					ALPHA: "also-hidden",
				},
			});
			return { status: "ok" };
		},
	}), {
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
			warning: () => {},
		},
		exec: { getExecOutput: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
		fs: { readText: async () => "" },
		runner: { uidGid: "1001:1001" },
	});

	assert.equal(events[0], "group:tool 'hello world' 'it'\\''s'");
	assert.equal(events[1], "info:\u001B[2m  cwd  /repo\u001B[0m");
	assert.equal(events[2], "info:\u001B[2m  env  ALPHA, ZETA\u001B[0m");
	const status = events[3] ?? "";
	assert.ok(status.startsWith("info:  \u001B[32mok\u001B[0m"));
	assert.match(status, /\s+\d+ms  tool 'hello world' 'it'\\''s'$/);
	assert.equal(events[4], "output:status:ok");
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
		/publish \/tmp\/artifact.tgz 3 dev exited 1\nstderr:\ndenied/,
	);
	assert.equal(failed, "publish /tmp/artifact.tgz 3 dev exited 1\nstderr:\ndenied");
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

test("runGitHubAction provides a typed step summary table", async () => {
	let summaryBuffer = "";
	const summaries: string[] = [];
	const summary = {
		addRaw: (text: string, addEOL = false) => {
			summaryBuffer += text;
			if (addEOL) {
				summaryBuffer += "\n";
			}
			return summary;
		},
		write: async () => {
			summaries.push(summaryBuffer);
			summaryBuffer = "";
			return summary;
		},
	};

	await runGitHubAction(deploymentSummary, {
		core: {
			getInput: () => "",
			group: async (_name, run) => run(),
			info: () => {},
			setFailed: (message) => {
				throw new Error(`unexpected failure: ${message}`);
			},
			setOutput: () => {},
			summary,
			warning: () => {},
		},
		exec: { getExecOutput: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
		fs: { readText: async () => "" },
		runner: { uidGid: "1001:1001" },
	});

	assert.equal(summaries.length, 1);
	assert.match(summaries[0] ?? "", /<h2>Integration &lt;test&gt;<\/h2>/);
	assert.match(
		summaries[0] ?? "",
		/<td>Environment &amp; scope<\/td><td><code>preview\|prod<\/code><\/td>/,
	);
	assert.match(summaries[0] ?? "", /<td>Result<\/td><td>PASS<\/td>/);
});

test("runGitHubAction fails when a requested step summary is unavailable", async () => {
	let failed = "";

	await assert.rejects(
		() =>
			runGitHubAction(deploymentSummary, {
				core: {
					getInput: () => "",
					group: async (_name, run) => run(),
					info: () => {},
					setFailed: (message) => {
						failed = message;
					},
					setOutput: () => {},
					warning: () => {},
				},
				exec: { getExecOutput: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
				fs: { readText: async () => "" },
				runner: { uidGid: "1001:1001" },
			}),
		/GitHub step summary is unavailable/,
	);
	assert.equal(failed, "GitHub step summary is unavailable");
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
