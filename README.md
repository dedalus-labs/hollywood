# Hollywood

Lights, cameras, Actions!

Hollywood is a GitHub Actions rehearsal tool. The goal is to write and run the
same continuous integration and deployment (CI/CD) contract locally before it
runs on GitHub.

GitHub Actions is good orchestration. It knows when a job should run, which
runner it needs, which secrets are available, and how jobs depend on each other.

It is a bad programming environment. Real deployment logic ends up as shell
inside YAML: untyped strings, quoting bugs, hidden input coercion, and commits
whose only purpose is "try CI again lol".

Hollywood moves that imperative logic into TypeScript scripts you can test
locally. The generated output is still boring GitHub Actions: `action.yml`,
`uses: ./.github/actions/...`, and JavaScript actions that run through
GitHub's official `@actions/core` and `@actions/exec` packages.

The point is not to replace GitHub Actions. The point is to stop writing tiny
programs inside YAML strings.

## Before / After

Before Hollywood, deployment logic tends to become shell-in-YAML soup:

```yaml
- name: Bake VM snapshot
  run: |
    set -euo pipefail
    VERSION="$(cat /tmp/guest/rootfs-version)"
    sudo dm-bake \
      --dhv-binary "${{ inputs.dhv_binary }}" \
      --kernel "${{ inputs.kernel }}" \
      --rootfs "${{ inputs.rootfs }}" \
      --memory-mib-max "${{ inputs.max_machine_memory_mib }}" \
      --max-vcpus "${{ inputs.max_machine_burst_vcpus }}" \
      --image-version "noble@${VERSION}" \
      --output /tmp/snapshot
```

After Hollywood, the program is normal TypeScript with typed inputs and
execve-shaped command calls:

```typescript
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
	`${input.imageName}@${rootfsVersion}`,
	"--output",
	input.output,
]);
```

GitHub still sees a boring action step:

```yaml
- name: Bake VM snapshot
  uses: ./.github/actions/dcs-bake-vm-snapshot
  with:
    dhv-binary: /usr/local/bin/dedalus-hypervisor
    kernel: /tmp/vmlinux
    rootfs: /tmp/rootfs.raw
    memory-mib-max: ${{ inputs.max_machine_memory_mib }}
    max-vcpus: ${{ inputs.max_machine_burst_vcpus }}
    output: /tmp/snapshot
```

Hollywood is TypeScript-first, language-tolerant. First-class Hollywood scripts
are TypeScript because GitHub's official action toolkit is TypeScript-shaped:
`@actions/core`, `@actions/exec`, `action.yml`, `node24`, and `dist/index.js`
are the paved road.

Other languages still work as executables. Call Python, shell scripts, Rust
binaries, or Go binaries through `exec(file, args)`. Hollywood keeps the
GitHub-facing contract typed while letting existing tools do the work.

```typescript
await exec("python3", [
	"ci/scripts/publish_artifact.py",
	"--bucket",
	input.bucket,
	"--key",
	input.key,
]);
```

## What You Get

Write command execution as an `execve(2)`-shaped value. `execve(2)` is the
Unix system call shape where a program receives an executable path and an array
of arguments, not one shell string:

```typescript
await exec("sudo", [
	"dm-bake",
	"--dhv-binary",
	input.dhvBinary,
	"--memory-mib-max",
	input.memoryMibMax.toString(),
]);
```

There is no shell interpolation in that example. Each argument is already an
argument. Your future self does not need to remember which layer of YAML,
shell, and GitHub expression syntax owns the next quote character. Skin clears
up. Eyesight improves. The pager gets bored.

Because command execution is async, independent work stays naturally
parallelizable:

```typescript
const [lint, test] = await Promise.all([exec("pnpm", ["lint"]), exec("pnpm", ["test"])]);
```

Build GitHub expressions through typed helpers when you can. A typo like
`gh.github.workfloooooow` fails in TypeScript instead of becoming a surprise in
Actions:

```typescript
import { format, gh } from "@dedalus-labs/hollywood/expr";

concurrency: {
	group: format("{0}-{1}", gh.github.workflow, gh.github.ref),
	queue: "max",
}
```

Keep environment policy in one typed registry when an action needs account or
promotion rules:

```typescript
import { defineEnvironmentRegistry, resolveEnvironment } from "@dedalus-labs/hollywood/environments";

const dcs = defineEnvironmentRegistry({
	accounts: {
		dev: { id: "089042446622" },
		prod: { id: "558999820298" },
	},
	environments: {
		dev: { account: "dev", branches: ["dev"] },
		preview: { account: "dev", artifactSource: "dev", branches: ["preview"] },
		prod: { account: "prod", artifactSource: "preview", branches: ["main"] },
	},
} as const);

const prod = resolveEnvironment(dcs, "prod");
// prod.accountId == "558999820298"
// prod.artifactSource == "preview"
```

Test the script locally:

```typescript
await runAction(bakeSnapshot, {
	with: {
		dhvBinary: "/usr/local/bin/dedalus-hypervisor",
		memoryMibMax: "32768",
	},
	fs: nodeFs,
	exec: nodeExec,
	runner: { uidGid: "1001:1001" },
});
```

Generate ordinary GitHub Actions files:

```bash
hollywood generate "ci/**/*.ts" --output .
```

```yaml
name: Bake VM Snapshot
description: Run dm-bake without embedding shell in workflow YAML.
runs:
  using: node24
  main: dist/index.js
```

Hollywood can generate and validate GitHub Actions-compatible files, run scripts
on the host, and run the same scripts through a Lima VM when the script needs
Linux. It does not pretend to execute whole GitHub workflow jobs locally.

## Local Action Runs

Run an exported action directly on the host:

```bash
hollywood run ci/dcs/dm/bake-vm-snapshot.ts \
  --export bakeSnapshot \
  --with dhvBinary=/usr/local/bin/dedalus-hypervisor \
  --with kernel=/tmp/vmlinux \
  --with rootfs=/tmp/rootfs.raw \
  --with output=/tmp/snapshot \
  --with memoryMibMax=32768 \
  --with maxVcpus=16 \
  --with imageVersion=noble@2026.05.14
```

Run the same action with every `exec(file, args)` call routed through Lima:

```bash
hollywood run ci/go/s3-cache.ts \
  --export s3Cache \
  --lima kvm \
  --start-vm \
  --with mode=restore \
  --with bucket=ci-cache \
  --with prefix=go \
  --with key=linux-arm64 \
  --with archivePath=/tmp/cache.tar.gz \
  --with contentsPath=/tmp/go-cache
```

The VM path is still execve-shaped. Hollywood invokes:

```text
limactl shell --tty=false --start kvm -- <file> <arg>...
```

No command is rewritten into shell text. If a Lima VM is stopped and
`--start-vm` was not passed, the run fails before the action starts. If a script
needs containerd or KVM, request that contract explicitly with
`--require-containerd` or `--require-kvm`.

## Generated Action Model

Hollywood generates the official action wrapper. The script remains a plain
TypeScript value:

```typescript
// .github/actions/dcs/dm/bake-vm-snapshot/src/action.ts
export const bakeSnapshot = action({
	name: "Bake VM Snapshot",
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

The generated action is ordinary GitHub Actions metadata:

```yaml
# .github/actions/dcs/dm/bake-vm-snapshot/action.yml
name: dcs-bake-vm-snapshot
description: Run dm-bake without embedding shell in workflow YAML.
runs:
  using: node24
  main: dist/index.js
```

Hollywood also generates the tiny TypeScript entrypoint that adapts the script
to GitHub's official toolkit:

```typescript
// .github/actions/dcs/dm/bake-vm-snapshot/src/index.ts
import { runGitHubAction } from "@dedalus-labs/hollywood/action-runtime";
import { bakeSnapshot } from "./action.ts";

void runGitHubAction(bakeSnapshot);
```

`runGitHubAction` is the bridge to official TypeScript action support. It reads
inputs through `@actions/core`, executes commands through `@actions/exec`, and
writes outputs back through `@actions/core`. Local tests call `runAction` with
mock or real executors. GitHub calls the generated JavaScript action. Both paths
run the same script object.

Large actions can stay readable by composing smaller Hollywood actions inside
`run`:

```typescript
run: async ({ call, input }) => {
	const artifacts = await call(resolveArtifacts, { version: input.version });
	const metadata = await call(readBuildMetadata, { uri: artifacts.build_metadata_uri });
	return assembleRelease(input, artifacts, metadata);
};
```

`call` reuses the same executor, filesystem, logger, and runner context. It is
not nested workflow YAML; GitHub still sees one canonical action step.

The remaining packaging step is still explicit: the generated entrypoint must be
bundled to the `dist/index.js` file named by `action.yml`. Hollywood does not yet
own that bundling command.

## First Real Fixture: Dedalus Machines Bake

The first hard case is the Dedalus Machines snapshot bake. The production path
lives in:

- `.github/workflows/dcs-guest-artifacts.yml`
- `apps/cloud/apps/dcs/src/runtime/bake/src/main.rs`
- `apps/cloud/apps/dedalus-machines/canary/scripts/bake-guest-snapshot.sh`

This fixture is useful because it stresses the exact parts that container-based
GitHub Actions emulators get wrong:

| Requirement          | Why Hollywood has to model it                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `dedalus-kvm` runner | The job requires Linux Kernel-based Virtual Machine (KVM), Intel VMX, and nested virtualization. |
| Passwordless `sudo`  | `dm-bake` creates loop devices, TAP networking, and root-owned snapshot files.                   |
| Host fingerprint     | The snapshot cache key depends on CPU vendor, family, model, stepping, and flags.                |
| Mutable rootfs       | The bake mutates `rootfs.raw`; the post-bake rootfs must be published with the snapshot.         |
| S3 artifact cache    | Cache hits must prove every required snapshot, template, and epoch0 file exists.                 |
| Failure artifacts    | The `.work` directories must be handed back to the runner user so logs survive failure.          |

The MVP does not need to bake a machine on a laptop. It needs to parse this job,
name its requirements, and reject impossible local environments before execution.
That gives us a crisp contract for adding remote KVM workers later.

## Current SDK Surface

The package exports the first narrow script authoring surface:

```typescript
import {
	action,
	booleanInput,
	choiceInput,
	integerInput,
	job,
	nodeExec,
	nodeFs,
	nodeLog,
	pathDependencies,
	pathInput,
	probeLimaEnvironment,
	runAction,
	runGitHubAction,
	stringOutput,
	uses,
	workflow,
	generateActionEntrypointFile,
	generateActionFile,
	generateActionFiles,
	generateActionMetadata,
	generateWorkflowFile,
	renderActionFile,
	renderWorkflowFile,
	validateActionMetadataContent,
	validateWorkflowContent,
	writeGeneratedFiles,
} from "@dedalus-labs/hollywood";
import { defineMatrix, format, gh } from "@dedalus-labs/hollywood/expr";

const bakeSnapshot = action({
	name: "Bake VM Snapshot",
	description: "Run dm-bake without embedding shell in workflow YAML.",
	localActionPath: "dcs/dm/bake-vm-snapshot",
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

const build = defineMatrix({
	runner: ["dedalus-kvm"],
} as const);

generateActionMetadata(bakeSnapshot);
renderActionFile(
	generateActionFile(bakeSnapshot, {
		sourcePath: ".github/actions/dcs/dm/bake-vm-snapshot/src/action.ts",
		actionsDir: ".github/actions",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
	}),
);
generateActionFiles([
	{
		action: bakeSnapshot,
		sourcePath: ".github/actions/dcs/dm/bake-vm-snapshot/src/action.ts",
		actionsDir: ".github/actions",
	},
]);
generateActionEntrypointFile(bakeSnapshot, {
	sourcePath: ".github/actions/dcs/dm/bake-vm-snapshot/src/action.ts",
	actionsDir: ".github/actions",
	exportName: "bakeSnapshot",
	generatedAt: new Date("2026-05-14T00:00:00.000Z"),
});
uses(bakeSnapshot, {
	name: "Bake VM snapshot",
	with: {
		dhvBinary: "/usr/local/bin/dedalus-hypervisor",
		memoryMibMax: "${{ inputs.max_machine_memory_mib }}",
	},
});
renderWorkflowFile(
	generateWorkflowFile({
		sourcePath: "ci/dcs/guest-artifacts.ts",
		sourceRoot: "ci",
		workflowsDir: ".github/workflows",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
		workflow: workflow({
			name: "DCS Guest Artifacts",
			on: { workflow_dispatch: {} },
			concurrency: {
				group: format("{0}-{1}", gh.github.workflow, gh.github.ref),
				queue: "max",
			},
			jobs: {
				bake_snapshot: job({
					"runs-on": build.runner,
					strategy: { matrix: build, "max-parallel": 2 },
					steps: [
						uses(bakeSnapshot, {
							name: "Bake VM snapshot",
							with: {
								dhvBinary: "/usr/local/bin/dedalus-hypervisor",
								memoryMibMax: "${{ inputs.max_machine_memory_mib }}",
							},
						}),
					],
				}),
			},
		}),
	}),
);

const changes = pathDependencies("changes", {
	terraform: ["apps/cloud/apps/dcs/tf/**", ".github/actions/terraform/**"],
});

renderWorkflowFile(
	generateWorkflowFile({
		sourcePath: "ci/dcs/static-validation.ts",
		sourceRoot: "ci",
		workflowsDir: ".github/workflows",
		workflow: workflow({
			name: "DCS Static Validation",
			on: { pull_request: { paths: changes.workflowPaths } },
			jobs: {
				[changes.jobId]: changes.job(),
				infracost: job({
					name: "Terraform cost",
					needs: changes.jobId,
					if: changes.terraform.changed,
					"runs-on": "ubuntu-24.04",
					steps: [{ uses: "./.github/actions/terraform/infracost" }],
				}),
			},
		}),
	}),
);

validateWorkflowContent({
	name: ".github/workflows/dcs-guest-artifacts.yml",
	content:
		"on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n",
});
validateActionMetadataContent({
	name: ".github/actions/dcs/dm/bake-vm-snapshot/action.yml",
	content: "name: bake\ndescription: bake\nruns:\n  using: node24\n  main: dist/index.js\n",
});

await runAction(bakeSnapshot, {
	with: {
		dhvBinary: "/usr/local/bin/dedalus-hypervisor",
		memoryMibMax: "32768",
	},
	fs: nodeFs,
	exec: nodeExec,
	log: nodeLog,
	runner: { uidGid: "1001:1001" },
});

await writeGeneratedFiles(
	[
		generateActionFile(bakeSnapshot, {
			sourcePath: ".github/actions/dcs/dm/bake-vm-snapshot/src/action.ts",
			actionsDir: ".github/actions",
		}),
		generateActionEntrypointFile(bakeSnapshot, {
			sourcePath: ".github/actions/dcs/dm/bake-vm-snapshot/src/action.ts",
			actionsDir: ".github/actions",
			exportName: "bakeSnapshot",
		}),
	],
	{ outputDir: process.cwd() },
);

// Or let the CLI discover exported actions and workflows:
// hollywood generate "ci/**/*.ts" --output .

void runGitHubAction(bakeSnapshot);

await probeLimaEnvironment({ name: "kvm", exec: nodeExec, start: true });
```

Generated files are rendered through GitHub's upstream workflow parser before
Hollywood returns YAML content. If the generated workflow or `action.yml` is not
accepted by that parser, rendering fails before anything is written into
`.github/`.

## Documentation

Hollywood has a MkDocs manual under `docs/`, shaped after the small open-source
docs sites for `inline-tests-python` and `slurmq`.

```text
docs/
  index.md
  getting-started/
    quickstart.md
  usage/
    scripts.md
    github-actions.md
    local-testing.md
    local-services.md
  recipes/
    s3-cache.md
    bake-vm-snapshot.md
  reference/
    api.md
    generated-files.md
    publishing.md
examples/
  s3-cache.ts
  bake-vm-snapshot.ts
mkdocs.yml
```

Serve it locally:

```bash
uvx --with mkdocs-material \
  --with mkdocs-git-revision-date-localized-plugin \
  --with mkdocs-llmstxt \
  mkdocs serve -f packages/typescript/hollywood/mkdocs.yml
```

The README should stay short: problem, one real example, local test, generated
GitHub output, and links to the docs site.

## Roadmap

Hollywood's current package contract is:

- define typed TypeScript action scripts
- run those scripts locally
- route command execution through Lima when Linux matters
- generate standard GitHub Action files
- model path-dependent CI jobs with typed `needs.<job>.outputs` guards
- validate generated YAML with GitHub's parser

### Package Stability

- [ ] Publish the package as a public MIT-licensed npm package.
- [ ] Add `CHANGELOG.md`.
- [ ] Stabilize the public API surface before `0.1.0`.
- [ ] Keep the published package restricted to `dist`, `README.md`, and
      `package.json`.
- [ ] Document supported Node and GitHub Actions runtime versions.

### Generation

- [ ] Add `hollywood generate --check`.
- [ ] Keep generated `action.yml` and workflow files GitHub-compatible.
- [ ] Keep generated entrypoints small and readable.
- [ ] Make generated timestamps configurable or deterministic.
- [ ] Split source loading from CLI orchestration if the module grows.

### Local Execution

- [ ] Add `--env NAME=value`.
- [ ] Add `--workdir <path>`.
- [ ] Improve typed errors for missing Lima VMs, stopped VMs, missing KVM, and
      missing containerd.
- [ ] Add first-class examples for MinIO and LocalStack.
- [ ] Keep command execution execve-shaped: `exec(file, args, options)`.

### GitHub Actions Coverage

- [ ] Expand typed workflow fields as real GitHub use cases require them.
- [ ] Improve typed expression helpers for `github`, `matrix`, `needs`, and job
      outputs.
- [ ] Add examples for concurrency, permissions, services, matrix jobs, and
      reusable workflows.
- [ ] Keep using upstream GitHub parser validation as the compatibility gate.

### Documentation

- [ ] Add before/after examples for shell-in-YAML versus Hollywood scripts.
- [ ] Add a compact API reference for scripts, actions, workflows, expressions,
      and CLI commands.
- [ ] Add migration docs for handwritten JavaScript actions.
- [ ] Add comparison docs for Dagger, `act`, composite actions, and handwritten
      JavaScript actions.

### Later: Workflow Rehearsal

Hollywood does not currently emulate full GitHub workflow jobs.

A future workflow runner would need:

- [ ] workflow event payload loading
- [ ] job DAG and matrix expansion
- [ ] service container orchestration
- [ ] artifact and cache API shims
- [ ] local secrets, `GITHUB_TOKEN`, and OIDC handling
- [ ] a VM-backed runner contract using Lima or another primary VM engine

## Runtime Boundaries

Hollywood wraps upstream GitHub packages where they are the real contract:

| Layer            | Primary source                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Action authoring | `@actions/core`, `@actions/exec`, `@actions/github`, `@actions/glob`, `@actions/io`, `@actions/tool-cache` |
| Workflow syntax  | `@actions/workflow-parser`                                                                                 |
| Linux local runs | `limactl shell`                                                                                            |

Hollywood omits artifact servers, cache servers, OIDC issuers, and the private
GitHub runner worker protocol until each one has an executable implementation,
tests, and a package-level API.
