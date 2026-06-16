# Quick Start

## 1. Write a script

```typescript
import {
	action,
	booleanInput,
	pathInput,
	stringInput,
	stringOutput,
} from "@dedalus-labs/hollywood";

export const publishImage = action({
	name: "publish-container-image",
	description: "Build and publish a container image without embedding shell in workflow YAML.",
	inputs: {
		image: stringInput({ description: "Container image name, including registry." }),
		tag: stringInput({ description: "Container image tag." }),
		context: pathInput({ description: "Build context path.", default: "." }),
		dockerfile: pathInput({ description: "Dockerfile path.", default: "Dockerfile" }),
		provenance: booleanInput({ description: "Emit build provenance.", default: "false" }),
	},
	outputs: {
		imageRef: stringOutput({ description: "Published image reference." }),
	},
	run: async ({ exec, input }) => {
		const imageRef = `${input.image}:${input.tag}`;
		await exec("docker", [
			"buildx",
			"build",
			"--file",
			input.dockerfile,
			"--tag",
			imageRef,
			"--push",
			"--provenance",
			input.provenance ? "true" : "false",
			input.context,
		]);

		return { imageRef };
	},
});
```

## 2. Test it locally

```typescript
import { nodeExec, nodeFs, nodeLog, runAction } from "@dedalus-labs/hollywood";

await runAction(publishImage, {
	with: {
		image: "ghcr.io/acme/api",
		tag: "sha-abc123",
		provenance: "false",
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
npx hollywood run gha/containers/publish-image.ts \
  --export publishImage \
  --with image=ghcr.io/acme/api \
  --with tag=sha-abc123 \
  --with provenance=false
```

For Linux VM execution on macOS, add `--lima <name>`:

```bash
npx hollywood run gha/containers/publish-image.ts \
  --export publishImage \
  --lima default \
  --start-vm \
  --with image=ghcr.io/acme/api \
  --with tag=sha-abc123 \
  --with provenance=false
```

## 3. Generate action files

Point Hollywood at the source files that export actions or workflows. Quote glob
patterns so your shell does not expand them first.

```bash
npx hollywood generate "gha/**/*.ts" --output .
```

The command writes:

```text
created .github/actions/publish-container-image/action.yml
created .github/actions/publish-container-image/src/index.ts
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
		generateActionFile(publishImage, {
			sourcePath: "gha/containers/publish-image.ts",
			actionsDir: ".github/actions",
		}),
		generateActionEntrypointFile(publishImage, {
			sourcePath: "gha/containers/publish-image.ts",
			actionsDir: ".github/actions",
			exportName: "publishImage",
		}),
	],
	{ outputDir: process.cwd() },
);
```

This writes:

```text
.github/actions/publish-container-image/action.yml
.github/actions/publish-container-image/src/index.ts
```

## 4. Call it from workflow YAML

```yaml
jobs:
  publish_image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
      - name: Publish container image
        uses: ./.github/actions/publish-container-image
        with:
          image: ghcr.io/acme/api
          tag: ${{ github.sha }}
          provenance: "false"
```

The workflow stays flat and GitHub-compatible. The real logic stays in
TypeScript.
