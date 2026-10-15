import { Octokit } from "@octokit/rest";
import {
	ROOT_CONTEXT,
	SpanKind,
	SpanStatusCode,
	trace,
	type Span,
	type Tracer,
} from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
	AlwaysOnSampler,
	InMemorySpanExporter,
	SimpleSpanProcessor,
	TracerProvider,
	type ReadableSpan,
} from "@opentelemetry/sdk-trace";
import type { components } from "@octokit/openapi-types";

import type { GitHubApiToken, GitHubRepository } from "./github-runner-api";

type WorkflowRun = components["schemas"]["workflow-run"];
type WorkflowJob = components["schemas"]["job"];

/** One workflow attempt, with the reporter excluded when collecting from its own run. */
export type WorkflowTrace = Readonly<{
	name: string;
	url: string;
	attempt: number;
	spans: readonly ReadableSpan[];
}>;

export type WorkflowTraceOptions = Readonly<{
	repository: GitHubRepository;
	runId: number;
	attempt: number;
	token: GitHubApiToken;
	/** Exclude the reporting job while it is still running. */
	excludeJobId?: number;
}>;

export class WorkflowTraceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowTraceError";
	}
}

export const collectWorkflowTrace = async (
	options: WorkflowTraceOptions,
	client: Octokit = new Octokit({ auth: options.token }),
): Promise<WorkflowTrace> => {
	const ids = [options.runId, options.attempt];
	if (options.excludeJobId !== undefined) ids.push(options.excludeJobId);
	if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
		throw new WorkflowTraceError("Run, attempt, and job IDs must be positive integers.");
	}
	const parameters = {
		owner: options.repository.owner,
		repo: options.repository.name,
		run_id: options.runId,
		attempt_number: options.attempt,
	};
	const [{ data: run }, allJobs] = await Promise.all([
		client.rest.actions.getWorkflowRunAttempt(parameters),
		client.paginate(client.rest.actions.listJobsForWorkflowRunAttempt, {
			...parameters,
			per_page: 100,
		}),
	]);
	if (
		options.excludeJobId !== undefined &&
		!allJobs.some((job) => job.id === options.excludeJobId)
	) {
		throw new WorkflowTraceError(
			`Reporter job ${options.excludeJobId} is absent from this attempt.`,
		);
	}
	const jobs = allJobs.filter((job) => job.id !== options.excludeJobId);
	if (jobs.length === 0) throw new WorkflowTraceError("No workload jobs to report.");
	const unfinished = jobs.filter((job) => job.status !== "completed");
	if (unfinished.length > 0) {
		throw new WorkflowTraceError(
			`Jobs are still running: ${unfinished.map((job) => job.name).join(", ")}`,
		);
	}
	return recordWorkflow(run, jobs, options.attempt);
};

const recordWorkflow = async (
	run: WorkflowRun,
	jobs: WorkflowJob[],
	attempt: number,
): Promise<WorkflowTrace> => {
	const anchor = timestamp(run.created_at);
	const timings = jobs.flatMap((job) => [
		interval(job, anchor),
		...(job.steps ?? []).map((step) => interval(step, anchor)),
	]);
	const measured = timings.filter((time) => time.available);
	const start = measured.length === 0 ? anchor : Math.min(...measured.map((time) => time.start));
	const end = measured.length === 0 ? start : Math.max(...measured.map((time) => time.end));
	const exporter = new InMemorySpanExporter();
	const provider = new TracerProvider({
		sampler: new AlwaysOnSampler(),
		resource: resourceFromAttributes({ "service.name": "hollywood" }),
		spanProcessors: [new SimpleSpanProcessor({ exporter })],
	});
	const tracer = provider.getTracer("@dedalus-labs/hollywood");
	const name = run.name ?? "Unnamed workflow";
	const root = recordedSpan(tracer, undefined, {
		name,
		kind: "workflow",
		result: workloadResult(jobs),
		url: run.html_url,
		time: { start, end, available: measured.length > 0 },
	});
	root.setAttributes({
		"cicd.pipeline.name": name,
		"cicd.pipeline.run.id": String(run.id),
		"github.run.attempt": attempt,
	});
	try {
		for (const job of jobs) {
			const time = interval(job, start);
			const jobUrl = `${run.html_url}/job/${job.id}`;
			const parent = recordedSpan(tracer, root, {
				name: job.name,
				kind: "job",
				result: job.conclusion,
				time,
				url: jobUrl,
			});
			parent.setAttribute("cicd.pipeline.task.run.id", String(job.id));
			for (const step of job.steps ?? []) {
				const stepTime = interval(step, time.start);
				const child = recordedSpan(tracer, parent, {
					name: step.name,
					kind: "step",
					result: step.conclusion,
					time: stepTime,
					url: `${jobUrl}#step:${step.number}:1`,
				});
				child.setAttributes({
					"github.step.number": step.number,
					"cicd.pipeline.task.run.id": `${job.id}/${step.number}`,
				});
				child.end(new Date(stepTime.end));
			}
			parent.end(new Date(time.end));
		}
		root.end(new Date(end));
		await provider.forceFlush();
		return { name, url: run.html_url, attempt, spans: [...exporter.getFinishedSpans()] };
	} finally {
		await provider.shutdown();
	}
};

type Timing = Readonly<{ start: number; end: number; available: boolean }>;
type RecordedSpan = Readonly<{
	name: string;
	kind: "workflow" | "job" | "step";
	result: string | null;
	time: Timing;
	url: string;
}>;

const recordedSpan = (tracer: Tracer, parent: Span | undefined, item: RecordedSpan): Span => {
	const span = tracer.startSpan(
		item.name,
		{
			kind: item.kind === "workflow" ? SpanKind.SERVER : SpanKind.INTERNAL,
			startTime: new Date(item.time.start),
			attributes: {
				"hollywood.kind": item.kind,
				"hollywood.result": item.result ?? "unknown",
				"hollywood.timing.available": item.time.available,
				"url.full": item.url,
			},
		},
		parent === undefined ? ROOT_CONTEXT : trace.setSpan(ROOT_CONTEXT, parent),
	);
	if (["failure", "timed_out", "startup_failure"].includes(item.result ?? "unknown")) {
		span.setStatus({ code: SpanStatusCode.ERROR });
	}
	return span;
};

const workloadResult = (jobs: readonly WorkflowJob[]): string => {
	const results = jobs.map((job) => job.conclusion);
	if (results.some((value) => value === "failure" || value === "timed_out")) return "failure";
	if (results.includes("cancelled")) return "cancelled";
	if (results.every((value) => value === "skipped")) return "skipped";
	if (results.every((value) => value === "success" || value === "skipped" || value === "neutral"))
		return "success";
	return "unknown";
};

const timestamp = (value: string): number => {
	const result = Date.parse(value);
	if (!Number.isFinite(result) || result <= 0)
		throw new WorkflowTraceError(`Invalid GitHub timestamp: ${value}`);
	return result;
};

type TimingSource = Readonly<{
	started_at?: string | null;
	completed_at?: string | null;
	conclusion: string | null;
}>;

const interval = (source: TimingSource, anchor: number): Timing => {
	const { started_at: start, completed_at: end } = source;
	// Skipped jobs can have inverted bookkeeping timestamps despite doing no work.
	if (
		source.conclusion === "skipped" ||
		start == null ||
		end == null ||
		start.startsWith("0001-") ||
		end.startsWith("0001-")
	) {
		return { start: anchor, end: anchor, available: false };
	}
	const from = timestamp(start);
	const to = timestamp(end);
	if (to < from) throw new WorkflowTraceError("GitHub step completion precedes its start.");
	return { start: from, end: to, available: true };
};
