# Usage

Hollywood has six working surfaces:

| Surface                                       | Purpose                                               |
| --------------------------------------------- | ----------------------------------------------------- |
| [Scripts](scripts.md)                         | Define typed inputs, outputs, logs, and commands.     |
| [Generated GitHub Actions](github-actions.md) | Produce `action.yml`, entrypoints, and workflow YAML. |
| [Local Testing](local-testing.md)             | Run scripts before pushing to GitHub.                 |
| [GitHub runner execution](github-runner.md)   | Run one job with GitHub's official runner.            |
| [Local Services](local-services.md)           | Test scripts against MinIO and LocalStack.            |
| [Execution Backends](../backends/index.md)    | See where local actions can run.                      |

The rule of thumb is simple: write imperative logic in TypeScript, keep YAML as
orchestration, and validate generated files before they land in `.github`.
