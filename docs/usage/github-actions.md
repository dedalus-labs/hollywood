# Generated GitHub Actions

Hollywood generates ordinary GitHub Actions files. There is no custom runtime
inside the workflow YAML.

## Action metadata

```typescript
generateActionFile(publishImage, {
	sourcePath: ".github/actions/containers/publish-image/src/action.ts",
	actionsDir: ".github/actions",
});
```

This produces:

```text
.github/actions/containers/publish-image/action.yml
```

When the source already lives under `.github/actions/<name>/src`, Hollywood
keeps the generated files in that action directory.

The file contains a normal JavaScript action contract:

```yaml
name: publish-container-image
description: Build and publish a container image without embedding shell in workflow YAML.
runs:
  using: node24
  main: dist/index.js
```

## Entrypoint

```typescript
generateActionEntrypointFile(publishImage, {
	sourcePath: ".github/actions/containers/publish-image/src/action.ts",
	actionsDir: ".github/actions",
	exportName: "publishImage",
});
```

This produces:

```typescript
import { runGitHubAction } from "@dedalus-labs/hollywood/action-runtime";
import { publishImage } from "./action.ts";

void runGitHubAction(publishImage);
```

`runGitHubAction` uses GitHub's official TypeScript packages. Inputs and
outputs go through `@actions/core`. Commands go through `@actions/exec`.

## Action composition

Use `call` inside a parent action when one public GitHub Action should compose
smaller typed Hollywood actions.

```typescript
export const release = action({
	name: "release",
	description: "Compose a release contract.",
	inputs,
	outputs,
	run: async ({ call, input }) => {
		const artifacts = await call(resolveArtifacts, {
			version: input.version,
		});
		const metadata = await call(readBuildMetadata, {
			uri: artifacts.buildMetadataUri,
		});
		return assembleRelease(input, artifacts, metadata);
	},
});
```

`call` does not create nested workflow steps. It invokes the child action in the
same runtime with the same `exec`, `fs`, `log`, and `runner` services.

## Workflow files

Set `localActionPath` on actions you want to call from generated workflows.
Then `uses(action, ...)` derives `./.github/actions/<path>` and preserves the
action's typed inputs.

```typescript
import { generateWorkflowFile, job, uses, workflow } from "@dedalus-labs/hollywood";
import { defineMatrix, format, gh } from "@dedalus-labs/hollywood/expr";

const build = defineMatrix({
	runner: ["ubuntu-latest"],
} as const);

generateWorkflowFile({
	sourcePath: "gha/containers/release.ts",
	sourceRoot: "gha",
	workflowsDir: ".github/workflows",
	workflow: workflow({
		name: "Container Release",
		on: { workflow_dispatch: {} },
		concurrency: {
			group: format("{0}-{1}", gh.github.workflow, gh.github.ref),
			queue: "max",
		},
		jobs: {
			publish_image: job({
				"runs-on": build.runner,
				strategy: { matrix: build, "max-parallel": 2 },
				steps: [
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
	}),
});
```

The source path is flattened:

```text
gha/containers/release.ts
```

becomes:

```text
.github/workflows/containers-release.yml
```

GitHub gets the flat shape it requires. The source tree keeps the nested shape
humans want.

## Path-dependent CI jobs

Use `pathDependencies` when a workflow should stay scheduled but specific jobs
should only run for relevant files. This is the safe shape for required checks:
GitHub path filters can leave skipped workflows pending, while job guards keep
the workflow result explicit.

```typescript
import {
	generateWorkflowFile,
	job,
	pathDependencies,
	workflow,
} from "@dedalus-labs/hollywood";

const changes = pathDependencies("changes", {
	terraform: [
		"infra/terraform/**",
		".github/actions/terraform/**",
	],
	web: [
		"apps/web/**",
		"packages/ui/**",
		"!apps/web/docs/**",
	],
});

generateWorkflowFile({
	sourcePath: "gha/platform/static-validation.ts",
	sourceRoot: "gha",
	workflowsDir: ".github/workflows",
	workflow: workflow({
		name: "Platform Static Validation",
		on: {
			pull_request: { paths: changes.workflowPaths },
		},
		jobs: {
			[changes.jobId]: changes.job(),
			infracost: job({
				name: "Terraform cost",
				needs: changes.jobId,
				if: changes.terraform.changed,
				"runs-on": "ubuntu-24.04",
				steps: [{ uses: "./.github/actions/terraform/infracost" }],
			}),
			web_checks: job({
				name: "Web checks",
				needs: changes.jobId,
				if: changes.web.changed,
				"runs-on": "ubuntu-24.04",
				steps: [{ run: "npm test" }],
			}),
		},
	}),
});
```

`workflowPaths` contains positive patterns only. Negative patterns still apply
inside the generated detector job, so a workflow can start conservatively
without accidentally skipping another dependency.

## Validation

Generated workflow YAML and action metadata pass through upstream GitHub
Actions parsers before Hollywood writes files. Invalid generated content fails
closed.

## CLI

Generate action and workflow files from the inferred source directory:

```bash
npx hollywood generate
```

Hollywood discovers exports by shape:

| Export shape                               | Generated files                                      |
| ------------------------------------------ | ---------------------------------------------------- |
| `action({ name: "s3-cache" })`             | `.github/actions/s3-cache/action.yml` and entrypoint |
| `workflow({ name: "Container Release" })`  | `.github/workflows/<flattened-source-path>.yml`      |

For example, this source tree:

```text
gha/
  actions/
    s3-cache.ts
  workflows/
    cache-example.ts
```

can generate:

```text
.github/
  actions/
    s3-cache/
      action.yml
      src/index.ts
  workflows/
    workflows-cache-example.yml
```

The generated action still needs bundling to `dist/index.js` before GitHub can
run it. The workflow YAML can be committed as-is.

The CLI prints one line per generated file:

```text
created .github/actions/publish-container-image/action.yml
updated .github/actions/publish-container-image/src/index.ts
created .github/workflows/containers-release.yml
```
