# Local Testing

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

This is the fast path. It proves typed inputs, output shapes, command arguments,
and explicit nonzero-exit handling.

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

This is useful for scripts that call local tools such as `aws`, `tar`, `zstd`,
`terraform`, or project-specific binaries.

## Container execution

The CLI requires Docker Engine/Desktop, Podman, or Apple's `container`. Docker
VMM sits behind Docker Desktop's normal `docker` CLI and therefore uses the
`docker` provider. Apple's `container` provider requires Apple silicon and
macOS 26 or newer:

```bash
npx hollywood run gha/go/s3-cache.ts \
  --export s3Cache \
  --provider container \
  --with mode=restore
```

Hollywood bundles the action, starts one persistent Linux container, and runs
the bundle with GitHub's workspace, input, output, event, environment, path, and
step-summary protocol files. The default is GitHub's digest-pinned minimal
Actions runner image. The image has native Linux `amd64` and `arm64` manifests;
GitHub does not publish this runner image for other architectures. It is not
the much larger `ubuntu-latest` hosted VM.

Provider selection is explicit. Hollywood throws
`ContainerProviderUnavailableError` when the selected executable is absent;
it never detects or falls back to a different runtime.

## Real local services

Use MinIO or LocalStack when the script talks to cloud-shaped APIs. The current
local S3 test is gated because it needs a local service:

```bash
HOLLYWOOD_RUN_LOCAL_S3=1 HOLLYWOOD_RUN_MINIO=1 \
  npm test -- src/script.test.ts
```

This tests the ethos directly: run the script locally against a real service,
then expose the same script to GitHub.
