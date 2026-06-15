# Bake VM Snapshot

The Dedalus Machines bake recipe wraps `dm-bake`, the command that creates a
guest virtual machine (VM) snapshot for Dedalus Machines.

This is the hard case. It needs privileged Linux behavior, mutable root
filesystem (rootfs) files, loop devices, Linux Kernel-based Virtual Machine
(KVM), and artifact publication. That is exactly why it should not be written
as shell inside workflow YAML.

The maintained example lives at `examples/bake-vm-snapshot.ts`.

## Script shape

```typescript
export const bakeSnapshot = action({
	name: "dcs-bake-vm-snapshot",
	description: "Run dm-bake without embedding shell in workflow YAML.",
	inputs: {
		dhvBinary: pathInput({ description: "Path to dedalus-hypervisor." }),
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
- name: Bake VM snapshot
  uses: ./.github/actions/dcs-bake-vm-snapshot
  with:
    dhv-binary: /usr/local/bin/dedalus-hypervisor
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
| Linux KVM            | `dm-bake` starts a virtual machine during the bake. |
| Passwordless sudo    | The bake manipulates root-owned devices and files.  |
| Loop devices         | Rootfs images are mounted and mutated.              |
| Artifact credentials | The resulting snapshot and rootfs need publication. |

When running through Lima, pass `--require-kvm` so Hollywood checks `/dev/kvm`
before the action starts:

```bash
hollywood run examples/bake-vm-snapshot.ts \
  --export bakeSnapshot \
  --lima kvm \
  --start-vm \
  --require-kvm \
  --with dhvBinary=/usr/local/bin/dedalus-hypervisor \
  --with kernel=/tmp/vmlinux \
  --with rootfs=/tmp/rootfs.raw \
  --with output=/tmp/snapshot \
  --with memoryMibMax=32768 \
  --with maxVcpus=16 \
  --with imageVersion=noble@2026.05.14
```

That rejection is honest when the VM cannot provide the contract. A local green
run that did not provide KVM would be worse than no local run.
