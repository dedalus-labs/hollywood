# Quick Start

## 1. Write a script

```typescript
import { action, integerInput, pathInput, stringOutput } from "@dedalus-labs/hollywood";

export const bakeSnapshot = action({
	name: "dcs-bake-vm-snapshot",
	description: "Run dm-bake without embedding shell in workflow YAML.",
	inputs: {
		dhvBinary: pathInput({ description: "Path to dedalus-hypervisor." }),
		memoryMibMax: integerInput({ description: "Maximum guest memory in MiB." }),
	},
	outputs: {
		snapshotDir: stringOutput({ description: "Snapshot output directory." }),
	},
	run: async ({ exec, input }) => {
		await exec("sudo", [
			"dm-bake",
			"--dhv-binary",
			input.dhvBinary,
			"--memory-mib-max",
			input.memoryMibMax.toString(),
		]);

		return { snapshotDir: "/tmp/snapshot" };
	},
});
```

## 2. Test it locally

```typescript
import { nodeExec, nodeFs, nodeLog, runAction } from "@dedalus-labs/hollywood";

await runAction(bakeSnapshot, {
	with: {
		dhvBinary: "/usr/local/bin/dedalus-hypervisor",
		memoryMibMax: "32768",
	},
	exec: nodeExec,
	fs: nodeFs,
	log: nodeLog,
	runner: { uidGid: "1001:1001" },
});
```

Use a fake executor for unit tests. Use `nodeExec` only when you intentionally
want to run the command on the local machine.

The CLI can run the same exported action:

```bash
hollywood run ci/dcs/dm/bake-vm-snapshot.ts \
  --export bakeSnapshot \
  --with dhvBinary=/usr/local/bin/dedalus-hypervisor \
  --with memoryMibMax=32768
```

For Linux VM execution on macOS, add `--lima <name>`:

```bash
hollywood run ci/dcs/dm/bake-vm-snapshot.ts \
  --export bakeSnapshot \
  --lima kvm \
  --start-vm \
  --with dhvBinary=/usr/local/bin/dedalus-hypervisor \
  --with memoryMibMax=32768
```

## 3. Generate action files

Point Hollywood at the source files that export actions or workflows. Quote glob
patterns so your shell does not expand them first.

```bash
hollywood generate "ci/**/*.ts" --output .
```

The command writes:

```text
created .github/actions/dcs-bake-vm-snapshot/action.yml
created .github/actions/dcs-bake-vm-snapshot/src/index.ts
```

The same flow is available as a library API:

```typescript
import {
	generateActionEntrypointFile,
	generateActionFile,
	writeGeneratedFiles,
} from "@dedalus-labs/hollywood";

await writeGeneratedFiles(
	[
		generateActionFile(bakeSnapshot, {
			sourcePath: "ci/dcs/dm/bake-vm-snapshot.ts",
			actionsDir: ".github/actions",
		}),
		generateActionEntrypointFile(bakeSnapshot, {
			sourcePath: "ci/dcs/dm/bake-vm-snapshot.ts",
			actionsDir: ".github/actions",
			exportName: "bakeSnapshot",
		}),
	],
	{ outputDir: process.cwd() },
);
```

This writes:

```text
.github/actions/dcs-bake-vm-snapshot/action.yml
.github/actions/dcs-bake-vm-snapshot/src/index.ts
```

## 4. Call it from workflow YAML

```yaml
jobs:
  bake_snapshot:
    runs-on: dedalus-kvm
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
      - name: Bake VM snapshot
        uses: ./.github/actions/dcs-bake-vm-snapshot
        with:
          dhv-binary: /usr/local/bin/dedalus-hypervisor
          memory-mib-max: ${{ inputs.max_machine_memory_mib }}
```

The workflow stays flat and GitHub-compatible. The real logic stays in
TypeScript.
