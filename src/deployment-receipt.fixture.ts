import { strict as assert } from "node:assert";

export const head = "a".repeat(40);
export const merged = "b".repeat(40);
export const repository = "acme/project";
export const requirement = {
	environment: "production",
	task: "api",
	publisher: "deploy[bot]",
	workflow: ".github/workflows/deploy-api.yml",
};

export const deploymentFixture = () => {
	const deployment = {
		id: 5,
		sha: merged,
		environment: "production",
		task: "api",
		creator: { login: "deploy[bot]" },
		payload: { artifact_digest: `sha256:${"c".repeat(64)}`, verification_run_id: 8 },
	};
	const status = { state: "success", environment: "production", creator: { login: "deploy[bot]" } };
	const run = {
		head_sha: merged,
		head_branch: "main",
		event: "push",
		path: requirement.workflow,
		status: "completed",
		conclusion: "success",
		repository: { full_name: repository },
	};
	const artifact = {
		name: `deployment-5-${"c".repeat(64)}`,
		expired: false,
		digest: `sha256:${"d".repeat(64)}`,
		workflow_run: { id: 8, head_sha: merged },
	};
	const responses: Record<string, unknown> = {
		"deployments?environment=production&task=api&per_page=1": [deployment],
		[`compare/${merged}...${merged}?per_page=1`]: {
			status: "identical",
			base_commit: { sha: merged },
			merge_base_commit: { sha: merged },
		},
		[`compare/${merged}...${head}?per_page=1`]: {
			status: "diverged",
			base_commit: { sha: merged },
			merge_base_commit: { sha: head },
		},
		"deployments/5/statuses?per_page=1": [status],
		"actions/runs/8": run,
		"actions/runs/8/artifacts?per_page=100&page=1": { artifacts: [artifact] },
	};
	const api = async (path: string): Promise<unknown> => {
		assert.ok(path in responses, `unexpected request ${path}`);
		return responses[path];
	};
	return { deployment, status, run, artifact, responses, api };
};
