---
description: TypeScript scripts for GitHub Actions, without shell-in-YAML.
---

# Hollywood

TypeScript scripts for GitHub Actions, without shell-in-YAML.

<p class="hollywood-motto">"Lights, Cameras, (GitHub) Actions!"</p>

Hollywood keeps GitHub Actions as the orchestration layer. GitHub still decides
when jobs run, which runner label they need, which secrets exist, and how jobs
depend on each other.

Hollywood replaces the part GitHub Actions is bad at: writing imperative
programs inside YAML strings.

```typescript
await exec("docker", [
	"buildx",
	"build",
	"--file",
	input.dockerfile,
	"--tag",
	`${input.image}:${input.tag}`,
	"--push",
	input.context,
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
- Keep the runtime dependency surface small: six direct dependencies, mostly
  GitHub action packages.

Hollywood does not emulate the private GitHub runner worker protocol. It keeps
the loop smaller: write the script, run it locally or through Lima, generate
GitHub-compatible files, and let GitHub run the generated action.

## First real targets

Hollywood fits the parts of DevOps and GitOps workflows that already want to be
programs:

| Use case                        | Why it matters                                                               |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Container image publishing      | Build, tag, and push images without shell-in-YAML.                           |
| Terraform plan/apply wrappers   | Keep environment policy and command arguments typed.                         |
| GitOps manifest promotion       | Validate promotion inputs before mutating deployment state.                  |
| S3-compatible cache actions     | Exercise real object-storage behavior in local tests.                        |
| Path-dependent CI jobs          | Keep required checks explicit while skipping irrelevant expensive jobs.       |
| Lima action runs                | Prove Linux command execution locally before expensive GitHub pushes.         |

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
python -m pip install -r docs/requirements.txt
python -m mkdocs serve -f mkdocs.yml
```
