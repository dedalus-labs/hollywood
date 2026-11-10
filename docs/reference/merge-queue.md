# Read the native merge queue

`readGitHubMergeQueue(plan, services)` reads every entry in the repository's
configured GitHub merge queue. Each entry includes its position, exact queue
head commit, pull request head, and native stack number. A head can be null
while GitHub prepares the entry.

The reader paginates the GraphQL connection and rejects missing queues,
GraphQL errors, and invalid cursors. It requires the read token's Merge queues,
Contents, and Pull requests permissions. It performs no queue mutations.

Queue positions and heads describe the observed snapshot. Callers must refresh
them before deciding which required statuses to publish for a merge group.
