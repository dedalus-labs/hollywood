# Arch / pacman

Arch Linux and `pacman` are candidate recipe targets, not an execution backend
by themselves.

The useful direction is a backend profile or recipe for scripts that need Arch
package tooling such as `pacman`, `makepkg`, or repository metadata commands.
That profile would still run through a real backend such as Lima, Docker, Apple
Container, or smolmachines.

## Target Shape

The script command remains ordinary Hollywood:

```typescript
await exec("pacman", ["--sync", "--refresh"]);
```

The backend provides the Arch environment where that command exists.

## Good Fit

- building Arch packages in CI
- testing repository metadata updates
- exercising package-manager-specific cache behavior
- documenting package recipes without shell-in-YAML

## Open Questions

- Should this live as a recipe rather than a backend page?
- Which Arch base image or VM image should examples use?
- Which commands are safe to demonstrate without mutating the developer host?
