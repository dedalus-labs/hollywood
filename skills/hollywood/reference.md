# Hollywood reference

Every public export, command and flag, with the file in
[the Hollywood repository](https://github.com/dedalus-labs/hollywood) that
implements it. Read the source before assuming Hollywood lacks a feature.

## Package entry points

| Import | Holds |
| --- | --- |
| `@dedalus-labs/hollywood` | workflows, generation, `runAction`, host executors, containers, runner API |
| `@dedalus-labs/hollywood/action-runtime` | what a bundled action imports: `action`, inputs, outputs, `runGitHubAction` |
| `@dedalus-labs/hollywood/expr` | expression helpers |
| `@dedalus-labs/hollywood/environments` | the environment registry |

The package is ESM only. `require()` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`,
so call it from an ESM script or a test file.

## Actions

`action({ name, description, localActionPath, inputs, outputs, run })`
(`src/script.ts`).
`run` receives `input`, `exec`, `fs`, `log`, `runner`, `summary` and `call`.

- Inputs: `stringInput`, `pathInput`, `integerInput`, `booleanInput` and
  `choiceInput`. Outputs: `stringOutput`. An input with a `default` is
  optional. Defaults and outputs are strings.
- camelCase names become kebab-case in `action.yml`.
- `exec(file, args, { cwd, env, exitPolicy })` runs without a shell. The
  default `exitPolicy: "zero"` throws on a nonzero exit, and `"any"` returns it.
- `call(child, inputs)` runs another action in the same step with the same
  services.
- `runGitHubAction` sets outputs, writes a table of the commands it ran to the
  step summary, and marks the step failed instead of throwing.
- `summary.table` escapes every cell and refuses raw HTML or Markdown.
- Hollywood never masks values. Mask secrets in the action itself.

## Workflows

`workflow(def)` and `job(def)`
(`src/generate.ts`).
Triggers are typed, including `merge_group`, `workflow_call` and
`workflow_dispatch` inputs. A reusable workflow job takes `uses`, `with` and
`secrets` (`"inherit"` or a map).

- `uses(action, { name, with })` builds the local `./.github/actions/<path>`
  step and types `with` from the action's inputs.
- `localAction({ name, localActionPath, inputs })` types a local action
  Hollywood does not implement.
- `command({ file, args })` writes a shell-free `run:` step. It moves a
  whole-expression argument into `HOLLYWOOD_COMMAND_ARG_<i>` and rejects an
  argument that mixes literal text with `${{ }}`. Use `format()` for that.
- `unsafeShell(script)` is the escape hatch. It does no quoting or validation.
- `defineMatrix({...} as const)` returns typed matrix references.

Expressions
(`src/expressions.ts`):
`expr` parses its body with GitHub's own parser and throws on invalid input.
`input`, `matrix`, `envVar`, `secret`, `needsOutput`, `needsResult` and
`stepOutput` name contexts. `format`, `contains`, `startsWith`, `hashFiles`,
`eq`, `ne`, `and`, `or`, `not`, `selectString`, `valueOr`, `always`,
`cancelled`, `failure` and `success` build expressions.

`defineEnvironmentRegistry({ accounts, environments })`, `resolveEnvironment`
and `selectEnvironmentName` live in `/environments`.

## Generation and checks

| Command | Does | Watch for |
| --- | --- | --- |
| `hollywood generate` | writes `action.yml`, each action's `src/index.ts` and workflow YAML, validated with GitHub's workflow parser | reports `created`, `updated` or `unchanged` per file |
| `hollywood check --generated` | regenerates, rejects YAML without the generated header, then `git diff --exit-code` | it writes files before it diffs |
| `hollywood check --workflow-security` | rejects `pull_request_target`, `workflow_run`, `actions/cache@`, `cache: npm` and unpinned `uses:` | scans sources and workflows |
| `hollywood build` | bundles each `src/index.ts` to `dist/index.js` | ESM for Node 24, never minified |

## Running actions locally

The [layer table](SKILL.md#pick-the-layer) says when to use each.

- `runAction(action, { with, exec, fs, log, runner, summary })`
  (`src/script.ts`)
  runs an action in-process with whatever services it is given.
- `nodeExec`, `nodeFs`, `nodeLog` and `currentRunner()`
  (`src/local.ts`)
  are the real host services. `nodeExec` spawns without a shell.
- `hollywood run <source> --export <name> --provider container|docker|podman
  [--image <ref@sha256:...>] [--with name=value]` bundles one action and runs
  it in one container. It mounts the working tree at `/github/workspace`, sets
  the `GITHUB_*` file-command paths, passes inputs as `INPUT_<NAME>` and prints
  `output\tname=value`. The image must be digest-pinned. A missing provider
  fails with `ContainerProviderUnavailableError`. It never tries another.
- `withContainer` and `withLocalContainer` are the library forms. `hostExec`
  injects a fake provider for tests. The CLI does not expose it.
- For S3 behavior use MinIO, and for IAM, STS or DynamoDB use LocalStack
  ([Local services](https://oss.dedaluslabs.ai/hollywood/usage/local-services/)).
  Pass endpoints and credentials explicitly.

## Connected jobs

- `hollywood runner jit-config OWNER/REPO --runner-group-id <id> --label <labels...>`
  writes a one-job JIT configuration with mode 0600. The token needs repository
  administration write access.
- `hollywood runner listen <jit-config> --provider <p>` runs the official
  listener and worker for exactly one job, then removes the container.
  `--container-engine-socket` is required for `container:` jobs, `services:`
  and Docker actions. `--require-job-container`, the job hooks and
  `--diagnostics` are optional.
- `hollywood runner probe`, `verify` and `compare` record a runner's tools and
  paths and check them against a contract.

## Limits

Hollywood is not a local GitHub Actions emulator. It has no local artifact
server, cache server or OIDC issuer, does not run pre or post handlers under
`hollywood run`, and does not reproduce the GitHub-hosted `ubuntu-latest`
machine. A connected job needs its workflow on the default branch.
