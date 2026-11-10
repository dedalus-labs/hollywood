import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer";

import { parseGitHubApiToken, parseGitHubRepository } from "./github-runner-api";
import { action, integerInput, pathInput, stringInput } from "./script";
import { collectWorkflowTrace, WorkflowTraceError, type WorkflowTrace } from "./workflow-trace";
import { renderTraceHtml, renderTraceSummary, renderTraceText } from "./trace-report";

export { collectWorkflowTrace, WorkflowTraceError } from "./workflow-trace";
export type { WorkflowTrace, WorkflowTraceOptions } from "./workflow-trace";
export { renderTraceHtml, renderTraceSummary, renderTraceText } from "./trace-report";
export type { ActionTraceOptions } from "./action-trace";
export { ActionTraceError } from "./action-trace";

/** Write an offline explorer, GitHub summary, text cascade, and standard OTLP JSON. */
export const writeWorkflowTrace = async (
	report: WorkflowTrace,
	directory: string,
): Promise<void> => {
	const json = JsonTraceSerializer.serializeRequest([...report.spans]);
	if (json === undefined)
		throw new WorkflowTraceError("OpenTelemetry could not serialize the trace.");
	const summary = renderTraceSummary(report);
	if (Buffer.byteLength(summary) > 1_048_576)
		throw new WorkflowTraceError("Trace summary exceeds GitHub's 1 MiB limit.");
	await mkdir(directory, { recursive: true });
	await Promise.all([
		writeFile(join(directory, "trace.html"), renderTraceHtml(report)),
		writeFile(join(directory, "summary.md"), summary),
		writeFile(join(directory, "trace.txt"), renderTraceText(report)),
		writeFile(join(directory, "trace.json"), json),
	]);
};

export const reportWorkflowTrace = action({
	name: "Report workflow trace",
	description: "Collect workflow spans and render an offline trace explorer.",
	localActionPath: "hollywood-trace",
	inputs: {
		repository: stringInput({ description: "GitHub OWNER/REPOSITORY." }),
		runId: integerInput({ description: "Workflow run ID." }),
		attempt: integerInput({ description: "Workflow attempt number." }),
		excludeJobId: integerInput({
			description: "Reporter job ID to exclude. Zero includes every job.",
			default: "0",
		}),
		output: pathInput({
			description: "Directory for trace artifacts.",
			default: ".hollywood/trace",
		}),
	},
	outputs: {},
	run: async ({ input, log }) => {
		const token = process.env["GITHUB_TOKEN"];
		const summary = process.env["GITHUB_STEP_SUMMARY"];
		if (token === undefined || summary === undefined)
			throw new WorkflowTraceError("GITHUB_TOKEN and GITHUB_STEP_SUMMARY are required.");
		const report = await collectWorkflowTrace({
			repository: parseGitHubRepository(input.repository),
			token: parseGitHubApiToken(token),
			runId: input.runId,
			attempt: input.attempt,
			...(input.excludeJobId === 0 ? {} : { excludeJobId: input.excludeJobId }),
		});
		await writeWorkflowTrace(report, input.output);
		await appendFile(summary, renderTraceSummary(report));
		log.info(renderTraceText(report));
		return {};
	},
});
