import assert from "node:assert/strict";
import { Octokit } from "@octokit/rest";
import { SpanStatusCode } from "@opentelemetry/api";
import { test } from "vitest";

import { parseGitHubApiToken, parseGitHubRepository } from "./github-runner-api";
import { collectWorkflowTrace, WorkflowTraceError } from "./workflow-trace";

const start = "2026-10-14T10:00:00Z";
const end = "2026-10-14T10:00:10Z";
const step = {
	name: "Compile",
	number: 1,
	status: "completed",
	conclusion: "success",
	started_at: start,
	completed_at: end,
};
const job = {
	id: 42,
	name: "Build",
	status: "completed",
	conclusion: "success",
	started_at: start,
	completed_at: end,
	steps: [step],
};
const run = {
	id: 7,
	name: "CI",
	html_url: "https://github.com/acme/project/actions/runs/7",
	run_attempt: 2,
	created_at: start,
	status: "completed",
	conclusion: "success",
};
const options = {
	repository: parseGitHubRepository("acme/project"),
	runId: 7,
	attempt: 2,
	token: parseGitHubApiToken("test-token"),
};

const client = (jobs: readonly unknown[], requests: string[] = []): Octokit =>
	new Octokit({
		request: {
			fetch: async (input: string | URL | Request) => {
				const url = new URL(String(input));
				requests.push(url.pathname + url.search);
				const page = Number(url.searchParams.get("page") ?? "1");
				const isJobs = url.pathname.endsWith("/jobs");
				const body = isJobs
					? { total_count: jobs.length, jobs: jobs.slice((page - 1) * 100, page * 100) }
					: run;
				const response = new Response(JSON.stringify(body), {
					headers: {
						"content-type": "application/json",
						...(isJobs && page * 100 < jobs.length
							? { link: `<${url.origin}${url.pathname}?page=${page + 1}>; rel="next"` }
							: {}),
					},
				});
				Object.defineProperty(response, "url", { value: url.href });
				return response;
			},
		},
	});

test("workflow traces retain every job across API pages within one attempt", async () => {
	const requests: string[] = [];
	const report = await collectWorkflowTrace(
		options,
		client(
			Array.from({ length: 101 }, (_, index) => ({ ...job, id: index + 1 })),
			requests,
		),
	);
	assert.equal(report.spans.length, 203);
	assert.equal(
		report.spans.filter((span) => span.attributes["hollywood.kind"] === "job").length,
		101,
	);
	assert.ok(requests.every((url) => url.includes("/attempts/2")));
	assert.ok(requests.some((url) => url.includes("page=2")));
	assert.equal(new Set(report.spans.map((span) => span.spanContext().traceId)).size, 1);
});

test("parallel spans preserve recorded intervals and parent relationships", async () => {
	const report = await collectWorkflowTrace(
		options,
		client([
			job,
			{
				...job,
				id: 43,
				name: "Test",
				started_at: "2026-10-14T10:00:05Z",
				steps: [{ ...step, started_at: "2026-10-14T10:00:05Z" }],
			},
		]),
	);
	const root = report.spans.find((span) => span.attributes["hollywood.kind"] === "workflow");
	const jobs = report.spans.filter((span) => span.attributes["hollywood.kind"] === "job");
	assert.deepEqual(root?.duration, [10, 0]);
	assert.deepEqual(
		jobs.map((span) => span.duration),
		[
			[10, 0],
			[5, 0],
		],
	);
	assert.ok(jobs.every((span) => span.parentSpanContext?.spanId === root?.spanContext().spanId));
});

test("unmeasured and failed steps differ from successful zero-duration work", async () => {
	const report = await collectWorkflowTrace(
		options,
		client([
			{
				...job,
				steps: [
					{ ...step, name: "Failed", conclusion: "failure" },
					{ ...step, name: "Skipped", conclusion: "skipped", started_at: end, completed_at: start },
					{ ...step, name: "Fast", completed_at: start },
				],
			},
		]),
	);
	assert.equal(
		report.spans.find((span) => span.name === "Failed")?.status.code,
		SpanStatusCode.ERROR,
	);
	assert.equal(
		report.spans.find((span) => span.name === "Skipped")?.attributes["hollywood.timing.available"],
		false,
	);
	assert.equal(
		report.spans.find((span) => span.name === "Fast")?.attributes["hollywood.timing.available"],
		true,
	);
});

test("only an explicitly identified reporting job may be incomplete", async () => {
	const jobs = [job, { ...job, id: 99, name: "Trace", status: "in_progress" }];
	await assert.rejects(collectWorkflowTrace(options, client(jobs)), WorkflowTraceError);
	await assert.rejects(
		collectWorkflowTrace({ ...options, excludeJobId: 123 }, client(jobs)),
		/absent/,
	);
	const report = await collectWorkflowTrace({ ...options, excludeJobId: 99 }, client(jobs));
	assert.equal(
		report.spans.filter((span) => span.attributes["hollywood.kind"] === "job").length,
		1,
	);
});

test("invalid timing data fails before a misleading report can be emitted", async () => {
	for (const completed_at of ["invalid", "2026-10-14T09:59:00Z"]) {
		await assert.rejects(
			collectWorkflowTrace(options, client([{ ...job, completed_at }])),
			WorkflowTraceError,
		);
	}
});

test("measured children set the window when parent timing is unavailable", async () => {
	const report = await collectWorkflowTrace(
		options,
		client([{ ...job, started_at: null, completed_at: null }]),
	);
	assert.deepEqual(
		report.spans.find((span) => span.attributes["hollywood.kind"] === "workflow")?.duration,
		[10, 0],
	);
	assert.equal(
		report.spans.find((span) => span.name === "Build")?.attributes["hollywood.timing.available"],
		false,
	);
});

test("an entirely skipped workload has no measured window", async () => {
	const report = await collectWorkflowTrace(
		options,
		client([{ ...job, conclusion: "skipped", started_at: end, completed_at: start, steps: [] }]),
	);
	assert.ok(report.spans.every((span) => span.attributes["hollywood.timing.available"] === false));
});
