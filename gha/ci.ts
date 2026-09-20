import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
	action,
	command,
	gh,
	job,
	summaryCode,
	summaryText,
	uses,
	workflow,
} from "../src/index";
import {
	auditDependenciesCommand,
	buildHollywoodCommand,
	buildLocalActionsCommand,
	checkHollywoodStateCommand,
	checkPackageContentsCommand,
	checkoutAction,
	installDependenciesCommand,
	lintCommand,
	setupNodeAction,
	testCommand,
	typecheckCommand,
	verifyRegistrySignaturesCommand,
} from "./actions";
import { trustedCiRun } from "./guards";
import { validateReleaseCandidate } from "./release-actions";

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

const containerProviders = ["docker", "podman"] as const;

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

export const testContainerProvider = action({
	name: "Test container provider",
	description: "Run the real container provider contract tests.",
	localActionPath: "test-container-provider",
	inputs: {},
	outputs: {},
	run: async ({ exec }) => {
		await exec("npm", [
			"test",
			"--",
			"--no-file-parallelism",
			"src/container.test.ts",
			"src/container-action.test.ts",
		]);
		return {};
	},
});

export const ci = workflow({
	name: "CI",
	on: {
		push: { branches: ["main"] },
		pull_request: { branches: ["main"] },
		merge_group: { types: ["checks_requested"] },
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
				{ name: "Install dependencies", run: installDependenciesCommand },
				{ name: "Audit dependencies", run: auditDependenciesCommand },
				{ name: "Verify registry signatures", run: verifyRegistrySignaturesCommand },
				{ name: "Lint", run: lintCommand },
				{ name: "Typecheck", run: typecheckCommand },
				{ name: "Test", run: testCommand },
				{ name: "Build", run: buildHollywoodCommand },
				{ name: "Check package contents", run: checkPackageContentsCommand },
				{ name: "Check Hollywood state", run: checkHollywoodStateCommand },
				{ ...setupNode, with: { "node-version": "20" } },
				{
					name: "Check Node 20 CLI runtime",
					run: command({ file: "node", args: ["dist/cli.js", "check", "--workflow-security"] }),
				},
			],
		}),
		actionlint: job({
			name: "Actionlint",
			if: trustedCiRun,
			"runs-on": "ubuntu-latest",
			steps: [
				{ uses: checkoutAction, with: { "persist-credentials": false } },
				setupNode,
				{ name: "Install dependencies", run: installDependenciesCommand },
				{ name: "Build Hollywood", run: buildHollywoodCommand },
				{ name: "Build local actions", run: buildLocalActionsCommand },
				uses(validateReleaseCandidate, {
					env: { GH_TOKEN: gh.github.token },
					name: "Validate release candidate",
					with: { repository: gh.github.repository },
				}),
				uses(checkRuntime, { name: "Check Hollywood runtime" }),
				uses(lintWorkflows, { name: "Lint GitHub Actions workflows" }),
			],
		}),
		container: job({
			name: "Container provider",
			if: trustedCiRun,
			"runs-on": "ubuntu-24.04",
			env: { HOLLYWOOD_CONTAINER_PROVIDER: "${{ matrix.provider }}" },
			strategy: { matrix: { provider: containerProviders } },
			steps: [
				{ uses: checkoutAction, with: { "persist-credentials": false } },
				setupNode,
				{ name: "Install dependencies", run: installDependenciesCommand },
				{ name: "Build Hollywood", run: buildHollywoodCommand },
				{ name: "Build local actions", run: buildLocalActionsCommand },
				uses(testContainerProvider, { name: "Test provider" }),
			],
		}),
	},
});
