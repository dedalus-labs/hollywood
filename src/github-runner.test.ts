import assert from "node:assert/strict";
import { once } from "node:events";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

import { ContainerProviderUnavailableError, githubActionsRunnerVersion } from "./container";
import {
	parseEncodedGitHubJitConfig,
	runGitHubRunner,
	type GitHubRunnerProcess,
} from "./github-runner";
import type { Command } from "./script";

const image = `ghcr.io/actions/actions-runner@sha256:${"a".repeat(64)}`;
const encodedJitConfig = (): string =>
	Buffer.from(
		JSON.stringify({
			".credentials": Buffer.from("credentials").toString("base64"),
			".runner": Buffer.from("runner").toString("base64"),
		}),
	).toString("base64");

test("GitHub runner uses the official listener without exposing JIT configuration in host arguments", async () => {
	const commands: Command[] = [];
	let environmentPath = "";
	let launcherPath = "";
	const process: GitHubRunnerProcess = async (command) => {
		commands.push(command);
		environmentPath = required(valueAfter(command.args, "--env-file"));
		launcherPath = required(mountSource(command.args, "/opt/hollywood/runner-launch.js"));
		assert.equal((await stat(environmentPath)).mode & 0o777, 0o600);
		assert.equal((await readFile(environmentPath, "utf8")).includes(encodedJitConfig()), true);
		assert.match(await readFile(launcherPath, "utf8"), /Runner\.Listener/);
	};

	await runGitHubRunner(
		{
			encodedJitConfig: parseEncodedGitHubJitConfig(encodedJitConfig()),
			image,
			provider: "docker",
		},
		{ process, runnerLauncher: new URL("./runner-launch.ts", import.meta.url) },
	);

	assert.equal(commands.length, 1);
	const command = required(commands[0]);
	assert.equal(command.file, "docker");
	assert.deepEqual(command.args.slice(0, 8), [
		"run",
		"--rm",
		"--init",
		"--name",
		required(command.args[4]),
		"--workdir",
		"/home/runner",
		"--env-file",
	]);
	assert.match(required(command.args[4]), /^hollywood-runner-[0-9a-f-]{36}$/);
	assert.deepEqual(command.args.slice(-4), [
		"--entrypoint",
		"/home/runner/externals/node24/bin/node",
		image,
		"/opt/hollywood/runner-launch.js",
	]);
	assert.equal(
		command.args.some((argument) => argument.includes(encodedJitConfig())),
		false,
	);
	await assert.rejects(access(environmentPath));
});

test("GitHub runner mounts typed hooks, diagnostics, and a Docker-compatible socket", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-runner-test-"));
	const jobStarted = join(root, "job-started.sh");
	const jobCompleted = join(root, "job-completed.sh");
	const containerHooks = join(root, "container-hooks.js");
	const diagnostics = join(root, "diagnostics");
	await Promise.all([
		writeFile(jobStarted, "#!/bin/sh\nexit 0\n", { mode: 0o755 }),
		writeFile(jobCompleted, "#!/bin/sh\nexit 0\n", { mode: 0o755 }),
		writeFile(containerHooks, "process.exit(0);\n"),
		mkdir(diagnostics),
	]);
	let command: Command | undefined;

	try {
		await withUnixSocket(root, async (socket) => {
			await runGitHubRunner(
				{
					containerEngine: { kind: "docker-socket", path: socket },
					diagnostics,
					encodedJitConfig: parseEncodedGitHubJitConfig(encodedJitConfig()),
					hooks: {
						container: containerHooks,
						jobCompleted,
						jobStarted,
						requireJobContainer: true,
					},
					image,
					provider: "container",
				},
				{
					process: async (candidate) => {
						command = candidate;
						const environment = await readFile(
							required(valueAfter(candidate.args, "--env-file")),
							"utf8",
						);
						assert.match(
							environment,
							/ACTIONS_RUNNER_HOOK_JOB_STARTED=\/opt\/hollywood\/hooks\/job-started/,
						);
						assert.match(
							environment,
							/ACTIONS_RUNNER_HOOK_JOB_COMPLETED=\/opt\/hollywood\/hooks\/job-completed/,
						);
						assert.match(
							environment,
							/ACTIONS_RUNNER_CONTAINER_HOOKS=\/opt\/hollywood\/hooks\/container.js/,
						);
						assert.match(environment, /ACTIONS_RUNNER_REQUIRE_JOB_CONTAINER=true/);
					},
					runnerLauncher: new URL("./runner-launch.ts", import.meta.url),
				},
			);

			const args = required(command).args;
			assert.deepEqual(
				args.slice(args.indexOf("--publish-socket"), args.indexOf("--publish-socket") + 2),
				["--publish-socket", `${socket}:/var/run/docker.sock`],
			);
			assert.equal(mountSource(args, "/opt/hollywood/hooks/job-started"), jobStarted);
			assert.equal(mountSource(args, "/opt/hollywood/hooks/job-completed"), jobCompleted);
			assert.equal(mountSource(args, "/opt/hollywood/hooks/container.js"), containerHooks);
			assert.equal(mountSource(args, "/home/runner/_diag"), diagnostics);
		});
	} finally {
		await rm(root, { force: true, recursive: true });
	}
});

test("GitHub runner rejects malformed JIT configuration", () => {
	assert.throws(
		() => parseEncodedGitHubJitConfig("not-base64"),
		/GitHub JIT configuration must be canonical base64/,
	);
	assert.throws(
		() => parseEncodedGitHubJitConfig(Buffer.from("[]").toString("base64")),
		/GitHub JIT configuration must decode to a nonempty object/,
	);
	assert.throws(
		() =>
			parseEncodedGitHubJitConfig(
				Buffer.from(JSON.stringify({ ".runner": "not-base64" })).toString("base64"),
			),
		/GitHub JIT configuration entry '\.runner' must be canonical base64/,
	);
	assert.throws(
		() =>
			parseEncodedGitHubJitConfig(
				Buffer.from(
					JSON.stringify({ "../credentials": Buffer.from("secret").toString("base64") }),
				).toString("base64"),
			),
		/GitHub JIT configuration entry name '\.\.\/credentials' is not a safe file name/,
	);
});

for (const provider of ["docker", "podman"] as const) {
	test(`${provider} mounts a Docker-compatible socket without changing providers`, async () => {
		const root = await mkdtemp(join(tmpdir(), "hollywood-runner-test-"));
		let command: Command | undefined;
		try {
			await withUnixSocket(root, async (socket) => {
				await runGitHubRunner(
					{
						containerEngine: { kind: "docker-socket", path: socket },
						encodedJitConfig: parseEncodedGitHubJitConfig(encodedJitConfig()),
						image,
						provider,
					},
					{
						process: async (candidate) => {
							command = candidate;
						},
						runnerLauncher: new URL("./runner-launch.ts", import.meta.url),
					},
				);
				assert.equal(required(command).file, provider);
				assert.equal(mountSource(required(command).args, "/var/run/docker.sock"), socket);
				assert.equal(required(command).args.includes("--publish-socket"), false);
			});
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
}

test("GitHub runner rejects a container engine path that is not a Unix socket", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-runner-test-"));
	const regularFile = join(root, "engine.sock");
	await writeFile(regularFile, "not a socket\n");
	try {
		await assert.rejects(
			() =>
				runGitHubRunner(
					{
						containerEngine: { kind: "docker-socket", path: regularFile },
						encodedJitConfig: parseEncodedGitHubJitConfig(encodedJitConfig()),
						image,
						provider: "docker",
					},
					{
						process: async () => assert.fail("provider must not start"),
						runnerLauncher: new URL("./runner-launch.ts", import.meta.url),
					},
				),
			/Container engine path must be a Unix socket/,
		);
	} finally {
		await rm(root, { force: true, recursive: true });
	}
});

test("GitHub runner reports a missing selected provider after deleting its JIT secret", async () => {
	let environmentPath = "";
	const cause = Object.assign(new Error("spawn podman ENOENT"), { code: "ENOENT" });
	await assert.rejects(
		() =>
			runGitHubRunner(
				{
					encodedJitConfig: parseEncodedGitHubJitConfig(encodedJitConfig()),
					image,
					provider: "podman",
				},
				{
					process: async (command) => {
						environmentPath = required(valueAfter(command.args, "--env-file"));
						throw cause;
					},
					runnerLauncher: new URL("./runner-launch.ts", import.meta.url),
				},
			),
		(error) =>
			error instanceof ContainerProviderUnavailableError &&
			error.provider === "podman" &&
			error.cause === cause,
	);
	await assert.rejects(access(environmentPath));
});

test("pinned runner version matches the official worker image", () => {
	assert.equal(githubActionsRunnerVersion, "2.336.0");
});

const valueAfter = (args: readonly string[], flag: string): string | undefined => {
	const index = args.indexOf(flag);
	return index === -1 ? undefined : args[index + 1];
};

const mountSource = (args: readonly string[], target: string): string | undefined => {
	for (let index = 0; index < args.length; index += 1) {
		if (args[index] !== "--mount") {
			continue;
		}
		const mount = args[index + 1];
		if (mount?.includes(`target=${target}`) === true) {
			return /(?:^|,)source=([^,]+)/.exec(mount)?.[1];
		}
	}
	return undefined;
};

const required = <Value>(value: Value | undefined): Value => {
	assert.notEqual(value, undefined);
	return value as Value;
};

const withUnixSocket = async <Value>(
	root: string,
	run: (path: string) => Promise<Value>,
): Promise<Value> => {
	const socket = join(root, "engine.sock");
	const server = createServer();
	server.listen(socket);
	await once(server, "listening");
	try {
		return await run(socket);
	} finally {
		await new Promise<void>((resolveClose, rejectClose) => {
			server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
		});
	}
};
