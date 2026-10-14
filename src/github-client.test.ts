import * as assert from "node:assert/strict";
import { test } from "vitest";

import {
	action,
	runAction,
	runGitHubAction,
	stringInput,
	stringOutput,
	createGitHubClient,
	unavailableGitHubClient,
	GitHubWorkflowRunNotFoundError,
	GitHubArtifactNotFoundError,
	GitHubNotFoundError,
	GitHubApiError,
	type GitHubClient,
	type GitHubCore,
	type GitHubWorkflowRun,
	type GitHubArtifact,
} from "./index";

const mockRun = (overrides: Partial<GitHubWorkflowRun> = {}): GitHubWorkflowRun =>
	({
		id: 12345,
		name: "merge-queue",
		node_id: "MDEwOkNoZWNrU3VpdGU1",
		head_sha: "commit-sha-123",
		head_branch: "main",
		event: "merge_group",
		status: "completed",
		conclusion: "success",
		workflow_id: 42,
		url: "https://api.github.com/repos/dedalus-labs/hollywood/actions/runs/12345",
		html_url: "https://github.com/dedalus-labs/hollywood/actions/runs/12345",
		created_at: "2026-10-14T12:00:00Z",
		updated_at: "2026-10-14T12:05:00Z",
		jobs_url: "https://api.github.com/repos/dedalus-labs/hollywood/actions/runs/12345/jobs",
		logs_url: "https://api.github.com/repos/dedalus-labs/hollywood/actions/runs/12345/logs",
		check_suite_url: "https://api.github.com/repos/dedalus-labs/hollywood/check-suites/42",
		artifacts_url: "https://api.github.com/repos/dedalus-labs/hollywood/actions/runs/12345/artifacts",
		cancel_url: "https://api.github.com/repos/dedalus-labs/hollywood/actions/runs/12345/cancel",
		rerun_url: "https://api.github.com/repos/dedalus-labs/hollywood/actions/runs/12345/rerun",
		workflow_url: "https://api.github.com/repos/dedalus-labs/hollywood/actions/workflows/42",
		run_number: 1,
		run_attempt: 1,
		...overrides,
	}) as unknown as GitHubWorkflowRun;

const mockArtifact = (overrides: Partial<GitHubArtifact> = {}): GitHubArtifact =>
	({
		id: 998877,
		node_id: "MDEwOkFydGlmYWN0OTk4ODc3",
		name: "network-plan",
		size_in_bytes: 1024,
		url: "https://api.github.com/repos/dedalus-labs/hollywood/actions/artifacts/998877",
		archive_download_url:
			"https://api.github.com/repos/dedalus-labs/hollywood/actions/artifacts/998877/zip",
		expired: false,
		created_at: "2026-10-14T12:05:00Z",
		expires_at: "2026-11-14T12:05:00Z",
		updated_at: "2026-10-14T12:05:00Z",
		...overrides,
	}) as unknown as GitHubArtifact;

// The exact example from the issue prompt
export const findPlan = action({
	name: "find-plan",
	description: "Find the successful merge-queue run and list artifacts.",
	inputs: { commit: stringInput({ description: "Commit to deploy." }) },
	outputs: { runId: stringOutput({ description: "Run that produced the plan." }) },
	run: async ({ github, input }) => {
		const run = await github.findWorkflowRun({
			workflow: "merge-queue.yml",
			headSha: input.commit,
			event: "merge_group",
			conclusion: "success",
		});
		const artifacts = await github.listRunArtifacts({ runId: run.id, name: "network-plan" });
		assert.equal(artifacts.length, 1);
		return { runId: String(run.id) };
	},
});

test("findPlan action runs with an injected fake GitHub client in local runAction", async () => {
	const fakeClient: GitHubClient = {
		findWorkflowRun: async ({ workflow, headSha, event, conclusion }) => {
			assert.equal(workflow, "merge-queue.yml");
			assert.equal(headSha, "abc1234");
			assert.equal(event, "merge_group");
			assert.equal(conclusion, "success");
			return mockRun({ id: 54321, head_sha: "abc1234" });
		},
		listRunArtifacts: async ({ runId, name }) => {
			assert.equal(runId, 54321);
			assert.equal(name, "network-plan");
			return [mockArtifact({ id: 888, name: "network-plan" })];
		},
	};

	const outputs = await runAction(findPlan, {
		github: fakeClient,
		with: { commit: "abc1234" },
		exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
		fs: { readText: async () => "" },
		runner: { uidGid: "1001:1001" },
	});

	assert.deepEqual(outputs, { runId: "54321" });
});

test("findPlan action runs with an injected fake client in runGitHubAction", async () => {
	const fakeClient: GitHubClient = {
		findWorkflowRun: async () => mockRun({ id: 77777 }),
		listRunArtifacts: async () => [mockArtifact()],
	};

	const requestedOutputs = new Map<string, string>();
	const mockCore: GitHubCore = {
		getInput: (name) => (name === "commit" ? "def5678" : ""),
		group: async (_name, fn) => fn(),
		info: () => {},
		setOutput: (name, value) => {
			requestedOutputs.set(name, value);
		},
		setFailed: (message) => {
			throw new Error(`setFailed called: ${message}`);
		},
		warning: () => {},
	};

	const outputs = await runGitHubAction(findPlan, {
		github: fakeClient,
		core: mockCore,
		exec: {
			getExecOutput: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
		},
		fs: { readText: async () => "" },
		runner: { uidGid: "1001:1001" },
	});

	assert.deepEqual(outputs, { runId: "77777" });
	assert.equal(requestedOutputs.get("run-id"), "77777");
});

test("client reads token from explicit input 'github-token' and makes authenticated requests", async () => {
	const calls: { url: string; headers: unknown }[] = [];

	const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, headers: init?.headers ?? {} });

		if (url.includes("/actions/workflows/merge-queue.yml/runs")) {
			return new Response(
				JSON.stringify({
					total_count: 1,
					workflow_runs: [
						mockRun({
							id: 11111,
							head_sha: "test-commit",
							event: "merge_group",
							conclusion: "success",
						}),
					],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}

		if (url.includes("/actions/runs/11111/artifacts")) {
			return new Response(
				JSON.stringify({
					total_count: 1,
					artifacts: [mockArtifact({ id: 22222, name: "network-plan" })],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}

		return new Response("Not found", { status: 404 });
	}) as typeof fetch;

	const mockCore: GitHubCore = {
		getInput: (name) => {
			if (name === "commit") return "test-commit";
			if (name === "github-token") return "explicit-secret-token";
			return "";
		},
		group: async (_name, fn) => fn(),
		info: () => {},
		setOutput: () => {},
		setFailed: (msg) => {
			throw new Error(msg);
		},
		warning: () => {},
	};

	const client = createGitHubClient({
		core: mockCore,
		fetch: mockFetch,
		repository: "dedalus-labs/hollywood",
	});

	const outputs = await runGitHubAction(findPlan, {
		core: mockCore,
		github: client,
		exec: {
			getExecOutput: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
		},
		fs: { readText: async () => "" },
		runner: { uidGid: "1001:1001" },
	});

	assert.deepEqual(outputs, { runId: "11111" });

	const run = await client.findWorkflowRun({
		workflow: "merge-queue.yml",
		headSha: "test-commit",
		event: "merge_group",
		conclusion: "success",
	});
	assert.equal(run.id, 11111);

	const artifacts = await client.listRunArtifacts({ runId: run.id, name: "network-plan" });
	assert.equal(artifacts.length, 1);
	assert.equal(artifacts[0]?.id, 22222);

	assert.equal(calls.length, 4);
	for (const call of calls) {
		const headers = call.headers as Record<string, string>;
		assert.equal(headers["Authorization"], "Bearer explicit-secret-token");
		assert.equal(headers["Accept"], "application/vnd.github+json");
		assert.equal(headers["X-GitHub-Api-Version"], "2022-11-28");
	}
});

test("client reads token from explicit input 'token' when 'github-token' is not set", async () => {
	const mockCore: GitHubCore = {
		getInput: (name) => {
			if (name === "token") return "fallback-token";
			return "";
		},
		group: async (_name, fn) => fn(),
		info: () => {},
		setOutput: () => {},
		setFailed: () => {},
		warning: () => {},
	};

	let authHeader = "";
	const mockFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
		authHeader = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
		return new Response(
			JSON.stringify({
				total_count: 1,
				workflow_runs: [mockRun({ id: 1 })],
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	}) as typeof fetch;

	const client = createGitHubClient({
		core: mockCore,
		fetch: mockFetch,
		repository: "owner/repo",
	});

	await client.findWorkflowRun({ workflow: "ci.yml" });
	assert.equal(authHeader, "Bearer fallback-token");
});

test("client rejects when no token is provided in inputs", async () => {
	const mockCore: GitHubCore = {
		getInput: () => "",
		group: async (_name, fn) => fn(),
		info: () => {},
		setOutput: () => {},
		setFailed: () => {},
		warning: () => {},
	};

	const client = createGitHubClient({
		core: mockCore,
		repository: "owner/repo",
	});

	await assert.rejects(
		() => client.findWorkflowRun({ workflow: "ci.yml" }),
		/GitHub client requires an explicit token input\. Provide 'github-token' or 'token' input\./,
	);
});

test("client ignores ambient GITHUB_TOKEN environment variable", async () => {
	const previousEnv = process.env["GITHUB_TOKEN"];
	process.env["GITHUB_TOKEN"] = "ambient-secret";

	try {
		const mockCore: GitHubCore = {
			getInput: () => "",
			group: async (_name, fn) => fn(),
			info: () => {},
			setOutput: () => {},
			setFailed: () => {},
			warning: () => {},
		};

		const client = createGitHubClient({
			core: mockCore,
			repository: "owner/repo",
		});

		// Must NOT use process.env["GITHUB_TOKEN"]
		await assert.rejects(
			() => client.findWorkflowRun({ workflow: "ci.yml" }),
			/GitHub client requires an explicit token input/,
		);
	} finally {
		if (previousEnv !== undefined) {
			process.env["GITHUB_TOKEN"] = previousEnv;
		} else {
			delete process.env["GITHUB_TOKEN"];
		}
	}
});

test("findWorkflowRun paginates across multiple pages to find matching run", async () => {
	const requestedUrls: string[] = [];

	const mockFetch = (async (input: string | URL | Request) => {
		const url = String(input);
		requestedUrls.push(url);
		const parsed = new URL(url);

		if (parsed.searchParams.get("page") === "1") {
			return new Response(
				JSON.stringify({
					total_count: 2,
					workflow_runs: [
						mockRun({ id: 1, head_sha: "other-sha" }),
					],
				}),
				{
					status: 200,
					headers: {
						"Content-Type": "application/json",
						Link: '<https://api.github.com/repos/owner/repo/actions/workflows/ci.yml/runs?page=2&per_page=100>; rel="next"',
					},
				},
			);
		}

		if (parsed.searchParams.get("page") === "2") {
			return new Response(
				JSON.stringify({
					total_count: 2,
					workflow_runs: [
						mockRun({ id: 2, head_sha: "target-sha" }),
					],
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		return new Response("Not found", { status: 404 });
	}) as typeof fetch;

	const client = createGitHubClient({
		token: "test-token",
		repository: "owner/repo",
		fetch: mockFetch,
	});

	const run = await client.findWorkflowRun({
		workflow: "ci.yml",
		headSha: "target-sha",
	});

	assert.equal(run.id, 2);
	assert.equal(requestedUrls.length, 2);
	assert.match(requestedUrls[0] ?? "", /page=1/);
	assert.match(requestedUrls[1] ?? "", /page=2/);
});

test("findWorkflowRun reads latest workflow run on a branch", async () => {
	let capturedUrl = "";

	const mockFetch = (async (input: string | URL | Request) => {
		capturedUrl = String(input);
		return new Response(
			JSON.stringify({
				total_count: 1,
				workflow_runs: [
					mockRun({ id: 99, head_branch: "release-v1" }),
				],
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	}) as typeof fetch;

	const client = createGitHubClient({
		token: "test-token",
		repository: "owner/repo",
		fetch: mockFetch,
	});

	const run = await client.findWorkflowRun({
		workflow: "release.yml",
		branch: "release-v1",
	});

	assert.equal(run.id, 99);
	assert.match(capturedUrl, /branch=release-v1/);
});

test("findWorkflowRun throws typed GitHubWorkflowRunNotFoundError when no matching run exists", async () => {
	const mockFetch = (async () =>
		new Response(
			JSON.stringify({
				total_count: 1,
				workflow_runs: [
					mockRun({ id: 1, head_sha: "other-sha" }),
				],
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		)) as typeof fetch;

	const client = createGitHubClient({
		token: "test-token",
		repository: "owner/repo",
		fetch: mockFetch,
	});

	await assert.rejects(
		() =>
			client.findWorkflowRun({
				workflow: "merge-queue.yml",
				headSha: "missing-sha",
			}),
		(error: unknown) => {
			assert.ok(error instanceof GitHubNotFoundError);
			assert.ok(error instanceof GitHubWorkflowRunNotFoundError);
			assert.equal(error.name, "GitHubWorkflowRunNotFoundError");
			assert.equal(error.workflow, "merge-queue.yml");
			assert.equal(error.criteria["headSha"], "missing-sha");
			return true;
		},
	);
});

test("findWorkflowRun throws typed GitHubWorkflowRunNotFoundError when API returns 404", async () => {
	const mockFetch = (async () =>
		new Response(JSON.stringify({ message: "Not Found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})) as typeof fetch;

	const client = createGitHubClient({
		token: "test-token",
		repository: "owner/repo",
		fetch: mockFetch,
	});

	await assert.rejects(
		() => client.findWorkflowRun({ workflow: "nonexistent.yml" }),
		(error: unknown) => {
			assert.ok(error instanceof GitHubWorkflowRunNotFoundError);
			return true;
		},
	);
});

test("listRunArtifacts paginates and filters by artifact name", async () => {
	const mockFetch = (async (input: string | URL | Request) => {
		const parsed = new URL(String(input));
		if (parsed.searchParams.get("page") === "1") {
			return new Response(
				JSON.stringify({
					total_count: 2,
					artifacts: [mockArtifact({ id: 1, name: "other-artifact" })],
				}),
				{
					status: 200,
					headers: {
						"Content-Type": "application/json",
						Link: '<https://api.github.com/runs/123/artifacts?page=2&per_page=100>; rel="next"',
					},
				},
			);
		}
		return new Response(
			JSON.stringify({
				total_count: 2,
				artifacts: [mockArtifact({ id: 2, name: "my-artifact" })],
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	}) as typeof fetch;

	const client = createGitHubClient({
		token: "test-token",
		repository: "owner/repo",
		fetch: mockFetch,
	});

	const artifacts = await client.listRunArtifacts({ runId: 123, name: "my-artifact" });
	assert.equal(artifacts.length, 1);
	assert.equal(artifacts[0]?.id, 2);
	assert.equal(artifacts[0]?.name, "my-artifact");
});

test("listRunArtifacts throws typed GitHubArtifactNotFoundError when no matching artifact exists", async () => {
	const mockFetch = (async () =>
		new Response(
			JSON.stringify({
				total_count: 1,
				artifacts: [mockArtifact({ id: 1, name: "other-plan" })],
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		)) as typeof fetch;

	const client = createGitHubClient({
		token: "test-token",
		repository: "owner/repo",
		fetch: mockFetch,
	});

	await assert.rejects(
		() => client.listRunArtifacts({ runId: 123, name: "network-plan" }),
		(error: unknown) => {
			assert.ok(error instanceof GitHubNotFoundError);
			assert.ok(error instanceof GitHubArtifactNotFoundError);
			assert.equal(error.name, "GitHubArtifactNotFoundError");
			assert.equal(error.runId, 123);
			assert.equal(error.artifactName, "network-plan");
			return true;
		},
	);
});

test("listRunArtifacts throws typed GitHubArtifactNotFoundError when run has zero artifacts", async () => {
	const mockFetch = (async () =>
		new Response(
			JSON.stringify({ total_count: 0, artifacts: [] }),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		)) as typeof fetch;

	const client = createGitHubClient({
		token: "test-token",
		repository: "owner/repo",
		fetch: mockFetch,
	});

	await assert.rejects(
		() => client.listRunArtifacts({ runId: 456 }),
		(error: unknown) => {
			assert.ok(error instanceof GitHubArtifactNotFoundError);
			assert.equal(error.runId, 456);
			assert.equal(error.artifactName, undefined);
			return true;
		},
	);
});

test("client throws GitHubApiError on 401 Unauthorized without leaking token", async () => {
	const token = "super-secret-key-12345";
	const mockFetch = (async () =>
		new Response(JSON.stringify({ message: "Bad credentials" }), {
			status: 401,
			statusText: "Unauthorized",
			headers: { "Content-Type": "application/json" },
		})) as typeof fetch;

	const client = createGitHubClient({
		token,
		repository: "owner/repo",
		fetch: mockFetch,
	});

	await assert.rejects(
		() => client.findWorkflowRun({ workflow: "ci.yml" }),
		(error: unknown) => {
			assert.ok(error instanceof GitHubApiError);
			assert.equal(error.status, 401);
			assert.ok(!error.message.includes(token));
			return true;
		},
	);
});

test("client throws on invalid repository format", () => {
	assert.throws(
		() => createGitHubClient({ token: "t", repository: "not-valid" }),
		/GitHub repository must use OWNER\/REPOSITORY format/,
	);
});

test("client throws on invalid runId", async () => {
	const client = createGitHubClient({ token: "t", repository: "owner/repo" });
	await assert.rejects(
		() => client.listRunArtifacts({ runId: -5 }),
		/runId must be a positive integer/,
	);
	await assert.rejects(
		() => client.listRunArtifacts({ runId: 0 }),
		/runId must be a positive integer/,
	);
	await assert.rejects(
		() => client.listRunArtifacts({ runId: 1.5 }),
		/runId must be a positive integer/,
	);
});

test("unavailableGitHubClient throws when findWorkflowRun or listRunArtifacts is called", async () => {
	const client = unavailableGitHubClient();
	await assert.rejects(
		() => client.findWorkflowRun({ workflow: "ci.yml" }),
		/GitHub client is unavailable/,
	);
	await assert.rejects(
		() => client.listRunArtifacts({ runId: 100 }),
		/GitHub client is unavailable/,
	);
});
