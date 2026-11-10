---
name: hollywood
description: Use when writing, generating, checking, bundling or testing GitHub Actions workflows and actions with @dedalus-labs/hollywood, including typed action() scripts, workflow() sources, hollywood generate/check/build/run, runAction tests, and JIT runner jobs. Prove a change locally at the right layer before pushing it.
---

# Hollywood

Hollywood writes GitHub Actions in TypeScript. A workflow source exports
`workflow()`, an action exports `action()`, and `hollywood generate` writes the
YAML and action metadata GitHub reads. The YAML is generated. Edit the
TypeScript and regenerate.

The point of typed actions is that they run anywhere a function runs. Prove a
change on this machine before pushing it, instead of pushing to see what CI
says.

## Pick the layer

Each layer proves something the one above it cannot. Use the cheapest layer
that reaches the contract the change touches.

| Layer | How | Proves | Cannot prove |
| --- | --- | --- | --- |
| Fake exec | `runAction(action, { exec: fake, ... })` in a test | inputs, outputs, the exact commands and their order | that the commands work |
| Host run | `runAction(action, { exec: nodeExec, fs: nodeFs, log: nodeLog, runner: currentRunner() })` | the action against real tools and real state on this machine | the runner image's tools |
| Container run | `hollywood run <source> --export <name> --provider <p>` | the bundled action in a digest-pinned runner image | GitHub expressions, `needs`, OIDC |
| Connected job | `hollywood runner jit-config`, then `hollywood runner listen` | one whole job with GitHub's context, secrets and OIDC | a workflow that is not on the default branch |

An action that calls `terraform`, `aws` or another host tool usually needs the
host run, since the runner image may lack the tool and the credentials. A
workflow contract, such as an `if:` on `needs`, needs a connected job.

### Fake exec

```ts
const commands: Command[] = [];
await runAction(publishImage, {
	with: { image: "ghcr.io/acme/api", tag: "sha-abc123", provenance: "false" },
	exec: async (file, args, options) => {
		commands.push({ file, args, ...options });
		return { exitCode: 0, stdout: "", stderr: "" };
	},
	fs: { readText: async () => "" },
	runner: { uidGid: "1001:1001" },
});
```

### Host run

```ts
import { currentRunner, nodeExec, nodeFs, nodeLog, runAction } from "@dedalus-labs/hollywood";

await runAction(publishImage, {
	with: { image: "ghcr.io/acme/api", tag: "sha-abc123", provenance: "false" },
	exec: nodeExec,
	fs: nodeFs,
	log: nodeLog,
	runner: currentRunner(),
});
```

Inputs are strings, as GitHub passes them, even for `integerInput` and
`booleanInput`. `nodeExec` spawns without a shell and throws on a nonzero exit
unless the call passes `exitPolicy: "any"`. The package is ESM only, so run
this from an ESM script or a test file.

### Container run

```bash
npx hollywood run gha/cache/s3-cache.ts --export s3Cache --provider docker \
  --with mode=restore --with bucket=ci-cache --with key=linux-arm64
```

Hollywood bundles the action and runs it with Node 24 in one container. It
mounts the working directory at `/github/workspace`, sets the `GITHUB_*` file
command paths, passes each input as `INPUT_<NAME>` and prints each output as
`output\tname=value`. Choose `container`, `docker` or `podman` explicitly. A
missing provider fails with `ContainerProviderUnavailableError` and Hollywood
never tries another. `--image` must be pinned by digest. There are no pre or
post handlers in this mode.

### Connected job

```bash
export GITHUB_TOKEN="$(gh auth token)"
npx hollywood runner jit-config OWNER/REPO --runner-group-id 1 \
  --label self-hosted hollywood-local --output job.jit
npx hollywood runner listen job.jit --provider docker --diagnostics runner-diagnostics
```

Point the job's `runs-on` at the label, then dispatch it. The listener runs the
official runner for exactly one job. Register a new configuration for each job,
and read the workflow run's conclusion, since the listener exiting proves
nothing about the job. The token needs repository administration write access.
Pass `--container-engine-socket` for `container:` jobs, `services:` and Docker
actions.

## Generate and check

```bash
npx hollywood generate                 # write action.yml, src/index.ts and workflow YAML
npx hollywood check --generated        # regenerate, then fail on any diff or handwritten YAML
npx hollywood check --workflow-security
npx hollywood build                    # bundle each action's src/index.ts to dist/index.js
```

`check --generated` writes files before it diffs, so run it on a clean tree.
`check --workflow-security` rejects `pull_request_target`, `workflow_run`,
`actions/cache@`, `cache: npm` and any `uses:` not pinned to a full commit.
`build` emits ESM for Node 24, without minification.

## Write workflows

- Use `command({ file, args })` for a `run:` step. It quotes literal arguments,
  moves a whole-expression argument into an environment variable, and rejects
  an argument that mixes literal text with `${{ }}`. Build that with
  `format()`.
- Reach for `unsafeShell` only when neither `command` nor a typed action can
  express the step, and say why in a comment.
- Build expressions with the helpers, such as `eq`, `and`, `selectString`,
  `valueOr`, `needsOutput` and `stepOutput`. `expr` parses its body with
  GitHub's own parser and throws on invalid input.
- `uses(action, { with })` types a local action step from the action's inputs.
- Hollywood does not mask values at run time. Mask secrets in the action.

[reference.md](reference.md) lists every export, command and flag.

## Limits

Hollywood is not a local GitHub Actions emulator. It has no local artifact
server, cache server or OIDC issuer, and neither local mode reproduces the
GitHub-hosted `ubuntu-latest` machine. For S3 behavior run MinIO, and for IAM,
STS or DynamoDB run LocalStack, passing endpoints and credentials to the action
explicitly. See [Local services](https://oss.dedaluslabs.ai/hollywood/usage/local-services/).
