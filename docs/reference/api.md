# API Surface

Hollywood's current application programming interface (API) surface is
intentionally small.

## Script authoring

| API             | Purpose                                                   |
| --------------- | --------------------------------------------------------- |
| `action`        | Define a typed script action.                             |
| `stringInput`   | Read a required or defaulted string input.                |
| `integerInput`  | Parse a string input into an integer.                     |
| `booleanInput`  | Parse a string input into a boolean.                      |
| `choiceInput`   | Restrict a string input to a closed set of values.        |
| `pathInput`     | Mark an input as a filesystem path.                       |
| `stringOutput`  | Declare a string output.                                  |
| `call`          | Invoke a child action with typed inputs inside `run`.     |
| `exec`          | Run an executable plus argument array inside `run`.       |
| `summary.table` | Write a sanitized GitHub step-summary table inside `run`. |
| `summaryCode`   | Render a summary cell as escaped inline code.             |
| `summaryText`   | Render a summary cell as escaped plain text.              |
| `expr`          | Validate and wrap a GitHub Actions expression.            |

## Step Summary Tables

`summary.table(title, rows)` writes one table to the GitHub step summary. The
title and each row label are escaped plain text. Row values must be
`summaryText(value)` for plain text or `summaryCode(value)` for inline code.
Hollywood does not accept raw HTML, Markdown, or bare string values in table
cells.

## Expressions

| API                               | Purpose                                              |
| --------------------------------- | ---------------------------------------------------- |
| `gh`                              | Namespace for typed `github.*` and `runner.*` refs.  |
| `github`                          | Typed references to common `github.*` context names. |
| `runner`                          | Typed references to common `runner.*` context names. |
| `format`                          | Build a validated `format(...)` expression.          |
| `contains`                        | Build a validated `contains(...)` expression.        |
| `hashFiles`                       | Build a validated `hashFiles(...)` expression.       |
| `eq` / `ne`                       | Build validated equality expressions.                |
| `and` / `or`                      | Compose validated boolean expressions.               |
| `selectString`                    | Select between typed string expression values.       |
| `valueOr`                         | Compose typed value expressions with OR.             |
| `not`                             | Negate a validated expression.                       |
| `input`                           | Reference `inputs.<name>`.                           |
| `matrix`                          | Reference `matrix.<name>`.                           |
| `needsOutput`                     | Reference `needs.<job>.outputs.<name>`.              |
| `needsResult`                     | Reference `needs.<job>.result`.                      |
| `needsResultIs` / `needsResultIn` | Compare job results.                                 |
| `stepOutput`                      | Reference `steps.<step>.outputs.<name>`.             |
| `defineMatrix`                    | Keep matrix values and typed matrix refs together.   |
| Status helpers                    | `always`, `cancelled`, `failure`, `success`.         |

Expression helpers are also exported from `@dedalus-labs/hollywood/expr` so workflow
authoring can keep orchestration imports separate from script/action imports.

## Runtime adapters

| API                               | Purpose                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `runAction`                       | Run a script with explicit filesystem, executor, logger, and runner context. |
| `runGitHubAction`                 | Run a script through `@actions/core` and `@actions/exec`.                    |
| `RunGitHubActionOptions.logColor` | Control command-log color: `auto`, `always`, or `never`.                    |
| `nodeExec`                        | Execute commands on the local machine.                                       |
| `nodeFs`                          | Read local files.                                                            |
| `nodeLog`                         | Write local logs to stdout and stderr.                                       |
| `withContainer`                   | Own one Docker, Podman, or Apple container action session.                   |
| `probeRunner`                     | Capture a sanitized, typed runner inventory.                                 |
| `defineRunnerContract`            | Define the required operating system, paths, and tools.                      |
| `verifyRunner`                    | Compare a runner probe with its required contract.                           |
| `compareRunnerProbes`             | Classify contract, inventory, and provider drift.                            |

## Action runtime import

GitHub JavaScript actions should import the smaller action runtime surface:

```typescript
import { action, runGitHubAction } from "@dedalus-labs/hollywood/action-runtime";
```

This subpath exports script authoring primitives and the GitHub adapter without
pulling workflow generation or YAML validation code into every bundled action.

## Generation

| API                            | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `generateActionMetadata`       | Convert a script action into `action.yml` metadata.        |
| `generateActionFile`           | Produce a generated `action.yml` file object.              |
| `generateActionEntrypointFile` | Produce a generated TypeScript entrypoint file object.     |
| `generateActionFiles`          | Generate action metadata files with duplicate path checks. |
| `generateUsesStep`             | Convert typed script inputs into GitHub `with:` names.     |
| `uses`                         | Reference a generated local action from a workflow step.   |
| `generateWorkflowFile`         | Produce a flattened workflow file object.                  |
| `workflow`                     | Type a GitHub workflow definition without extra runtime.   |
| `job`                          | Type a GitHub workflow job without extra runtime.          |
| `writeGeneratedFiles`          | Write generated files under an explicit output directory.  |

`GitHubWorkflow` types cover the orchestration fields Hollywood emits today:
`permissions`, `concurrency`, job `needs`, matrix `strategy`, `services`,
`env`, `if`, and mutually exclusive `run`/`uses` steps. `queue: max` is typed
so it cannot be combined with `cancel-in-progress`.

## CLI

| Command                   | Purpose                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `hollywood generate`      | Discover exported actions and workflows from source files. |
| `hollywood run`           | Run one exported Hollywood action locally.                 |
| `hollywood runner probe`  | Write a sanitized runner inventory.                        |
| `hollywood runner verify` | Verify a probe against a runner contract.                   |
| `hollywood runner compare` | Classify drift between two runner probes.                  |

The command infers `gha/**/*.ts` or `ci/**/*.ts` from the repository:

```bash
npx hollywood generate
```

Supported override flags:

| Flag                  | Default             | Purpose                                      |
| --------------------- | ------------------- | -------------------------------------------- |
| `--output`            | `.`                 | Repository root where files are written.     |
| `--actions-dir`       | `.github/actions`   | Destination for generated local actions.     |
| `--workflows-dir`     | `.github/workflows` | Destination for generated workflows.         |
| `--source-root`       | inferred            | Prefix removed before workflow flattening.   |
| `--root-import-alias` | inferred            | Import alias for generated action entrypoints. |

The source root, root import alias, and generated output directories are CLI
options, not hardcoded paths. Hollywood infers `@` from a `tsconfig.json`
`@/*` path alias when present.

Run an action with an explicit provider:

```bash
npx hollywood run gha/s3-cache.ts --export s3Cache --provider docker --with mode=restore
```

The default image is GitHub's official minimal Actions runner image, pinned by
digest. Override it only with another digest-pinned image:

```bash
npx hollywood run gha/s3-cache.ts \
  --export s3Cache \
  --provider podman \
  --image ghcr.io/acme/runner@sha256:<digest> \
  --with mode=restore
```

The exact lifecycle and compatibility boundary are documented in [Execution
Backends](../backends/index.md). The reproducible image and its publication
contract are documented in [Runner Image](../backends/runner-image.md).

## Validation

| API                                | Purpose                                                |
| ---------------------------------- | ------------------------------------------------------ |
| `validateActionMetadataContent`    | Return parser diagnostics for an action metadata file. |
| `validateWorkflowContent`          | Return parser diagnostics for a workflow file.         |
| `assertValidActionMetadataContent` | Throw if action metadata is invalid.                   |
| `assertValidWorkflowContent`       | Throw if workflow YAML is invalid.                     |
