import { action, job, summaryCode, summaryText, uses, workflow } from "../src/index";
import {
	actionlintAction,
	checkHollywoodStateCommand,
	checkoutAction,
	setupNodeAction,
} from "./actions";
import { trustedCiRun } from "./guards";

const setupNode = {
	uses: setupNodeAction,
	with: {
		"node-version": "24",
	},
} as const;

export const checkRuntime = action({
	name: "Check Hollywood runtime",
	description: "Exercise Hollywood's command logs and step summaries.",
	localActionPath: "check-runtime",
	inputs: {},
	outputs: {},
	run: async ({ exec, summary }) => {
		const result = await exec("node", ["--version"]);
		await summary.table("Hollywood runtime", [
			{ label: "Node", value: summaryCode(result.stdout.trim()) },
			{ label: "Result", value: summaryText("PASS") },
		]);
		return {};
	},
});

export const ci = workflow({
	name: "CI",
	on: {
		push: { branches: ["main"] },
		pull_request: { branches: ["main"] },
	},
	permissions: { contents: "read" },
	jobs: {
		test: job({
			name: "Test",
			if: trustedCiRun,
			"runs-on": "ubuntu-latest",
			steps: [
				{ uses: checkoutAction, with: { "persist-credentials": false } },
				setupNode,
				{ name: "Install dependencies", run: "npm ci" },
				{ name: "Lint", run: "npm run lint" },
				{ name: "Typecheck", run: "npm run typecheck" },
				{ name: "Test", run: "npm test" },
				{ name: "Build", run: "npm run build" },
				{ name: "Check package contents", run: "npm run package" },
				{ name: "Check Hollywood state", run: checkHollywoodStateCommand },
				{ ...setupNode, with: { "node-version": "20" } },
				{ name: "Check Node 20 CLI runtime", run: "node dist/cli.js check --workflow-security" },
			],
		}),
		actionlint: job({
			name: "Actionlint",
			if: trustedCiRun,
			"runs-on": "ubuntu-latest",
			steps: [
				{ uses: checkoutAction, with: { "persist-credentials": false } },
				setupNode,
				{ name: "Install dependencies", run: "npm ci" },
				{ name: "Build Hollywood", run: "npm run build" },
				{ name: "Build local actions", run: "npm run actions" },
				uses(checkRuntime, { name: "Check Hollywood runtime" }),
				{ uses: actionlintAction },
			],
		}),
	},
});
