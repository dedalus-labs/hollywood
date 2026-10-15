import { SpanStatusCode } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace";

import { WorkflowTraceError, type WorkflowTrace } from "./workflow-trace";

export const escapeTraceHtml = (value: string): string =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
export const spanMilliseconds = (time: readonly [number, number]): number =>
	time[0] * 1_000 + time[1] / 1_000_000;
export const formatTraceDuration = (ms: number): string =>
	ms < 1_000
		? `${Math.round(ms)} ms`
		: ms < 60_000
			? `${(ms / 1_000).toFixed(2)} s`
			: `${Math.floor(ms / 60_000)}m ${((ms % 60_000) / 1_000).toFixed(1)}s`;

export type TraceNode = Readonly<{
	span: ReadableSpan;
	children: TraceNode[];
}>;

export const traceTree = (report: WorkflowTrace): TraceNode => {
	const nodes = new Map<string, TraceNode>(
		report.spans.map((span) => [span.spanContext().spanId, { span, children: [] }]),
	);
	if (nodes.size !== report.spans.length)
		throw new WorkflowTraceError("Duplicate span IDs in trace.");
	const roots: TraceNode[] = [];
	for (const node of nodes.values()) {
		const parentId = node.span.parentSpanContext?.spanId;
		if (parentId === undefined) {
			roots.push(node);
			continue;
		}
		const parent = nodes.get(parentId);
		if (parent === undefined)
			throw new WorkflowTraceError(`Missing parent for span ${node.span.name}.`);
		parent.children.push(node);
	}
	if (roots.length !== 1 || roots[0] === undefined)
		throw new WorkflowTraceError("A workflow trace must have one root.");
	let count = 0;
	const visit = (node: TraceNode): void => {
		count++;
		node.children.sort((a, b) => {
			const left = a.span.attributes["github.step.number"];
			const right = b.span.attributes["github.step.number"];
			if (typeof left === "number" && typeof right === "number") return left - right;
			return (
				Number(available(b.span)) - Number(available(a.span)) ||
				spanMilliseconds(a.span.startTime) - spanMilliseconds(b.span.startTime)
			);
		});
		node.children.forEach(visit);
	};
	visit(roots[0]);
	if (count !== nodes.size) throw new WorkflowTraceError("Disconnected cycle in trace.");
	return roots[0];
};

const attribute = (span: ReadableSpan, key: string): string => {
	const value = span.attributes[key];
	if (typeof value !== "string") throw new WorkflowTraceError(`Missing trace attribute ${key}.`);
	return value;
};
const available = (span: ReadableSpan): boolean =>
	span.attributes["hollywood.timing.available"] === true;
const displayName = (span: ReadableSpan): string =>
	span.name.replace(/^(Post )?Run ([\w.-]+\/[\w./-]+)@[a-f0-9]{40}$/, "$1$2");

const duration = (span: ReadableSpan): string =>
	available(span) ? formatTraceDuration(spanMilliseconds(span.duration)) : "Unmeasured";
const result = (span: ReadableSpan): string => attribute(span, "hollywood.result");
const url = (value: string): string => {
	if (new URL(value).protocol !== "https:")
		throw new WorkflowTraceError("Trace links must use HTTPS.");
	return escapeTraceHtml(value);
};
const failed = (span: ReadableSpan): boolean => span.status.code === SpanStatusCode.ERROR;
export const renderTraceSummary = (report: WorkflowTrace): string => {
	const root = traceTree(report);
	const total = Math.max(spanMilliseconds(root.span.duration), 1);
	const cascade = (span: ReadableSpan): string => {
		if (!available(span)) return "unmeasured";
		const offset = Math.floor(
			((spanMilliseconds(span.startTime) - spanMilliseconds(root.span.startTime)) / total) * 32,
		);
		const length = Math.max(1, Math.round((spanMilliseconds(span.duration) / total) * 32));
		return `${"·".repeat(offset)}${"━".repeat(length)}`;
	};
	const row = (node: TraceNode): string =>
		`<tr><td>${failed(node.span) ? "🔴" : result(node.span) === "skipped" ? "⚪" : "🔵"} <a href="${url(attribute(node.span, "url.full"))}">${escapeTraceHtml(node.span.name)}</a></td><td align="right">${duration(node.span)}</td><td><code>${cascade(node.span)}</code></td></tr>`;
	return `<h2>Hollywood trace: ${escapeTraceHtml(report.name)}</h2>\n<p>${root.children.length} jobs. ${duration(root.span)} elapsed job window. Attempt ${report.attempt}.</p>\n<p>Bars share one time axis. Parallel spans overlap.</p>\n${root.children.map((job) => `<details><summary><b>${escapeTraceHtml(job.span.name)}</b> (${duration(job.span)})</summary><table><thead><tr><th>Span</th><th>Duration</th><th>Cascade</th></tr></thead><tbody>${row(job)}${job.children.map(row).join("")}</tbody></table></details>`).join("\n")}\n`;
};

export const renderTraceText = (report: WorkflowTrace): string => {
	const root = traceTree(report);
	const lines = [`Hollywood / ${report.name} / attempt ${report.attempt}`, ""];
	const visit = (node: TraceNode, prefix: string, branch: string): void => {
		const name = [...displayName(node.span)]
			.map((character) =>
				character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? " " : character,
			)
			.join("");
		lines.push(
			`${(prefix + branch + name).padEnd(60)} ${duration(node.span).padStart(12)}  ${result(node.span)}`,
		);
		for (const [index, child] of node.children.entries()) {
			visit(
				child,
				prefix + (branch === "" ? "" : branch === "`- " ? "   " : "|  "),
				index === node.children.length - 1 ? "`- " : "|- ",
			);
		}
	};
	visit(root, "", "");
	return `${lines.join("\n")}\n`;
};
