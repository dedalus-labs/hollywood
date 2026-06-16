import { action, integerInput, pathInput, stringInput, stringOutput } from "@dedalus-labs/hollywood";

export const bakeSnapshot = action({
	name: "dcs-package-artifact",
	description: "Run artifact-pack without embedding shell in workflow YAML.",
	localActionPath: "dcs-package-artifact",
	inputs: {
		toolBinary: pathInput({ description: "Path to artifact-packager." }),
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
		await log.group("Bake release artifact", async () => {
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
