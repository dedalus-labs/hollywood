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

Before opening a code PR:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run check:generated
npm pack --dry-run
```

Generated workflow YAML is committed, but it is not handwritten. Edit files in
`ci/`, then run:

```bash
npm run generate
```

## Security

Do not use `pull_request_target` or `workflow_run` for repo workflows. Public
pull requests run without secrets and with read-only token permissions. See
[SECURITY.md](SECURITY.md) for the CI/CD rules.
