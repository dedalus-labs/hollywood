# Pull Request

## Summary

**What changed:**

<!-- 1-2 sentences describing the change. -->

**Why:**

<!-- 1-2 sentences explaining the user or maintainer problem this solves. -->

> [!IMPORTANT]
> Keep reviewed diffs small. If this adds more than 500 lines outside generated files or lockfiles, split it.

**Lines added, excluding generated files and lockfiles:**

## Test Plan

<!-- List the exact commands you ran. Include manual verification for generated workflow output. -->

- [ ] CLA/Vouch check passes, or this PR only updates `VOUCHED.td`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run check:generated`
- [ ] `npm pack --dry-run`

## Generated Output

<!-- If this changes workflow generation, paste or link the relevant generated YAML diff. Otherwise write "N/A". -->

## Release Impact

- [ ] Runtime/library behavior changed
- [ ] CLI behavior changed
- [ ] Generated YAML changed
- [ ] Package contents changed
- [ ] Documentation only
- [ ] N/A

## Compatibility

<!-- Note any breaking API, Node.js version, package manager, or GitHub Actions behavior concerns. Write "N/A" if none. -->

## Reviewers

- Domain: @
- Readability: @

## Notes for Reviewers

<!-- Risk areas, tradeoffs, or anything reviewers should pay attention to. -->

## Changelog

**[YYYY-MM-DD]**

Feedback received:

- (none yet)

Changes made:

- Initial implementation
