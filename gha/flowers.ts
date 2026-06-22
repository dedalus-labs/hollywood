import { action, job, pathInput, stringInput, workflow, type ScriptExec } from "../src/index";
import { checkoutAction, createGitHubAppTokenAction, setupNodeAction } from "./actions";

const flowerBody = "Here's a flower for all your hard work! 🌸";
const flowerBots = new Set(["github-actions[bot]", "cind-bot[bot]", "cind[bot]"]);

type PushEvent = Readonly<{
	after?: unknown;
	commits?: unknown;
}>;

export const leaveFlower = action({
	name: "Leave merged PR flower",
	description: "Leave a flower comment on pull requests associated with this push.",
	localActionPath: "leave-flower",
	inputs: {
		eventPath: pathInput({ description: "Path to the GitHub event payload." }),
		repository: stringInput({ description: "GitHub owner/repo name." }),
		token: stringInput({ description: "GitHub token for commenting." }),
	},
	outputs: {},
	run: async ({ exec, fs, input, log }) => {
		const event = JSON.parse(await fs.readText(input.eventPath)) as PushEvent;
		const shas = pushShas(event);
		const prNumbers = new Set<number>();

		for (const sha of shas) {
			const prs = await ghApiItems(exec, input.token, [
				`repos/${input.repository}/commits/${sha}/pulls`,
				"--method",
				"GET",
				"--paginate",
				"--slurp",
				"-H",
				"Accept: application/vnd.github+json",
			]);
			for (const pr of prs) {
				const number = numberField(pr, "number");
				const mergedAt = stringField(pr, "merged_at");
				if (number !== null && mergedAt !== null && mergedAt.length > 0) {
					prNumbers.add(number);
				}
			}
		}

		if (prNumbers.size === 0) {
			log.info("No merged PRs associated with this push; skipping");
			return {};
		}

		for (const prNumber of [...prNumbers].sort((left, right) => left - right)) {
			const comments = await ghApiItems(exec, input.token, [
				`repos/${input.repository}/issues/${prNumber}/comments`,
				"--method",
				"GET",
				"--paginate",
				"--slurp",
				"-f",
				"per_page=100",
			]);
			const alreadyLeft = comments.some((comment) => {
				const user = recordField(comment, "user");
				const login = user === null ? null : stringField(user, "login");
				const body = stringField(comment, "body");
				return login !== null && flowerBots.has(login) && body?.trim() === flowerBody;
			});

			if (alreadyLeft) {
				log.info(`Flower comment already exists on #${prNumber}; skipping`);
				continue;
			}

			await exec(
				"gh",
				[
					"api",
					`repos/${input.repository}/issues/${prNumber}/comments`,
					"--method",
					"POST",
					"-f",
					`body=${flowerBody}`,
				],
				{ env: { GH_TOKEN: input.token } },
			);
		}

		return {};
	},
});

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

export const flowers = workflow({
	name: "PR: Merged Flower",
	on: {
		push: { branches: ["main"] },
		workflow_dispatch: {},
	},
	permissions: {
		contents: "read",
	},
	env: {
		FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true",
	},
	jobs: {
		"leave-flower": job({
			name: "Leave Flower",
			if: "github.repository == 'dedalus-labs/hollywood'",
			"runs-on": "ubuntu-24.04",
			steps: [
				{ uses: checkoutAction, with: { "persist-credentials": false } },
				{ uses: setupNodeAction, with: { "node-version": "24" } },
				{ name: "Install dependencies", run: "npm ci" },
				{ name: "Build Hollywood", run: "npm run build" },
				{
					id: "cind-token",
					name: "Create Cind app token",
					uses: createGitHubAppTokenAction,
					with: {
						"app-id": "${{ secrets.CIND_BOT_APP_ID }}",
						"private-key": "${{ secrets.CIND_BOT_APP_PRIVATE_KEY }}",
						owner: "${{ github.repository_owner }}",
						repositories: "hollywood",
						"permission-metadata": "read",
						"permission-pull-requests": "write",
					},
				},
				{
					name: "Leave flower comment",
					env: {
						GITHUB_TOKEN: "${{ steps.cind-token.outputs.token }}",
					},
					run: 'node dist/cli.js run gha/flowers.ts --with eventPath="$GITHUB_EVENT_PATH" --with repository="$GITHUB_REPOSITORY" --with token="$GITHUB_TOKEN"',
				},
			],
		}),
	},
});
