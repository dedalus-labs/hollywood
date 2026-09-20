import { ContextAccess, type Expr, type ExprVisitor, IndexAccess, Literal, Star } from "@actions/expressions/ast";
import { StringData } from "@actions/expressions/data/string";
import type { GitHubWorkflowJob, GitHubWorkflowJobs } from "../generate";
import { parseGitHubExpressionAST, isGitHubExpression, expressionBody } from "../expressions";
import type { LintIssue } from "../validation";


 // Recursively extracts all expression bodies and raw string values from an object/array.
 
function extractExpressionsAndStrings(value: unknown): string[] {
	const results: string[] = [];
	if (typeof value === "string") {
		results.push(value);
		if (isGitHubExpression(value)) {
			try {
				results.push(expressionBody(value));
			} catch {
				// Ignore malformed wrapper
			}
		}
	} else if (Array.isArray(value)) {
		for (const item of value) {
			results.push(...extractExpressionsAndStrings(item));
		}
	} else if (value !== null && typeof value === "object") {
		for (const val of Object.values(value)) {
			results.push(...extractExpressionsAndStrings(val));
		}
	}
	return results;
}

function astReferencesJob(node: Expr, upstreamJobName: string): boolean {
	const references = (expr: Expr): boolean => !(expr instanceof Star) && expr.accept(visitor);
	const visitor: ExprVisitor<boolean> = {
		visitLiteral: () => false,
		visitContextAccess: () => false,
		visitUnary: ({ expr }) => references(expr),
		visitBinary: ({ left, right }) => references(left) || references(right),
		visitLogical: ({ args }) => args.some(references),
		visitGrouping: ({ group }) => references(group),
		visitFunctionCall: ({ args }) => args.some(references),
		visitIndexAccess: ({ expr, index }) => {
			if (
				index instanceof Literal &&
				index.literal instanceof StringData &&
				["outputs", "result"].includes(index.literal.value.toLowerCase()) &&
				expr instanceof IndexAccess &&
				expr.expr instanceof ContextAccess &&
				expr.expr.name.lexeme.toLowerCase() === "needs" &&
				expr.index instanceof Literal &&
				expr.index.literal instanceof StringData &&
				expr.index.literal.value.toLowerCase() === upstreamJobName.toLowerCase()
			) {
				return true;
			}
			return references(expr) || references(index);
		},
	};
	return references(node);
}

function hasExpressionReference(job: GitHubWorkflowJob, upstreamJobName: string): boolean {
	const allStrings = extractExpressionsAndStrings(job);

	for (const str of allStrings) {
		// Try parsing as AST expression body
		try {
			const body = isGitHubExpression(str) ? expressionBody(str) : str;
			const ast = parseGitHubExpressionAST(body);
			if (astReferencesJob(ast, upstreamJobName)) {
				return true;
			}
		} catch {
			// If not a standalone valid expression, fallback to direct string inspection
			if (
				str.includes(`needs.${upstreamJobName}.outputs`) ||
				str.includes(`needs.${upstreamJobName}.result`) ||
				str.includes(`needs['${upstreamJobName}'].outputs`) ||
				str.includes(`needs["${upstreamJobName}"].outputs`)
			) {
				return true;
			}
		}
	}

	return false;
}

function hasArtifactHandoff(
	job: GitHubWorkflowJob,
	upstreamJob: GitHubWorkflowJob | undefined
): boolean {
	if (
		!upstreamJob ||
		!("steps" in upstreamJob) ||
		!upstreamJob.steps ||
		!("steps" in job) ||
		!job.steps
	) {
		return false;
	}

	// Standard upload-artifact & upload-pages-artifact
	const uploadedArtifacts = upstreamJob.steps
		.filter((s) => s.uses && (s.uses.includes("upload-artifact") || s.uses.includes("upload-pages-artifact")))
		.map((s) => {
			if (s.uses?.includes("upload-pages-artifact")) {
				return (s.with?.["name"] as string) ?? "github-pages";
			}
			return s.with?.["name"];
		})
		.filter((name): name is string => typeof name === "string");

	// Standard download-artifact & deploy-pages
	const downloadedArtifacts = job.steps
		.filter((s) => s.uses && (s.uses.includes("download-artifact") || s.uses.includes("deploy-pages")))
		.map((s) => {
			if (s.uses?.includes("deploy-pages")) {
				return (s.with?.["artifact_name"] as string) ?? (s.with?.["name"] as string) ?? "github-pages";
			}
			return s.with?.["name"];
		})
		.filter((name): name is string => typeof name === "string");

	return downloadedArtifacts.some((dl) => uploadedArtifacts.includes(dl));
}

// Warns when a job declares a dependency but does not demonstrably use its outputs or artifacts.
export function checkUnnecessaryNeeds(
	jobId: string,
	job: GitHubWorkflowJob,
	allJobs: GitHubWorkflowJobs
): LintIssue[] {
	const warnings: LintIssue[] = [];

	if (job.needs === undefined) {
		return warnings;
	}

	const needsArray = Array.isArray(job.needs) ? job.needs : [job.needs];

	for (const need of needsArray) {
		const upstreamJob = allJobs[need];

		const isProvableDependency =
			hasExpressionReference(job, need) ||
			hasArtifactHandoff(job, upstreamJob);

		if (!isProvableDependency) {
			warnings.push({
				ruleId: "no-unnecessary-needs",
				jobId,
				message: `job '${jobId}' declares needs '${need}' but does not reference any outputs from it. Remove the dependency or document why sequencing is required.`,
			});
		}
	}

	return warnings;
}
