# Required deployment dependency check

`reconcileGitHubMergePlan` refreshes **Hollywood deployment dependencies** on
planned PR heads and live queue revisions. Require that status in branch rules
and select the status-writing App as its expected source. Keep normal CI and
review requirements enabled too.

Pass a trusted `repository`, `base`, `statusPublisher` bot login, and `runUrl`.
The run URL supplies the status's Details link.
Full dependency reasons appear in the workflow summary.
Skip unchanged statuses only when they belong to the configured publisher.

The callback reads trusted plan source. Routing comes from the trusted caller.
Unreadable or invalid plans invalidate known queue revisions. A plan must match
the caller's repository and base. Stack members inherit their top candidate's
policy. Only declared candidates, their members, and the live queue are inspected.

Each controller run reads live queue membership and checks all planned predecessors
included in that revision. Waiting candidates outside the queue cannot block an
earlier group. Failed, inactive, missing, or mismatched deployment evidence blocks both the PR
and queued revision. Repeated observations preserve unchanged statuses.
Status publication and admission share one evaluated decision snapshot.

GitHub events and API reads are asynchronous. These checks prove an observed
snapshot, not a transaction with a deployment platform. Serialize incompatible
rollbacks in the deployment system. Base pushes and scheduled reconciliation refresh
mutable evidence. Read failures invalidate known revisions.

To stop pending intent, remove it from the reviewed plan. Dequeue an already
submitted PR before removing its entry. Removal does not cancel a GitHub merge
operation. Changed heads require reviewed SHA updates before resubmission.
