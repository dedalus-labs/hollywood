import { action, always, and, gh, job, uses, workflow } from "../src/index";
import { reportWorkflowTrace } from "../src/tracing";
import {
	checkoutAction,
	setupNodeAction,
	installDependenciesCommand,
	buildHollywoodCommand,
	buildLocalActionsCommand,
	uploadArtifactAction,
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
	inputs: {},
	outputs: {},
	run: async ({ call, exec, log }) => {
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
			steps: [...setup, uses(traceExample, {})],
		}),
		report: job({
			name: "Workflow trace",
			if: and(always(), trustedCiRun),
			needs: "workload",
			"runs-on": "ubuntu-latest",
			steps: [
				...setup,
				uses(reportWorkflowTrace, {
					env: { GITHUB_TOKEN: gh.github.token },
					with: {
						repository: gh.github.repository,
						runId: "${{ github.run_id }}",
						attempt: "${{ github.run_attempt }}",
						excludeJobId: "${{ job.check_run_id }}",
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
