# Local Testing

Hollywood has three local testing layers.

## Unit tests

Use a fake executor when the script's command sequence is the contract:

```typescript
const commands: Command[] = [];

await runAction(bakeSnapshot, {
	with: {
		dhvBinary: "/usr/local/bin/dedalus-hypervisor",
		memoryMibMax: "32768",
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
hollywood run ci/dcs/dm/bake-vm-snapshot.ts \
  --export bakeSnapshot \
  --with dhvBinary=/usr/local/bin/dedalus-hypervisor \
  --with memoryMibMax=32768
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

Use `--lima <name>` when the script should run commands inside a Linux VM:

```bash
hollywood run ci/go/s3-cache.ts \
  --export s3Cache \
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
