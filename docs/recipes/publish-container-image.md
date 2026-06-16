# Publish Container Image

The container image recipe wraps a Docker buildx publish step. It is a common
CI/CD action: build from a Dockerfile, tag with the current commit, push to a
registry, and return the image reference for deployment jobs.

The maintained example lives at `examples/publish-container-image.ts`.

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
	run: async ({ exec, input, log }) => {
		const imageRef = `${input.image}:${input.tag}`;
		await log.group("Publish container image", async () => {
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
		});
		return { imageRef };
	},
});
```

Generated workflow usage:

```yaml
- name: Publish container image
  uses: ./.github/actions/publish-container-image
  with:
    image: ghcr.io/acme/api
    tag: ${{ github.sha }}
    context: .
    dockerfile: Dockerfile
    provenance: "false"
```

## Why this belongs in Hollywood

Container publishing looks small until it needs to be reliable. The moment you
add multiple tags, build arguments, cache settings, provenance, and downstream
outputs, a shell string inside YAML becomes hard to review.

Hollywood keeps the contract typed:

| Concern             | Hollywood shape                                       |
| ------------------- | ----------------------------------------------------- |
| Required image name | `stringInput({ description: "..." })`                 |
| Optional paths      | `pathInput({ default: "." })`                         |
| Boolean settings    | `booleanInput({ default: "false" })`                  |
| Command arguments   | `exec("docker", ["buildx", "build", ...])`            |
| Downstream value    | `imageRef: stringOutput({ description: "..." })`      |

## Run locally

```bash
npx hollywood run examples/publish-container-image.ts \
  --export publishImage \
  --with image=ghcr.io/acme/api \
  --with tag=sha-abc123 \
  --with context=. \
  --with dockerfile=Dockerfile \
  --with provenance=false
```

Use a fake executor in unit tests when you want to assert the exact Docker
command without pushing anything.
