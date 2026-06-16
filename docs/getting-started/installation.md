# Installation

Hollywood currently lives inside the Dedalus monorepo:

```bash
pnpm --filter @dedalus-labs/hollywood typecheck
pnpm exec vitest run --root packages/typescript/hollywood --config vitest.config.ts
```

When the package is published, install it as a development dependency:

```bash
pnpm add -D @dedalus-labs/hollywood
```

That installs the `hollywood` binary:

```bash
pnpm exec hollywood generate "ci/**/*.ts" --output .
```

Run an exported action locally:

```bash
pnpm exec hollywood run ci/s3-cache.ts --export s3Cache --with mode=restore
```

GitHub JavaScript actions need a bundled entrypoint. Hollywood generates the
TypeScript entrypoint, but the bundling command is still explicit. Until
Hollywood owns that build step, use the repository's chosen bundler to turn:

```text
.github/actions/<action-name>/src/index.ts
```

into:

```text
.github/actions/<action-name>/dist/index.js
```

The generated `action.yml` points at `dist/index.js` because that is the normal
GitHub Actions JavaScript action contract.

## Documentation site

Serve these docs locally with MkDocs:

```bash
uvx --with mkdocs-material \
  --with mkdocs-git-revision-date-localized-plugin \
  --with mkdocs-llmstxt \
  mkdocs serve -f packages/typescript/hollywood/mkdocs.yml
```

Build them with strict link validation:

```bash
uvx --with mkdocs-material \
  --with mkdocs-git-revision-date-localized-plugin \
  --with mkdocs-llmstxt \
  mkdocs build --strict -f packages/typescript/hollywood/mkdocs.yml
```
