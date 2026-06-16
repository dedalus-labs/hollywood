# Docker

Docker is a planned execution backend.

Scripts can already call Docker directly through `exec("docker", [...])` when
the host has Docker installed. A Docker backend would be different: it would run
each script command inside a declared container environment.

## Target Shape

A future backend should preserve the command contract:

```text
docker run <backend-options> <image> <file> <arg>...
```

The backend would own image selection, volume mounts, working directory,
environment, user mapping, and container cleanup.

## Good Fit

- tools that are easier to install once in an image than on every laptop
- Linux-only command-line tools
- reproducible smoke tests for generated actions
- local service tests that need a nearby container network

## Non-Goals

Docker support should not turn Hollywood into a workflow emulator. It should
only route `exec(file, args)` through a declared container environment.
