import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

import type { RunnerContract } from "./runner-contract";
import { createRunnerCommand } from "./runner-cli";
import {
	probeRunner,
	type RunnerProbeSource,
} from "./runner";

const environment = {
	CI: "true",
	GITHUB_ACTIONS: "true",
	GITHUB_ENV: "/github/file_commands/env",
	GITHUB_EVENT_PATH: "/github/workflow/event.json",
	GITHUB_OUTPUT: "/github/file_commands/output",
	GITHUB_PATH: "/github/file_commands/path",
	GITHUB_STEP_SUMMARY: "/github/file_commands/step_summary",
	GITHUB_WORKSPACE: "/github/workspace",
	HOME: "/github/home",
	ImageOS: "ubuntu24",
	PATH: "/bin",
	RUNNER_ARCH: "ARM64",
	RUNNER_OS: "Linux",
	RUNNER_TEMP: "/github/temp",
	RUNNER_TOOL_CACHE: "/opt/hostedtoolcache",
	SECRET_DO_NOT_SERIALIZE: "super-secret",
} as const;

test("probeRunner records only allowlisted runner state", async () => {
	const probe = await probeRunner(probeSource());

	assert.deepEqual(probe.environment, {
		CI: "true",
		GITHUB_ACTIONS: "true",
		ImageOS: "ubuntu24",
		RUNNER_ARCH: "ARM64",
		RUNNER_OS: "Linux",
	});
	assert.equal(JSON.stringify(probe).includes("super-secret"), false);
	assert.deepEqual(probe.identity, { gid: 1001, groups: ["docker", "runner"], uid: 1001 });
	assert.deepEqual(probe.platform.os, {
		id: "ubuntu",
		prettyName: "Ubuntu 24.04 LTS",
		versionId: "24.04",
	});
	assert.deepEqual(
		probe.tools.filter((tool) => tool.status === "ready"),
		[
			{ name: "bash", path: "/bin/bash", status: "ready", version: "GNU bash 5.2" },
			{ name: "node", path: "/bin/node", status: "ready", version: "v24.11.0" },
		],
	);
	assert.deepEqual(probe.packages, {
		manager: "dpkg",
		packages: [
			{ name: "bash", version: "5.2" },
			{ name: "nodejs", version: "24.11.0" },
		],
	});
	assert.deepEqual(probe.toolCache, { go: ["1.26.0"], node: ["24.11.0"] });
});

test("probeRunner rejects non-Linux environments", async () => {
	await assert.rejects(
		probeRunner({ ...probeSource(), operatingSystem: "darwin" }),
		/requires Linux, received darwin/,
	);
});

test("runner CLI writes and verifies a typed probe", async () => {
	const directory = await mkdtemp(join(tmpdir(), "hollywood-runner-cli-"));
	const contractPath = join(directory, "contract.json");
	const probePath = join(directory, "probe.json");
	const output: string[] = [];
	const contract: RunnerContract = {
		schemaVersion: 1,
		environment: { CI: "true", RUNNER_OS: "Linux" },
		os: { id: "ubuntu", versionId: "24.04" },
		paths: ["GITHUB_WORKSPACE"],
		tools: [{ name: "node", versionPrefix: "v24." }],
	};
	try {
		const probe = await probeRunner(probeSource());
		const command = createRunnerCommand(
			{ writeOut: (message) => output.push(message) },
			{ probe: async () => probe },
		);
		await command.parseAsync(["node", "runner", "probe", "--output", probePath]);
		await writeFile(contractPath, `${JSON.stringify(contract)}\n`);
		await command.parseAsync(["node", "runner", "verify", contractPath, probePath]);
		assert.equal((await readFile(probePath, "utf8")).endsWith("\n"), true);
		assert.deepEqual(output, [`wrote\t${probePath}\n`, "ok\trunner contract\n"]);
	} finally {
		await rm(directory, { force: true, recursive: true });
	}
});

const probeSource = (): RunnerProbeSource => ({
	architecture: "arm64",
	env: environment,
	exec: async (file, args) => {
		if (file === "id") {
			return result("runner docker\n");
		}
		if (file === "/bin/bash") {
			return result("GNU bash 5.2\n");
		}
		if (file === "/bin/node") {
			return result("v24.11.0\n");
		}
		if (file === "/bin/dpkg-query") {
			assert.deepEqual(args, ["-W", "-f=${binary:Package}\\t${Version}\\n"]);
			return result("nodejs\t24.11.0\nbash\t5.2\n");
		}
		throw new Error(`unexpected command: ${file} ${args.join(" ")}`);
	},
	gid: 1001,
	kernelRelease: "6.16.9",
	kernelVersion: "Linux",
	operatingSystem: "linux",
	pathDelimiter: ":",
	readDirectory: async (path) => {
		if (path === "/opt/hostedtoolcache") {
			return ["node", "go"];
		}
		if (path === "/opt/hostedtoolcache/node") {
			return ["24.11.0"];
		}
		if (path === "/opt/hostedtoolcache/go") {
			return ["1.26.0"];
		}
		throw new Error(`unexpected directory: ${path}`);
	},
	readText: async (path) => {
		if (path === "/etc/os-release") {
			return 'ID=ubuntu\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04 LTS"\n';
		}
		if (path === "/proc/self/status") {
			return "Name:\tnode\nCapEff:\t000001ffffffffff\n";
		}
		throw new Error(`unexpected file: ${path}`);
	},
	testAccess: async (path) =>
		path.startsWith("/github/") ||
		path.startsWith("/opt/hostedtoolcache") ||
		["/bin/bash", "/bin/dpkg-query", "/bin/node", "/sys/fs/cgroup/cgroup.controllers"].includes(
			path,
		),
	uid: 1001,
});

const result = (stdout: string) => ({ exitCode: 0, stderr: "", stdout });
