# Security Policy

## Reporting Vulnerabilities

Do not open public issues for security vulnerabilities.

Email security reports to [security@dedaluslabs.ai](mailto:security@dedaluslabs.ai).

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix, if any

We will acknowledge your report within 48 hours and provide a detailed response
within 7 days.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| main | Active development |
| < 1.0 | Pre-release, best-effort |

## CI/CD Policy

Hollywood is a public repository. Forks and pull requests are expected, but
untrusted pull requests must not become a path to repository credentials,
release credentials, or maintainer trust state.

Rules for workflows in this repository:

- Do not use `pull_request_target`.
- Do not use `workflow_run`.
- Do not run untrusted pull request code in a workflow with write permissions
  or secrets.
- Keep top-level pull request permissions read-only.
- Pin every third-party `uses:` action to a full commit SHA.
- Author workflows in `ci/*.ts` and regenerate YAML with Hollywood.
- Treat generated workflow YAML as build output. Do not handwrite
  `.github/workflows/*.yml` or `.github/actions/**/action.yml`.
- Publish packages only from release workflows, never from pull request
  workflows.
- Publish with provenance and short-lived identity tokens. Do not store
  long-lived registry publish tokens in repository workflows.
- Do not share caches across untrusted and release contexts.

The CLA workflow follows these rules. It runs on `pull_request`, checks out the
trusted base commit, reads `VOUCHED.td` from that base commit, and emits a
status result. It does not write comments, use secrets, or evaluate pull
request code.

When adding or changing CI/CD:

1. Edit Hollywood source under `ci/`.
2. Regenerate workflows with `npm run generate`.
3. Run `npm run check` before opening or merging the change.
4. Keep verification jobs separate from release or publish jobs.
5. If Hollywood cannot express a required workflow field, extend Hollywood
   first instead of hand-editing generated YAML.

## Disclosure Policy

We follow coordinated disclosure:

1. Reporter submits vulnerability privately.
2. We acknowledge within 48 hours.
3. We investigate and develop a fix.
4. We release the fix and credit the reporter, unless anonymity is requested.
5. Public disclosure happens after 90 days or when the fix is deployed.

## Contact

- Security issues: [security@dedaluslabs.ai](mailto:security@dedaluslabs.ai)
