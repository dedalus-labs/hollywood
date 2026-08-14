# Run a GitHub job locally or remotely

`hollywood runner` runs one GitHub-scheduled job with GitHub's official
`Runner.Listener` and `Runner.Worker` processes.

Use this mode when a test must include GitHub scheduling, expression
evaluation, permissions, secrets, action lifecycle handlers, artifacts,
caches, OpenID Connect, services, or job status. Use `hollywood run` when a
test only needs one exported action and does not need the GitHub control plane.

## How the runner works

One execution has this lifecycle:

1. `hollywood runner jit-config` requests one just-in-time (JIT) runner
   configuration from the GitHub REST API.
2. `hollywood runner listen` starts a new container with the selected provider.
3. Hollywood starts the official `Runner.Listener` process with the JIT
   configuration.
4. GitHub assigns one job that matches the runner labels.
5. The listener starts the official `Runner.Worker` process.
6. The worker runs the job and reports its result to GitHub.
7. The listener exits. Hollywood removes the container and its temporary
   credential file.

The runner makes outbound HTTPS connections to GitHub. It does not open an
inbound port. A JIT configuration registers one ephemeral runner and is valid
for one job.

## Prerequisites

Install these components on the execution host:

- Node.js 20 or newer.
- Hollywood.
- Docker, Podman, or Apple `container`.
- A GitHub token that can create repository self-hosted runners.

The GitHub token must have repository administration write permission for the
target repository. See GitHub's
[JIT runner REST API](https://docs.github.com/en/rest/actions/self-hosted-runners#create-configuration-for-a-just-in-time-runner-for-a-repository)
for supported token types and permissions.

The workflow file must exist on the repository's default branch before GitHub
can dispatch it. The dispatch can select another pushed ref after the workflow
exists on the default branch.

## Define the workflow

Use a dedicated label so that another self-hosted runner cannot accept the
proof job:

```typescript
import { command, job, workflow } from "@dedalus-labs/hollywood";

export const connectedRunnerProof = workflow({
	name: "Connected runner proof",
	on: { workflow_dispatch: {} },
	permissions: { contents: "read" },
	jobs: {
		proof: job({
			"runs-on": ["self-hosted", "hollywood-local"],
			"timeout-minutes": 30,
			steps: [
				{
					uses: "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
					with: { "persist-credentials": false },
				},
				{ name: "Test", run: command({ file: "npm", args: ["test"] }) },
			],
		}),
	},
});
```

Generate and push the workflow. Merge the workflow definition into the default
branch before its first manual dispatch:

```bash
npx hollywood generate
git add gha/connected-runner-proof.ts .github/workflows/connected-runner-proof.yml
git commit -m "ci: add connected runner proof"
git push
```

Hollywood itself includes a generated `Connected runner proof` workflow. That
workflow builds the local actions, captures a sanitized runner probe, verifies
`runner/contract.json`, and retains the probe as a workflow artifact.

## Create the JIT configuration

Set the token in one named environment variable:

```bash
export GITHUB_TOKEN="$(gh auth token)"
```

Find the runner group ID for an organization repository:

```bash
gh api orgs/OWNER/actions/runner-groups \
  --jq '.runner_groups[] | [.id, .name] | @tsv'
```

Create the configuration:

```bash
npx hollywood runner jit-config OWNER/REPOSITORY \
  --runner-group-id 1 \
  --label self-hosted hollywood-local \
  --name hollywood-local
```

The command writes `.hollywood-jit-config` with mode `0600`. It uses exclusive
creation and fails if the file exists. It never prints the configuration.
Delete an unused file before you request a replacement:

```bash
rm .hollywood-jit-config
```

Select a different token variable or output path explicitly:

```bash
npx hollywood runner jit-config OWNER/REPOSITORY \
  --runner-group-id 7 \
  --label self-hosted hollywood-local arm64 \
  --name workstation-arm64 \
  --token-env HOLLYWOOD_GITHUB_TOKEN \
  --output .hollywood/workstation-arm64.jit
```

The command sends this GitHub OpenAPI operation:

```text
POST /repos/{owner}/{repo}/actions/runners/generate-jitconfig
```

Hollywood compiles the request against `@octokit/openapi-types`. It validates
the response before it brands the encoded configuration for runner use.

### Use GitHub Enterprise Server

Set the REST API base URL. Include the `/api/v3/` path:

```bash
npx hollywood runner jit-config OWNER/REPOSITORY \
  --api-url https://github.example.com/api/v3/ \
  --runner-group-id 1 \
  --label self-hosted hollywood-local
```

Hollywood requires HTTPS and preserves the base URL path.

### Use the typed API

Applications can create the same file without the CLI:

```typescript
import {
	defineGitHubRunnerJitRegistration,
	generateGitHubRepositoryRunnerJitConfig,
	parseGitHubApiToken,
	parseGitHubRepository,
	writeEncodedGitHubJitConfig,
} from "@dedalus-labs/hollywood";

const token = process.env.GITHUB_TOKEN;
if (token === undefined) {
	throw new Error("GITHUB_TOKEN is not set.");
}

const config = await generateGitHubRepositoryRunnerJitConfig({
	repository: parseGitHubRepository("OWNER/REPOSITORY"),
	registration: defineGitHubRunnerJitRegistration({
		labels: ["self-hosted", "hollywood-local"],
		name: "hollywood-local",
		runnerGroupId: 1,
		workFolder: "_work",
	}),
	token: parseGitHubApiToken(token),
});

await writeEncodedGitHubJitConfig(".hollywood-jit-config", config);
```

`parseGitHubRepository`, `parseGitHubApiToken`, and
`defineGitHubRunnerJitRegistration` return branded types. Callers cannot pass
unchecked strings or an unvalidated registration to the API function.

## Start the listener

Start the listener before you dispatch the workflow.

### Docker

```bash
npx hollywood runner listen .hollywood-jit-config \
  --provider docker \
  --diagnostics .hollywood/runner-diagnostics
```

Docker Desktop can use Docker VMM. Continue to select `--provider docker`
because Docker VMM uses the standard Docker command-line interface.

### Podman

```bash
npx hollywood runner listen .hollywood-jit-config \
  --provider podman \
  --diagnostics .hollywood/runner-diagnostics
```

The selected Podman machine or service must already be running. Hollywood does
not start it or select another provider.

### Apple `container`

Apple `container` requires Apple silicon and macOS 26 or later. Start its
system service before the listener:

```bash
container system start
container system status
npx hollywood runner listen .hollywood-jit-config \
  --provider container \
  --diagnostics .hollywood/runner-diagnostics
```

Hollywood uses the native Linux `arm64` manifest on Apple silicon.

### Select an image

The default image is GitHub's official, digest-pinned Actions runner image.
Select a published Hollywood runner image by immutable manifest digest when
you need its verified userspace contract:

```bash
npx hollywood runner listen .hollywood-jit-config \
  --provider docker \
  --image ghcr.io/dedalus-labs/hollywood-runner@sha256:<digest>
```

Hollywood rejects mutable image references.

## Dispatch the job

Dispatch the workflow from another terminal:

```bash
gh workflow run connected-runner-proof.yml --ref BRANCH
gh run watch --exit-status
```

The labels in the workflow and JIT registration must match. GitHub leaves the
job queued when no online runner has all requested labels.

The listener exits after the job. Create a new JIT configuration for every
subsequent job.

## Run on a remote host

Install Node.js, Hollywood, and one provider on the remote host. The host needs
outbound access to GitHub and the selected image registry. It does not need an
inbound listener port.

On the remote host:

```bash
cd /srv/hollywood-runner
npx hollywood runner jit-config OWNER/REPOSITORY \
  --runner-group-id 1 \
  --label self-hosted hollywood-remote linux-x64 \
  --name build-host-01 \
  --output .hollywood/build-host-01.jit
npx hollywood runner listen .hollywood/build-host-01.jit \
  --provider podman \
  --diagnostics .hollywood/diagnostics/build-host-01
```

Load `GITHUB_TOKEN` from the secret manager available on the host before you
run these commands. Do not pass the token in a command argument. Do not copy a
JIT configuration between hosts.

Use matching labels in the workflow:

```typescript
import { command, job } from "@dedalus-labs/hollywood";

job({
	"runs-on": ["self-hosted", "hollywood-remote", "linux-x64"],
	steps: [
		{
			name: "Test",
			run: command({ file: "npm", args: ["test"] }),
		},
	],
});
```

Dispatch the workflow from any authenticated workstation:

```bash
gh workflow run connected-runner-proof.yml --ref BRANCH
```

For concurrent jobs, create one JIT configuration, output path, runner name,
and listener process per job. Do not reuse one configuration across listener
processes.

## Run container jobs, services, and Docker actions

The runner container needs a Docker-compatible API socket when a workflow uses
`container:`, `services:`, or a Docker action.

### Docker socket

```bash
npx hollywood runner listen .hollywood-jit-config \
  --provider docker \
  --container-engine-socket /var/run/docker.sock
```

### Rootless Podman socket

Start the user socket and pass its absolute path:

```bash
systemctl --user start podman.socket
npx hollywood runner listen .hollywood-jit-config \
  --provider podman \
  --container-engine-socket "$XDG_RUNTIME_DIR/podman/podman.sock"
```

Hollywood verifies that the path is a Unix socket. Docker and Podman receive a
bind mount at `/var/run/docker.sock`. Apple `container` publishes the selected
host socket at the same path.

Hollywood does not silently select or start a different engine. A workflow
that invokes Docker without a configured socket fails through the GitHub
runner.

## Configure runner hooks

Mount GitHub runner hooks with explicit flags:

```bash
npx hollywood runner listen .hollywood-jit-config \
  --provider docker \
  --job-started-hook ./hooks/job-started.sh \
  --job-completed-hook ./hooks/job-completed.sh \
  --container-hook ./hooks/container/index.js \
  --require-job-container
```

Job hooks must be executable regular files. The container hook must be one
bundled JavaScript file. Hollywood mounts each hook read-only outside the
runner application directory and sets GitHub's documented runner variables.

`--require-job-container` sets `ACTIONS_RUNNER_REQUIRE_JOB_CONTAINER=true`.
The runner rejects jobs that do not declare a job container.

## Credential handling

Treat the JIT configuration as a credential.

- Do not commit it.
- Do not print it.
- Do not pass it in the host process argument list.
- Store it on a local filesystem with mode `0600`.
- Create one configuration for one listener.
- Delete an unused configuration.

`runner jit-config` uses exclusive file creation. `runner listen` validates the
file, writes the value to a temporary mode-`0600` environment file, starts the
provider with the environment file path, and removes the temporary directory
after the provider exits.

Inside the ephemeral container, Hollywood starts:

```text
/home/runner/bin/Runner.Listener run --jitconfig <encoded-configuration>
```

GitHub's runner interface requires this argument. It is visible inside the
ephemeral container while the listener starts. It is not present in the host
provider command arguments.

Hollywood starts `Runner.Listener` directly. GitHub's `run.sh` service wrapper
restarts selected update results and converts some listener failures to a zero
exit code. Those policies do not apply to a pinned, one-job container.
Hollywood reports every nonzero listener result.

## Fidelity boundary

Connected runner mode uses GitHub's implementations for:

- Scheduling, contexts, expressions, permissions, and secrets.
- `Runner.Listener` and `Runner.Worker` job execution.
- JavaScript and Docker action pre and post handlers.
- `GITHUB_STATE` propagation.
- Job-started, job-completed, and container hooks.
- GitHub caches, artifacts, OpenID Connect tokens, logs, and job status.

The provider controls the kernel, cgroups, networking, mounts, and
virtualization. The selected image controls the Linux userspace and installed
tools.

Connected runner mode does not reproduce the GitHub-hosted `ubuntu-latest`
virtual machine. GitHub publishes the VM build definitions but does not
publish `ubuntu-latest` as a supported OCI image.

Connected runner mode also requires pushed workflow source and a GitHub
connection. GitHub does not publish a supported offline job-server or
worker-control API.

## Troubleshoot failures

| Failure | Required action |
| --- | --- |
| `GitHub API token environment variable GITHUB_TOKEN is not set` | Set the selected token variable or pass `--token-env NAME`. |
| `GitHub JIT configuration request failed with 403 Forbidden` | Grant repository administration write permission to the token. |
| `Failed to create GitHub JIT configuration file` | Remove the unused output file or select a new `--output` path. |
| `Container provider '<name>' is unavailable` | Install and start the selected provider. Hollywood does not select another provider. |
| Apple `container` reports that the system is not running | Run `container system start`, then verify `container system status`. |
| The job remains queued | Match every `runs-on` label with a JIT registration label and start the listener before dispatch. |
| GitHub cannot find the workflow | Generate and merge the manual workflow into the default branch before dispatch. |
| A Docker action cannot connect to `/var/run/docker.sock` | Start one Docker-compatible API and pass its socket with `--container-engine-socket`. |
| The listener exits without a completed job | Read `--diagnostics` output and the GitHub run log. Create a new JIT configuration before retrying. |
