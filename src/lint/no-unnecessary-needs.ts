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


 // Checks AST node structures recursively to find references to `needs.<upstreamJobName>.(outputs|result)`
 
function astReferencesJob(node: unknown, upstreamJobName: string): boolean {
	if (!node || typeof node !== "object") {
		return false;
	}

	const nodeObj = node as Record<string, unknown>;

	// Handle property access: node.target.property or node.object.property
	if (
		(nodeObj["type"] === "PropertyAccess" || nodeObj["kind"] === "PropertyAccess") &&
		(nodeObj["property"] === "outputs" || nodeObj["property"] === "result")
	) {
		const target = nodeObj["target"] ?? nodeObj["object"];
		if (
			target &&
			typeof target === "object" &&
			((target as Record<string, unknown>)["property"] === upstreamJobName ||
				(target as Record<string, unknown>)["value"] === upstreamJobName)
		) {
			return true;
		}
	}

	// Handle index access: needs['job_name'].outputs
	if (
		(nodeObj["type"] === "IndexAccess" || nodeObj["kind"] === "IndexAccess") &&
		(nodeObj["index"] === "outputs" || nodeObj["index"] === "result")
	) {
		const target = nodeObj["target"] ?? nodeObj["object"];
		if (
			target &&
			typeof target === "object" &&
			((target as Record<string, unknown>)["index"] === upstreamJobName ||
				(target as Record<string, unknown>)["value"] === upstreamJobName)
		) {
			return true;
		}
	}

	for (const child of Object.values(nodeObj)) {
		if (Array.isArray(child)) {
			for (const item of child) {
				if (astReferencesJob(item, upstreamJobName)) return true;
			}
		} else if (child && typeof child === "object") {
			if (astReferencesJob(child, upstreamJobName)) return true;
		}
	}

	return false;
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