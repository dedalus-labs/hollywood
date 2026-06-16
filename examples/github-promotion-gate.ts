import { action, stringInput, stringOutput } from "@dedalus-labs/hollywood";

const inputs = {
	githubToken: stringInput({
		description: "GitHub token with actions:read permission.",
	}),
	repository: stringInput({
		description: "GitHub repository in owner/name form.",
	}),
	targetSha: stringInput({
		description: "Preview commit SHA being promoted.",
	}),
	workflowName: stringInput({
		description: "Required workflow run name.",
		default: "CI",
	}),
} as const;

const outputs = {
	ciRunUrl: stringOutput({ description: "Successful preview CI run URL." }),
} as const;

type PromotionGateRequest = Readonly<{
	repository: Repository;
	targetSha: CommitSha;
	workflowName: string;
}>;

type Repository = Readonly<{
	owner: string;
	repo: string;
}>;

type CommitSha = string & { readonly __brand: "CommitSha" };

export type WorkflowRun = Readonly<{
	conclusion: string | null;
	createdAt: string;
	headSha: string;
	htmlUrl: string;
	name: string;
	status: string;
}>;

export type GitHubActionsReader = Readonly<{
	workflowRunsForCommit: (
		request: Readonly<{ branch: "preview"; headSha: CommitSha }>,
	) => Promise<readonly WorkflowRun[]>;
}>;

export const previewPromotionGate = action({
	name: "preview-promotion-gate",
	description: "Verify a preview commit has a successful workflow run.",
	localActionPath: "preview-promotion-gate",
	inputs,
	outputs,
	run: async ({ input }) => {
		const request = promotionGateRequest(input);
		return {
			ciRunUrl: await verifyPreviewCi(
				request,
				githubActionsReader(input.githubToken, request.repository),
			),
		};
	},
});

export const verifyPreviewCi = async (
	request: PromotionGateRequest,
	github: GitHubActionsReader,
): Promise<string> => {
	const runs = await github.workflowRunsForCommit({
		branch: "preview",
		headSha: request.targetSha,
	});
	const latest = runs
		.filter(
			(run) =>
				run.name === request.workflowName &&
				run.status === "completed" &&
				run.conclusion !== "cancelled",
		)
		.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];

	if (latest === undefined) {
		throw new Error(`No completed ${request.workflowName} run found for ${request.targetSha}`);
	}
	if (latest.conclusion !== "success") {
		throw new Error(`${request.workflowName} run was ${latest.conclusion}: ${latest.htmlUrl}`);
	}
	return latest.htmlUrl;
};

export const promotionGateRequest = (
	input: Readonly<{ repository: string; targetSha: string; workflowName: string }>,
): PromotionGateRequest => ({
	repository: parseRepository(input.repository),
	targetSha: commitSha(input.targetSha),
	workflowName: nonempty("workflow-name", input.workflowName),
});

const githubActionsReader = (token: string, repository: Repository): GitHubActionsReader => ({
	workflowRunsForCommit: async ({ branch, headSha }) => {
		const url = new URL(
			`https://api.github.com/repos/${repository.owner}/${repository.repo}/actions/runs`,
		);
		url.searchParams.set("branch", branch);
		url.searchParams.set("head_sha", headSha);
		url.searchParams.set("per_page", "100");
		const response = await fetch(url, {
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${token}`,
				"X-GitHub-Api-Version": "2022-11-28",
			},
		});
		if (!response.ok) {
			throw new Error(`GitHub Actions API failed ${response.status}: ${await response.text()}`);
		}
		return workflowRuns(await response.json());
	},
});

const workflowRuns = (value: unknown): readonly WorkflowRun[] => {
	if (typeof value !== "object" || value === null) {
		throw new Error("GitHub Actions response must be an object");
	}
	const runs = (value as { readonly [name: string]: unknown })["workflow_runs"];
	if (!Array.isArray(runs)) {
		throw new Error("workflow_runs must be an array");
	}
	return runs.map(workflowRun);
};

const workflowRun = (value: unknown): WorkflowRun => {
	if (typeof value !== "object" || value === null) {
		throw new Error("workflow run must be an object");
	}
	const run = value as { readonly [name: string]: unknown };
	return {
		conclusion: nullableString("conclusion", run["conclusion"]),
		createdAt: requiredString("created_at", run["created_at"]),
		headSha: requiredString("head_sha", run["head_sha"]),
		htmlUrl: requiredString("html_url", run["html_url"]),
		name: requiredString("name", run["name"]),
		status: requiredString("status", run["status"]),
	};
};

const parseRepository = (value: string): Repository => {
	const match = /^([^/\s]+)\/([^/\s]+)$/.exec(value.trim());
	if (match === null || match[1] === undefined || match[2] === undefined) {
		throw new Error(`repository must be owner/name: ${value}`);
	}
	return { owner: match[1], repo: match[2] };
};

const commitSha = (value: string): CommitSha => {
	const trimmed = value.trim();
	if (!/^[0-9a-f]{40}$/i.test(trimmed)) {
		throw new Error(`target-sha must be a 40-character commit SHA: ${value}`);
	}
	return trimmed as CommitSha;
};

const nonempty = (name: string, value: string): string => {
	const trimmed = value.trim();
	if (trimmed === "") {
		throw new Error(`${name} is required`);
	}
	return trimmed;
};

const requiredString = (name: string, value: unknown): string => {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`${name} must be a non-empty string`);
	}
	return value;
};

const nullableString = (name: string, value: unknown): string | null => {
	if (value === null) {
		return null;
	}
	return requiredString(name, value);
};
