# Usage

Hollywood has five working surfaces:

| Surface                                       | Purpose                                               |
| --------------------------------------------- | ----------------------------------------------------- |
| [Scripts](scripts.md)                         | Define typed inputs, outputs, logs, and commands.     |
| [Generated GitHub Actions](github-actions.md) | Produce `action.yml`, entrypoints, and workflow YAML. |
| [Local Testing](local-testing.md)             | Run scripts before pushing to GitHub.                 |
| [Local Services](local-services.md)           | Test scripts against MinIO, LocalStack, and Lima.     |
| [Execution Backends](../backends/index.md)    | See where local script commands can run.              |

The rule of thumb is simple: write imperative logic in TypeScript, keep YAML as
orchestration, and validate generated files before they land in `.github`.
