# Action Pinning

Hollywood checks that every third-party `uses:` reference in your workflows is pinned
to an immutable commit SHA.

A `uses:` reference resolves when the workflow runs, not when you write it. `@v4` is a
tag, and a tag is a mutable pointer. Whoever can move that tag can change the code that
runs on your runner, with your runner's token and secrets. Pinning to a full commit SHA
removes that class of supply chain attack, because a commit SHA names one immutable
tree.

This is the policy stated in [`SECURITY.md`](https://github.com/dedalus-labs/hollywood/blob/main/SECURITY.md):
pin every third-party `uses:` action to a full commit SHA.

## Accepted references

| Reference | Why it is accepted |
| --- | --- |
| `actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10` | Full 40-character commit SHA. |
| `owner/repo/tools/lint@<sha>` | Action in a repository subdirectory, same pin. |
| `owner/repo/.github/workflows/release.yml@<sha>` | Reusable workflow, same pin. |
| `owner/repo@<64-character sha>` | SHA-256 git object ids. |
| `./.github/actions/hello` | Local action. |
| `./.github/workflows/reusable.yml` | Local reusable workflow. |
| `docker://ghcr.io/acme/tool@sha256:<digest>` | Container action pinned by image digest. |

Local references are always accepted. A `./` path resolves inside the repository at the
commit being run, so it is already immutable, and its contents are reviewed in the same
pull request as the workflow that calls it. The check never asks you to pin your own
actions.

## Rejected references

| Reference | Reason |
| --- | --- |
| `actions/checkout@v4`, `@main`, `@v4.1.2` | `mutable-ref` — tags and branches move. |
| `actions/checkout@df4cb1c` | `mutable-ref` — abbreviated SHAs are not immutable. |
| `actions/checkout` | `missing-ref` — no ref at all. |
| `docker://alpine:3.19`, `docker://alpine` | `mutable-image` — an image tag moves. |
| `${{ matrix.action }}` | `expression` — the value is not known until the workflow runs. |
| `checkout`, `""` | `unparsable` — not a reference Hollywood can read. |

## How to pin

Resolve the tag you want to a commit SHA, then keep the human-readable version in a
trailing comment so reviewers and Dependabot can still read it. Hollywood's own
workflows hoist each reference into a named constant:

```ts
export const checkoutAction =
	"actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10"; // v6.0.3

export const setupNodeAction =
	"actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e"; // v6.4.0
```

Dependabot updates both the SHA and the trailing comment, so a bump stays reviewable.

## Running the check

The rule runs as part of the workflow security policy:

```bash
hollywood check --workflow-security
```

Bare `hollywood check` runs every check, including this one. Findings are reported as
`path:line: mutable action references: <reference>`, and a non-empty set fails the
command.

The check reads generated workflow YAML under `--workflows-dir` and TypeScript workflow
sources under `--source-root`.

## Allowing an unpinned reference

Use `--allow-unpinned` to exempt a reference. The flag is repeatable, and a trailing `*`
matches a prefix:

```bash
hollywood check --workflow-security \
  --allow-unpinned "my-org/*" \
  --allow-unpinned "docker://ghcr.io/acme/tool"
```

Patterns match the reference identity with the mutable part removed: `owner/repo` for an
action, and `docker://image` without its tag for a container action. Keep the flag in the
CI command line, where it is visible in review, rather than hiding the exemption in the
workflow.

## Validating from TypeScript

The same rule is available as a function, so you can assert pinning in your own tests:

```ts
import { validateActionPinning } from "@dedalus-labs/hollywood";

const result = validateActionPinning({
	name: ".github/workflows/ci.yml",
	content: await readFile(".github/workflows/ci.yml", "utf8"),
});
```

See [API Surface](api.md) for the exported functions and types.

## Limitation

In TypeScript sources the check reads quoted string literals only. A reference held in a
constant, such as `uses: checkoutAction`, is not resolved. This is not a gap in coverage:
the generated workflow YAML is the artifact GitHub runs, it is checked in full, and
`hollywood check --generated` proves the YAML matches its TypeScript source.
