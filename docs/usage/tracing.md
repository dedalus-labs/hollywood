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


## Render summaries

`renderTraceSummary(report)` returns GitHub-compatible Markdown and HTML.
It groups each job in a collapsible section and displays each step's name,
duration, and a cascade on one shared time axis. Names are escaped before
rendering. Missing measurements remain labeled `Unmeasured`.

`renderTraceText(report)` returns a text tree for terminal logs. Both renderers
consume the same spans from `collectWorkflowTrace` and preserve their parentage.
They reject duplicate span IDs, missing parents, and disconnected cycles.

The summary uses GitHub's supported markup. HTML is appropriate for the browser
presentation because it provides native links, tables, and disclosure controls.
An XML document alone would still require a presentation layer. Trace data
remains represented as OpenTelemetry spans independently of the markup.


## Explore spans offline

`renderTraceHtml(report)` returns a self-contained HTML document with expandable
workflow, job, and step rows. Each bar uses the span's recorded start and end
on a shared time axis. Search retains matching jobs and their child steps.
Select a bar to inspect its duration, attributes, and GitHub log link.

The viewer includes its own styling and script, makes no network requests on
load, and supports filtering failures, expanding groups, and zooming. Save the
returned string as `trace.html` and open it in a browser.

HTML owns the interactive controls. Inline SVG, an XML-based graphics format,
owns the bars. A standalone XML document would require a separate viewer and
would not make GitHub execute interactive content in a job summary. The GitHub
summary and the offline explorer are separate views of the same span data.
