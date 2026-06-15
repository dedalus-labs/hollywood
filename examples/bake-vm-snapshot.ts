import { action, integerInput, pathInput, stringInput, stringOutput } from "@dedalus/hollywood";

export const bakeSnapshot = action({
	name: "dcs-bake-vm-snapshot",
	description: "Run dm-bake without embedding shell in workflow YAML.",
	localActionPath: "dcs-bake-vm-snapshot",
	inputs: {
		dhvBinary: pathInput({ description: "Path to dedalus-hypervisor." }),
		kernel: pathInput({ description: "Path to guest vmlinux." }),
		rootfs: pathInput({ description: "Path to mutable rootfs.raw." }),
		output: pathInput({ description: "Snapshot output directory." }),
		memoryMibMax: integerInput({ description: "Maximum guest memory in MiB." }),
		maxVcpus: integerInput({ description: "Maximum vCPU count." }),
		imageVersion: stringInput({ description: "Guest image version." }),
		epoch0Dir: pathInput({ description: "Epoch0 output directory.", default: "/tmp/epoch0" }),
	},
	outputs: {
		snapshotDir: stringOutput({ description: "Snapshot output directory." }),
		templatesDir: stringOutput({ description: "Upper template output directory." }),
		epoch0Dir: stringOutput({ description: "Epoch0 output directory." }),
	},
	run: async ({ exec, input, log, runner }) => {
		await log.group("Bake VM snapshot", async () => {
			await exec("sudo", [
				"dm-bake",
				"--dhv-binary",
				input.dhvBinary,
				"--kernel",
				input.kernel,
				"--rootfs",
				input.rootfs,
				"--memory-mib-max",
				input.memoryMibMax.toString(),
				"--max-vcpus",
				input.maxVcpus.toString(),
				"--image-version",
				input.imageVersion,
				"--epoch0-dir",
				input.epoch0Dir,
				"--output",
				input.output,
			]);
		});
		await log.group("Return bake artifacts to runner user", async () => {
			await exec("sudo", [
				"chown",
				"-R",
				runner.uidGid,
				input.output,
				"/tmp/templates",
				input.epoch0Dir,
			]);
		});
		return {
			snapshotDir: input.output,
			templatesDir: "/tmp/templates",
			epoch0Dir: input.epoch0Dir,
		};
	},
});
