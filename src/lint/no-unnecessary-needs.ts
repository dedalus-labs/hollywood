import type { GitHubWorkflowJob, GitHubWorkflowJobs } from "../generate";
import type { LintIssue } from "../validation";

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

	// Normalize needs to an array
	const needsArray = Array.isArray(job.needs) ? job.needs : [job.needs];

	for (const need of needsArray) {
		const upstreamJob = allJobs[need];
		let isProvableDependency = false;

		const jobString = JSON.stringify(job);

		// Match standard dot notation: needs.job_name.outputs
		const outputRegex = new RegExp(`needs\\s*\\.\\s*${need}\\s*\\.\\s*(outputs|result)`, "g");
		
		// Match bracket notation: needs['job_name'].outputs
		const bracketRegex = new RegExp(`needs\\s*\\[\\s*['"]${need}['"]\\s*\\]\\s*\\.\\s*(outputs|result)`, "g");

		if (outputRegex.test(jobString) || bracketRegex.test(jobString)) {
			isProvableDependency = true;
		}

        // Check for artifact passing (upload-artifact -> download-artifact)
		if (
			!isProvableDependency && 
			upstreamJob && 
			"steps" in upstreamJob && 
			upstreamJob.steps && 
			"steps" in job && 
			job.steps
		) {
			const uploadedArtifacts = upstreamJob.steps
				.filter((s) => s.uses && s.uses.includes("upload-artifact"))
				.map((s) => s.with?.['name'])
				.filter((name): name is string => typeof name === "string");

			const downloadedArtifacts = job.steps
				.filter((s) => s.uses && s.uses.includes("download-artifact"))
				.map((s) => s.with?.['name'])
				.filter((name): name is string => typeof name === "string");

			if (downloadedArtifacts.some((dl) => uploadedArtifacts.includes(dl))) {
				isProvableDependency = true;
			}
		}

		if (!isProvableDependency) {
			warnings.push({
				ruleId: "no-unnecessary-needs",
				jobId,
				message: `warn[no-unnecessary-needs]: job '${jobId}' declares needs '${need}' but does not reference any outputs from it. Remove the dependency or document why sequencing is required.`,
			});
		}
	}

	return warnings;
}