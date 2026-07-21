import * as assert from "node:assert/strict";
import { test, vi } from "vitest";

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

const captureSummary = () => {
	let buffer = "";
	const writes: string[] = [];
	const summary = {
		addRaw: (text: string, addEOL = false) => {
			buffer += `${text}${addEOL ? "\n" : ""}`;
			return summary;
		},
		write: async () => {
			writes.push(buffer);
			buffer = "";
			return summary;
		},
	};
	return { summary, writes };
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

test("runGitHubAction streams failed command output once and reports a concise failure", async () => {
	const failingAction = action({
		name: "failing-action",
		description: "Exercise command failure reporting.",
		inputs: {},
		outputs: {},
		run: async ({ exec }) => {
			await exec("tool", ["test"]);
			return {};
		},
	});
	let failed = "";
	let streamed = "";
	const stderr = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
		streamed += chunk.toString();
		return true;
	});
	const core: GitHubCore = {
		getInput: () => "",
		group: async (_name, run) => run(),
		info: () => {},
		setOutput: () => {},
		setFailed: (message) => {
			failed = message;
		},
		warning: () => {},
	};
	const exec: GitHubExec = {
		getExecOutput: async (_file, _args, options) => {
			const output = Buffer.from("native reporter failure\n");
			options?.listeners?.stderr?.(output);
			return { exitCode: 1, stdout: "", stderr: output.toString() };
		},
	};

	try {
		const result = await runGitHubAction(failingAction, {
			core,
			exec,
			fs: { readText: async () => "" },
			runner: { uidGid: "1001:1001" },
		});
		assert.equal(result, undefined);
	} finally {
		stderr.mockRestore();
	}

	assert.equal(streamed, "native reporter failure\n");
	assert.match(failed, /exited 1$/);
	assert.doesNotMatch(failed, /native reporter failure/);
	assert.equal(`${streamed}${failed}`.match(/native reporter failure/g)?.length, 1);
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
	const events: string[] = [];
	const outputs = new Map<string, string>();

	await runGitHubAction(exitProbe, {
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

	assert.equal(commands.length, 1);
	assert.deepEqual(commands[0]?.file, "probe");
	assert.deepEqual(commands[0]?.args, []);
	assert.equal(commands[0]?.options?.ignoreReturnCode, true);
	assert.equal(commands[0]?.options?.silent, true);
	assert.equal(typeof commands[0]?.options?.listeners?.stderr, "function");
	assert.equal(typeof commands[0]?.options?.listeners?.stdout, "function");
	assert.equal(events[0], "group:probe");
	assert.ok((events[1] ?? "").startsWith("info:  \u001B[33mexit\u001B[0m"));
	assert.match(events[1] ?? "", /\s+\d+ms  probe \(exit 7\)$/);
	assert.deepEqual([...outputs], [["status", "7"]]);
});

test("runGitHubAction keeps long command reports bounded and recognizable", async () => {
	const events: string[] = [];
	const { summary, writes } = captureSummary();
	const longKey = `linux-arm64-${"a".repeat(64)}`;
	const source = `artifact://cache/builds/dev/${longKey}/`;
	const destination = `artifact://releases/dev/${longKey}-package-${"b".repeat(64)}/runs/build-123/`;
	const args = [
		"sync",
		source,
		destination,
		"--exclude",
		"images/source.img.zst",
		"--region",
		"test-1",
		"--quiet",
	];

	await runGitHubAction(action({
		name: "publish-artifacts",
		description: "Exercise compact command logs.",
		inputs: {},
		outputs: {
			status: stringOutput({ description: "Command status." }),
		},
		run: async ({ exec }) => {
			await exec("artifact", args);
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
			summary,
			warning: (message) => {
				events.push(`warning:${message}`);
			},
		},
		exec: { getExecOutput: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
		fs: { readText: async () => "" },
		runner: { uidGid: "1001:1001" },
	});

	const group = events[0] ?? "";
	assert.match(group, /^group:artifact sync /);
	assert.ok(group.length < ["artifact", ...args].join(" ").length);
	assert.ok(!group.includes(source));
	assert.ok(!group.includes(destination));
	assert.match(group, /\.\.\. \+2 args$/);
	assert.match(events[1] ?? "", /\s+\d+ms  artifact sync /);
	assert.equal(events[2], "output:status:ok");
	assert.equal(writes.length, 1);
	assert.match(writes[0] ?? "", /### Hollywood: publish-artifacts/);
	assert.match(writes[0] ?? "", /artifact sync/);
	assert.ok(!(writes[0] ?? "").includes(source));
	assert.ok(!(writes[0] ?? "").includes(destination));
});

test("runGitHubAction compacts multiline command arguments", async () => {
	const events: string[] = [];
	const { summary, writes } = captureSummary();
	const inlineScript = "console.log('first');\nconsole.log('second');";

	await runGitHubAction(action({
		name: "summary-script",
		description: "Exercise multiline script command logs.",
		inputs: {},
		outputs: {},
		run: async ({ exec }) => {
			await exec("node", ["-e", inlineScript]);
			return {};
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

	assert.equal(events[0], "group:node -e <inline script>");
	assert.match(events[1] ?? "", /\s+\d+ms  node -e <inline script>$/);
	assert.equal(writes.length, 1);
	assert.match(writes[0] ?? "", /node -e &lt;inline script&gt;/);
	assert.ok(!(writes[0] ?? "").includes(inlineScript));
});

test("runGitHubAction provides a typed step summary table", async () => {
	const { summary, writes } = captureSummary();

	await runGitHubAction(action({
		name: "summary-action",
		description: "Exercise typed summaries.",
		inputs: {},
		outputs: {},
		run: async ({ exec, summary }) => {
			await summary.table("Integration test", [
				{ label: "Environment", value: summaryCode("preview|prod") },
				{ label: "Result", value: summaryText("PASS") },
			]);
			await exec("go", ["test", "./e2e"], { exitPolicy: "any" });
			return {};
		},
	}), {
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
		exec: { getExecOutput: async () => ({ exitCode: 1, stdout: "", stderr: "" }) },
		fs: { readText: async () => "" },
		runner: { uidGid: "1001:1001" },
	});

	assert.equal(writes.length, 2);
	assert.match(writes[0] ?? "", /<h2>Integration test<\/h2>/);
	assert.match(writes[0] ?? "", /<td>Environment<\/td><td><code>preview\|prod<\/code><\/td>/);
	assert.match(writes[0] ?? "", /<td>Result<\/td><td>PASS<\/td>/);
	assert.match(writes[1] ?? "", /### Hollywood: summary-action/);
});

test("runGitHubAction reports when a requested step summary is unavailable", async () => {
	let failed = "";

	const result = await runGitHubAction(
		action({
			name: "summary-action",
			description: "Exercise unavailable step summaries.",
			inputs: {},
			outputs: {},
			run: async ({ summary }) => {
				await summary.table("Summary", []);
				return {};
			},
		}),
		{
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
		},
	);
	assert.equal(result, undefined);
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
