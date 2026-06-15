# Local Services

Cloud workflows should be tested against local services before GitHub spends
money discovering obvious mistakes.

## MinIO

Use MinIO, an Amazon Simple Storage Service (S3)-compatible object store, for
S3-specific tests when persistence and speed matter more than full Amazon Web
Services (AWS) behavior.

Good fit:

- direct S3 cache restore/save scripts
- object upload and download
- archive layout checks
- cache key behavior

Not a fit:

- Identity and Access Management (IAM) policy behavior
- Security Token Service (STS) or OpenID Connect
- AWS service interactions beyond S3

## LocalStack

Use LocalStack, a local AWS emulator, when the script or workflow depends on
AWS-shaped behavior across multiple services.

Good fit:

- Terraform tests that need S3, DynamoDB, IAM, or STS endpoints
- service containers in GitHub Actions
- scripts that call the normal AWS CLI or SDK against a local endpoint

Hollywood should not hide which service is active. A script should receive the
endpoint and credentials explicitly through typed inputs or environment.

## VM providers

Linux action runs on macOS should use Lima first. Lima gives us a real Linux
virtual machine (VM), and Hollywood routes each script `exec(file, args)` call
through `limactl shell`.

```bash
hollywood run ci/go/s3-cache.ts --export s3Cache --lima kvm --start-vm
```

Hollywood's current VM support is action-level, not whole-workflow emulation.
There is no local artifact server, cache server, OIDC issuer, or private GitHub
runner worker protocol in the package.

## Rejection is a feature

Some jobs cannot run on a developer laptop. The Dedalus Machines bake requires
Linux Kernel-based Virtual Machine (KVM) access and nested virtualization. A
Mac running Lima can provide a Linux VM, but it cannot provide x86 KVM inside
that VM.

Hollywood should reject that local run before starting. A local green run that
did not provide the runner contract would be worse than no local run.
