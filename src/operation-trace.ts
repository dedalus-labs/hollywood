import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ROOT_CONTEXT, trace, type Span, type Tracer } from "@opentelemetry/api";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer";

import { ActionTraceError, type ActionTraceOptions } from "./action-trace";

const identitySchema = z.object({
	repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
	runId: z.number().int().positive().safe(),
	attempt: z.number().int().positive().safe(),
	jobId: z.number().int().positive().safe(),
	stepName: z.string().min(1),
});
export type OperationIdentity = z.infer<typeof identitySchema>;

export const githubActionTrace = (environment: NodeJS.ProcessEnv): ActionTraceOptions => {
	const required = (name: string): string => {
		const value = environment[name];
		if (value === undefined || value.length === 0)
			throw new ActionTraceError(`Native tracing requires ${name}.`);
		return value;
	};
	return fileActionTrace(required("HOLLYWOOD_TRACE_DIR"), {
		repository: required("GITHUB_REPOSITORY"),
		runId: decimalId.parse(required("GITHUB_RUN_ID")),
		attempt: decimalId.parse(required("GITHUB_RUN_ATTEMPT")),
		jobId: decimalId.parse(required("HOLLYWOOD_TRACE_JOB_ID")),
		stepName: required("HOLLYWOOD_TRACE_STEP_NAME"),
	});
};

/** Persist one native action as standard OTLP JSON with its exact GitHub identity. */
export const fileActionTrace = (directory: string, identity: OperationIdentity): ActionTraceOptions => {
	identitySchema.parse(identity);
	return {
		attributes: {
			"hollywood.trace.version": 1,
			"github.repository": identity.repository,
			"cicd.pipeline.run.id": String(identity.runId),
			"github.run.attempt": identity.attempt,
			"cicd.pipeline.task.run.id": String(identity.jobId),
			"github.step.name": identity.stepName,
		},
		onEnd: async (spans) => {
			const root = spans.find((span) => span.parentSpanContext === undefined);
			const json = JsonTraceSerializer.serializeRequest([...spans]);
			if (root === undefined || json === undefined)
				throw new ActionTraceError("Cannot serialize an empty action trace.");
			await mkdir(directory, { recursive: true });
			await writeFile(join(directory, `${root.spanContext().spanId}.otlp.json`), json, { flag: "wx" });
		},
	};
};

const decimalId = z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().positive().safe());
const scalar = z.union([
	z.object({ stringValue: z.string() }).transform((value) => value.stringValue),
	z.object({ boolValue: z.boolean() }).transform((value) => value.boolValue),
	z.object({ intValue: z.union([z.number(), z.string().regex(/^-?[0-9]+$/).transform(Number)]).pipe(z.number().int().safe()) })
		.transform((value) => value.intValue),
	z.object({ doubleValue: z.number() }).transform((value) => value.doubleValue),
]);
const value = z.union([
	scalar,
	z.object({ arrayValue: z.object({ values: z.array(scalar) }) }).transform((entry) => entry.arrayValue.values),
]);
const id = z.string().regex(/^[a-f0-9]{16}$/).refine((value) => value !== "0".repeat(16));
const time = z.string().regex(/^[1-9][0-9]*$/).transform(BigInt)
	.refine((value) => value <= 18_446_744_073_709_551_615n);
const spanSchema = z.object({
	traceId: z.string().regex(/^[a-f0-9]{32}$/).refine((value) => value !== "0".repeat(32)),
	spanId: id,
	parentSpanId: id.optional(),
	name: z.string().min(1),
	startTimeUnixNano: time,
	endTimeUnixNano: time,
	attributes: z.array(z.object({ key: z.string(), value })).transform((entries, context) => {
		if (new Set(entries.map((entry) => entry.key)).size !== entries.length)
			context.addIssue({ code: "custom", message: "Duplicate operation attribute." });
		return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
	}),
	status: z.object({ code: z.union([z.literal(0), z.literal(1), z.literal(2)]) }),
});
const documentSchema = z.object({
	resourceSpans: z.array(z.object({ scopeSpans: z.array(z.object({ spans: z.array(spanSchema) })) })),
});
type OperationSpan = z.infer<typeof spanSchema>;
export type OperationTrace = Readonly<{
	identity: OperationIdentity;
	root: OperationSpan;
	spans: readonly OperationSpan[];
}>;

/** Read files downloaded with merge-multiple enabled. Reject incomplete or ambiguous trees. */
export const readOperationTraces = async (directory: string): Promise<readonly OperationTrace[]> => {
	const files = (await readdir(directory)).filter((name) => name.endsWith(".otlp.json")).sort();
	if (files.length === 0) throw new ActionTraceError("No operation traces found in the supplied directory.");
	return Promise.all(files.map(async (file) => {
		const document = documentSchema.parse(JSON.parse(await readFile(join(directory, file), "utf8")));
		const spans = document.resourceSpans.flatMap((resource) => resource.scopeSpans.flatMap((scope) => scope.spans));
		const roots = spans.filter((span) => span.parentSpanId === undefined);
		const root = roots[0];
		if (roots.length !== 1 || root === undefined || new Set(spans.map((span) => span.spanId)).size !== spans.length)
			throw new ActionTraceError("Operation traces require one root and unique span IDs.");
		const attributes = root.attributes;
		if (attributes["hollywood.trace.version"] !== 1 || attributes["hollywood.kind"] !== "action")
			throw new ActionTraceError("Unsupported Hollywood operation trace.");
		const identity = identitySchema.parse({
			repository: attributes["github.repository"],
			runId: decimalId.parse(attributes["cicd.pipeline.run.id"]),
			attempt: attributes["github.run.attempt"],
			jobId: decimalId.parse(attributes["cicd.pipeline.task.run.id"]),
			stepName: attributes["github.step.name"],
		});
		for (const span of spans) {
			if (span.traceId !== root.traceId || span.endTimeUnixNano < span.startTimeUnixNano ||
				span.startTimeUnixNano < root.startTimeUnixNano || span.endTimeUnixNano > root.endTimeUnixNano ||
				!["action", "command", "file", "group"].includes(String(span.attributes["hollywood.kind"])) ||
				!["success", "failure", "unfinished"].includes(String(span.attributes["hollywood.result"])) ||
				span.attributes["hollywood.timing.available"] !== true ||
				(span.attributes["hollywood.result"] === "unfinished") !== (span.attributes["hollywood.timing.partial"] === true))
				throw new ActionTraceError("Invalid operation interval, trace ID, or attributes.");
		}
		const children = new Map<string, OperationSpan[]>();
		for (const span of spans) {
			if (span.parentSpanId === undefined) continue;
			const siblings = children.get(span.parentSpanId) ?? [];
			siblings.push(span);
			children.set(span.parentSpanId, siblings);
		}
		const ordered: OperationSpan[] = [root];
		for (const parent of ordered) ordered.push(...(children.get(parent.spanId) ?? []));
		if (ordered.length !== spans.length)
			throw new ActionTraceError("Operation trace has missing parents or a disconnected cycle.");
		return { identity, root, spans: ordered };
	}));
};

/** Attach recorded operations beneath a GitHub step without losing nanosecond precision. */
export const replayOperations = (tracer: Tracer, step: Span, operations: OperationTrace, url: string): void => {
	const parents = new Map<string, Span>();
	for (const source of operations.spans) {
		const parent = source.parentSpanId === undefined ? step : parents.get(source.parentSpanId);
		if (parent === undefined) throw new ActionTraceError("Operation parent was not recorded.");
		const span = tracer.startSpan(source.name, {
			startTime: hrTime(source.startTimeUnixNano),
			attributes: { ...source.attributes, "url.full": url },
			links: [{ context: { traceId: source.traceId, spanId: source.spanId, traceFlags: 1 } }],
		}, trace.setSpan(ROOT_CONTEXT, parent));
		span.setStatus(source.status);
		span.end(hrTime(source.endTimeUnixNano));
		parents.set(source.spanId, span);
	}
};

const hrTime = (nanoseconds: bigint): [number, number] =>
	[Number(nanoseconds / 1_000_000_000n), Number(nanoseconds % 1_000_000_000n)];
