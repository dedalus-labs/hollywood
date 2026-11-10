import {
	action,
	booleanInput,
	command,
	job,
	reconcileGitHubMergePlan,
	stringInput,
	summaryText,
	uses,
	workflow,
} from "@dedalus-labs/hollywood";

export const reconcileMergePlan = action({
	name: "Reconcile merge plan",
	description: "Refresh deployment dependency checks and admit ready revisions.",
	localActionPath: "reconcile-merge-plan",
	inputs: {
		token: stringInput({ description: "Merge App installation token." }),
		statusPublisher: stringInput({ description: "Expected status App bot login." }),
		runUrl: stringInput({ description: "Trusted workflow run URL." }),
		repository: stringInput({ description: "Current workflow repository." }),
		mergeToken: stringInput({ description: "Authorized user token for queue mutation." }),
		mergeActor: stringInput({ description: "Expected login of the merge user." }),
		initialize: booleanInput({ description: "Initialize ordinary PR statuses.", default: "false" }),
	},
	outputs: {},
	run: async ({ input, fs, summary }) => {
		const decisions = await reconcileGitHubMergePlan(
			() => fs.readText("gha/merge-plan.json"),
			{ token: input.token, mergeToken: input.mergeToken, mergeActor: input.mergeActor },
			{
				repository: input.repository,
				statusPublisher: input.statusPublisher,
				runUrl: input.runUrl,
				base: "main",
				initialize: input.initialize,
			},
		);
		await summary.table(
			"Merge plan",
			decisions.map((decision) => ({
				label: `#${decision.pull}: ${decision.state}`,
				value: summaryText(decision.reason),
			})),
		);
		return {};
	},
});

export const mergePlanWorkflow = workflow({
	name: "Merge plan",
	on: {
		push: { branches: ["main"] },
		workflow_dispatch: {},
		schedule: [{ cron: "*/5 * * * *" }],
	},
	permissions: { contents: "read" },
	concurrency: { group: "hollywood-merge-plan", "cancel-in-progress": false },
	jobs: {
		reconcile: job({
			if: "${{ github.ref == 'refs/heads/main' }}",
			environment: "merge-plan-controller",
			"runs-on": "ubuntu-24.04",
			steps: [
				{
					uses: "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
					with: { ref: "main", "persist-credentials": false },
				},
				{
					uses: "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
					with: { "node-version": "24" },
				},
				{ run: command({ file: "npm", args: ["ci", "--ignore-scripts"] }) },
				{ run: command({ file: "npx", args: ["--no-install", "hollywood", "build"] }) },
				{
					uses: "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1",
					id: "merge-app",
					with: {
						"app-id": "${{ vars.MERGE_APP_ID }}",
						"private-key": "${{ secrets.MERGE_APP_PRIVATE_KEY }}",
						"permission-contents": "read",
						"permission-statuses": "write",
						"permission-merge-queues": "read",
						"permission-pull-requests": "read",
						"permission-actions": "read",
						"permission-deployments": "read",
					},
				},
				uses(reconcileMergePlan, {
					with: {
						mergeToken: "${{ secrets.MERGE_USER_TOKEN }}",
						mergeActor: "${{ vars.MERGE_USER_LOGIN }}",
						token: "${{ steps.merge-app.outputs.token }}",
						repository: "${{ github.repository }}",
						statusPublisher: "${{ steps.merge-app.outputs.app-slug }}[bot]",
						runUrl:
							"${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}",
						initialize:
							"${{ github.event_name == 'schedule' || github.event_name == 'workflow_dispatch' }}",
					},
				}),
			],
		}),
	},
});
