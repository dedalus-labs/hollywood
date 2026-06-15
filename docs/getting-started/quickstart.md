# Quick Start

## 1. Write a script

```typescript
import { action, integerInput, pathInput, stringOutput } from "@dedalus/hollywood";

export const bakeSnapshot = action({
	name: "dcs-package-artifact",
	description: "Run artifact-pack without embedding shell in workflow YAML.",
	inputs: {
		toolBinary: pathInput({ description: "Path to artifact-packager." }),
		memoryMibMax: integerInput({ description: "Maximum guest memory in MiB." }),
	},
	outputs: {
		snapshotDir: stringOutput({ description: "Snapshot output directory." }),
	},
	run: async ({ exec, input }) => {
		await exec("sudo", [
			"artifact-pack",
			"--tool-binary",
			input.toolBinary,
			"--memory-mib-max",
			input.memoryMibMax.toString(),
		]);

		return { snapshotDir: "/tmp/snapshot" };
	},
});
```

## 2. Test it locally

```typescript
import { nodeExec, nodeFs, nodeLog, runAction } from "@dedalus/hollywood";

await runAction(bakeSnapshot, {
	with: {
		toolBinary: "/usr/local/bin/artifact-packager",
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
hollywood run ci/dcs/dm/package-artifact.ts \
  --export bakeSnapshot \
  --with toolBinary=/usr/local/bin/artifact-packager \
  --with memoryMibMax=32768
```

For Linux VM execution on macOS, add `--lima <name>`:

```bash
hollywood run ci/dcs/dm/package-artifact.ts \
  --export bakeSnapshot \
  --lima kvm \
  --start-vm \
  --with toolBinary=/usr/local/bin/artifact-packager \
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
created .github/actions/dcs-package-artifact/action.yml
created .github/actions/dcs-package-artifact/src/index.ts
```

The same flow is available as a library API:

```typescript
import {
	generateActionEntrypointFile,
	generateActionFile,
	writeGeneratedFiles,
} from "@dedalus/hollywood";

await writeGeneratedFiles(
	[
		generateActionFile(bakeSnapshot, {
			sourcePath: "ci/dcs/dm/package-artifact.ts",
			actionsDir: ".github/actions",
		}),
		generateActionEntrypointFile(bakeSnapshot, {
			sourcePath: "ci/dcs/dm/package-artifact.ts",
			actionsDir: ".github/actions",
			exportName: "bakeSnapshot",
		}),
	],
	{ outputDir: process.cwd() },
);
```

This writes:

```text
.github/actions/dcs-package-artifact/action.yml
.github/actions/dcs-package-artifact/src/index.ts
```

## 4. Call it from workflow YAML

```yaml
jobs:
  bake_snapshot:
    runs-on: dedalus-kvm
    steps:
      - uses: actions/checkout@v6
      - name: Bake release artifact
        uses: ./.github/actions/dcs-package-artifact
        with:
          tool-binary: /usr/local/bin/artifact-packager
          memory-mib-max: ${{ inputs.max_machine_memory_mib }}
```

The workflow stays flat and GitHub-compatible. The real logic stays in
TypeScript.
