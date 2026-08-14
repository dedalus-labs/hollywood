# Quick start

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
  --provider container \
  --with image=ghcr.io/acme/api \
  --with tag=sha-abc123 \
  --with provenance=false
```

Select `docker`, `podman`, or Apple `container`. Hollywood runs the bundled
action with Node 24 in one Linux container. Pin a custom runner image by
digest:

```bash
npx hollywood run gha/containers/publish-image.ts \
  --export publishImage \
  --provider docker \
  --image ghcr.io/acme/runner@sha256:<digest> \
  --with image=ghcr.io/acme/api \
  --with tag=sha-abc123 \
  --with provenance=false
```

Use `hollywood runner jit-config` and `hollywood runner listen` when the test
must execute GitHub's official listener and worker. The listener can run on a
local workstation or a remote host. See
[Run a GitHub job locally or remotely](../usage/github-runner.md).

## 3. Generate action files

Let Hollywood discover source files that export actions or workflows.

```bash
npx hollywood generate
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

## 4. Bundle the action

```bash
npx hollywood build
```

This writes the JavaScript entrypoint that GitHub executes:

```text
.github/actions/publish-container-image/dist/index.js
```

Commit the generated metadata, entrypoint, and bundle together. A workflow may
instead build an ignored bundle in an earlier step, but the bundle must exist
before a local `uses:` step runs.

## 5. Call it from workflow YAML

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
