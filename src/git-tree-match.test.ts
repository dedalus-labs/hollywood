import * as assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "vitest";

import type { ScriptExec } from "./script";
import { gitTreeMatch } from "./git-tree-match";

const mockExec = (
	commands: Map<string, { exitCode: number; stdout: string; stderr: string }>,
): ScriptExec => {
	return async (file, args) => {
		const key = `${file} ${args.join(" ")}`;
		const result = commands.get(key);
		if (result === undefined) {
			throw new Error(`unexpected command: ${key}`);
		}
		return result;
	};
};

const mockFetch = (
	handlers: Map<string, { status: number; body: unknown }>,
): typeof fetch => {
	return async (url: string | URL | Request) => {
		const urlString = url.toString();
		const handler = handlers.get(urlString);
		if (handler === undefined) {
			return new Response("not found", { status: 404 });
		}
		return new Response(JSON.stringify(handler.body), {
			status: handler.status,
			headers: { "Content-Type": "application/json" },
		});
	};
};

const baseExec = mockExec(
	new Map([
		[
			"git rev-parse HEAD:packages/typescript/databases/core/supabase/migrations",
			{ exitCode: 0, stdout: "abc123def456\n", stderr: "" },
		],
	]),
);

const baseFetch = mockFetch(
	new Map([
		[
			"https://api.github.com/repos/owner/repo/actions/runs?branch=main&per_page=10",
			{
				status: 200,
				body: {
					workflow_runs: [
						{
							id: 1,
							html_url: "https://github.com/owner/repo/actions/runs/1",
							conclusion: "success",
							created_at: "2025-01-01T00:00:00Z",
							head_sha: "sha111",
							name: "DB CD",
							status: "completed",
						},
						{
							id: 2,
							html_url: "https://github.com/owner/repo/actions/runs/2",
							conclusion: "success",
							created_at: "2025-01-02T00:00:00Z",
							head_sha: "sha222",
							name: "CI",
							status: "completed",
						},
					],
				},
			},
		],
		[
			"https://api.github.com/repos/owner/repo/git/trees/sha111?recursive=1",
			{
				status: 200,
				body: {
					sha: "tree1",
					tree: [
						{ path: "packages/typescript/databases/core/supabase/migrations", sha: "aaa111", type: "tree" },
					],
				},
			},
		],
		[
			"https://api.github.com/repos/owner/repo/git/trees/sha222?recursive=1",
			{
				status: 200,
				body: {
					sha: "tree2",
					tree: [
						{ path: "packages/typescript/databases/core/supabase/migrations", sha: "bbb222", type: "tree" },
					],
				},
			},
		],
	]),
);

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
	originalFetch = globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

test("gitTreeMatch returns found when tree hash matches a prior run", async () => {
	globalThis.fetch = baseFetch;

	const exec = mockExec(
		new Map([
			[
				"git rev-parse HEAD:packages/typescript/databases/core/supabase/migrations",
				{ exitCode: 0, stdout: "aaa111\n", stderr: "" },
			],
		]),
	);

	const result = await gitTreeMatch({
		path: "packages/typescript/databases/core/supabase/migrations",
		workflow: "DB CD",
		branch: "main",
		repository: "owner/repo",
		limit: 10,
		exec,
	});

	assert.equal(result.found, true);
	assert.equal(result.run.id, 1);
	assert.equal(result.run.name, "DB CD");
});

test("gitTreeMatch returns not found when tree hash differs from all runs", async () => {
	globalThis.fetch = baseFetch;

	const result = await gitTreeMatch({
		path: "packages/typescript/databases/core/supabase/migrations",
		workflow: "DB CD",
		branch: "main",
		repository: "owner/repo",
		limit: 10,
		exec: baseExec,
	});

	assert.equal(result.found, false);
	assert.ok(result.reason.includes("abc123def456"));
	assert.ok(result.reason.includes("DB CD"));
});

test("gitTreeMatch filters by workflow name", async () => {
	globalThis.fetch = baseFetch;

	const result = await gitTreeMatch({
		path: "packages/typescript/databases/core/supabase/migrations",
		workflow: "CI",
		branch: "main",
		repository: "owner/repo",
		limit: 10,
		exec: baseExec,
	});

	assert.equal(result.found, false);
	assert.ok(result.reason.includes("1 recent successful runs"));
});

test("gitTreeMatch skips non-successful runs", async () => {
	globalThis.fetch = baseFetch;

	const fetchWithFailed = mockFetch(
		new Map([
			[
				"https://api.github.com/repos/owner/repo/actions/runs?branch=main&per_page=10",
				{
					status: 200,
					body: {
						workflow_runs: [
							{
								id: 3,
								html_url: "https://github.com/owner/repo/actions/runs/3",
								conclusion: "failure",
								created_at: "2025-01-03T00:00:00Z",
								head_sha: "sha333",
								name: "DB CD",
								status: "completed",
							},
						],
					},
				},
			],
		]),
	);

	globalThis.fetch = fetchWithFailed;

	const result = await gitTreeMatch({
		path: "packages/typescript/databases/core/supabase/migrations",
		workflow: "DB CD",
		branch: "main",
		repository: "owner/repo",
		limit: 10,
		exec: baseExec,
	});

	assert.equal(result.found, false);
});

test("gitTreeMatch throws on invalid repository format", async () => {
	globalThis.fetch = baseFetch;

	await assert.rejects(
		() =>
			gitTreeMatch({
				path: "migrations",
				workflow: "DB CD",
				branch: "main",
				repository: "invalid",
				limit: 10,
				exec: baseExec,
			}),
		/repository must be owner\/name/,
	);
});

test("gitTreeMatch throws when git rev-parse fails", async () => {
	globalThis.fetch = baseFetch;

	const exec = mockExec(
		new Map([
			[
				"git rev-parse HEAD:packages/typescript/databases/core/supabase/migrations",
				{ exitCode: 128, stdout: "", stderr: "fatal: path 'migrations' does not exist\n" },
			],
		]),
	);

	await assert.rejects(
		() =>
			gitTreeMatch({
				path: "packages/typescript/databases/core/supabase/migrations",
				workflow: "DB CD",
				branch: "main",
				repository: "owner/repo",
				limit: 10,
				exec,
			}),
		/git rev-parse HEAD:.* failed/,
	);
});

test("gitTreeMatch passes token to GitHub API", async () => {
	globalThis.fetch = baseFetch;

	const exec = mockExec(
		new Map([
			[
				"git rev-parse HEAD:packages/typescript/databases/core/supabase/migrations",
				{ exitCode: 0, stdout: "aaa111\n", stderr: "" },
			],
		]),
	);

	let capturedUrl = "";
	const captureFetch: typeof fetch = async (url: string | URL | Request) => {
		capturedUrl = url.toString();
		return new Response(JSON.stringify({ workflow_runs: [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	};

	globalThis.fetch = captureFetch;

	await gitTreeMatch({
		path: "packages/typescript/databases/core/supabase/migrations",
		workflow: "DB CD",
		branch: "main",
		repository: "owner/repo",
		limit: 10,
		exec,
		token: "ghp_testtoken123",
	});

	assert.ok(capturedUrl.includes("api.github.com"));
});

test("gitTreeMatch respects the limit parameter", async () => {
	globalThis.fetch = baseFetch;

	let capturedUrl = "";
	const captureFetch: typeof fetch = async (url: string | URL | Request) => {
		capturedUrl = url.toString();
		return new Response(JSON.stringify({ workflow_runs: [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	};

	globalThis.fetch = captureFetch;

	await gitTreeMatch({
		path: "packages/typescript/databases/core/supabase/migrations",
		workflow: "DB CD",
		branch: "main",
		repository: "owner/repo",
		limit: 5,
		exec: baseExec,
	});

	assert.ok(capturedUrl.includes("per_page=5"));
});

test("gitTreeMatch handles tree entry not found in GitHub tree response", async () => {
	globalThis.fetch = baseFetch;

	const fetchNoEntry = mockFetch(
		new Map([
			[
				"https://api.github.com/repos/owner/repo/actions/runs?branch=main&per_page=10",
				{
					status: 200,
					body: {
						workflow_runs: [
							{
								id: 4,
								html_url: "https://github.com/owner/repo/actions/runs/4",
								conclusion: "success",
								created_at: "2025-01-04T00:00:00Z",
								head_sha: "sha444",
								name: "DB CD",
								status: "completed",
							},
						],
					},
				},
			],
			[
				"https://api.github.com/repos/owner/repo/git/trees/sha444?recursive=1",
				{
					status: 200,
					body: {
						sha: "tree3",
						tree: [
							{ path: "other/path", sha: "xyz789", type: "blob" },
						],
					},
				},
			],
		]),
	);

	globalThis.fetch = fetchNoEntry;

	const result = await gitTreeMatch({
		path: "packages/typescript/databases/core/supabase/migrations",
		workflow: "DB CD",
		branch: "main",
		repository: "owner/repo",
		limit: 10,
		exec: baseExec,
	});

	assert.equal(result.found, false);
});
