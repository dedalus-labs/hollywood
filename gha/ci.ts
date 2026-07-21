import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { action, job, summaryCode, summaryText, uses, workflow } from "../src/index";
import {
	checkHollywoodStateCommand,
	checkoutAction,
	setupNodeAction,
} from "./actions";
import { trustedCiRun } from "./guards";

const actionlintVersion = "1.7.12";
const actionlintArchiveSha256 =
	"8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8";

export const assertSha256 = (contents: Uint8Array, expected: string): void => {
	const actual = createHash("sha256").update(contents).digest("hex");
	if (actual !== expected) {
		throw new Error(`artifact checksum mismatch: expected ${expected}, received ${actual}`);
	}
};

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

export const lintWorkflows = action({
	name: "Lint GitHub Actions workflows",
	description: "Run a checksum-verified Actionlint binary.",
	localActionPath: "lint-workflows",
	inputs: {},
	outputs: {},
	run: async ({ exec }) => {
		const runnerTemp = process.env["RUNNER_TEMP"];
		const workspace = process.env["GITHUB_WORKSPACE"];
		if (runnerTemp === undefined || workspace === undefined) {
			throw new Error("RUNNER_TEMP and GITHUB_WORKSPACE are required");
		}

		const archive = join(runnerTemp, `actionlint_${actionlintVersion}_linux_amd64.tar.gz`);
		const executable = join(runnerTemp, "actionlint");
		await exec("curl", [
			"--fail",
			"--location",
			"--silent",
			"--show-error",
			"--output",
			archive,
			`https://github.com/rhysd/actionlint/releases/download/v${actionlintVersion}/actionlint_${actionlintVersion}_linux_amd64.tar.gz`,
		]);
		assertSha256(await readFile(archive), actionlintArchiveSha256);
		await exec("tar", ["--extract", "--gzip", "--file", archive, "--directory", runnerTemp, "actionlint"]);
		await exec(executable, ["-color"], { cwd: workspace });
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
				uses(lintWorkflows, { name: "Lint GitHub Actions workflows" }),
			],
		}),
	},
});
