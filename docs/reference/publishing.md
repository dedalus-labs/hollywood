# Publishing boundary

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
| `@octokit/openapi-types`    | GitHub REST request and response types.             |
| `esbuild`                   | Local TypeScript source loading for the CLI.       |
| `yaml`                      | Rendering generated action and workflow files.     |
| `zod`                       | Runtime validation for external structured data.  |

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

| Path                    | Published? | Reason                                  |
| ----------------------- | ---------- | --------------------------------------- |
| `dist/index.js`         | yes        | Runtime entrypoint.                     |
| `dist/cli.js`           | yes        | Bundled `hollywood` command.            |
| `dist/runner-launch.js` | yes        | Connected runner container entrypoint.  |
| `dist/index.d.ts`       | yes        | Public types.                           |
| `dist/expr.js`          | yes        | Expression helper subpath.              |
| `README.md`             | yes        | Package landing page.                   |
| `LICENSE`               | yes        | License file included by npm.           |
| `examples/*`            | no         | Repository examples, not runtime files. |
| `src/*.test.ts`         | no         | Tests are not runtime files.            |
| `vitest.config.ts`      | no         | Local test configuration.               |

`npm pack --dry-run` is the source of truth for what would publish. The package
uses `prepack` to build `dist/` before the tarball is assembled.

## Release flow

Hollywood releases from `main` through
[Release Please](https://github.com/googleapis/release-please). Normal PRs
merge into `main` first. On each push, Release Please reads the Conventional
Commit history and opens or updates separate release PRs for these components:

| Component | Version source | Git tag | Publication |
| --- | --- | --- | --- |
| Hollywood | `package.json` | `vX.Y.Z` | npm and GitHub Releases |
| Runner image | `runner/version.txt` | `runner-vX.Y.Z` | GHCR and GitHub Releases |

Release Please creates `runner/version.txt` and `runner/CHANGELOG.md` in the
first runner release PR. Until that PR merges, the manifest omits the runner
component and no runner release exists.

Merging a release PR into `main` creates a pending deployment for the protected
`release` environment. A maintainer must approve that deployment before the
workflow can publish npm packages, GitHub Releases, or runner images. The
publication workflow compares the previous and current Release Please
manifests. It fails when the manifest changes without changing a configured
component version.

Required CI also compares each manifest version with the published immutable
GitHub Releases. The first stable component release must use `0.0.1`. Later
stable releases must apply one major, minor, or patch increment. This check
prevents a release PR from skipping an unpublished version.

For a Hollywood release, the workflow reruns lint, typecheck, tests, and the
build before publishing the package with npm provenance. It creates the GitHub
tag and release only after npm accepts the package. A failed npm publish cannot
leave behind a release tag.

For a runner image release, the workflow creates the `runner-vX.Y.Z` GitHub
release without running npm publication. The release event starts the runner
image workflow. That workflow verifies the image on Linux `amd64` and `arm64`,
then publishes the multi-platform image to GHCR.

Stable releases publish with the `latest` npm dist-tag. Prereleases use their
prerelease identifier, such as `alpha`. Release Please owns `package.json`,
`CHANGELOG.md`, and `.release-please-manifest.json` during normal releases.

The runner GitHub release tag must exactly match `runner/version.txt` before
GHCR receives version tags. Stable images publish the exact version, compatible
minor version, exact and compatible Ubuntu 24.04 variants, `latest`, and
`ubuntu-24.04`. Prereleases publish only the immutable source tag, exact
prerelease version, and exact prerelease Ubuntu 24.04 variant.

The image is native on Linux `amd64` and `arm64`, carries an SBOM and BuildKit
provenance, and receives a GitHub artifact attestation. Publication verifies
the attestation and an anonymous digest pull before succeeding. Consumers
should pin the resulting manifest digest even when they discover it through a
version tag.

GitHub creates the first GHCR package with private visibility. An organization
owner must change `hollywood/runner` to Public once. The publication workflow
fails until an anonymous digest pull succeeds.
