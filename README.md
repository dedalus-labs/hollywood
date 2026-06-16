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
[ROADMAP.md](ROADMAP.md) for planned contribution areas. See
[SECURITY.md](SECURITY.md) for the GitHub Actions hardening policy.

## Contributions

Hollywood accepts external code from vouched contributors. Due to the increased
volume of AI-generated code, Hollywood uses [Vouch](https://github.com/mitchellh/vouch)
as the arbiter of contributor trust and CLA eligibility for external pull
requests. Being listed in `VOUCHED.td` means a maintainer has verified the
GitHub account and recorded that the contributor accepted [CLA.md](CLA.md).

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

That installs a local `hollywood` binary at `node_modules/.bin/hollywood`. Run
it with `npx hollywood ...`, or put `hollywood ...` inside an npm script.

Hollywood's published package targets Node 20 and newer. Generated JavaScript
actions target GitHub's Node 24 action runtime by default. The repository
toolchain uses newer TypeScript build tools, so contributors should use Node
22.18+ or Node 24.11+ when building Hollywood from source.

## Small Dependency Surface

Hollywood is intentionally lightweight. The package has six direct runtime
dependencies:

- `@actions/core`
- `@actions/exec`
- `@actions/expressions`
- `@actions/workflow-parser`
- `esbuild`
- `yaml`

Most of that surface is GitHub's own action toolkit and schema parser. The
published package only ships runtime files, type declarations, package metadata,
the README, and the license. A smaller dependency graph is easier to audit and
reduces npm supply-chain exposure.

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

With Hollywood, the program is typed TypeScript instead of text hidden in YAML:

```typescript
import {
	type ActionInputValues,
	type ActionOutputValues,
	action,
	booleanInput,
	choiceInput,
	integerInput,
	pathInput,
	stringInput,
	stringOutput,
} from "@dedalus-labs/hollywood";

const publishInputs = {
	image: stringInput({ description: "Container image name, including registry." }),
	tag: stringInput({ description: "Container image tag." }),
	context: pathInput({ description: "Build context path.", default: "." }),
	dockerfile: pathInput({ description: "Dockerfile path.", default: "Dockerfile" }),
	platform: choiceInput({
		description: "Build target platform.",
		options: ["linux/amd64", "linux/arm64"] as const,
		default: "linux/amd64",
	}),
	provenance: choiceInput({
		description: "Build provenance mode.",
		options: ["false", "min", "max"] as const,
		default: "false",
	}),
	cacheFrom: stringInput({ description: "Optional build cache source.", default: "" }),
	buildAttempt: integerInput({ description: "CI build attempt number." }),
	push: booleanInput({ description: "Push instead of loading locally.", default: "true" }),
} as const;

const publishOutputs = {
	imageRef: stringOutput({ description: "Published image reference." }),
} as const;

type PublishImageInput = ActionInputValues<typeof publishInputs>;
type PublishImageOutput = ActionOutputValues<typeof publishOutputs>;

const imageRef = (input: Pick<PublishImageInput, "image" | "tag">): string =>
	`${input.image}:${input.tag}`;

const dockerBuildArgs = (input: PublishImageInput, ref: string): readonly string[] => {
	const args = [
		"buildx",
		"build",
		"--file",
		input.dockerfile,
		"--platform",
		input.platform,
		"--tag",
		ref,
		"--label",
		`ci.build-attempt=${input.buildAttempt}`,
		"--provenance",
		input.provenance,
	] as string[];

	if (input.cacheFrom.length > 0) {
		args.push("--cache-from", input.cacheFrom);
	}
	args.push(input.push ? "--push" : "--load", input.context);
	return args;
};

export const publishImage = action({
	name: "publish-container-image",
	description: "Build and publish a container image without embedding shell in workflow YAML.",
	inputs: publishInputs,
	outputs: publishOutputs,
	run: async ({ exec, input }): Promise<PublishImageOutput> => {
		const ref = imageRef(input);
		await exec("docker", dockerBuildArgs(input, ref));
		return { imageRef: ref };
	},
});
```

Hollywood parses GitHub's string inputs into `PublishImageInput` before `run`
starts. You can still layer Zod, Effect Schema, or your own parser on top for
repository-specific policy:

```typescript
import { z } from "zod";

const publishPolicy = z.object({
	image: z.string().regex(/^ghcr\.io\/[a-z0-9-]+\/[a-z0-9._/-]+$/),
	tag: z.string().min(1).max(128).regex(/^[A-Za-z0-9_.-]+$/),
	context: z.string().refine((path) => !path.includes(".."), "context must stay inside workspace"),
	push: z.boolean(),
});

const validatePublishPolicy = (input: PublishImageInput): void => {
	publishPolicy.parse(input);
};

export const publishImage = action({
	// ...
	run: async ({ exec, input }): Promise<PublishImageOutput> => {
		validatePublishPolicy(input);
		const ref = imageRef(input);
		await exec("docker", dockerBuildArgs(input, ref));
		return { imageRef: ref };
	},
});
```

Those schema packages live in your workflow repository. Hollywood does not pull
them into its own runtime dependency graph.

GitHub still sees a normal local action step:

```yaml
- name: Publish container image
  uses: ./.github/actions/publish-container-image
  with:
    image: ghcr.io/acme/api
    tag: ${{ github.sha }}
    context: .
    dockerfile: Dockerfile
    platform: linux/amd64
    provenance: "false"
    build-attempt: ${{ github.run_attempt }}
    push: "true"
```

The important bit is the command shape:

```typescript
const args = [
	"buildx",
	"build",
	"--file",
	input.dockerfile,
	"--platform",
	input.platform,
	"--tag",
	ref,
	"--label",
	`ci.build-attempt=${input.buildAttempt}`,
	input.context,
];

await exec("docker", args);
```

That is [`execve(2)`](https://man7.org/linux/man-pages/man2/execve.2.html)-shaped:
one executable path and one array of arguments.
There is no shell interpolation and no YAML quoting puzzle.

## Local Runs

Run an exported action directly on your machine:

```bash
npx hollywood run gha/containers/publish-image.ts \
  --export publishImage \
  --with image=ghcr.io/acme/api \
  --with tag="$(git rev-parse --short HEAD)" \
  --with context=. \
  --with dockerfile=Dockerfile \
  --with buildAttempt=1 \
  --with provenance=false
```

Route every `exec(file, args)` call through a Lima VM when the script needs a
Linux environment:

```bash
npx hollywood run gha/cache/s3-cache.ts \
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
was not passed, the run fails before the action starts. See the
[execution backend docs](docs/backends/index.md) for the supported Lima backend
and planned backend directions.

## Generate Actions

Generate local action metadata and entrypoints:

```bash
npx hollywood generate "gha/**/*.ts" --output .
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

## Roadmap

Future work is tracked in [ROADMAP.md](ROADMAP.md). Concrete tasks should become
GitHub issues before implementation, especially if they change the public API or
generated YAML.

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
