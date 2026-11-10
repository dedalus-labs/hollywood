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


The overview above the span tree compares job windows before expanding any
steps. Purple bars represent jobs, blue bars represent steps, and red marks
failed work. Skipped jobs stay visible as unmeasured. Compact action labels
retain the full action reference in the inspector and hover text.

## Add a report to a workflow

Re-export the built-in action from a source file Hollywood scans. Generate and
bundle it with the rest of your local actions.

```typescript
// ci/tracing.ts
export { reportWorkflowTrace } from "@dedalus-labs/hollywood/tracing";
```

In the workflow, add a final job with `needs` covering every workload job. Use
the same checkout, dependency installation, and local-action build steps as
your other jobs. After those setup steps, run:

```typescript
import { gh, uses } from "@dedalus-labs/hollywood";
import { reportWorkflowTrace } from "./tracing";

const report = uses(reportWorkflowTrace, {
	env: { GITHUB_TOKEN: gh.github.token },
	with: {
		repository: gh.github.repository,
		runId: "${{ github.run_id }}",
		attempt: "${{ github.run_attempt }}",
		excludeJobId: "${{ job.check_run_id }}",
	},
});
```

Give the reporter `actions: read` and `contents: read` permissions and an
`always()` condition. Upload `.hollywood/trace` with `actions/upload-artifact`,
using `include-hidden-files: true` and `if-no-files-found: error`. The action
writes `summary.md` to `GITHUB_STEP_SUMMARY` and prints `trace.txt` in its logs.
The artifact also contains `trace.html` and standard OTLP `trace.json`.

The reporter uses GitHub.com's `job.check_run_id` context as its job ID.
Keep the reporter's `needs` list synchronized as jobs are added. A missing
workload dependency produces an explicit incomplete-job error.

## Inspect an existing run

Set `GITHUB_TOKEN` to a token with Actions read access, then run:

```bash
hollywood trace OWNER/REPOSITORY RUN_ID --attempt 1 --output .hollywood/trace
```

Open `.hollywood/trace/trace.html` locally. Pass `--summary PATH` to append the
same summary to another file. The collector pins the requested attempt, so a
rerun cannot silently combine jobs from two attempts. The CLI writes generated
report files into the output directory, replacing files with the same names.


The [trace example workflow](https://github.com/dedalus-labs/hollywood/blob/8727688499dbfc5b1d34bffcfbb3b08b83ff67bf/gha/tracing.ts) exercises a workload and
uploads its report. It runs on pull requests with any base branch so stacked
changes can verify the complete artifact flow before merging.

The artifact contains `trace.html`, standard OTLP `trace.json`, `summary.md`,
and `trace.txt`. HTML provides the presentation. OTLP's JSON encoding provides
the structured data, so an additional XML trace schema is unnecessary.

## Measure operations within an action

Pass `trace: { onEnd }` to `runAction` to receive OpenTelemetry spans for the
action, each `exec` command, `fs.readText`, `log.group`, and nested `call`.
The callback runs once after execution, including when the action fails.
It receives a complete parent tree with high-resolution start and end times.

```typescript
await runAction(build, {
	with: {}, exec: nodeExec, fs: nodeFs, runner: currentRunner(),
	trace: { onEnd: async (spans) => { await saveSpans(spans); } },
});
```

Use `log.group("Compile", async () => { ... })` to label a block of work.
Parallel groups retain independent async context, so each command belongs to
the group that started it. Tracing owns its provider and does not change the
process's global OpenTelemetry configuration.

Commands record the executable's basename and a returned exit code. File
reads use the label `Read file`. Arguments, paths, environment values,
outputs, and error messages are excluded. Group names, action names, and
explicit root attributes must be safe to include in an artifact.

Await every operation. If an action returns with outstanding operations,
Hollywood rejects it. On early failure, outstanding spans end at collection
with `hollywood.result=unfinished` and `hollywood.timing.partial=true`. Their
duration is the observed portion, not total execution time. Later completion
does not change the exported trace. Starting work after closure fails.

An export failure rejects the run. If both execution and export fail, an
`AggregateError` preserves both errors, with the action error first. A hard
process kill cannot flush in-memory spans. Arbitrary JavaScript statements
and work inside external binaries require their own instrumentation.

Run `npm test -- src/action-trace.test.ts` for real command timing, parallel
parentage, partial intervals, redaction, and export failure coverage.

## Attach operation recordings

`fileActionTrace(directory, identity)` supplies a `runAction` trace callback
that writes one standard OTLP JSON file per action. Its identity contains
`repository`, `runId`, `attempt`, `jobId`, and the resolved `stepName`.
Files use exclusive span-ID names, so an existing recording is never replaced.

Download each workload job's files into one flat directory with
`actions/download-artifact` and `merge-multiple: true`. Pass the directory as
`operations` to `reportWorkflowTrace` or `collectWorkflowTrace`. For the CLI,
use `--operations DIRECTORY`. An explicitly supplied empty directory fails.

The collector checks the repository, run, attempt, job ID, and exact step name
before attaching a recording. Every traced step needs a unique name within
its job. GitHub's jobs API exposes step names and numbers, but not workflow
step IDs. Missing or ambiguous matches fail. Duplicate recordings for one
step also fail.

Operations appear beneath their GitHub step in the HTML explorer, summary,
text cascade, and OTLP report. Original nanosecond intervals are preserved.
Each imported span links to its original trace and span IDs. The report window
includes native timings even when GitHub rounded a step boundary to a second.
Partial durations are labeled explicitly.

Select an action or group bar, then choose **Focus interval** to expand that
interval across the timeline. The tree keeps its ancestors and descendants,
and the ticks start at the selected interval's beginning. **Full workflow**
restores every job. This makes millisecond commands readable within long jobs.

The reader accepts Hollywood's recorded OTLP span trees. It rejects mixed
trace IDs, duplicate span IDs, missing parents, disconnected cycles, and
invalid intervals. This is a native action recording contract, not a general
importer for every OpenTelemetry payload.

Source: the [OpenTelemetry GitHub receiver](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/githubreceiver#traces---getting-started)
documents the same step-name limitation.
