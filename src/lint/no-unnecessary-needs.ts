import {
	ContextAccess,
	type Expr,
	type ExprVisitor,
	Literal,
	Star,
} from "@actions/expressions/ast";
import { StringData } from "@actions/expressions/data/string";

import { parseGitHubExpression } from "../expressions";
import type { GitHubWorkflowJob, GitHubWorkflowJobs } from "../generate";
import type { LintIssue } from "../validation";

const jobSteps = (job: GitHubWorkflowJob | undefined) =>
	(job?.steps ?? []).flatMap((step) => step.parallel !== undefined ? step.parallel : [step]);

function* expressionBodies(value: unknown): Generator<string> {
	if (typeof value === "string") {
		let start = value.indexOf("${{");
		while (start !== -1) {
			let quoted = false;
			let end = start + 3;
			for (; end < value.length; end++) {
				if (value[end] === "'") quoted = !quoted;
				if (!quoted && value.startsWith("}}", end)) break;
			}
			if (end === value.length) throw new Error("unterminated GitHub expression");
			yield value.slice(start + 3, end);
			start = value.indexOf("${{", end + 2);
		}
	} else if (Array.isArray(value)) {
		for (const item of value) yield* expressionBodies(item);
	} else if (value !== null && typeof value === "object") {
		for (const item of Object.values(value)) yield* expressionBodies(item);
	}
}

function astReferencesJob(node: Expr, upstreamJobName: string): boolean {
	const references = (expr: Expr): boolean => !(expr instanceof Star) && expr.accept(visitor);
	const visitor: ExprVisitor<boolean> = {
		visitLiteral: () => false,
		visitContextAccess: ({ name }) => name.lexeme.toLowerCase() === "needs",
		visitUnary: ({ expr }) => references(expr),
		visitBinary: ({ left, right }) => references(left) || references(right),
		visitLogical: ({ args }) => args.some(references),
		visitGrouping: ({ group }) => references(group),
		visitFunctionCall: ({ args }) => args.some(references),
		visitIndexAccess: ({ expr, index }) => {
			if (expr instanceof ContextAccess && expr.name.lexeme.toLowerCase() === "needs") {
				// Dynamic indexes and wildcards may read any declared dependency.
				return (
					!(index instanceof Literal && index.literal instanceof StringData) ||
					index.literal.value.toLowerCase() === upstreamJobName.toLowerCase()
				);
			}
			return references(expr) || references(index);
		},
	};
	return references(node);
}

function hasArtifactHandoff(
	job: GitHubWorkflowJob,
	upstream: GitHubWorkflowJob | undefined,
): boolean {
	return jobSteps(upstream).some((upload) => {
		const action = upload.uses?.split("@")[0];
		if (action !== "actions/upload-artifact" && action !== "actions/upload-pages-artifact")
			return false;
		const uploaded =
			upload.with?.["name"] ??
			(action === "actions/upload-pages-artifact" ? "github-pages" : "artifact");
		return jobSteps(job).some((download) => {
			const action = download.uses?.split("@")[0];
			if (action !== "actions/download-artifact" && action !== "actions/deploy-pages") return false;
			const downloaded =
				action === "actions/deploy-pages"
					? (download.with?.["artifact_name"] ?? "github-pages")
					: download.with?.["name"];
			// Downloads without a name include all artifacts or an unresolved pattern.
			return (
				downloaded === undefined ||
				typeof uploaded !== "string" ||
				typeof downloaded !== "string" ||
				(action === "actions/download-artifact" && downloaded.trim() === "") ||
				uploaded.trim() === downloaded.trim() ||
				uploaded.includes("${{") ||
				downloaded.includes("${{")
			);
		});
	});
}

export function checkUnnecessaryNeeds(
	jobId: string,
	job: GitHubWorkflowJob,
	allJobs: GitHubWorkflowJobs,
): LintIssue[] {
	if (job.needs === undefined) return [];
	const conditions = [job.if, ...jobSteps(job).map((step) => step.if)];
	const bodies = [
		...expressionBodies(job),
		...conditions.filter(
			(condition): condition is string =>
				typeof condition === "string" && !condition.includes("${{"),
		),
	];
	const expressions = bodies.map((body) => {
		if (body.trim() === "") throw new Error(`job '${jobId}': empty GitHub expression`);
		return parseGitHubExpression(body);
	});
	const needs = typeof job.needs === "string" ? [job.needs] : job.needs;
	return needs
		.filter(
			(need) =>
				!expressions.some((ast) => astReferencesJob(ast, need)) &&
				!hasArtifactHandoff(job, allJobs[need]),
		)
		.map((need) => ({
			ruleId: "no-unnecessary-needs",
			jobId,
			message: `job '${jobId}' has no detected output or artifact use from '${need}'. Keep needs when ordering is intentional.`,
		}));
}
