import { action, job, pathInput, stringInput, uses, workflow, type ScriptExec } from "../src/index";
import {
	buildHollywoodCommand,
	buildLocalActionsCommand,
	checkoutAction,
	installDependenciesCommand,
	setupNodeAction,
} from "./actions";

const flowerBody = "Here's a flower for all your hard work! 🌸";
const deploymentCommentMarker = "<!-- github-actions:post-merge-deployments -->";
const flowerBots = new Set(["github-actions[bot]", "cind-bot[bot]", "cind[bot]"]);
const deploymentWorkflowPaths = new Set([
	".github/workflows/docs.yml",
	".github/workflows/publish-npm.yml",
]);

type PushEvent = Readonly<{
	after?: unknown;
	commits?: unknown;
}>;

type DeploymentRun = Readonly<{
	name: string;
	number: number;
	url: string;
}>;

export const leaveFlower = action({
	name: "Comment on merged PR",
	description: "Leave separate flower and deployment comments on merged pull requests.",
	localActionPath: "leave-flower",
	inputs: {
		eventPath: pathInput({ description: "Path to the GitHub event payload." }),
		repository: stringInput({ description: "GitHub owner/repo name." }),
		token: stringInput({ description: "GitHub token for commenting." }),
	},
	outputs: {},
	run: async ({ exec, fs, input, log }) => {
		const event = JSON.parse(await fs.readText(input.eventPath)) as PushEvent;
		const prNumbers = new Set<number>();
		for (const sha of pushShas(event)) {
			const pullRequests = await ghApiItems(exec, input.token, [
				`repos/${input.repository}/commits/${sha}/pulls`,
				"--method",
				"GET",
				"--paginate",
				"--slurp",
				"-H",
				"Accept: application/vnd.github+json",
			]);
			for (const pullRequest of pullRequests) {
				const number = numberField(pullRequest, "number");
				const mergedAt = stringField(pullRequest, "merged_at");
				if (number !== null && mergedAt !== null && mergedAt.length > 0) prNumbers.add(number);
			}
		}

		if (prNumbers.size === 0) {
			log.info("No merged PRs associated with this push; skipping");
			return {};
		}
		const deploymentRuns =
			typeof event.after === "string"
				? await deploymentRunsForSha(exec, input.token, input.repository, event.after)
				: [];

		for (const prNumber of [...prNumbers].sort((left, right) => left - right)) {
			const commentEndpoint = `repos/${input.repository}/issues/${prNumber}/comments`;
			const comments = await ghApiItems(exec, input.token, [
				commentEndpoint,
				"--method",
				"GET",
				"--paginate",
				"--slurp",
				"-f",
				"per_page=100",
			]);
			if (comments.some(isFlowerComment)) {
				log.info(`Flower comment already exists on #${prNumber}`);
			} else {
				await postIssueComment(exec, input.token, commentEndpoint, flowerBody);
			}
			if (deploymentRuns.length === 0) continue;
			if (comments.some(isDeploymentComment)) {
				log.info(`Deployment comment already exists on #${prNumber}`);
				continue;
			}
			await postIssueComment(
				exec,
				input.token,
				commentEndpoint,
				deploymentCommentBody(deploymentRuns),
			);
		}

		return {};
	},
});

const postIssueComment = async (
	exec: ScriptExec,
	token: string,
	endpoint: string,
	body: string,
): Promise<void> => {
	await exec("gh", ["api", endpoint, "--method", "POST", "-f", `body=${body}`], {
		env: { GH_TOKEN: token },
	});
};

const deploymentRunsForSha = async (
	exec: ScriptExec,
	token: string,
	repository: string,
	headSha: string,
): Promise<readonly DeploymentRun[]> => {
	const result = await exec(
		"gh",
		[
			"api",
			`repos/${repository}/actions/runs`,
			"--method",
			"GET",
			"-f",
			`head_sha=${headSha}`,
			"-f",
			"event=push",
			"-F",
			"per_page=100",
			"--paginate",
			"--slurp",
		],
		{ env: { GH_TOKEN: token } },
	);
	const response: unknown = JSON.parse(result.stdout);
	if (!Array.isArray(response) || response.length === 0) {
		throw new Error("GitHub workflow run response must contain at least one page");
	}
	const runs = response.flatMap((page) => arrayField(page, "workflow_runs"));
	const total = numberField(response[0], "total_count");
	if (total === null || total !== runs.length) {
		throw new Error("GitHub workflow run response was truncated or invalid");
	}
	return runs.flatMap((run) => deploymentRun(run, headSha));
};

const deploymentRun = (value: unknown, headSha: string): readonly DeploymentRun[] => {
	const event = stringField(value, "event");
	const runHeadSha = stringField(value, "head_sha");
	const path = stringField(value, "path");
	if (event !== "push" || runHeadSha !== headSha || path === null) {
		throw new Error("GitHub returned a workflow run outside the exact push query");
	}
	if (!deploymentWorkflowPaths.has(path)) return [];
	const name = stringField(value, "name");
	const number = numberField(value, "run_number");
	const url = stringField(value, "html_url");
	if (name === null || number === null || number < 1 || url === null) {
		throw new Error("GitHub returned an invalid deployment workflow run");
	}
	return [{ name, number, url }];
};

const deploymentCommentBody = (runs: readonly DeploymentRun[]): string => {
	const rows = [...runs]
		.sort((left, right) => left.name.localeCompare(right.name))
		.map(({ name, number, url }) => `| ${name.replaceAll("|", "\\|")} | [#${number}](${url}) |`);
	return [
		deploymentCommentMarker,
		"### Deployments triggered by this merge",
		"",
		"| Workflow | Run |",
		"| --- | --- |",
		...rows,
	].join("\n");
};

const ghApiItems = async (
	exec: ScriptExec,
	token: string,
	args: readonly string[],
): Promise<readonly unknown[]> => {
	const result = await exec("gh", ["api", ...args], { env: { GH_TOKEN: token } });
	const parsed: unknown = JSON.parse(result.stdout);
	if (!Array.isArray(parsed)) {
		throw new Error("gh api expected a JSON array response");
	}
	if (parsed.every(Array.isArray)) {
		return parsed.flat();
	}
	return parsed;
};

const arrayField = (value: unknown, key: string): readonly unknown[] => {
	const field = recordField(value, key);
	if (!Array.isArray(field)) throw new Error(`GitHub API field ${key} must be an array`);
	return field;
};

const pushShas = (event: PushEvent): readonly string[] => {
	const shas = new Set<string>();
	if (typeof event.after === "string" && event.after.length > 0) {
		shas.add(event.after);
	}
	if (Array.isArray(event.commits)) {
		for (const commit of event.commits) {
			const id = recordField(commit, "id");
			if (typeof id === "string" && id.length > 0) {
				shas.add(id);
			}
		}
	}
	return [...shas];
};

const recordField = (value: unknown, key: string): unknown | null => {
	if (value === null || typeof value !== "object") {
		return null;
	}
	return (value as Record<string, unknown>)[key] ?? null;
};

const numberField = (value: unknown, key: string): number | null => {
	const field = recordField(value, key);
	return typeof field === "number" ? field : null;
};

const stringField = (value: unknown, key: string): string | null => {
	const field = recordField(value, key);
	return typeof field === "string" ? field : null;
};

const isFlowerComment = (comment: unknown): boolean => {
	const user = recordField(comment, "user");
	const login = user === null ? null : stringField(user, "login");
	return login !== null && flowerBots.has(login) && stringField(comment, "body")?.trim() === flowerBody;
};

const isDeploymentComment = (comment: unknown): boolean => {
	const user = recordField(comment, "user");
	const login = user === null ? null : stringField(user, "login");
	const body = stringField(comment, "body");
	return login !== null && flowerBots.has(login) && body?.includes(deploymentCommentMarker) === true;
};

export const flowers = workflow({
	name: "PR: Post-merge receipts",
	on: {
		push: { branches: ["main"] },
		workflow_dispatch: {},
	},
	permissions: {
		actions: "read",
		contents: "read",
		issues: "write",
		"pull-requests": "read",
	},
	env: {
		FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true",
	},
	jobs: {
		"leave-flower": job({
			name: "Comment on merged PR",
			if: "github.repository == 'dedalus-labs/hollywood'",
			"runs-on": "ubuntu-24.04",
			steps: [
				{ uses: checkoutAction, with: { "persist-credentials": false } },
				{ uses: setupNodeAction, with: { "node-version": "24" } },
				{ name: "Install dependencies", run: installDependenciesCommand },
				{ name: "Build Hollywood", run: buildHollywoodCommand },
				{ name: "Build local actions", run: buildLocalActionsCommand },
				uses(leaveFlower, {
					name: "Comment on merged PR",
					with: {
						eventPath: "${{ github.event_path }}",
						repository: "${{ github.repository }}",
						token: "${{ github.token }}",
					},
				}),
			],
		}),
	},
});
