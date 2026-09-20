# Local testing

Hollywood has three local testing layers.

## Unit tests

Use a fake executor when the script's command sequence is the contract:

```typescript
const commands: Command[] = [];

await runAction(publishImage, {
	with: {
		image: "ghcr.io/acme/api",
		tag: "sha-abc123",
		provenance: "false",
	},
	exec: async (file, args, options) => {
		commands.push({ file, args, ...options });
		return { exitCode: 0, stdout: "", stderr: "" };
	},
	fs: { readText: async () => "" },
	log: memoryLog,
	runner: { uidGid: "1001:1001" },
});
```

This test verifies typed inputs, output shapes, command arguments, and explicit
nonzero-exit handling.

## Direct library execution

Use `nodeExec`, `nodeFs`, and `nodeLog` when the script should run on the local
machine:

```typescript
await runAction(action, {
  with,
  exec: nodeExec,
  fs: nodeFs,
  log: nodeLog,
  runner: { uidGid: "1001:1001" },
});
```

Use this mode for scripts that call local tools such as `aws`, `tar`, `zstd`,
`terraform`, or project-specific binaries.

## Fast container execution

Install Docker Engine or Docker Desktop, Podman, or Apple `container`. Select
the Docker provider when Docker Desktop uses Docker VMM. Apple `container`
requires Apple silicon and macOS 26 or later:

```bash
npx hollywood run gha/go/s3-cache.ts \
  --export s3Cache \
  --provider container \
  --with mode=restore
```

Hollywood bundles the action, starts one Linux container, and runs the bundle
with Node 24. It mounts `/github/workspace` and creates paths for `GITHUB_ENV`,
`GITHUB_EVENT_PATH`, `GITHUB_OUTPUT`, `GITHUB_PATH`, `GITHUB_STATE`, and
`GITHUB_STEP_SUMMARY`.

The default image derives from GitHub's digest-pinned Actions runner image. It
has native Linux `amd64` and `arm64` manifests. It is not the GitHub-hosted
`ubuntu-latest` virtual machine, and Hollywood does not invoke the GitHub runner
worker.

Provider selection is explicit. Hollywood throws
`ContainerProviderUnavailableError` when the selected executable is absent. It
does not detect or use a different runtime.

Use [GitHub runner execution](github-runner.md) when the test must execute the
official `Runner.Listener` and `Runner.Worker` lifecycle. That mode runs one
GitHub-scheduled job and covers action pre and post handlers, state
propagation, runner hooks, permissions, caches, artifacts, and job reporting.

## Real local services

Use MinIO or LocalStack when the script talks to cloud-shaped APIs. The current
local S3 test is gated because it needs a local service:

```bash
HOLLYWOOD_RUN_LOCAL_S3=1 HOLLYWOOD_RUN_MINIO=1 \
  npm test -- src/script.test.ts
```

This test verifies the script against a local implementation of the required
service. Run the generated action on GitHub to verify GitHub-managed behavior.
