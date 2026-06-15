# Package Artifact

The artifact packaging bake recipe wraps `artifact-pack`, the command that creates a
release artifact for artifact packaging.

This is the hard case. It needs privileged Linux behavior, mutable root
filesystem (rootfs) files, build directories, Linux Kernel-based Virtual Machine
(KVM), and artifact publication. That is exactly why it should not be written
as shell inside workflow YAML.

The maintained example lives at `examples/package-artifact.ts`.

## Script shape

```typescript
export const bakeSnapshot = action({
	name: "dcs-package-artifact",
	description: "Run artifact-pack without embedding shell in workflow YAML.",
	inputs: {
		toolBinary: pathInput({ description: "Path to artifact-packager." }),
		kernel: pathInput({ description: "Path to guest vmlinux." }),
		rootfs: pathInput({ description: "Path to mutable rootfs.raw." }),
		output: pathInput({ description: "Snapshot output directory." }),
		memoryMibMax: integerInput({ description: "Maximum guest memory in MiB." }),
		maxVcpus: integerInput({ description: "Maximum vCPU count." }),
		imageVersion: stringInput({ description: "Guest image version." }),
	},
	outputs: {
		snapshotDir: stringOutput({ description: "Snapshot output directory." }),
	},
	run: async ({ exec, input, log }) => {
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
				"--output",
				input.output,
			]);
		});

		return { snapshotDir: input.output };
	},
});
```

## Generated workflow step

```yaml
- name: Bake release artifact
  uses: ./.github/actions/dcs-package-artifact
  with:
    tool-binary: /usr/local/bin/artifact-packager
    kernel: /tmp/vmlinux
    rootfs: /tmp/rootfs.raw
    output: /tmp/snapshot
    memory-mib-max: ${{ inputs.max_machine_memory_mib }}
    max-vcpus: ${{ inputs.max_machine_burst_vcpus }}
    image-version: noble@2026.05.14
```

## Local behavior

The script can be unit tested anywhere by replacing `exec` with a fake executor.
That proves the command contract.

The full bake should only run on a host that satisfies the runner contract:

| Requirement          | Reason                                              |
| -------------------- | --------------------------------------------------- |
| Linux KVM            | `artifact-pack` starts a virtual machine during the bake. |
| Passwordless sudo    | The bake manipulates root-owned devices and files.  |
| Loop devices         | Rootfs images are mounted and mutated.              |
| Artifact credentials | The resulting snapshot and rootfs need publication. |

When running through Lima, pass `--require-kvm` so Hollywood checks `/dev/kvm`
before the action starts:

```bash
hollywood run examples/package-artifact.ts \
  --export bakeSnapshot \
  --lima kvm \
  --start-vm \
  --require-kvm \
  --with toolBinary=/usr/local/bin/artifact-packager \
  --with kernel=/tmp/vmlinux \
  --with rootfs=/tmp/rootfs.raw \
  --with output=/tmp/snapshot \
  --with memoryMibMax=32768 \
  --with maxVcpus=16 \
  --with imageVersion=noble@2026.05.14
```

That rejection is honest when the VM cannot provide the contract. A local green
run that did not provide KVM would be worse than no local run.
