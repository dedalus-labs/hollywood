# Runner image

The Hollywood runner image provides a consistent Linux userspace for fast
action tests and connected GitHub runner jobs through Docker, Podman, and Apple
`container`.

The image derives from GitHub's official, digest-pinned
[`actions-runner`](https://docs.github.com/en/actions/concepts/runners/actions-runner-controller#software-components)
image. Hollywood adds a stable Node 24 `PATH` and OCI source labels. It does
not add language SDKs that are absent from the upstream image.

The pinned upstream image contains GitHub Actions runner `v2.336.0` and
publishes native Linux `amd64` and `arm64` manifests. Hollywood supports those
two image architectures. Other GitHub runner archives do not use this image
contract.

## Fidelity boundary

A
[GitHub-hosted runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
is a new virtual machine for each job. GitHub publishes its VM build
definitions and software inventories in
[`actions/runner-images`](https://github.com/actions/runner-images). GitHub
does not publish `ubuntu-latest` as a supported OCI image.

The Hollywood image provides:

- Ubuntu 24.04 userspace.
- The official GitHub runner binaries and Node 24 runtime.
- The `runner` user and selected command-line tools.
- The `/github/workspace` mount.
- Paths for outputs, environment changes, `PATH` changes, event data, and step
  summaries.

In fast action mode, Hollywood executes the bundled action directly with Node
24. It does not register the container as a self-hosted runner or invoke
GitHub's `Runner.Listener` or `Runner.Worker`.

Local execution does not implement these GitHub runner lifecycle features:

- JavaScript action
  [`runs.pre`, `runs.post`, `runs.pre-if`, or `runs.post-if`](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax).
- Docker action
  [`pre-entrypoint` or `post-entrypoint`](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax).
- The
  [`ACTIONS_RUNNER_HOOK_JOB_STARTED` or `ACTIONS_RUNNER_HOOK_JOB_COMPLETED` job hook](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/run-scripts-before-or-after-a-job).
- The
  [`prepare_job`, `cleanup_job`, `run_container_step`, or `run_script_step` container hook](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/customize-containers).

The selected provider controls the kernel, cgroups, networking, mount
implementation, and virtualization. GitHub controls workflow scheduling,
permissions, OIDC, caches, artifacts, service containers, and job lifecycle.
A successful local test does not verify those GitHub-controlled behaviors.

Connected runner mode accepts a GitHub-issued JIT configuration and starts the
pinned `Runner.Listener` and `Runner.Worker`. It covers the lifecycle features
listed above because GitHub schedules and controls the job. See [Run a job with
the GitHub runner](../usage/github-runner.md).

Hollywood uses `@actions/core`, `@actions/exec`, `@actions/expressions`,
`@actions/workflow-parser`, and `@octokit/openapi-types` for supported GitHub
interfaces. Hollywood defines its authoring types and local container contract
because GitHub does not publish an offline runner control-plane API or a
compatible workflow authoring API.

## Run an action

After the publication workflow creates `ghcr.io/dedalus-labs/hollywood/runner`,
use an immutable manifest digest:

```bash
npx hollywood run gha/check.ts \
  --export check \
  --provider container \
  --image ghcr.io/dedalus-labs/hollywood/runner@sha256:<digest>
```

Select `docker` or `podman` to test those runtimes. Hollywood does not detect a
provider or run the action on the host when the selected provider is
unavailable.

## Run a GitHub job

Use the same digest-pinned image with the official runner lifecycle:

```bash
npx hollywood runner listen .hollywood-jit-config \
  --provider docker \
  --image ghcr.io/dedalus-labs/hollywood/runner@sha256:<digest> \
  --diagnostics .hollywood/runner-diagnostics
```

The command runs one GitHub-scheduled job and removes the container after the
listener exits.

## Inspect a runner

Run `runner probe` inside the Linux runner or container that you want to
inspect. The command writes deterministic JSON from a fixed allowlist:

```bash
npx hollywood runner probe --output runner.json
```

The probe records:

- The operating system, architecture, kernel, cgroup version, effective
  capabilities, user ID, and group ID.
- Selected non-secret GitHub runner variables.
- The status of selected GitHub workspace and file-command paths.
- Selected tool locations and versions.
- Installed Debian packages.
- Hosted tool-cache names and versions.

The probe does not enumerate arbitrary environment variables, process
environments, home-directory contents, cloud metadata, or GitHub temporary
files. The parser rejects fields that the schema does not declare.

## Verify and compare

The contract in `runner/contract.json` defines the userspace behavior that
Hollywood verifies:

```bash
npx hollywood runner verify runner/contract.json runner.json
```

Verification fails when the probe does not satisfy the contract. Use
`runner compare` to classify other differences:

```bash
npx hollywood runner compare github-runner.json local-runner.json
```

The command uses these categories:

| Category | Meaning |
| --- | --- |
| `contract` | A difference in behavior required by the Hollywood contract. |
| `inventory` | A difference in a tool, package, hosted-image value, or path value. |
| `provider` | A difference in the kernel, cgroup, capability, architecture, or process identity. |

## Publish the image

The generated `Runner image` workflow performs these jobs:

1. Probe GitHub's x64 and arm64 Ubuntu 24.04 runners, verify the contract, and
   retain each sanitized observation for 30 days.
2. Build and verify the image with Docker and Podman on native x64 and arm64
   runners. Verification starts `Runner.Listener --version` and requires
   `2.336.0`.
3. Publish the image for a `runner-vX.Y.Z` GitHub release.

The publication job requires the Git release tag to match
`runner/version.txt`. The runner image version is independent from the
`@dedalus-labs/hollywood` npm package version. A push to `main` verifies the
image but does not publish it.

The job publishes an SBOM, BuildKit provenance, and a GitHub artifact
attestation. Pull request jobs have read-only permissions and do not receive
package credentials.

The publication job verifies the attestation against the repository, workflow,
source commit, source ref, and GitHub-hosted runner with
[`gh attestation verify`](https://cli.github.com/manual/gh_attestation_verify).
It then logs out of GHCR and pulls the published digest without credentials.

GitHub
[creates a new organization package with private visibility by default](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility#configuring-visibility-of-packages-for-an-organization).
An organization owner must make the package public after its first
publication. The anonymous pull fails while the package is private. GitHub
[does not permit a public package to become private](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility#configuring-visibility-of-packages-for-an-organization).

A stable release such as `runner-v1.2.3` publishes:

- `sha-<git-sha>` for the source commit.
- `1.2.3` for the exact runner image version.
- `1.2` for the compatible minor release.
- `1.2.3-ubuntu-24.04` for the exact image and userspace contract.
- `1.2-ubuntu-24.04` for the compatible minor release and userspace contract.
- `latest` for the latest stable release.
- `ubuntu-24.04` for the latest stable release with this userspace contract.

A prerelease publishes its source commit tag, exact prerelease version, and
exact prerelease userspace tag. It does not update `latest`, `ubuntu-24.04`, or
a compatible minor tag.

The image records its Hollywood runner image version, upstream GitHub Actions
runner version, and digest-pinned base image in OCI labels. Pin the published
manifest digest for reproducible use. Use version tags to discover a release,
not as a deployment lock.

Dependabot proposes updates to the upstream runner digest and pinned GitHub
Actions. Each update must pass the observation and image-contract workflow
before publication.

## Test a provider

Select one installed provider and run the provider tests:

```bash
HOLLYWOOD_CONTAINER_PROVIDER=container \
HOLLYWOOD_RUNNER_IMAGE_PROVIDER=container \
npm test -- --no-file-parallelism \
  src/container.test.ts src/container-action.test.ts gha/runner-image-actions.test.ts
```

Replace `container` with `docker` or `podman` to test that provider. GitHub CI
tests Docker and Podman on native x64 and arm64 Ubuntu 24.04 runners. Apple
`container` requires Apple silicon and macOS 26 or later. Run the provider test
on a compatible Mac before releasing a change to that provider.

Select the Docker provider when Docker Desktop uses Docker VMM. Docker VMM
remains behind the standard `docker` CLI.
