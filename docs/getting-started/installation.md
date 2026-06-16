# Installation

Inside this repository, install dependencies and build the local CLI:

```bash
npm ci
npm run build
```

In another repository, install Hollywood as a development dependency:

```bash
npm install --save-dev @dedalus-labs/hollywood
```

That installs the `hollywood` binary:

```bash
npx hollywood generate "gha/**/*.ts" --output .
```

Run an exported action locally:

```bash
npx hollywood run gha/s3-cache.ts --export s3Cache --with mode=restore
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
python -m pip install -r docs/requirements.txt
python -m mkdocs serve -f mkdocs.yml
```

Build them with strict link validation:

```bash
python -m pip install -r docs/requirements.txt
python -m mkdocs build --strict -f mkdocs.yml
```
