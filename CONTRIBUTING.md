# Contributing

Hollywood accepts external contributions from vouched contributors.

This is intentionally a small gate. A maintainer needs to know who is sending
code before spending review time or letting CI run on a public pull request.
Being listed in `VOUCHED.td` records two things:

1. A maintainer or trusted contributor has vouched for the GitHub account.
2. The contributor has accepted the [CLA](CLA.md).

## Getting Vouched

1. Open a "Vouch request" issue.
2. Confirm in the issue that you have read and accept `CLA.md`.
3. Link public GitHub work, a project website, or another public identity that
   helps a maintainer recognize you.
4. If an existing vouched contributor knows you, ask them to comment on the
   issue.
5. A maintainer adds your GitHub handle to `VOUCHED.td` in a normal pull
   request.

Do not add yourself to `VOUCHED.td` in your first contribution. That file is
maintainer-owned trust state.

## Pull Requests

For future work, start with [ROADMAP.md](ROADMAP.md). If the idea is concrete,
open or comment on a GitHub issue before implementing it. Public API changes,
generated YAML changes, and new workflow primitives should have issue context
before a pull request.

Before opening a code PR:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run check
npm run package
```

Use Conventional Commits so Release Please can build the changelog and version
bump from merged history:

```text
feat(cli): add watch mode
fix(expr): preserve boolean inputs
docs: clarify generated workflow output
```

`feat` and `fix` commits are releasable. `docs`, `test`, `chore`, `ci`,
`style`, `refactor`, and `build` commits may appear in the changelog, but they
do not drive a release by themselves.

Generated workflow YAML is committed, but it is not handwritten. Edit files in
`gha/`, then run:

```bash
npm run generate
```

## Release Flow

Contributors do not publish releases directly. Merge normal contribution PRs
into `main`; each push lets [Release Please](https://github.com/googleapis/release-please)
update a single release PR with the next version, changelog, and package
metadata.

When maintainers are ready to release, they merge the Release Please PR into
`main`. That merge creates the GitHub release, and the npm publishing workflow
publishes the tagged package. Do not edit `package.json`, `CHANGELOG.md`, or
`.release-please-manifest.json` by hand unless a maintainer asks for a manual
release repair.

## Security

Do not use `pull_request_target` or `workflow_run` for repo workflows. Public
pull requests run without secrets and with read-only token permissions. See
[SECURITY.md](SECURITY.md) for the CI/CD rules.
