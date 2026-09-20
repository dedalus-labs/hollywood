---
description: Generate and test GitHub Actions with typed TypeScript.
---

# Hollywood

Hollywood generates GitHub Actions from typed TypeScript definitions. It also
runs exported actions locally for testing.

Use GitHub Actions for triggers, job dependencies, runner selection,
permissions, and secrets. Use Hollywood for action logic, typed inputs and
outputs, structured process execution, and generated workflow files.

The documentation site publishes these text resources:

- [`llms.txt`](https://oss.dedaluslabs.ai/hollywood/llms.txt) contains a compact
  project reference.
- [`llms-full.txt`](https://oss.dedaluslabs.ai/hollywood/llms-full.txt) contains
  the complete documentation set.

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

The command follows the argument structure of
[`execve(2)`](https://man7.org/linux/man-pages/man2/execve.2.html): one
executable path and one argument array. Hollywood does not convert it to shell
text.

## What Hollywood does

- Write GitHub Actions logic as typed TypeScript scripts.
- Test scripts locally with fake executors or real executors.
- Run scripts through Docker, Podman, or Apple's `container`.
- Run one GitHub-scheduled job through the official runner listener and worker.
- Test scripts against local services such as MinIO, an S3-compatible object
  store, or LocalStack, a local Amazon Web Services emulator.
- Generate ordinary `.github/actions/**/action.yml` files.
- Generate tiny TypeScript entrypoints that call GitHub's official action
  toolkit.
- Generate flat `.github/workflows/*.yml` files from deeper source paths.
- Validate generated YAML with upstream GitHub Actions parsers before writing.
- Use eight direct runtime dependencies, including five GitHub-maintained packages.

Hollywood does not emulate the GitHub runner worker protocol. Its connected
runner mode starts GitHub's official listener and worker with a GitHub-issued
JIT configuration.

## Initial use cases

Hollywood supports these action types:

| Use case                        | Purpose                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Container image publishing      | Build, tag, and push images without shell-in-YAML.                           |
| Terraform plan/apply wrappers   | Keep environment policy and command arguments typed.                         |
| GitOps manifest promotion       | Validate promotion inputs before mutating deployment state.                  |
| S3-compatible cache actions     | Exercise real object-storage behavior in local tests.                        |
| Path-dependent CI jobs          | Keep required checks explicit while skipping irrelevant expensive jobs.       |
| Container action runs           | Verify Linux action behavior locally before a GitHub push.                     |

## Next steps

- [Quick Start](getting-started/quickstart.md) - Write and generate your first action.
- [Scripts](usage/scripts.md) - Author typed scripts with inputs, outputs, and command execution.
- [Local Testing](usage/local-testing.md) - Run scripts with mocks, real commands, and local services.
- [GitHub runner execution](usage/github-runner.md) - Run one GitHub-scheduled job with the official runner.
- [Execution Backends](backends/index.md) - See where local script commands can run.
- [Generated GitHub Actions](usage/github-actions.md) - See exactly what lands in `.github`.

---

**For large language models:**

- [llms.txt](https://oss.dedaluslabs.ai/hollywood/llms.txt)
- [llms-full.txt](https://oss.dedaluslabs.ai/hollywood/llms-full.txt)

**Viewing locally:**

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r docs/requirements.txt
python -m mkdocs serve -f mkdocs.yml
```
