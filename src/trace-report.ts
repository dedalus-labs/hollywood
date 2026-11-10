import { SpanStatusCode } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace";

import { WorkflowTraceError, type WorkflowTrace } from "./workflow-trace";
import { traceReportStyle, traceReportScript } from "./trace-report-page";

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
const kind = (span: ReadableSpan): string => attribute(span, "hollywood.kind");
const url = (value: string): string => {
	if (new URL(value).protocol !== "https:")
		throw new WorkflowTraceError("Trace links must use HTTPS.");
	return escapeTraceHtml(value);
};
const failed = (span: ReadableSpan): boolean => span.status.code === SpanStatusCode.ERROR;
const tone = (span: ReadableSpan): string =>
	failed(span)
		? "failure"
		: result(span) === "cancelled"
			? "cancelled"
			: !available(span) || result(span) === "skipped"
				? "muted"
				: kind(span);

export const renderTraceHtml = (report: WorkflowTrace): string => {
	const root = traceTree(report);
	const total = spanMilliseconds(root.span.duration);
	const steps = report.spans.filter((span) => kind(span) === "step");
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeTraceHtml(report.name)} / Hollywood trace</title><style>${traceReportStyle}</style></head><body>
<main><section class="heading"><div><h1>${escapeTraceHtml(report.name)}</h1><p class="subtitle">${root.children.length} jobs <span>/</span> ${steps.length} steps <span>/</span> <b>${duration(root.span)}</b> elapsed job window</p></div><a class="source-link" href="${url(report.url)}" target="_blank" rel="noreferrer">View workflow ↗</a></section>
<section class="explorer"><div class="toolbar"><label class="search"><span>⌕</span><input type="search" placeholder="Find a job or step…" aria-label="Find a job or step"></label><div class="toolbar-actions"><button id="errors" aria-pressed="false">Failures</button><button id="expand">Expand all</button><button id="collapse">Collapse all</button><label class="zoom">Zoom <input id="zoom" type="range" min="1" max="4" step="0.5" value="1"></label></div></div>
<div class="workspace"><div class="trace-scroll"><div class="trace-body"><div class="ruler row"><div class="span-heading">Span <span id="visible-count">${report.spans.length}</span></div><div class="ticks">${[0, 1, 2, 3, 4].map((tick) => `<span>${formatTraceDuration((total * tick) / 4)}</span>`).join("")}</div><div class="duration-heading">Duration</div></div>${renderNode(root, root.span, 0)}<p id="empty" hidden>No spans match your search.</p></div></div><aside id="inspector" aria-label="Span details"><p class="inspector-kicker">Span details</p><h2>Inspect a span</h2><p>Select a bar to inspect its duration, start time, and trace attributes.</p></aside></div></section>
</main><script>${traceReportScript}</script></body></html>`;
};

const renderNode = (node: TraceNode, root: ReadableSpan, depth: number): string => {
	const { span, children } = node;
	const id = span.spanContext().spanId;
	const tag = children.length > 0 ? "details" : "div";
	const rowTag = children.length > 0 ? "summary" : "div";
	const open = depth === 0 ? " open" : "";
	return `<${tag} class="node" data-id="${id}" data-name="${escapeTraceHtml(span.name.toLowerCase())}" data-failed="${failed(span)}"${open}>
<${rowTag} class="row ${tone(span)}"><div class="span-label" style="--depth:${depth}"><span class="chevron">${children.length > 0 ? "›" : ""}</span><span class="status-dot" title="${escapeTraceHtml(result(span))}"></span><span class="span-name" title="${escapeTraceHtml(span.name)}">${escapeTraceHtml(displayName(span))}</span>${kind(span) === "job" ? `<span class="step-count">${children.length}</span>` : ""}</div><button class="plot inspect" aria-label="Inspect ${escapeTraceHtml(span.name)}">${bar(span, root, 36)}</button><div class="duration">${duration(span)}</div></${rowTag}>
<template>${spanDetails(span, root)}</template>${children.map((child) => renderNode(child, root, depth + 1)).join("")}</${tag}>`;
};

const bar = (span: ReadableSpan, root: ReadableSpan, height: number): string => {
	if (!available(span)) return `<span class="unmeasured">No timing recorded</span>`;
	const total = Math.max(spanMilliseconds(root.duration), 1);
	const x = ((spanMilliseconds(span.startTime) - spanMilliseconds(root.startTime)) / total) * 1_000;
	const width = (spanMilliseconds(span.duration) / total) * 1_000;
	if (x < -0.01 || x + width > 1_000.01)
		throw new WorkflowTraceError(`Span ${span.name} extends beyond the report window.`);
	return `<svg class="bar ${tone(span)}" viewBox="0 0 1000 ${height}" preserveAspectRatio="none" aria-hidden="true"><title>${escapeTraceHtml(span.name)} (${duration(span)})</title><rect x="${x.toFixed(3)}" y="${height / 4}" width="${Math.max(width, 1).toFixed(3)}" height="${height / 2}" rx="2"/></svg>`;
};

const spanDetails = (span: ReadableSpan, root: ReadableSpan): string =>
	`<p class="inspector-kicker">${escapeTraceHtml(kind(span))}</p><h2>${escapeTraceHtml(span.name)}</h2><span class="result ${tone(span)}">${escapeTraceHtml(result(span))}</span><dl><dt>Duration</dt><dd>${duration(span)}</dd><dt>Started after</dt><dd>${available(span) ? formatTraceDuration(spanMilliseconds(span.startTime) - spanMilliseconds(root.startTime)) : "Unmeasured"}</dd><dt>Span ID</dt><dd class="mono">${span.spanContext().spanId}</dd></dl><a class="source-link" href="${url(attribute(span, "url.full"))}" target="_blank" rel="noreferrer">Open logs ↗</a><h3>Attributes</h3><dl class="attributes">${Object.entries(
		span.attributes,
	)
		.map(
			([key, value]) =>
				`<dt>${escapeTraceHtml(key)}</dt><dd>${escapeTraceHtml(String(value))}</dd>`,
		)
		.join("")}</dl>`;

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
