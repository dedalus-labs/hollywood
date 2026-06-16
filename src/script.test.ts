import * as assert from "node:assert/strict";
import { test } from "vitest";

import {
	action,
	booleanInput,
	integerInput,
	pathInput,
	stringInput,
	stringOutput,
	runAction,
} from "./script";

const bakeSnapshot = action({
	name: "dcs-package-artifact",
	description: "Run artifact-pack without embedding shell in workflow YAML.",
	inputs: {
		toolBinary: pathInput({ description: "Path to artifact-packager." }),
		kernel: pathInput({ description: "Path to guest vmlinux." }),
		rootfs: pathInput({ description: "Path to mutable rootfs.raw." }),
		output: pathInput({ description: "Snapshot output directory." }),
		memoryMibMax: integerInput({ description: "Maximum guest memory in MiB." }),
		maxVcpus: integerInput({ description: "Maximum vCPU count." }),
		imageName: stringInput({ description: "Guest image name.", default: "noble" }),
		rootfsVersionFile: pathInput({
			description: "File containing the guest rootfs version.",
			default: "/tmp/guest/rootfs-version",
		}),
		epoch0Dir: pathInput({ description: "Epoch0 output directory.", default: "/tmp/epoch0" }),
	},
	outputs: {
		snapshotDir: stringOutput({ description: "Snapshot output directory." }),
		templatesDir: stringOutput({ description: "Upper template output directory." }),
		epoch0Dir: stringOutput({ description: "Epoch0 output directory." }),
	},
	run: async ({ exec, fs, input, runner }) => {
		const rootfsVersion = (await fs.readText(input.rootfsVersionFile)).trim();
		await exec("sudo", [
			"artifact-pack",
			"--tool-binary",
			input.toolBinary,
			"--kernel",
			input.kernel,
			"--rootfs",
			input.rootfs,
			"--memory-mib-max",
			input.memoryMibMax.toString(),
			"--max-vcpus",
			input.maxVcpus.toString(),
			"--image-version",
			`${input.imageName}@${rootfsVersion}`,
			"--epoch0-dir",
			input.epoch0Dir,
			"--output",
			input.output,
		]);
		await exec("sudo", [
			"chown",
			"-R",
			runner.uidGid,
			input.output,
			"/tmp/templates",
			input.epoch0Dir,
		]);
		return {
			snapshotDir: input.output,
			templatesDir: "/tmp/templates",
			epoch0Dir: input.epoch0Dir,
		};
	},
});

test("action run emits execve-shaped commands", async () => {
	const commands: unknown[] = [];
	const outputs = await bakeSnapshot.run({
		input: {
			toolBinary: "/usr/local/bin/artifact-packager",
			kernel: "/tmp/vmlinux",
			rootfs: "/tmp/rootfs.raw",
			output: "/tmp/snapshot",
			memoryMibMax: 32768,
			maxVcpus: 16,
			imageName: "noble",
			rootfsVersionFile: "/tmp/guest/rootfs-version",
			epoch0Dir: "/tmp/epoch0",
		},
		fs: { readText: async () => "2026.05.14\n" },
		log: {
			info: () => {},
			warning: () => {},
			group: async (_name, run) => run(),
		},
		call: async () => {
			throw new Error("unexpected child action call");
		},
		exec: async (file, args, options) => {
			commands.push({ file, args, ...options });
			return { exitCode: 0, stdout: "", stderr: "" };
		},
		runner: { uidGid: "1001:1001" },
	});

	assert.deepEqual(commands, [
		{
			file: "sudo",
			args: [
				"artifact-pack",
				"--tool-binary",
				"/usr/local/bin/artifact-packager",
				"--kernel",
				"/tmp/vmlinux",
				"--rootfs",
				"/tmp/rootfs.raw",
				"--memory-mib-max",
				"32768",
				"--max-vcpus",
				"16",
				"--image-version",
				"noble@2026.05.14",
				"--epoch0-dir",
				"/tmp/epoch0",
				"--output",
				"/tmp/snapshot",
			],
		},
		{
			file: "sudo",
			args: ["chown", "-R", "1001:1001", "/tmp/snapshot", "/tmp/templates", "/tmp/epoch0"],
		},
	]);
	assert.deepEqual(outputs, {
		snapshotDir: "/tmp/snapshot",
		templatesDir: "/tmp/templates",
		epoch0Dir: "/tmp/epoch0",
	});
});

test("runAction binds workflow string inputs into typed script inputs", async () => {
	const commands: unknown[] = [];
	const outputs = await runAction(bakeSnapshot, {
		with: {
			toolBinary: "/usr/local/bin/artifact-packager",
			kernel: "/tmp/vmlinux",
			rootfs: "/tmp/rootfs.raw",
			output: "/tmp/snapshot",
			memoryMibMax: "32768",
			maxVcpus: "16",
		},
		fs: { readText: async () => "2026.05.14\n" },
		exec: async (file, args, options) => {
			commands.push({ file, args, ...options });
			return { exitCode: 0, stdout: "", stderr: "" };
		},
		runner: { uidGid: "1001:1001" },
	});

	assert.equal(commands.length, 2);
	assert.deepEqual(outputs, {
		snapshotDir: "/tmp/snapshot",
		templatesDir: "/tmp/templates",
		epoch0Dir: "/tmp/epoch0",
	});
});

test("runAction rejects invalid integer workflow inputs", async () => {
	await assert.rejects(
		() =>
			runAction(bakeSnapshot, {
				with: {
					toolBinary: "/usr/local/bin/artifact-packager",
					kernel: "/tmp/vmlinux",
					rootfs: "/tmp/rootfs.raw",
					output: "/tmp/snapshot",
					memoryMibMax: "a lot",
					maxVcpus: "16",
				},
				fs: { readText: async () => "2026.05.14\n" },
				exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
				runner: { uidGid: "1001:1001" },
			}),
		/memoryMibMax must be an integer/,
	);
});

test("runAction rejects blank integer workflow inputs", async () => {
	await assert.rejects(
		() =>
			runAction(bakeSnapshot, {
				with: {
					toolBinary: "/usr/local/bin/artifact-packager",
					kernel: "/tmp/vmlinux",
					rootfs: "/tmp/rootfs.raw",
					output: "/tmp/snapshot",
					memoryMibMax: "",
					maxVcpus: "16",
				},
				fs: { readText: async () => "2026.05.14\n" },
				exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
				runner: { uidGid: "1001:1001" },
			}),
		/memoryMibMax is required/,
	);
});

test("runAction rejects blank required workflow inputs", async () => {
	await assert.rejects(
		() =>
			runAction(bakeSnapshot, {
				with: {
					toolBinary: "   ",
					kernel: "/tmp/vmlinux",
					rootfs: "/tmp/rootfs.raw",
					output: "/tmp/snapshot",
					memoryMibMax: "32768",
					maxVcpus: "16",
				},
				fs: { readText: async () => "2026.05.14\n" },
				exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
				runner: { uidGid: "1001:1001" },
			}),
		/toolBinary is required/,
	);
});

test("runAction uses defaults for blank optional workflow inputs", async () => {
	const outputs = await runAction(bakeSnapshot, {
		with: {
			toolBinary: "/usr/local/bin/artifact-packager",
			kernel: "/tmp/vmlinux",
			rootfs: "/tmp/rootfs.raw",
			output: "/tmp/snapshot",
			memoryMibMax: "32768",
			maxVcpus: "16",
			imageName: "",
		},
		fs: { readText: async () => "2026.05.14\n" },
		exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
		runner: { uidGid: "1001:1001" },
	});

	assert.equal(outputs.snapshotDir, "/tmp/snapshot");
});

test("runAction rejects unknown workflow inputs", async () => {
	await assert.rejects(
		() =>
			runAction(bakeSnapshot, {
				with: {
					toolBinary: "/usr/local/bin/artifact-packager",
					kernel: "/tmp/vmlinux",
					rootfs: "/tmp/rootfs.raw",
					output: "/tmp/snapshot",
					memoryMibMax: "32768",
					maxVcpus: "16",
					unused: "silently accepting this would hide workflow drift",
				} as never,
				fs: { readText: async () => "2026.05.14\n" },
				exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
				runner: { uidGid: "1001:1001" },
			}),
		/unknown input: unused/,
	);
});

test("input helpers type-check default literals", () => {
	assert.equal(booleanInput({ description: "Boolean default.", default: "true" }).default, "true");
	assert.equal(integerInput({ description: "Integer default.", default: "42" }).default, "42");

	if (process.env["HOLLYWOOD_TYPE_TESTS"] === "1") {
		// @ts-expect-error Boolean defaults must be GitHub boolean strings.
		booleanInput({ description: "Invalid boolean default.", default: "yes" });
		// @ts-expect-error Integer defaults must be integer strings.
		integerInput({ description: "Invalid integer default.", default: "1.5" });
	}
});

test("runAction binds strict boolean workflow inputs", async () => {
	const deploy = action({
		name: "deploy",
		description: "Deploy with an explicit publish flag.",
		inputs: {
			publish: booleanInput({ description: "Publish artifacts." }),
			dryRun: booleanInput({ description: "Skip writes.", default: "false" }),
		},
		outputs: {
			mode: stringOutput({ description: "Resolved mode." }),
		},
		run: async ({ input }) => ({
			mode: `${input.publish ? "publish" : "skip"}:${input.dryRun ? "dry" : "write"}`,
		}),
	});

	assert.deepEqual(
		await runAction(deploy, {
			with: { publish: "true" },
			fs: { readText: async () => "" },
			exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
			runner: { uidGid: "1001:1001" },
		}),
		{ mode: "publish:write" },
	);
	assert.deepEqual(
		await runAction(deploy, {
			with: { publish: "false", dryRun: "true" },
			fs: { readText: async () => "" },
			exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
			runner: { uidGid: "1001:1001" },
		}),
		{ mode: "skip:dry" },
	);
	await assert.rejects(
		() =>
			runAction(deploy, {
				with: { publish: "yes" },
				fs: { readText: async () => "" },
				exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
				runner: { uidGid: "1001:1001" },
			}),
		/publish must be true or false/,
	);
});
