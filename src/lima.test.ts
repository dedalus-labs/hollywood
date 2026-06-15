import * as assert from "node:assert/strict";
import { test } from "vitest";

import { nodeExec } from "./local";
import { limaExec, limaRunner, probeLimaEnvironment } from "./lima";
import type { Command, ScriptExec } from "./script";

test("probeLimaEnvironment verifies the Linux rehearsal contract", async () => {
	const commands: Command[] = [];
	const exec: ScriptExec = async (file, args, options) => {
		const command = { file, args, ...options };
		commands.push(command);
		if (command.args[0] === "list") {
			return {
				exitCode: 0,
				stdout: JSON.stringify({ name: "kvm", status: "Running" }),
				stderr: "",
			};
		}
		if (command.args.at(-2) === "uname") {
			return { exitCode: 0, stdout: "Linux\n", stderr: "" };
		}
		if (command.args.at(-1) === "containerd") {
			return { exitCode: 0, stdout: "active\n", stderr: "" };
		}
		return { exitCode: 0, stdout: "ok\n", stderr: "" };
	};

	assert.deepEqual(
		await probeLimaEnvironment({
			name: "kvm",
			exec,
			requireContainerd: true,
			requireKvm: true,
		}),
		{
			status: "ready",
			name: "kvm",
			runtime: "nerdctl",
		},
	);
	assert.deepEqual(commands, [
		{ file: "limactl", args: ["list", "--json"] },
		{ file: "limactl", args: ["shell", "kvm", "--", "uname", "-s"] },
		{
			file: "limactl",
			args: ["shell", "kvm", "--", "systemctl", "--user", "is-active", "containerd"],
		},
		{ file: "limactl", args: ["shell", "kvm", "--", "nerdctl", "--version"] },
		{
			file: "limactl",
			args: ["shell", "kvm", "--", "test", "-r", "/dev/kvm", "-a", "-w", "/dev/kvm"],
		},
	]);
});

test("limaExec wraps commands without shell interpolation", async () => {
	const commands: Command[] = [];
	const exec: ScriptExec = async (file, args, options) => {
		commands.push({ file, args, ...options });
		return { exitCode: 0, stdout: "ok\n", stderr: "" };
	};

	assert.deepEqual(
		await limaExec({ name: "kvm", exec, start: true })("pnpm", ["test"], {
			cwd: "/workspace",
			env: { CI: "1" },
		}),
		{ exitCode: 0, stdout: "ok\n", stderr: "" },
	);
	assert.deepEqual(commands, [
		{
			file: "limactl",
			args: [
				"shell",
				"--tty=false",
				"--start",
				"--workdir",
				"/workspace",
				"kvm",
				"--",
				"env",
				"CI=1",
				"pnpm",
				"test",
			],
		},
	]);
});

test("limaRunner reads guest uid and gid", async () => {
	const exec: ScriptExec = async (_file, args) => {
		if (args.at(-1) === "-u") {
			return { exitCode: 0, stdout: "1000\n", stderr: "" };
		}
		return { exitCode: 0, stdout: "1001\n", stderr: "" };
	};

	assert.deepEqual(await limaRunner({ name: "kvm", exec }), { uidGid: "1000:1001" });
});

test("probeLimaEnvironment rejects stopped VMs unless start is explicit", async () => {
	const exec: ScriptExec = async () => ({
		exitCode: 0,
		stdout: JSON.stringify({ name: "kvm", status: "Stopped" }),
		stderr: "",
	});

	assert.deepEqual(await probeLimaEnvironment({ name: "kvm", exec }), {
		status: "rejected",
		name: "kvm",
		reason: "lima vm is stopped: kvm",
	});
});

test.runIf(process.env["HOLLYWOOD_RUN_LIMA"] === "1")(
	"probeLimaEnvironment verifies the configured Lima VM",
	async () => {
		const wasRunning = await isLimaRunning("kvm");
		try {
			assert.deepEqual(await probeLimaEnvironment({ name: "kvm", exec: nodeExec, start: true }), {
				status: "ready",
				name: "kvm",
			});
		} finally {
			if (!wasRunning) {
				await nodeExec("limactl", ["stop", "kvm"]);
			}
		}
	},
	60_000,
);

const isLimaRunning = async (name: string): Promise<boolean> => {
	const result = await nodeExec("limactl", ["list", "--json"]);
	return result.stdout
		.trim()
		.split("\n")
		.filter(Boolean)
		.some((line) => {
			const entry = JSON.parse(line) as { name?: string; status?: string };
			return entry.name === name && entry.status === "Running";
		});
};
