# Hollywood

Hollywood generates GitHub Actions from typed TypeScript definitions. It also
runs exported actions locally for testing.

Use GitHub Actions for triggers, job dependencies, runner selection,
permissions, and secrets. Use Hollywood for action logic, typed inputs and
outputs, structured process execution, and generated workflow files.

Hollywood generates standard `action.yml` files, JavaScript entrypoints, and
workflow YAML. Generated actions use GitHub's official action toolkit.

The documentation site publishes
[`llms.txt`](https://oss.dedaluslabs.ai/hollywood/llms.txt) and
[`llms-full.txt`](https://oss.dedaluslabs.ai/hollywood/llms-full.txt) for tools
that consume project documentation as text.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the CLA/Vouch contribution flow and
[ROADMAP.md](ROADMAP.md) for planned contribution areas. See
[SECURITY.md](SECURITY.md) for the GitHub Actions hardening policy.

## Documentation

Published docs live at <https://oss.dedaluslabs.ai/hollywood>.

Build them locally:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r docs/requirements.txt
python -m mkdocs serve -f mkdocs.yml
```

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

For code and docs changes, fork the repository and open a pull request from
your branch into `dedalus-labs/hollywood:main`. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the full checklist.

## Node requirements

The package runtime and the repository toolchain have different Node
requirements:

| Surface                    | Node requirement             |
| -------------------------- | ---------------------------- |
| Installed package and CLI  | Node 20 or newer             |
| Generated GitHub actions   | GitHub's Node 24 action runtime |
| Building Hollywood locally | Node 22.18+ or Node 24.11+   |

The published package declares `engines.node >=20` in
[`package.json`](package.json). The build output targets Node 20 in
[`tsdown.config.ts`](tsdown.config.ts). `tsconfig.json` is only the typecheck
configuration; it is not the runtime support contract.

Use Node 22.18+ or Node 24.11+ when contributing because the local build and
declaration-generation toolchain has stricter engine requirements than the
published runtime package.

## Install

```bash
npm install --save-dev @dedalus-labs/hollywood
```

That installs a local `hollywood` binary at `node_modules/.bin/hollywood`. Run
it with `npx hollywood ...`, or put `hollywood ...` inside an npm script.

## Runtime dependencies

The package has eight direct runtime dependencies:

- `@actions/core`
- `@actions/exec`
- `@actions/expressions`
- `@actions/workflow-parser`
- `@octokit/openapi-types`
- `esbuild`
- `yaml`
- `zod`

Five dependencies provide GitHub's action toolkit, expression parser,
workflow parser, and REST API types. The published package contains runtime
files, type declarations, package metadata, the README, and the license.

## Before and after

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

## Local runs

Run an exported action in a persistent Linux container:

```bash
npx hollywood run gha/containers/publish-image.ts \
  --export publishImage \
  --provider container \
  --with image=ghcr.io/acme/api \
  --with tag="$(git rev-parse --short HEAD)" \
  --with context=. \
  --with dockerfile=Dockerfile \
  --with buildAttempt=1 \
  --with provenance=false
```

Choose Docker, Podman, or Apple's `container` explicitly. Docker Desktop users
select `docker` whether Desktop uses Docker VMM or Apple's virtualization
framework:

```bash
npx hollywood run gha/cache/s3-cache.ts \
  --export s3Cache \
  --provider podman \
  --with mode=restore \
  --with bucket=ci-cache \
  --with prefix=node \
  --with key=linux-arm64 \
  --with archivePath=/tmp/cache.tar.gz \
  --with contentsPath=/tmp/node-cache
```

Hollywood runs the bundled action with Node 24 in one Linux container. It
mounts `/github/workspace` and creates selected GitHub file-command paths,
including `GITHUB_STATE`. The
default image derives from GitHub's official Actions runner image and is pinned
by digest. See [Execution providers](docs/backends/index.md) for the supported
and unsupported behavior.

For repeatable local and CI execution, Hollywood also defines a
[verified runner image](docs/backends/runner-image.md), a secret-safe runner
probe, and a machine-readable compatibility contract.

## GitHub runner jobs

Create a one-job JIT configuration:

```bash
export GITHUB_TOKEN="$(gh auth token)"
npx hollywood runner jit-config OWNER/REPOSITORY \
  --runner-group-id 1 \
  --label self-hosted hollywood-local
```

Run the matching GitHub job with the official Actions runner:

```bash
npx hollywood runner listen .hollywood-jit-config \
  --provider docker \
  --diagnostics .hollywood/runner-diagnostics
```

This mode starts the pinned `Runner.Listener` and `Runner.Worker` processes.
The worker handles action pre and post handlers, state propagation, and job
hooks. GitHub supplies scheduling, permissions, cache and artifact services,
OpenID Connect tokens, logs, and job status. The mode requires a GitHub-issued
JIT configuration and pushed workflow source. The listener can run on a local
workstation or a remote host. It only needs outbound access to GitHub. See
[Run a job with the GitHub runner](docs/usage/github-runner.md).

## Generate actions

Generate local action metadata and entrypoints:

```bash
npx hollywood generate
```

Hollywood infers the source root from `gha/` or `ci/`, and it uses `@/*` from
`tsconfig.json` for generated imports when that path alias exists.

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

Edit the TypeScript source and regenerate. We recommend not hand-patching
generated YAML.

## Workflow sources

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

## Use cases

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

## License

MIT.

## Development

```bash
npm ci
npm test
npm run build
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r docs/requirements.txt
python -m mkdocs build --strict -f mkdocs.yml
```

Repository installs disable dependency lifecycle scripts. Every required build
step is explicit instead of running code during `npm ci`. CI also rejects
high-severity advisories and [missing or invalid registry signatures](https://docs.npmjs.com/verifying-registry-signatures/).
