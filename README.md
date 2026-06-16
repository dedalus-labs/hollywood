# Hollywood

Lights, cameras, Actions!

Hollywood lets you write GitHub Actions logic as typed TypeScript, run it
locally, and generate ordinary GitHub Actions files for CI/CD.

> "Lights, Cameras, (GitHub) Actions!"

GitHub Actions is a good orchestration layer. It knows when jobs should run,
which runner labels they need, which secrets exist, and how jobs depend on each
other.

It is a rough programming environment. Real DevOps logic often turns into shell
inside YAML: untyped strings, quoting bugs, hidden input coercion, and commits
whose only purpose is "try CI again".

Hollywood moves the imperative part into TypeScript scripts you can test before
they run on GitHub. The generated output is still boring GitHub Actions:
`action.yml`, `uses: ./.github/actions/...`, and JavaScript actions that run
through GitHub's official action toolkit.

This works because GitHub Actions can run JavaScript actions directly. An
`action.yml` file points at a Node entrypoint, and Hollywood generates the thin
adapter around your typed script.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the CLA/Vouch contribution flow and
[SECURITY.md](SECURITY.md) for the GitHub Actions hardening policy.

## Contributing and Vouch

Hollywood accepts external code from vouched contributors. Being listed in
`VOUCHED.td` means a maintainer has verified the GitHub account and recorded
that the contributor accepted [CLA.md](CLA.md).

The flow is:

1. Open a "Vouch request" issue.
2. Confirm that you have read and accept `CLA.md`.
3. Link public GitHub work, a project website, or another public identity that
   helps a maintainer recognize you.
4. If an existing vouched contributor knows you, ask them to comment on the
   issue.
5. A maintainer adds your GitHub handle to `VOUCHED.td`.

Do not add yourself to `VOUCHED.td` in your first contribution. The CLA check
reads that file from the trusted base branch, so normal pull requests cannot
self-vouch.

## Install

```bash
npm install --save-dev @dedalus-labs/hollywood
```

Hollywood targets Node 24.

## Before / After

Before Hollywood, a container publish step might look like this:

```yaml
- name: Publish container image
  run: |
    set -euo pipefail
    IMAGE_REF="ghcr.io/acme/api:${GITHUB_SHA}"
    docker buildx build \
      --file Dockerfile \
      --tag "${IMAGE_REF}" \
      --push \
      --provenance false \
      .
    echo "image_ref=${IMAGE_REF}" >> "$GITHUB_OUTPUT"
```

With Hollywood, the program is normal TypeScript:

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

GitHub still sees a normal local action step:

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

The important bit is the command shape:

```typescript
await exec("docker", [
	"buildx",
	"build",
	"--file",
	input.dockerfile,
	"--tag",
	imageRef,
	"--push",
	input.context,
]);
```

That is `execve(2)`-shaped: one executable path and one array of arguments.
There is no shell interpolation and no YAML quoting puzzle.

## Local Runs

Run an exported action directly on your machine:

```bash
hollywood run gha/containers/publish-image.ts \
  --export publishImage \
  --with image=ghcr.io/acme/api \
  --with tag="$(git rev-parse --short HEAD)" \
  --with context=. \
  --with dockerfile=Dockerfile \
  --with provenance=false
```

Route every `exec(file, args)` call through a Lima VM when the script needs a
Linux environment:

```bash
hollywood run gha/cache/s3-cache.ts \
  --export s3Cache \
  --lima default \
  --start-vm \
  --with mode=restore \
  --with bucket=ci-cache \
  --with prefix=node \
  --with key=linux-arm64 \
  --with archivePath=/tmp/cache.tar.gz \
  --with contentsPath=/tmp/node-cache
```

Hollywood invokes Lima with the same argument-array shape:

```text
limactl shell --tty=false --start default -- <file> <arg>...
```

No command is rewritten into shell text. If the VM is stopped and `--start-vm`
was not passed, the run fails before the action starts.

## Generate Actions

Generate local action metadata and entrypoints:

```bash
hollywood generate "gha/**/*.ts" --output .
```

Hollywood writes ordinary GitHub Actions files:

```text
.github/actions/publish-container-image/action.yml
.github/actions/publish-container-image/src/index.ts
.github/workflows/container-release.yml
```

Generated files include a marker:

```text
# @generated by Hollywood. Do not edit by hand.
```

Edit the TypeScript source and regenerate. Do not hand-patch generated YAML.

## Workflow Sources

Hollywood can generate workflow YAML from typed workflow objects too:

```typescript
import { generateWorkflowFile, job, uses, workflow } from "@dedalus-labs/hollywood";
import { gh } from "@dedalus-labs/hollywood/expr";
import { publishImage } from "./containers/publish-image";

export const containerRelease = workflow({
	name: "Container Release",
	on: {
		push: { branches: ["main"] },
		workflow_dispatch: {},
	},
	permissions: { contents: "read", packages: "write" },
	jobs: {
		publish_image: job({
			"runs-on": "ubuntu-latest",
			steps: [
				{ uses: "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10" },
				uses(publishImage, {
					name: "Publish container image",
					with: {
						image: "ghcr.io/acme/api",
						tag: gh.github.sha,
						provenance: "false",
					},
				}),
			],
		}),
	},
});

export default generateWorkflowFile({
	sourcePath: "gha/container-release.ts",
	sourceRoot: "gha",
	workflowsDir: ".github/workflows",
	workflow: containerRelease,
});
```

## Good Fits

Hollywood is useful when the CI/CD step is a real program:

- publishing container images
- creating release artifacts
- promoting GitOps manifests between environments
- running Terraform plan/apply wrappers
- restoring and saving object-storage-backed caches
- validating pull requests with path-dependent jobs

Hollywood is not a local GitHub Actions emulator. GitHub still decides event
payloads, runner labels, secrets, permissions, and job scheduling.

## Docs

Published docs live at <https://oss.dedaluslabs.ai/hollywood>.

Build them locally:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r docs/requirements.txt
mkdocs serve
```

## Release

Releases are handled through Release Please. Normal commits land on `main`.
Release Please opens a release PR with the changelog and version bump. Merging
that PR publishes the package through the trusted publishing workflow.

## Development

```bash
npm ci
npm test
npm run build
python -m mkdocs build -f mkdocs.yml
```
