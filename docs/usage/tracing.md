# Workflow spans

Hollywood converts the jobs and steps of one GitHub workflow attempt into
OpenTelemetry spans. The collector reads every page of the jobs API and keeps
parallel intervals at their recorded timestamps.

```typescript
import { parseGitHubApiToken, parseGitHubRepository } from "@dedalus-labs/hollywood";
import { collectWorkflowTrace } from "@dedalus-labs/hollywood/tracing";

const token = process.env["GITHUB_TOKEN"];
if (token === undefined) throw new Error("GITHUB_TOKEN is required");

const report = await collectWorkflowTrace({
	repository: parseGitHubRepository("OWNER/REPOSITORY"),
	runId: 123,
	attempt: 1,
	token: parseGitHubApiToken(token),
});
// report.spans contains standard OpenTelemetry ReadableSpan values.
```

Each trace has a workflow root, job children, and step grandchildren. The
root covers the elapsed job window. Child durations overlap during parallel
execution, so their sum is not elapsed workflow time. GitHub timestamps may
round short operations to zero seconds.

All workload jobs must be complete. `excludeJobId` identifies a reporting job
that is still running. The collector rejects a missing exclusion ID or any
remaining incomplete job. Passing an explicit attempt keeps reruns separate.

Missing timestamps and skipped work have `hollywood.timing.available=false`.
Their spans use zero-length intervals anchored to the parent for structural
completeness. These intervals are not measurements. Invalid timestamps and
negative measured intervals raise `WorkflowTraceError`.

The collector owns a tracer provider per call and shuts it down before
returning. It does not register a global provider or send spans to a backend.

Run `npm test -- src/workflow-trace.test.ts` to verify pagination, parentage,
parallel timing, skipped work, and incomplete-job rejection.

Sources: [GitHub workflow jobs](https://docs.github.com/en/rest/actions/workflow-jobs)
and [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/).
