import * as assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

import {
	ContainerProviderUnavailableError,
	withContainer,
	withLocalContainer,
	type ContainerProvider,
} from "./index";
import type { Command, ScriptExec } from "./script";

const image = `ghcr.io/example/runner@sha256:${"a".repeat(64)}`;
const actionsRunnerImage =
	"ghcr.io/actions/actions-runner@sha256:0cfdcc701ce933c6d243c6b0b2da767366dc9f2e99961d4c3754b0b78084cdda";

const testProvider = (): ContainerProvider | undefined => {
	const provider = process.env["HOLLYWOOD_CONTAINER_PROVIDER"];
	if (provider === undefined) {
		return undefined;
	}
	if (provider === "container" || provider === "docker" || provider === "podman") {
		return provider;
	}
	throw new Error(`unsupported test container provider: ${provider}`);
};

for (const provider of ["container", "docker", "podman"] as const) {
	test(`${provider} uses one persistent container`, async () => {
		const commands: Command[] = [];
		const hostExec = fakeHostExec(commands);
		const workspace = await mkdtemp(join(tmpdir(), "hollywood-workspace-"));
		await writeFile(join(workspace, "message.txt"), "hello\n");

		try {
			await withContainer({ hostExec, image, provider, workspace }, async (services) => {
				assert.equal(services.runner.uidGid, "1001:1002");
				await services.exec("touch", ["marker"]);
				await services.exec("test", ["-f", "marker"]);
				await services.exec("printenv", ["HOLLYWOOD_TEST"], {
					env: { HOLLYWOOD_TEST: "expected" },
				});
				assert.equal(await services.fs.readText("message.txt"), "hello\n");
			});
		} finally {
			await rm(workspace, { force: true, recursive: true });
		}

		const create = commands[0];
		const name = required(create?.args[2]);
		assert.ok(name?.startsWith("hollywood-"));
		assert.equal(create?.file, provider);
		assert.deepEqual(create?.args.slice(0, 6), [
			"create",
			"--name",
			name,
			"--workdir",
			"/github/workspace",
			"--env",
		]);
		assert.ok(create?.args.includes("GITHUB_ACTIONS=true"));
		assert.ok(create?.args.includes("GITHUB_STATE=/github/file_commands/state"));
		assert.ok(create?.args.includes("GITHUB_WORKSPACE=/github/workspace"));
		assert.equal(create?.args.includes("--userns=keep-id"), provider === "podman");
		assert.ok(create?.args.some((arg) => arg.endsWith(":/github")));
		assert.ok(create?.args.includes(`${workspace}:/github/workspace`));
		assert.deepEqual(create?.args.slice(-4), ["--entrypoint", "sleep", image, "infinity"]);
		assert.deepEqual(
			commands.slice(1).map(({ file, args }) => [file, ...args]),
			expectedCommands(provider, name),
		);
	});
}

test("withContainer rejects mutable image tags before invoking a provider", async () => {
	let invoked = false;
	await assert.rejects(
		() =>
			withContainer(
				{
					hostExec: async () => {
						invoked = true;
						return { exitCode: 0, stderr: "", stdout: "" };
					},
					image: "ubuntu:24.04",
					provider: "docker",
					workspace: process.cwd(),
				},
				async () => undefined,
			),
		/Container image must use a SHA-256 digest or image ID\./,
	);
	assert.equal(invoked, false);
});

test("withContainer accepts immutable local image ids", async () => {
	const commands: Command[] = [];
	await withContainer(
		{
			hostExec: fakeHostExec(commands),
			image: `sha256:${"b".repeat(64)}`,
			provider: "docker",
			workspace: process.cwd(),
		},
		async () => undefined,
	);
	assert.equal(commands[0]?.args.includes(`sha256:${"b".repeat(64)}`), true);
});

test("withLocalContainer accepts a freshly built local tag", async () => {
	const commands: Command[] = [];
	await withLocalContainer(
		{
			hostExec: fakeHostExec(commands),
			image: "hollywood-runner:test",
			provider: "container",
			workspace: process.cwd(),
		},
		async () => undefined,
	);
	assert.equal(commands[0]?.args.includes("hollywood-runner:test"), true);
});

test("withContainer names a missing selected provider", async () => {
	const cause = Object.assign(new Error("spawn container ENOENT"), { code: "ENOENT" });
	await assert.rejects(
		() =>
			withContainer(
				{
					hostExec: async () => Promise.reject(cause),
					image,
					provider: "container",
					workspace: process.cwd(),
				},
				async () => undefined,
			),
		(error) =>
			error instanceof ContainerProviderUnavailableError &&
			error.provider === "container" &&
			error.binary === "container" &&
			error.cause === cause &&
			/Apple silicon and macOS 26 or later\./.test(error.message),
	);
});

test("withContainer reports action and cleanup failures", async () => {
	const hostExec: ScriptExec = async (_file, args) => {
		if (args[0] === "rm") {
			throw new Error("cleanup failed");
		}
		if (args[0] === "exec" && args.at(-2) === "id") {
			return { exitCode: 0, stderr: "", stdout: args.at(-1) === "-u" ? "1001\n" : "1002\n" };
		}
		return { exitCode: 0, stderr: "", stdout: "" };
	};

	await assert.rejects(
		() =>
			withContainer(
				{ hostExec, image, provider: "docker", workspace: process.cwd() },
				async () => {
					throw new Error("action failed");
				},
			),
		(error) =>
			error instanceof AggregateError &&
			error.errors.some((cause) => String(cause).includes("action failed")) &&
			error.errors.some((cause) => String(cause).includes("cleanup failed")),
	);
});

const runtimeProvider = testProvider();
const containerProviderTest = runtimeProvider === undefined ? test.skip : test;

containerProviderTest(
	"provider runs one persistent container session",
	async () => {
		const workspace = await mkdtemp(join(tmpdir(), "hollywood-workspace-"));
		try {
			await withContainer(
				{ image: actionsRunnerImage, provider: required(runtimeProvider), workspace },
				async ({ exec, fs, runner }) => {
					assert.equal(runner.uidGid, "1001:1001");
					assert.match((await exec("node", ["--version"])).stdout, /^v24\./);
					assert.equal(
						(await exec("printenv", ["GITHUB_WORKSPACE"])).stdout.trim(),
						"/github/workspace",
					);
					assert.equal(
						(
							await exec("printenv", ["ACTIONS_RUNNER_PRINT_LOG_TO_STDOUT"], {
								env: { ACTIONS_RUNNER_PRINT_LOG_TO_STDOUT: "0" },
							})
						).stdout.trim(),
						"0",
					);
					await exec("test", ["-w", "/github/file_commands/state"]);
					await exec("node", [
						"-e",
						"require('node:fs').writeFileSync('provider.txt', 'persistent\\n')",
					]);
					assert.equal(await fs.readText("provider.txt"), "persistent\n");
				},
			);
		} finally {
			await rm(workspace, { force: true, recursive: true });
		}
	},
	120_000,
);

const fakeHostExec =
	(commands: Command[]): ScriptExec =>
	async (file, args, options = {}) => {
		commands.push({ file, args, ...options });
		if (args[0] === "exec" && args.at(-2) === "id") {
			return { exitCode: 0, stderr: "", stdout: args.at(-1) === "-u" ? "1001\n" : "1002\n" };
		}
		if (args[0] === "exec" && args.at(-2) === "cat") {
			return { exitCode: 0, stderr: "", stdout: "hello\n" };
		}
		return { exitCode: 0, stderr: "", stdout: "" };
	};

const expectedCommands = (
	provider: ContainerProvider,
	name: string,
): readonly (readonly string[])[] => {
	const binary = provider;
	const remove = provider === "container" ? "delete" : "rm";
	return [
		[binary, "start", name],
		[binary, "exec", "--workdir", "/github/workspace", name, "id", "-u"],
		[binary, "exec", "--workdir", "/github/workspace", name, "id", "-g"],
		[binary, "exec", "--workdir", "/github/workspace", name, "touch", "marker"],
		[binary, "exec", "--workdir", "/github/workspace", name, "test", "-f", "marker"],
		[
			binary,
			"exec",
			"--workdir",
			"/github/workspace",
			name,
			"env",
			"HOLLYWOOD_TEST=expected",
			"printenv",
			"HOLLYWOOD_TEST",
		],
		[binary, "exec", "--workdir", "/github/workspace", name, "cat", "/github/workspace/message.txt"],
		[binary, remove, "--force", name],
	];
};

const required = <Value>(value: Value | undefined): Value => {
	assert.notEqual(value, undefined);
	return value as Value;
};
