# Roadmap

Hollywood is early. This roadmap tracks the work we think is useful for people
building GitOps, DevOps, and CI/CD workflows with typed TypeScript instead of
shell-in-YAML.

The roadmap is not a release promise. It is a public index of work that could
use design discussion, maintainer review, or outside contributions.

## How Work Is Tracked

Use GitHub issues for concrete work. Use this file for the larger direction.

- File a feature request when you have a workflow pain Hollywood cannot express.
- Link the TypeScript you want to write and the GitHub Actions YAML it should
  generate.
- Maintainers can mark scoped work as `help wanted`.
- Maintainers can mark small, self-contained work as `good first issue`.
- Larger API changes should start as an issue before a pull request.

If an issue and this file disagree, the issue is more current.

## Current Focus

Hollywood should become a small, boring tool that makes CI/CD programs easier
to write, test, generate, and review.

Near-term work should keep that shape:

- Better examples for common CI/CD workflows.
- Better typed helpers for workflow authoring.
- Better local testing stories for actions that call real tools.
- Better validation for generated GitHub Actions files.
- Better documentation for contributors and maintainers.

## Contribution Lanes

### Examples and Recipes

Good examples make the project easier to adopt. Useful recipes include:

- publishing container images
- running Terraform plan/apply wrappers
- promoting GitOps manifests between environments
- restoring and saving S3-compatible caches
- generating release artifacts
- validating pull requests with path-dependent jobs

Each recipe should include a runnable TypeScript action, expected generated
GitHub Actions shape, and at least one focused test.

### Workflow Authoring

Hollywood should make common GitHub Actions structure typed without hiding the
underlying YAML model.

Potential work:

- More typed helpers for permissions, environments, concurrency, matrices, and
  service containers.
- Safer defaults for pull request workflows.
- Clearer errors when a workflow object cannot be rendered as valid GitHub
  Actions YAML.
- Better examples of reusable workflows and local actions working together.

### Local Execution

Local runs should prove the command contract before GitHub runs it.

Potential work:

- More ergonomic fake executors for tests.
- Local service examples for MinIO, LocalStack, registries, and databases.
- Better Lima diagnostics when a requested VM or capability is missing.
- More execution backends beyond Lima, including Apple Container, Docker,
  smolmachines, and Arch/pacman-shaped recipes.
- Documentation for when local execution is useful and when GitHub must remain
  the source of truth.

### CLI

The CLI should stay small and scriptable.

Potential work:

- `init` scaffolding for a new Hollywood action or workflow.
- Watch mode for regenerate-on-change during local development.
- More readable `check` output for generated file drift.
- Better package-manager-neutral examples.

### Security and CI/CD Hygiene

Hollywood should help repositories avoid dangerous CI/CD defaults.

Potential work:

- Validation rules for unsafe workflow triggers.
- Validation rules for secret exposure in pull request workflows.
- Optional checks for unpinned third-party actions.
- Documentation for trusted publishing and GitHub App tokens.

## Not Goals

Hollywood should not become a full GitHub Actions emulator. GitHub still owns
event payloads, runner scheduling, permissions, hosted runner behavior, secrets,
and the private runner protocol.

Hollywood should also avoid provider-specific framework sprawl. It should expose
small primitives that let users write their own CI/CD logic clearly.

## How To Help

Start with an issue. For implementation work, include:

- the workflow problem
- the TypeScript API you want to write
- the generated YAML you expect
- local test coverage you plan to add
- any compatibility or security concerns

For docs work, include the page you want to improve and the reader who would
benefit from the change.
