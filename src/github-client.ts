import type { components } from "@octokit/openapi-types";

import type { GitHubCore } from "./github";
import { parseGitHubRepository } from "./github-runner-api";

export type GitHubWorkflowRun = components["schemas"]["workflow-run"];
export type WorkflowRun = GitHubWorkflowRun;

export type GitHubArtifact = components["schemas"]["artifact"];
export type Artifact = GitHubArtifact;

export type FindWorkflowRunOptions = Readonly<{
	workflow: string;
	branch?: string | undefined;
	checkSuiteId?: number | undefined;
	conclusion?: string | undefined;
	event?: string | undefined;
	headSha?: string | undefined;
	repository?: string | undefined;
	status?: string | undefined;
}>;

export type ListRunArtifactsOptions = Readonly<{
	runId: number;
	name?: string | undefined;
	repository?: string | undefined;
}>;

export type GitHubClient = Readonly<{
	findWorkflowRun: (options: FindWorkflowRunOptions) => Promise<GitHubWorkflowRun>;
	listRunArtifacts: (options: ListRunArtifactsOptions) => Promise<readonly GitHubArtifact[]>;
}>;

export class GitHubNotFoundError extends Error {}

export class GitHubWorkflowRunNotFoundError extends GitHubNotFoundError {
	readonly workflow: string;
	readonly criteria: Readonly<Record<string, unknown>>;

	constructor(workflow: string, criteria: Readonly<Record<string, unknown>> = {}) {
		const details = Object.entries(criteria)
			.filter(([key, value]) => key !== "workflow" && value !== undefined)
			.map(([key, value]) => `${key}=${String(value)}`)
			.join(", ");
		super(
			`No matching workflow run found for '${workflow}'${details.length > 0 ? ` (${details})` : ""}.`,
		);
		this.name = "GitHubWorkflowRunNotFoundError";
		this.workflow = workflow;
		this.criteria = criteria;
	}
}

export class GitHubArtifactNotFoundError extends GitHubNotFoundError {
	readonly runId: number;
	readonly artifactName?: string | undefined;

	constructor(runId: number, name?: string) {
		super(
			name !== undefined
				? `No matching artifact '${name}' found for workflow run ${runId}.`
				: `No artifacts found for workflow run ${runId}.`,
		);
		this.name = "GitHubArtifactNotFoundError";
		this.runId = runId;
		if (name !== undefined) {
			this.artifactName = name;
		}
	}
}

export class GitHubApiError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "GitHubApiError";
		this.status = status;
	}
}

export const unavailableGitHubClient = (): GitHubClient => ({
	findWorkflowRun: async () => {
		throw new Error("GitHub client is unavailable. Provide github in runAction options.");
	},
	listRunArtifacts: async () => {
		throw new Error("GitHub client is unavailable. Provide github in runAction options.");
	},
});

export type GitHubClientOptions = Readonly<{
	apiUrl?: URL | string | undefined;
	core?: GitHubCore | undefined;
	fetch?: typeof fetch | undefined;
	repository?: string | undefined;
	token?: string | undefined;
	tokenInput?: string | undefined;
}>;

export const createGitHubClient = (options: GitHubClientOptions = {}): GitHubClient => {
	if (options.repository !== undefined) {
		parseGitHubRepository(options.repository);
	}
	const customFetch = options.fetch ?? fetch;

	const resolveToken = (): string => {
		if (options.token !== undefined) {
			const trimmed = options.token.trim();
			if (trimmed.length === 0) {
				throw new Error("GitHub token must be nonempty text.");
			}
			return trimmed;
		}
		if (options.core !== undefined) {
			const inputName = options.tokenInput;
			if (inputName !== undefined) {
				const val = options.core.getInput(inputName).trim();
				if (val.length > 0) return val;
			}
			const githubToken = options.core.getInput("github-token").trim();
			if (githubToken.length > 0) return githubToken;
			const token = options.core.getInput("token").trim();
			if (token.length > 0) return token;
		}
		throw new Error(
			"GitHub client requires an explicit token input. Provide 'github-token' or 'token' input.",
		);
	};

	const resolveRepository = (override?: string): { owner: string; name: string } => {
		const raw = override ?? options.repository ?? process.env["GITHUB_REPOSITORY"];
		if (raw === undefined || raw.trim().length === 0) {
			throw new Error(
				"GitHub repository is required. Provide 'repository' option or set GITHUB_REPOSITORY.",
			);
		}
		return parseGitHubRepository(raw.trim());
	};

	const resolveApiUrl = (): URL => {
		const raw = options.apiUrl ?? process.env["GITHUB_API_URL"] ?? "https://api.github.com";
		const url = typeof raw === "string" ? new URL(raw) : raw;
		return withTrailingSlash(url);
	};

	const request = async <Data>(url: URL | string): Promise<{ data: Data; link: string | null }> => {
		const token = resolveToken();
		const response = await customFetch(url, {
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${token}`,
				"X-GitHub-Api-Version": "2022-11-28",
			},
			method: "GET",
		});

		if (response.status === 404) {
			throw new GitHubNotFoundError(`GitHub resource not found: ${response.status}`);
		}
		if (!response.ok) {
			throw new GitHubApiError(
				response.status,
				`GitHub API request failed with status ${response.status}${response.statusText ? ` (${response.statusText})` : ""}.`,
			);
		}
		const data = (await response.json()) as Data;
		const link = response.headers.get("link");
		return { data, link };
	};

	return {
		findWorkflowRun: async (findOptions) => {
			if (findOptions.workflow.trim().length === 0) {
				throw new Error("workflow must be a nonempty string.");
			}
			const repo = resolveRepository(findOptions.repository);
			const apiUrl = resolveApiUrl();

			const perPage = 100;
			let page = 1;
			const initialUrl = new URL(
				`repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/actions/workflows/${encodeURIComponent(findOptions.workflow)}/runs`,
				apiUrl,
			);
			initialUrl.searchParams.set("per_page", String(perPage));
			initialUrl.searchParams.set("page", String(page));
			if (findOptions.branch !== undefined) {
				initialUrl.searchParams.set("branch", findOptions.branch);
			}
			if (findOptions.headSha !== undefined) {
				initialUrl.searchParams.set("head_sha", findOptions.headSha);
			}
			if (findOptions.event !== undefined) {
				initialUrl.searchParams.set("event", findOptions.event);
			}
			if (findOptions.status !== undefined) {
				initialUrl.searchParams.set("status", findOptions.status);
			} else if (findOptions.conclusion !== undefined) {
				initialUrl.searchParams.set("status", findOptions.conclusion);
			}
			if (findOptions.checkSuiteId !== undefined) {
				initialUrl.searchParams.set("check_suite_id", String(findOptions.checkSuiteId));
			}

			let currentUrl: string | URL = initialUrl;

			while (true) {
				let data: { total_count: number; workflow_runs: GitHubWorkflowRun[] };
				let link: string | null;
				try {
					const res = await request<{ total_count: number; workflow_runs: GitHubWorkflowRun[] }>(
						currentUrl,
					);
					data = res.data;
					link = res.link;
				} catch (error) {
					if (error instanceof GitHubNotFoundError) {
						throw new GitHubWorkflowRunNotFoundError(findOptions.workflow, findOptions);
					}
					throw error;
				}

				if (!Array.isArray(data.workflow_runs)) {
					throw new Error("GitHub API response invalid: workflow_runs must be an array.");
				}

				for (const run of data.workflow_runs) {
					if (matchWorkflowRun(run, findOptions)) {
						return run;
					}
				}

				const nextLink = parseNextLink(link);
				if (nextLink !== null) {
					currentUrl = nextLink;
					page++;
					continue;
				}

				if (data.workflow_runs.length === perPage && page * perPage < data.total_count) {
					page++;
					const nextUrl = new URL(initialUrl);
					nextUrl.searchParams.set("page", String(page));
					currentUrl = nextUrl;
					continue;
				}

				break;
			}

			throw new GitHubWorkflowRunNotFoundError(findOptions.workflow, findOptions);
		},

		listRunArtifacts: async (listOptions) => {
			if (!Number.isSafeInteger(listOptions.runId) || listOptions.runId <= 0) {
				throw new Error("runId must be a positive integer.");
			}
			const repo = resolveRepository(listOptions.repository);
			const apiUrl = resolveApiUrl();

			const perPage = 100;
			let page = 1;
			const initialUrl = new URL(
				`repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/actions/runs/${listOptions.runId}/artifacts`,
				apiUrl,
			);
			initialUrl.searchParams.set("per_page", String(perPage));
			initialUrl.searchParams.set("page", String(page));
			if (listOptions.name !== undefined) {
				initialUrl.searchParams.set("name", listOptions.name);
			}

			let currentUrl: string | URL = initialUrl;
			const allArtifacts: GitHubArtifact[] = [];

			while (true) {
				let data: { total_count: number; artifacts: GitHubArtifact[] };
				let link: string | null;
				try {
					const res = await request<{ total_count: number; artifacts: GitHubArtifact[] }>(currentUrl);
					data = res.data;
					link = res.link;
				} catch (error) {
					if (error instanceof GitHubNotFoundError) {
						throw new GitHubArtifactNotFoundError(listOptions.runId, listOptions.name);
					}
					throw error;
				}

				if (!Array.isArray(data.artifacts)) {
					throw new Error("GitHub API response invalid: artifacts must be an array.");
				}

				allArtifacts.push(...data.artifacts);

				const nextLink = parseNextLink(link);
				if (nextLink !== null) {
					currentUrl = nextLink;
					page++;
					continue;
				}

				if (data.artifacts.length === perPage && page * perPage < data.total_count) {
					page++;
					const nextUrl = new URL(initialUrl);
					nextUrl.searchParams.set("page", String(page));
					currentUrl = nextUrl;
					continue;
				}

				break;
			}

			const matching =
				listOptions.name !== undefined
					? allArtifacts.filter((artifact) => artifact.name === listOptions.name)
					: allArtifacts;

			if (matching.length === 0) {
				throw new GitHubArtifactNotFoundError(listOptions.runId, listOptions.name);
			}

			return matching;
		},
	};
};

const matchWorkflowRun = (run: GitHubWorkflowRun, options: FindWorkflowRunOptions): boolean => {
	if (options.headSha !== undefined && run.head_sha !== options.headSha) {
		return false;
	}
	if (options.branch !== undefined && run.head_branch !== options.branch) {
		return false;
	}
	if (options.event !== undefined && run.event !== options.event) {
		return false;
	}
	if (options.status !== undefined && run.status !== options.status) {
		return false;
	}
	if (options.conclusion !== undefined && run.conclusion !== options.conclusion) {
		return false;
	}
	if (options.checkSuiteId !== undefined && run.check_suite_id !== options.checkSuiteId) {
		return false;
	}
	return true;
};

const parseNextLink = (linkHeader: string | null): string | null => {
	if (linkHeader === null || linkHeader.trim().length === 0) {
		return null;
	}
	const parts = linkHeader.split(",");
	for (const part of parts) {
		const match = /<([^>]+)>;\s*rel="?([^";\s]+)"?/i.exec(part.trim());
		if (match !== null && match[2]?.toLowerCase() === "next") {
			return match[1] ?? null;
		}
	}
	return null;
};

const withTrailingSlash = (url: URL): URL =>
	new URL(url.href.endsWith("/") ? url.href : `${url.href}/`);
