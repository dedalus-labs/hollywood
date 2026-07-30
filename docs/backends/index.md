# Execution Backends

Execution providers decide where a Hollywood action runs.

`hollywood run` requires one provider:

- `docker`
- `podman`
- `container` from Apple

There is no provider auto-detection or host fallback.

## Provider Matrix

| Provider    | Runtime | Host boundary |
| ----------- | ------- | ------------- |
| `docker`    | [Docker Engine or Docker Desktop](https://docs.docker.com/engine/) | Linux, macOS, or Windows supported by Docker |
| `podman`    | [Rootless, daemon-backed, or Podman machine](https://podman.io/docs/installation) | Linux, macOS, or Windows supported by Podman |
| `container` | [Apple's `container` CLI](https://github.com/apple/container) | Apple silicon and macOS 26 or newer |

[Docker VMM](https://docs.docker.com/desktop/features/vmm/) is a Docker Desktop
virtual machine manager on Apple silicon. It still exposes the ordinary
`docker` CLI, so select `--provider docker`; no Hollywood-specific backend or
configuration is required.

All three providers create one persistent container for the action, mount the
repository at `/github/workspace`, and expose GitHub's standard file-command
paths. The default is GitHub's official
[`actions-runner`](https://docs.github.com/en/actions/concepts/runners/actions-runner-controller#software-components)
container image, pinned by multi-architecture digest. That image publishes
native Linux `amd64` and `arm64` manifests. Those are the two architectures
Hollywood can support without replacing GitHub's runner userspace.

This is the closest public image GitHub supports, but it is deliberately
minimal. A standard
[GitHub-hosted runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
is a fresh virtual machine with a much larger tool inventory; GitHub does not
publish `ubuntu-latest` as a supported OCI image.

Hollywood guarantees that the action bundle, pinned userspace image, workspace
mount, inputs, and
[file-command paths](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)
are identical across providers. The provider still owns the kernel,
virtualization, networking, and filesystem implementation. GitHub still owns
workflow scheduling, service containers, permissions, OIDC, caches, and
artifacts. Real GitHub CI remains the final conformance test.

## Why Backends Exist

The provider boundary is intentionally small. A provider only needs to answer:

1. How do we create and remove one isolated Linux session?
2. How do we execute structured commands without shell interpolation?
3. How do we mount the workspace and GitHub protocol files?

The image supplies userspace tools. The provider supplies isolation. GitHub
still supplies workflow scheduling, services, permissions, and hosted-runner
infrastructure.

See [Hollywood Runner Image](runner-image.md) for the published image,
machine-readable runner probe, compatibility contract, and release boundary.
