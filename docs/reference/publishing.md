# Publishing Boundary

The published package should contain runtime JavaScript, TypeScript
declarations, package metadata, and the README.

It should not contain examples, tests, Vitest config, or TypeScript source.

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
| `examples/*`       | no         | Repository examples, not runtime files. |
| `src/*.test.ts`    | no         | Tests are not runtime files.            |
| `vitest.config.ts` | no         | Local test configuration.               |

`npm pack --dry-run` is the source of truth for what would publish. The package
uses `prepack` to build `dist/` before the tarball is assembled.

## Release flow

Hollywood releases from `main` through Release Please. Normal PRs merge into
`main` first. On each push, Release Please reads the Conventional Commit history
and opens or updates one release PR with the next version, changelog, and
package metadata.

Merging that release PR into `main` is the release switch. Release Please then
creates the GitHub release and tag. The npm workflow runs from the published
GitHub release, checks out the release tag, reruns lint/typecheck/tests/build,
and publishes the package with npm provenance.

The current prerelease channel publishes with the `alpha` npm dist-tag.
Release Please owns `package.json`, `CHANGELOG.md`, and
`.release-please-manifest.json` during normal releases.
