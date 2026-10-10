# Provider selection with retries

This recipe selects one provider before one payload starts. It selects the
secondary only after the primary canary fails or its queued cancellation is confirmed.

1. Dispatch the inert canary once. Do not retry an ambiguous mutation.
2. Retry only typed, read-only failures after 1 and 2 seconds.
3. Confirm cancellation before selecting the secondary provider.
4. Fail when dispatch, status, or cancellation remains ambiguous.

Both providers must satisfy the same payload contract. Match the operating
system, architecture, tools, memory, disk, network access, and timeout before
you use this pattern for a real job.

## Run every path locally

Run all scenarios in the official GitHub Actions runner image:

```bash
npm ci && npm run build

for scenario in primary-ready secondary-after-timeout retry-read; do
  node dist/cli.js run examples/provider-selection.ts \
    --export providerSelectionSimulation --provider container \
    --with "scenario=$scenario"
done
```

The timeout scenario advances a virtual clock. It proves the five-minute
ordering contract without making the test wait five minutes.

| Scenario | Provider | Dispatches | Cancellations |
| --- | --- | ---: | ---: |
| `primary-ready` | `primary` | 1 | 0 |
| `secondary-after-timeout` | `secondary` | 1 | 1 |
| `retry-read` | `primary` | 1 | 0 |

The local run proves action packaging, selection, cancellation ordering, and
bounded read retries. It does not prove credentials, hosted permissions,
network policy, or live capacity. Use one inert canary workflow for that
external receipt.
