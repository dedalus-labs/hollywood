import type { ScriptExec } from "./script";

// ── Types ──────────────────────────────────────────────────────────────────

/** Metadata about a successful GitHub Actions workflow run. */
export type WorkflowRunInfo = Readonly<{
	id: number;
	url: string;
	conclusion: string;
	createdAt: string;
	headSha: string;
	name: string;
}>;

/**
 * Result of comparing the current tree hash against recent successful
 * workflow runs. Uses a discriminated union so consumers must handle
 * both the match and no-match cases exhaustively.
 */
export type GitTreeMatchResult =
	| { found: true; run: WorkflowRunInfo }
	| { found: false; reason: string };

/**
 * Options for `gitTreeMatch`.
 *
 * @param path — The repository-relative path whose tree hash to compare
 *   (e.g. `"packages/typescript/databases/core/supabase/migrations"`).
 * @param workflow — The name of the GitHub Actions workflow to filter runs by.
 * @param branch — The branch to look for recent successful runs on.
 * @param repository — The `owner/repo` string (e.g. `"dedalus-labs/hollywood"`).
 * @param limit — Maximum number of recent successful runs to scan. Clamped
 *   to 100 (GitHub API `per_page` maximum). Defaults to 10.
 * @param exec — Hollywood `ScriptExec` for running `git rev-parse` locally.
 * @param token — Optional GitHub personal access token for authenticated API
 *   calls. Unauthenticated requests are rate-limited to 60/hour.
 */
export type GitTreeMatchOptions = Readonly<{
	path: string;
	workflow: string;
	branch: string;
	repository: string;
	limit?: number;
	exec: ScriptExec;
	token?: string;
}>;

// ── Helpers ────────────────────────────────────────────────────────────────

const parseRepository = (value: string): { owner: string; repo: string } => {
	const match = /^([^/\s]+)\/([^/\s]+)$/.exec(value.trim());
	if (match === null || match[1] === undefined || match[2] === undefined) {
		throw new Error(`repository must be owner/name: ${value}`);
	}
	return { owner: match[1], repo: match[2] };
};

// ── GitHub API ─────────────────────────────────────────────────────────────

type GitHubTreeEntry = Readonly<{
	path: string;
	sha: string;
	type: string;
}>;

type GitHubTreeResponse = Readonly<{
	sha: string;
	tree: readonly GitHubTreeEntry[];
}>;

type GitHubWorkflowRunItem = Readonly<{
	id: number;
	html_url: string;
	conclusion: string | null;
	created_at: string;
	head_sha: string;
	name: string;
	status: string;
}>;

type GitHubWorkflowRunsResponse = Readonly<{
	workflow_runs: readonly GitHubWorkflowRunItem[];
}>;

const fetchJson = async <T>(url: string, token?: string): Promise<T> => {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (token) {
		headers["Authorization"] = `Bearer ${token}`;
	}
	const response = await fetch(url, { headers });
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`GitHub API failed ${response.status}: ${body}`);
	}
	return response.json() as T;
};

const workflowRunsForBranch = async (
	repository: { owner: string; repo: string },
	branch: string,
	limit: number,
	token?: string,
): Promise<readonly WorkflowRunInfo[]> => {
	const url = new URL(
		`https://api.github.com/repos/${repository.owner}/${repository.repo}/actions/runs`,
	);
	url.searchParams.set("branch", branch);
	url.searchParams.set("per_page", String(limit));

	const data = await fetchJson<GitHubWorkflowRunsResponse>(url.toString(), token);

	return data.workflow_runs
		.filter(
			(run) =>
				run.status === "completed" && run.conclusion === "success",
		)
		.map((run) => ({
			id: run.id,
			url: run.html_url,
			conclusion: run.conclusion ?? "",
			createdAt: run.created_at,
			headSha: run.head_sha,
			name: run.name,
		}));
};

const treeHashForPath = async (
	repository: { owner: string; repo: string },
	commitSha: string,
	path: string,
	token?: string,
): Promise<string | null> => {
	const url = new URL(
		`https://api.github.com/repos/${repository.owner}/${repository.repo}/git/trees/${commitSha}`,
	);
	url.searchParams.set("recursive", "1");

	const data = await fetchJson<GitHubTreeResponse>(url.toString(), token);
	const entry = data.tree.find((e) => e.path === path);
	if (entry === undefined || (entry.type !== "blob" && entry.type !== "tree")) {
		return null;
	}
	return entry.sha;
};

// ── Git ────────────────────────────────────────────────────────────────────

const currentTreeHash = async (path: string, exec: ScriptExec): Promise<string> => {
	const result = await exec("git", ["rev-parse", `HEAD:${path}`], {
		exitPolicy: "any",
	});
	if (result.exitCode !== 0) {
		throw new Error(
			`git rev-parse HEAD:${path} failed (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`,
		);
	}
	return result.stdout.trim();
};

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * Compares the current tree hash for a given path against recent successful
 * workflow runs on a branch. If a prior run has the same tree hash for that
 * path, the gate passes without waiting — reusing the prior run's result.
 *
 * This solves the cross-workflow gate problem: when a CD pipeline requires
 * a dependent workflow to pass (e.g. database migrations), but the dependent
 * workflow didn't trigger for the current commit because the relevant source
 * tree didn't change.
 *
 * @param options — Configuration as described in `GitTreeMatchOptions`.
 * @returns A `GitTreeMatchResult` — `{ found: true, run }` if a matching
 *   prior run exists, or `{ found: false, reason }` otherwise.
 *
 * @example
 * ```ts
 * const match = await gitTreeMatch({
 *   path: "packages/typescript/databases/core/supabase/migrations",
 *   workflow: "DB CD",
 *   branch: input.branch,
 *   repository: input.repository,
 *   limit: 10,
 *   exec,
 * });
 *
 * if (match.found) {
 *   log.info(`Tree unchanged since ${match.run.url}`);
 *   return match.run;
 * }
 * ```
 */
export const gitTreeMatch = async (
	options: GitTreeMatchOptions,
): Promise<GitTreeMatchResult> => {
	const { path, workflow, branch, repository, limit, exec, token } = options;
	const repo = parseRepository(repository);
	const maxLimit = Math.max(Math.min(limit ?? 10, 100), 1);

	// Current tree hash for the given path at HEAD
	const currentHash = await currentTreeHash(path, exec);

	// Recent successful workflow runs on the branch
	const runs = await workflowRunsForBranch(repo, branch, maxLimit, token);

	// Filter by workflow name and compare tree hashes
	const candidates = runs.filter((run) => run.name === workflow);

	// Deduplicate tree hash lookups by headSha — re-runs share the same commit
	const treeCache = new Map<string, string | null>();

	for (const run of candidates) {
		let runHash = treeCache.get(run.headSha);
		if (runHash === undefined) {
			runHash = await treeHashForPath(repo, run.headSha, path, token);
			treeCache.set(run.headSha, runHash);
		}
		if (runHash === currentHash) {
			return { found: true, run };
		}
	}

	return {
		found: false,
		reason: `Tree hash ${currentHash} not found in ${candidates.length} recent successful runs of "${workflow}" on ${branch}`,
	};
};
