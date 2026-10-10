# Merge plan admission

A reviewed plan binds each candidate PR to its exact head SHA and prerequisites.
Each prerequisite requires a merge, optionally followed by a verified deployment.
`parseGitHubMergePlan` validates the complete graph before making API requests.
Cycles, duplicate candidates, changed heads, and dependencies within the same
open native stack block admission.

`evaluateGitHubMergePlan` returns `ready`, `blocked`, or `merged` with a reason.
`admitGitHubMergePlan` submits ready candidates through GitHub's asynchronous
native merge API, with `merge_action=merge_queue` and the expected head SHA.
GitHub enforces reviews, CI, branch rules, and stack ordering.
Accepted requests still need asynchronous validation. Ready does not mean queued.

Pass a read token plus a separate `mergeToken` and expected `mergeActor` login.
Admission verifies the mutation token belongs to that user. A repeated pending
request must carry the same SHA and queue action. Authentication and API errors
fail explicitly. Protect plan source and credentials from candidate code.

Deployment requirements use the [verification receipt contract](deployment-receipts.md).
Queue admission observes a snapshot. A required status must revalidate mutable
deployment evidence for queued revisions before GitHub merges them.
