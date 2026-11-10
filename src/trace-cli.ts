import { appendFile } from "node:fs/promises";
import { Command } from "@commander-js/extra-typings";

import { parseGitHubApiToken, parseGitHubRepository } from "./github-runner-api";

export const createTraceCommand = (io: Readonly<{ writeOut: (value: string) => void }>) =>
	new Command("trace")
		.description("Collect a GitHub workflow attempt and render its span cascade.")
		.argument("<repository>", "GitHub OWNER/REPOSITORY.")
		.argument("<run-id>", "Workflow run ID.")
		.requiredOption("--attempt <number>", "Workflow attempt number.")
		.option("--exclude-job <id>", "Exclude the still-running reporter job.")
		.option("--output <directory>", "Trace artifact directory.", ".hollywood/trace")
		.option("--summary <path>", "Append a GitHub summary to this file.")
		.option("--operations <directory>", "Attach downloaded native action spans.")
		.action(async (repository, runId, options) => {
			const {
				collectWorkflowTrace,
				renderTraceSummary,
				renderTraceText,
				writeWorkflowTrace,
				WorkflowTraceError,
			} = await import("./tracing");
			const token = process.env["GITHUB_TOKEN"];
			if (token === undefined) throw new WorkflowTraceError("GITHUB_TOKEN is required.");
			const report = await collectWorkflowTrace({
				repository: parseGitHubRepository(repository),
				token: parseGitHubApiToken(token),
				runId: Number(runId),
				attempt: Number(options.attempt),
				...(options.excludeJob === undefined ? {} : { excludeJobId: Number(options.excludeJob) }),
				...(options.operations === undefined ? {} : { operations: options.operations }),
			});
			await writeWorkflowTrace(report, options.output);
			if (options.summary !== undefined)
				await appendFile(options.summary, renderTraceSummary(report));
			io.writeOut(renderTraceText(report));
		});
