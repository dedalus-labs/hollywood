---
description: TypeScript scripts for GitHub Actions, without shell-in-YAML.
---

# Hollywood

TypeScript scripts for GitHub Actions, without shell-in-YAML.

Hollywood keeps GitHub Actions as the orchestration layer. GitHub still decides
when jobs run, which runner label they need, which secrets exist, and how jobs
depend on each other.

Hollywood replaces the part GitHub Actions is bad at: writing imperative
programs inside YAML strings.

```typescript
await exec("sudo", [
	"artifact-pack",
	"--tool-binary",
	input.toolBinary,
	"--memory-mib-max",
	input.memoryMibMax.toString(),
]);
```

That command is an `execve(2)`-shaped value. `execve(2)` is the Unix system call
shape where a process receives an executable path plus an array of arguments.
There is no shell interpolation and no YAML quoting puzzle.

## What Hollywood does

- Write GitHub Actions logic as typed TypeScript scripts.
- Test scripts locally with fake executors or real executors.
- Run scripts through Lima when the script needs a Linux VM.
- Test scripts against local services such as MinIO, an S3-compatible object
  store, or LocalStack, a local Amazon Web Services emulator.
- Generate ordinary `.github/actions/**/action.yml` files.
- Generate tiny TypeScript entrypoints that call GitHub's official action
  toolkit.
- Generate flat `.github/workflows/*.yml` files from deeper source paths.
- Validate generated YAML with upstream GitHub Actions parsers before writing.

Hollywood does not emulate the private GitHub runner worker protocol. It keeps
the loop smaller: write the script, run it locally or through Lima, generate
GitHub-compatible files, and let GitHub run the generated action.

## First real targets

The first Dedalus use cases are intentionally annoying:

| Use case                        | Why it matters                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------ |
| S3 cache                        | Proves scripts can hit Amazon Simple Storage Service-compatible storage first. |
| artifact packaging bake           | Proves scripts can express privileged release artifact work without shell in YAML.  |
| LocalStack infrastructure tests | Proves workflows can depend on local AWS-shaped services.                      |
| Lima action runs                | Proves Linux command execution locally before expensive GitHub pushes.         |

## Next steps

- [Quick Start](getting-started/quickstart.md) - Write and generate your first action.
- [Scripts](usage/scripts.md) - Author typed scripts with inputs, outputs, and command execution.
- [Local Testing](usage/local-testing.md) - Run scripts with mocks, real commands, and local services.
- [Generated GitHub Actions](usage/github-actions.md) - See exactly what lands in `.github`.

---

**For large language models:**

- `llms.txt`
- `llms-full.txt`

**Viewing locally:**

```bash
uvx --with mkdocs-material \
  --with mkdocs-git-revision-date-localized-plugin \
  --with mkdocs-llmstxt \
  mkdocs serve -f packages/typescript/hollywood/mkdocs.yml
```
