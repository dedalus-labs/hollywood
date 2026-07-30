# Hollywood Runner Image

Hollywood publishes a small, multi-architecture Linux userspace for running
actions consistently through Docker, Podman, and Apple `container`.

The image is built directly from GitHub's official, digest-pinned
[`actions-runner`](https://docs.github.com/en/actions/concepts/runners/actions-runner-controller#software-components)
image. Hollywood adds a stable Node 24 `PATH` and OCI provenance labels. It
does not install an unrelated collection of language SDKs.

The upstream image publishes native Linux `amd64` and `arm64` manifests. Those
are Hollywood's supported runner-image architectures. Other GitHub runner
release archives exist, but using them would require a different image and a
different contract rather than native variants of this image.

## Fidelity Boundary

A standard
[GitHub-hosted runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
is a fresh virtual machine. GitHub publishes the VM build definitions and
software inventory in
[`actions/runner-images`](https://github.com/actions/runner-images), but it
does not publish `ubuntu-latest` as a supported OCI image.

The Hollywood image and runtime reproduce the portable action boundary:

- Ubuntu 24.04 userspace
- the official GitHub runner and Node 24 runtime
- the `runner` user and common command-line tools
- `/github/workspace`
- GitHub file-command paths for outputs, environment, paths, and summaries

Hollywood executes the bundled action directly. It does not register the
container as a self-hosted runner or invoke GitHub's `Runner.Listener` or
`Runner.Worker` job protocol. The runner binaries are present because they come
from GitHub's official image, not because local execution impersonates the
GitHub Actions control plane.

The selected container provider still owns the kernel, cgroups, networking,
mount implementation, and virtualization. GitHub still owns workflow
scheduling, permissions, OIDC, caches, artifacts, and service-container
orchestration. A local container cannot prove those provider-owned behaviors.

## Run an Action

Use an immutable digest from the
[`hollywood-runner` package](https://github.com/dedalus-labs/hollywood/pkgs/container/hollywood-runner):

```bash
npx hollywood run gha/check.ts \
  --export check \
  --provider container \
  --image ghcr.io/dedalus-labs/hollywood-runner@sha256:<digest>
```

Use `docker` or `podman` instead of `container` when that is the runtime you
intend to validate. Hollywood never auto-detects a provider or falls back to
host execution.

## Inspect a Runner

Run `runner probe` inside the Linux runner or container you want to observe. It
writes deterministic JSON using a fixed allowlist:

```bash
npx hollywood runner probe --output runner.json
```

The probe records:

- OS, architecture, kernel, cgroup version, effective capabilities, and UID/GID
- selected non-secret GitHub runner variables
- the status of standard GitHub workspace and file-command paths
- selected tool locations and versions
- installed Debian packages
- hosted tool-cache names and versions

It never enumerates arbitrary environment variables, process environments,
home-directory contents, cloud metadata, or GitHub temporary files. This keeps
tokens and job secrets out of the observation artifact. The versioned parser
also rejects undeclared fields instead of carrying unknown data forward.

## Verify and Compare

The curated contract in `runner/contract.json` contains only behavior
Hollywood promises:

```bash
npx hollywood runner verify runner/contract.json runner.json
```

Verification fails when required userspace behavior is missing. The broader
comparison command classifies exact drift without pretending every difference
is a failure:

```bash
npx hollywood runner compare github-runner.json local-runner.json
```

Differences are classified as:

| Category | Meaning |
| --- | --- |
| `contract` | Portable behavior required by Hollywood |
| `inventory` | Tool, package, hosted-image identity/version, or path-value drift |
| `provider` | Kernel, cgroup, capability, architecture, or identity drift |

## Automated Publication

The generated `Runner Image` workflow performs three independent jobs:

1. Probe GitHub's x64 and arm64 Ubuntu 24.04 runners, verify the shared
   contract, and retain the sanitized observations for 30 days.
2. Build the image natively with Docker and Podman on both architectures and
   run the same typed contract inside all four combinations.
3. On trusted pushes to `main`, publish an `edge` image to GHCR. On a published
   GitHub release, publish stable or prerelease version tags only after the Git
   tag exactly matches `package.json`.

Published images include BuildKit's SBOM and maximum-mode provenance. GitHub
also creates a signed artifact attestation for the registry digest. Package
write and OIDC permissions exist only on the trusted publication job; pull
requests remain read-only and never receive publishing credentials.

The publication job verifies the signed provenance against the exact
repository, workflow, source commit, branch or release tag, and GitHub-hosted
runner using the attestation bundle stored in GHCR through
[`gh attestation verify`](https://cli.github.com/manual/gh_attestation_verify).
It then logs out of GHCR and pulls the exact digest anonymously. A release
cannot pass while the package is private. GitHub
[creates new organization packages as private by default](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility#configuring-visibility-of-packages-for-an-organization);
an organization owner must make the package public once in its package
settings. GitHub warns that a public package
[cannot later be made private](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility#configuring-visibility-of-packages-for-an-organization).

Main publishes:

- `sha-<git-sha>`: immutable source identity
- `edge`: latest verified `main` build

A stable release such as `v1.2.3` publishes:

- `sha-<git-sha>`: immutable source identity
- `1.2.3`: exact package version
- `1.2`: compatible minor release
- `latest`: latest stable release
- `ubuntu-24.04`: latest stable release with the documented userspace contract

A prerelease publishes only its immutable SHA and exact prerelease version. It
cannot move `latest`, `ubuntu-24.04`, or the compatible minor tag. The first
publication creates the GHCR package; if GitHub creates it as private, the
anonymous-pull proof fails until an organization owner makes the package public
and reruns the workflow.

Consumers should pin the resulting manifest digest. Dependabot proposes
updates to the upstream runner digest and pinned GitHub Actions. Each update
must pass the full observation and image-contract workflow before publication.

## Provider Conformance

Run the same real provider tests locally by selecting one installed runtime:

```bash
HOLLYWOOD_CONTAINER_PROVIDER=container \
HOLLYWOOD_RUNNER_IMAGE_PROVIDER=container \
npm test -- --no-file-parallelism \
  src/container.test.ts src/container-action.test.ts gha/runner-image-actions.test.ts
```

Replace `container` with `docker` or `podman` to exercise that provider. The
generated CI workflow runs Docker and Podman on GitHub's native x64 and arm64
Ubuntu 24.04 runners. Apple's `container` requires Apple silicon and macOS 26,
so its real conformance path runs locally on a compatible Mac. Docker VMM is
transparent behind Docker Desktop's ordinary `docker` CLI and uses the Docker
provider.
