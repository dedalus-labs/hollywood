# Execution providers

Execution providers run Hollywood's fast action executor or an official GitHub
runner in a local Linux container.

`hollywood run` requires one provider:

- `docker`.
- `podman`.
- `container` from Apple.

Hollywood does not detect a provider or use a different runtime when the
selected provider is unavailable.

## Provider matrix

| Provider | Runtime | Supported host |
| --- | --- | --- |
| `docker` | [Docker Engine or Docker Desktop](https://docs.docker.com/engine/) | A Linux, macOS, or Windows host that Docker supports. |
| `podman` | [Podman](https://podman.io/docs/installation) | A Linux, macOS, or Windows host that Podman supports. |
| `container` | [Apple `container`](https://github.com/apple/container) | Apple silicon with macOS 26 or later. |

[Docker VMM](https://docs.docker.com/desktop/features/vmm/) is a virtual
machine manager for Docker Desktop on Apple silicon. Select `--provider
docker` when Docker Desktop uses Docker VMM. Hollywood does not require a
separate Docker VMM provider.

In fast action mode, each provider creates one container and mounts the
repository at `/github/workspace`. Hollywood creates paths for `GITHUB_ENV`,
`GITHUB_EVENT_PATH`, `GITHUB_OUTPUT`, `GITHUB_PATH`, `GITHUB_STATE`, and
`GITHUB_STEP_SUMMARY`. It also sets `GITHUB_WORKSPACE`, `HOME`, `RUNNER_TEMP`, and
selected runner environment variables.

The default image derives from GitHub's official, digest-pinned
[`actions-runner`](https://docs.github.com/en/actions/concepts/runners/actions-runner-controller#software-components)
image. The upstream image publishes native Linux `amd64` and `arm64`
manifests. Hollywood supports those two image architectures.

`hollywood run` executes the bundled action directly with Node 24. This mode
does not invoke `Runner.Listener` or `Runner.Worker`. It verifies the action
bundle, selected userspace image, workspace mount, inputs, and configured
file-command paths.

`hollywood runner listen` starts GitHub's official `Runner.Listener` with a JIT
configuration. GitHub supplies one job message, and the listener starts the
official `Runner.Worker`. This mode uses GitHub's scheduling, permissions,
action lifecycle, cache and artifact services, OpenID Connect, logs, and job
reporting. See [Run a job with the GitHub runner](../usage/github-runner.md).

The provider controls the kernel, cgroups, networking, mount implementation,
and virtualization in both modes. GitHub controls the connected runner's job
lifecycle. Neither mode reproduces the GitHub-hosted `ubuntu-latest` virtual
machine.

## Provider contract

Each provider must:

- Create and remove one Linux container.
- Execute a file with a structured argument array and no shell interpolation.
- Mount the workspace and configured GitHub protocol files.
- Report a missing executable as `ContainerProviderUnavailableError`.

See [Runner image](runner-image.md) for the image contract, runner probe, and
publication process.
