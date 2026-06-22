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

## Real local commands

Use `nodeExec`, `nodeFs`, and `nodeLog` when the script should run on the local
machine. The CLI path is:

```bash
npx hollywood run gha/containers/publish-image.ts \
  --with image=ghcr.io/acme/api \
  --with tag=sha-abc123 \
  --with provenance=false
```

The library path is:

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

## Lima commands

Use `--lima <name>` when the script should run commands inside a Linux VM. The
full command mapping lives in the [Lima backend docs](../backends/lima.md).

```bash
npx hollywood run gha/go/s3-cache.ts \
  --lima kvm \
  --start-vm \
  --with mode=restore
```

Every script command is routed through `limactl shell` without turning the
command into shell text. Add `--require-containerd` or `--require-kvm` when the
script needs those VM capabilities before it starts.

## Real local services

Use MinIO or LocalStack when the script talks to cloud-shaped APIs. The current
local S3 test is gated because it needs a local service:

```bash
HOLLYWOOD_RUN_LOCAL_S3=1 HOLLYWOOD_RUN_MINIO=1 \
  npm test -- src/script.test.ts
```

This tests the ethos directly: run the script locally against a real service,
then expose the same script to GitHub.
