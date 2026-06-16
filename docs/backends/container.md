# Apple Container

Apple Container is a planned backend, not a supported Hollywood runtime yet.

The useful shape is clear: run a Linux container as the backend for
`exec(file, args)` while preserving the same argument-array contract Hollywood
uses for host and Lima runs.

Apple's `container` tool runs Linux containers as lightweight virtual machines
on Apple silicon Macs and consumes Open Container Initiative (OCI) images. Its
official docs expose nested virtualization with `--virtualization`; that path
requires supported Apple silicon and a Linux kernel with virtualization support.

## Target Shape

A future backend should keep this shape:

```text
container run <backend-options> <image> <file> <arg>...
```

The backend should own image selection, mount policy, network policy, and
virtualization capability checks. Scripts should still only see `exec(file,
args)`.

## Open Questions

- How should Hollywood map script working directories into container mounts?
- Should environment variables be passed directly or through an explicit `env`
  process for parity with Lima?
- How should a script request nested virtualization or KVM access without
  baking host-specific kernel paths into the action?
- Which runner user and group should be reported for extracted cache archives?

References:

- [apple/container](https://github.com/apple/container)
- [Apple Container how-to](https://github.com/apple/container/blob/main/docs/how-to.md)
