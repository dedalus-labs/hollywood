# smolmachines

smolmachines is a candidate execution backend.

The interesting fit is portable virtual machine images for scripts that need a
real Linux environment but should start quickly and travel with their runtime
state.

## Target Shape

A future backend should keep the same Hollywood command boundary:

```text
smolvm machine run <backend-options> -- <file> <arg>...
```

Persistent machines would likely use `smolvm machine exec --name <machine> --
<file> <arg>...`. The exact Hollywood API needs design against the smolmachines
CLI before this becomes a supported backend.

## Good Fit

- hermetic build tools
- stateful development machines used by CI-like scripts
- local tests that need stronger isolation than a host process

Reference:

- [smol-machines/smolvm](https://github.com/smol-machines/smolvm)
