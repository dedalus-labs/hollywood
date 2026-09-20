import { job, uses, workflow } from "../src/index";
import {
	buildHollywoodCommand,
	buildLocalActionsCommand,
	checkoutAction,
	installDependenciesCommand,
	setupNodeAction,
	uploadArtifactAction,
} from "./actions";
import { captureRunnerProbe, verifyRunnerProbe } from "./runner-image-actions";

const probePath = "runner-probe.json";

export const runnerJit = workflow({
	name: "Connected runner proof",
	on: { workflow_dispatch: {} },
	permissions: { contents: "read" },
	jobs: {
		proof: job({
			name: "Prove connected runner",
			"runs-on": ["self-hosted", "hollywood-local"],
			"timeout-minutes": 30,
			steps: [
				{ uses: checkoutAction, with: { "persist-credentials": false } },
				{ uses: setupNodeAction, with: { "node-version": "24" } },
				{ name: "Install dependencies", run: installDependenciesCommand },
				{ name: "Build Hollywood", run: buildHollywoodCommand },
				{ name: "Build local actions", run: buildLocalActionsCommand },
				uses(captureRunnerProbe, {
					name: "Capture runner",
					with: { output: probePath },
				}),
				uses(verifyRunnerProbe, {
					name: "Verify runner",
					with: { contract: "runner/contract.json", probe: probePath },
				}),
				{
					name: "Upload runner probe",
					uses: uploadArtifactAction,
					with: {
						name: "connected-runner-probe",
						path: probePath,
						"if-no-files-found": "error",
						"retention-days": 30,
					},
				},
			],
		}),
	},
});
