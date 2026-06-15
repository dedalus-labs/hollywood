# Hollywood Examples

These examples are normal TypeScript files that define Hollywood actions. They
are not test fixtures hidden under `src/`. The tests import these files to prove
the examples stay valid.

## S3 Cache

[s3-cache.ts](s3-cache.ts) shows a small cache action backed by
Amazon Simple Storage Service (S3)-compatible object storage.
[s3-cache-workflow.ts](s3-cache-workflow.ts) shows the matching workflow source
that Hollywood can flatten into `.github/workflows/s3-cache-workflow.yml`.

It demonstrates:

- `choiceInput` for `restore` or `save`
- `exec(file, args)` instead of shell strings
- `exitPolicy: "any"` for an expected restore miss
- typed output through `cacheHit`
- workflow generation that calls the generated action through `uses(s3Cache, ...)`

Generated workflow usage:

```yaml
- name: Restore cache
  uses: ./.github/actions/s3-cache
  with:
    mode: restore
    bucket: ci-cache
    prefix: go
    key: ${{ runner.os }}-${{ hashFiles('go.sum') }}
    archive-path: /tmp/cache.tar.gz
    contents-path: /tmp/go-cache
```

## Bake VM Snapshot

[bake-vm-snapshot.ts](bake-vm-snapshot.ts) wraps the Dedalus Machines
`dm-bake` command. This is the privileged infrastructure case: the script
needs `sudo`, Linux Kernel-based Virtual Machine (KVM) support, root filesystem
inputs, and generated artifacts.

It demonstrates:

- typed path and integer inputs
- grouped logs
- privileged command execution without shell-in-YAML
- generated outputs for downstream workflow steps

Generated workflow usage:

```yaml
- name: Bake VM snapshot
  uses: ./.github/actions/dcs-bake-vm-snapshot
  with:
    dhv-binary: /usr/local/bin/dedalus-hypervisor
    kernel: /tmp/vmlinux
    rootfs: /tmp/rootfs.raw
    output: /tmp/snapshot
    memory-mib-max: ${{ inputs.max_machine_memory_mib }}
    max-vcpus: ${{ inputs.max_machine_burst_vcpus }}
    image-version: noble@2026.05.14
```

## GitHub Promotion API

[github-promotion-admin.ts](github-promotion-admin.ts) shows the outside
Actions side: a server or admin API validates a request, checks authorization,
audits the attempt, and dispatches a standard GitHub Actions workflow.

[github-promotion-gate.ts](github-promotion-gate.ts) shows the inside Actions
side: a Hollywood action runs inside the workflow and checks GitHub Actions
state with typed inputs and outputs. [github-promotion-workflow.ts](github-promotion-workflow.ts)
shows the generated workflow calling that local action.

It demonstrates:

- keeping server/admin workflow dispatch outside the action runtime
- auditing before the GitHub mutation
- failing closed before dispatch when the caller is not authorized
- calling GitHub Actions APIs from an action with typed response parsing
- generating a workflow step that passes `${{ github.token }}` into the action

Outside Actions:

```typescript
await requestPreviewToMainPromotion(
	actor,
	{
		reason: "promote vetted preview artifacts",
		sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	},
	{ audit, github },
);
```

Inside Actions:

```yaml
- name: Verify preview promotion
  uses: ./.github/actions/preview-promotion-gate
  with:
    github-token: ${{ github.token }}
    repository: ${{ github.repository }}
    target-sha: ${{ inputs.sha }}
```

## Verify

Run the example tests:

```bash
pnpm exec vitest run \
  --root packages/typescript/hollywood \
  --config vitest.config.ts \
  packages/typescript/hollywood/src/examples.test.ts
```

Run the real MinIO roundtrip:

```bash
HOLLYWOOD_RUN_MINIO=1 pnpm exec vitest run \
  --root packages/typescript/hollywood \
  --config vitest.config.ts \
  packages/typescript/hollywood/src/examples.test.ts \
  -t "s3-cache example saves and restores through real local MinIO"
```
