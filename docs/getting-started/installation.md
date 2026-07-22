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

That installs a local `hollywood` binary at `node_modules/.bin/hollywood`. Run
it with `npx hollywood ...`:

```bash
npx hollywood generate
```

If you prefer npm scripts, wire the local binary once:

```json
{
  "scripts": {
    "generate": "hollywood generate",
    "check": "hollywood check"
  }
}
```

Then run:

```bash
npm run generate
```

Run an exported action locally:

```bash
npx hollywood run gha/s3-cache.ts --with mode=restore
```

## Node requirements

| Surface                    | Node requirement             |
| -------------------------- | ---------------------------- |
| Installed package and CLI  | Node 20 or newer             |
| Generated GitHub actions   | GitHub's Node 24 action runtime |
| Building Hollywood locally | Node 22.18+ or Node 24.11+   |

`package.json` is the source of truth for the published package's
`engines.node` value. `tsdown.config.ts` sets the runtime build target.
`tsconfig.json` is for typechecking and should not be read as the package's
runtime support contract.

GitHub JavaScript actions need a bundled entrypoint. After generation, run:

```bash
npx hollywood build
```

Hollywood bundles:

```text
.github/actions/<action-name>/src/index.ts
```

into:

```text
.github/actions/<action-name>/dist/index.js
```

The generated `action.yml` points at `dist/index.js` because that is the normal
GitHub Actions JavaScript action contract. Commit the bundle with the generated
metadata, or build an ignored bundle in an earlier workflow step before the
local action is used.

## Documentation site

Serve these docs locally with MkDocs:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r docs/requirements.txt
python -m mkdocs serve -f mkdocs.yml
```

Build them with strict link validation:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r docs/requirements.txt
python -m mkdocs build --strict -f mkdocs.yml
```
