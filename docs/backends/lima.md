# Lima

Lima is Hollywood's supported Linux virtual machine backend.

Use it when a script should run Linux commands from a macOS laptop or from a
host that should delegate execution into a named Lima virtual machine.

```bash
npx hollywood run gha/cache/s3-cache.ts \
  --export s3Cache \
  --lima default \
  --start-vm \
  --with mode=restore
```

## Command Shape

Hollywood routes each script command through `limactl shell` without rewriting
the command into shell text.

With `--lima default --start-vm`, the backend command is:

```text
limactl shell --tty=false --start default -- <file> <arg>...
```

If a script command has a working directory, Hollywood preserves that as a
structured Lima option:

```text
limactl shell --tty=false --start --workdir <cwd> default -- <file> <arg>...
```

If a script command has environment variables, Hollywood inserts an explicit
`env` process inside the VM:

```text
limactl shell --tty=false --start default -- env NAME=value <file> <arg>...
```

The important invariant is unchanged: the executable and arguments remain an
argument array all the way into the backend.

## Capability Checks

`--start-vm` starts the named VM before running the action. Without it, a stopped
VM rejects the local run before the script starts.

`--require-containerd` checks that `containerd` is active and that `nerdctl`
exists inside the VM.

`--require-kvm` checks that `/dev/kvm` is readable and writable inside the VM.

These checks are fail-closed. A local run that silently skips the requested
backend capability would not prove the action contract.

## Runner Context

Hollywood asks the Lima VM for `id -u` and `id -g` so scripts can use the guest
runner user and group when they create or extract files.
