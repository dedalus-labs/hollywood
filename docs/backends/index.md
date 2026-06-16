# Execution Backends

Execution backends decide where a Hollywood script command runs.

Hollywood's script contract stays the same for every backend:

- `exec(file, args)` receives an executable path and an argument array.
- `cwd`, environment, and exit policy stay structured.
- Missing capabilities reject the local run before the action starts.
- GitHub still runs generated actions on real GitHub runners.

## Backend Matrix

| Backend                              | Status    | Use cases                                                      |
| ------------------------------------ | --------- | -------------------------------------------------------------- |
| Host process                         | Supported | Commands that should run on the current developer machine.     |
| [Lima](lima.md)                      | Supported | Linux command execution from macOS or another host.            |
| [Apple Container](container.md)      | Planned   | OCI images backed by lightweight macOS virtual machines.       |
| [Docker](docker.md)                  | Planned   | Containerized tools where the Docker CLI is already available. |
| [smolmachines](smolmachines.md)      | Candidate | Portable virtual machine images with fast local startup.       |
| [Arch / pacman](pacman.md)           | Candidate | Arch Linux package workflows and pacman-shaped recipes.        |

Supported means Hollywood has a public API or CLI flag for that backend today.
Planned means the backend shape is useful, but the package does not expose it
yet. Candidate means the page records an integration direction for discussion.

## Why Backends Exist

The backend boundary is intentionally small. A backend only needs to answer:

1. How do we run `<file> <arg>...` without shell interpolation?
2. How do we pass structured working directory and environment values?
3. How do we prove required capabilities before `run` starts?
4. How do we report the runner user and group when file ownership matters?

Everything else belongs in the script or the generated GitHub Actions workflow.
Hollywood should not become a full GitHub Actions emulator.
