# Publishing Boundary

The published package should contain runtime JavaScript, TypeScript
declarations, package metadata, and the README.

It should not contain examples, tests, Vitest config, or TypeScript source.

## Dependency boundary

Hollywood keeps the direct runtime dependency list small:

| Dependency                  | Why it exists                                      |
| --------------------------- | -------------------------------------------------- |
| `@actions/core`             | Official GitHub Actions input/output and logging.  |
| `@actions/exec`             | Official GitHub Actions process execution.         |
| `@actions/expressions`      | GitHub expression parsing and validation.          |
| `@actions/workflow-parser`  | GitHub workflow schema parsing and validation.     |
| `esbuild`                   | Local TypeScript source loading for the CLI.       |
| `yaml`                      | Rendering generated action and workflow files.     |

Keep new runtime dependencies rare. Every dependency expands the install graph
that users have to trust when they run CI/CD automation from npm.

## Desired package boundary

```json
{
	"bin": {
		"hollywood": "./dist/cli.js"
	},
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"import": "./dist/index.js"
		},
		"./action-runtime": {
			"types": "./dist/action-runtime.d.ts",
			"import": "./dist/action-runtime.js"
		},
		"./expr": {
			"types": "./dist/expr.d.ts",
			"import": "./dist/expr.js"
		}
	},
	"types": "./dist/index.d.ts",
	"files": ["dist", "README.md", "package.json"]
}
```

With that boundary:

| Path               | Published? | Reason                                  |
| ------------------ | ---------- | --------------------------------------- |
| `dist/index.js`    | yes        | Runtime entrypoint.                     |
| `dist/cli.js`      | yes        | Bundled `hollywood` command.            |
| `dist/index.d.ts`  | yes        | Public types.                           |
| `dist/expr.js`     | yes        | Expression helper subpath.              |
| `README.md`        | yes        | Package landing page.                   |
| `LICENSE`          | yes        | License file included by npm.           |
| `examples/*`       | no         | Repository examples, not runtime files. |
| `src/*.test.ts`    | no         | Tests are not runtime files.            |
| `vitest.config.ts` | no         | Local test configuration.               |

`npm pack --dry-run` is the source of truth for what would publish. The package
uses `prepack` to build `dist/` before the tarball is assembled.

## Release flow

Hollywood releases from `main` through
[Release Please](https://github.com/googleapis/release-please). Normal PRs
merge into `main` first. On each push, Release Please reads the Conventional
Commit history and opens or updates one release PR with the next version,
changelog, and package metadata.

Merging that release PR into `main` is the release switch. The manifest change
reruns lint, typecheck, tests, and the build before publishing the package with
npm provenance. Only after npm accepts the package does a dependent job create
the matching GitHub tag and release. A failed npm publish therefore cannot
leave behind a release tag.

Stable releases publish with the `latest` npm dist-tag. Prereleases use their
prerelease identifier, such as `alpha`. Release Please owns `package.json`,
`CHANGELOG.md`, and `.release-please-manifest.json` during normal releases.

The published GitHub release also drives the public runner image. Its `vX.Y.Z`
tag must exactly match `package.json` before GHCR receives version tags. Stable
images publish the exact version, `X.Y`, `latest`, and `ubuntu-24.04` aliases;
prereleases publish only the exact prerelease version. Main-branch builds use
the `edge` channel, and every build also receives an immutable
`sha-<git-sha>` tag.

The image is native on Linux `amd64` and `arm64`, carries an SBOM and BuildKit
provenance, and receives a GitHub artifact attestation. Publication verifies
the attestation and an anonymous digest pull before succeeding. Consumers
should pin the resulting manifest digest even when they discover it through a
version tag.
