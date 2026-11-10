import { action, always, and, booleanInput, gh, job, operationTraceDirectory, uses, workflow } from "../src/index";
import { reportWorkflowTrace } from "../src/tracing";
import {
	checkoutAction,
	setupNodeAction,
	installDependenciesCommand,
	buildHollywoodCommand,
	buildLocalActionsCommand,
	uploadArtifactAction,
	downloadArtifactAction,
} from "./actions";
import { trustedCiRun } from "./guards";

const nested = action({
	name: "Nested action",
	description: "Exercise a nested command.",
	inputs: {},
	outputs: {},
	run: async ({ exec }) => {
		await exec("node", ["-e", "process.stdout.write('trace example\\n')"]);
		return {};
	},
});

export const traceExample = action({
	name: "Trace example",
	description: "Exercise grouped and parallel commands.",
	localActionPath: "trace-example",
	inputs: { fail: booleanInput({ description: "Exercise a failed command.", default: "false" }) },
	outputs: {},
	run: async ({ call, exec, input, log }) => {
		if (input.fail) {
			await log.group("Expected failure", () => exec("node", ["-e", "process.exit(7)"]));
			return {};
		}
		await log.group("Parallel commands", async () => {
			await Promise.all([exec("node", ["--version"]), call(nested, {})]);
		});
		return {};
	},
});

const setup = [
	{ uses: checkoutAction, with: { "persist-credentials": false } },
	{ uses: setupNodeAction, with: { "node-version": "24" } },
	{ name: "Install dependencies", run: installDependenciesCommand },
	{ name: "Build Hollywood", run: buildHollywoodCommand },
	{ name: "Build local actions", run: buildLocalActionsCommand },
] as const;

export const tracing = workflow({
	name: "Trace example",
	on: {
		pull_request: { paths: ["src/**", "gha/tracing.ts", "package*.json"] },
		workflow_dispatch: {},
	},
	permissions: { contents: "read", actions: "read" },
	jobs: {
		workload: job({
			name: "Example workload",
			if: trustedCiRun,
			"runs-on": "ubuntu-latest",
			steps: [
				...setup,
				uses(traceExample, { name: "Successful operations", trace: true }),
				uses(traceExample, { name: "Expected command failure", trace: true, with: { fail: "true" }, "continue-on-error": true }),
				{
					name: "Save operation recordings",
					if: always(),
					uses: uploadArtifactAction,
					with: {
						name: "hollywood-operations-${{ github.run_attempt }}-${{ job.check_run_id }}",
						path: operationTraceDirectory,
						"if-no-files-found": "error",
					},
				},
			],
		}),
		report: job({
			name: "Workflow trace",
			if: and(always(), trustedCiRun),
			needs: "workload",
			"runs-on": "ubuntu-latest",
			steps: [
				...setup,
				{
					name: "Download operation recordings",
					uses: downloadArtifactAction,
					with: {
						pattern: "hollywood-operations-${{ github.run_attempt }}-*",
						path: ".hollywood/operations",
						"merge-multiple": true,
					},
				},
				uses(reportWorkflowTrace, {
					env: { GITHUB_TOKEN: gh.github.token },
					with: {
						repository: gh.github.repository,
						runId: "${{ github.run_id }}",
						attempt: "${{ github.run_attempt }}",
						excludeJobId: "${{ job.check_run_id }}",
						operations: ".hollywood/operations",
					},
				}),
				{
					name: "Save trace explorer",
					uses: uploadArtifactAction,
					with: {
						name: "hollywood-trace",
						path: ".hollywood/trace",
						"include-hidden-files": true,
						"if-no-files-found": "error",
					},
				},
			],
		}),
	},
});
