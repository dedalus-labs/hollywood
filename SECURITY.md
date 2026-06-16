# Security

## Reporting Vulnerabilities

Report security vulnerabilities privately through GitHub Security Advisories:

https://github.com/dedalus-labs/hollywood/security/advisories/new

## GitHub Actions Policy

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
- Publish packages only from release workflows, never from pull request
  workflows.
- Do not share caches across untrusted and release contexts.

The CLA workflow follows these rules. It runs on `pull_request`, checks out the
trusted base commit, reads `VOUCHED.td` from that base commit, and emits a
status result. It does not write comments, use secrets, or evaluate pull
request code.

## Background

These rules follow the same threat model described by Astral's public CI/CD
security guidance and GitHub's Actions hardening guidance: privileged PR
triggers and mutable action tags are supply-chain footguns. The Mini
Shai-Hulud/TanStack compromise showed why this matters for npm publishers:
attacker-controlled pull request code poisoned CI state and later hijacked a
legitimate release pipeline.
