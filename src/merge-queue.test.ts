import { strict as assert } from "node:assert";
import { test } from "vitest";
import { readGitHubMergeQueue } from "./merge-queue";

const plan = { repository: "acme/project", base: "main", candidates: [] };
const entry = (number: number) => ({
	position: number,
	headCommit: { oid: String(number).repeat(40) },
	pullRequest: { number, headRefOid: "a".repeat(40), stack: { number: 8 } },
});
const page = (nodes: unknown[], hasNextPage = false, endCursor: string | null = null) => ({
	data: {
		repository: { mergeQueue: { entries: { nodes, pageInfo: { hasNextPage, endCursor } } } },
	},
});

test("queue reads preserve exact group heads across pages", async () => {
	const cursors: unknown[] = [];
	const request: typeof fetch = async (url, init) => {
		assert.equal(String(url), "https://api.github.com/graphql");
		assert.equal(new Headers(init?.headers).get("authorization"), "Bearer reader");
		assert.equal(init?.redirect, "error");
		const { variables } = JSON.parse(String(init?.body));
		assert.equal(variables.owner, "acme");
		assert.equal(variables.name, "project");
		assert.equal(variables.branch, "main");
		cursors.push(variables.after);
		return Response.json(
			variables.after === null ? page([entry(1)], true, "next") : page([entry(2)]),
		);
	};
	assert.deepEqual(await readGitHubMergeQueue(plan, { token: "reader", request }), [
		entry(1),
		entry(2),
	]);
	assert.deepEqual(cursors, [null, "next"]);
});

test("missing queues, GraphQL errors and invalid pagination fail closed", async () => {
	for (const result of [
		{ data: { repository: { mergeQueue: null } } },
		{ ...page([]), errors: [{ message: "permission denied" }] },
		page([], true, null),
	]) {
		await assert.rejects(
			readGitHubMergeQueue(plan, { token: "reader", request: async () => Response.json(result) }),
		);
	}
});
