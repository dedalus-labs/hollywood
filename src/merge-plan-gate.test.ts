import { strict as assert } from "node:assert";
import { test } from "vitest";
import {
	deploymentFixture,
	head,
	merged,
	repository,
	requirement,
} from "./deployment-receipt.fixture";
import { reconcileGitHubMergePlan, githubMergePlanContext } from "./merge-plan-gate";
import type { GitHubMergePlan } from "./merge-plan";

const group = "c".repeat(40);
const otherHead = "d".repeat(40);
const options = {
	repository,
	base: "main",
	statusPublisher: "status[bot]",
	runUrl: "https://github.com/acme/project/actions/runs/10",
};
const plan: GitHubMergePlan = {
	repository,
	base: "main",
	candidates: [{ pull: 2, head, after: [{ pull: 1, deployment: requirement }] }],
};
const fixture = () => {
	const evidence = deploymentFixture();
	const candidate = {
		number: 2,
		state: "open",
		draft: false,
		merged: false,
		merge_commit_sha: null,
		base: { ref: "main", repo: { full_name: repository } },
		head: { sha: head, repo: { full_name: repository } },
	};
	const prerequisite = {
		...candidate,
		head: { ...candidate.head },
		number: 1,
		merged: true,
		merge_commit_sha: merged,
	};
	const entry = {
		position: 1,
		headCommit: { oid: group },
		pullRequest: { number: 2, headRefOid: head, stack: null },
	};
	const queue = {
		data: {
			repository: {
				mergeQueue: {
					entries: {
						nodes: [entry],
						pageInfo: { hasNextPage: false, endCursor: null as string | null },
					},
				},
			},
		},
	};
	const responses: Record<string, unknown> = {
		"/user": { login: "merge-user", type: "User" },
		"pulls/2": candidate,
		"pulls/1": prerequisite,
		...evidence.responses,
		"pulls/2/merge-async": {
			status: "pending",
			details: { expected_head_sha: head, merge_action: "merge_queue" },
		},
	};
	const states = new Map<string, string>();
	const receipts = new Map<string, Record<string, unknown>>();
	const writes: { path: string; body: Record<string, string> }[] = [];
	const reads: string[] = [];
	const ordinary = new Map<string | null, unknown>();
	const request: typeof fetch = async (input, init) => {
		reads.push(String(input));
		if (String(input) === "https://api.github.com/graphql") {
			assert.equal(init?.redirect, "error");
			const body = JSON.parse(String(init?.body));
			return Response.json(
				body.query.includes("pullRequests(first:100") ? ordinary.get(body.variables.after) : queue,
			);
		}
		const path =
			String(input) === "https://api.github.com/user"
				? "/user"
				: String(input).replace(`https://api.github.com/repos/${repository}/`, "");
		const statusHead = /^commits\/([a-f0-9]{40})\/status/.exec(path)?.[1];
		if (statusHead !== undefined)
			return Response.json({
				statuses: receipts.has(statusHead) ? [receipts.get(statusHead)] : [],
			});
		if (init?.method !== "GET") {
			const body = JSON.parse(String(init?.body));
			writes.push({ path, body });
			if (path.startsWith("statuses/")) {
				states.set(path.slice(9), body.state);
				const receipt = { ...body, creator: { login: options.statusPublisher } };
				receipts.set(path.slice(9), receipt);
				return Response.json(receipt);
			}
		}
		assert.ok(path in responses, path);
		return Response.json(responses[path]);
	};
	return {
		services: { token: "test", mergeToken: "writer", mergeActor: "merge-user", request },
		candidate,
		prerequisite,
		status: evidence.status,
		queue,
		states,
		receipts,
		writes,
		responses,
		reads,
		ordinary,
	};
};

test("deployment events invalidate both PR and queued group receipts after rollback", async () => {
	const f = fixture();
	await reconcileGitHubMergePlan(async () => plan, f.services, options);
	assert.equal(f.states.get(head), "success");
	assert.equal(f.states.get(group), "success");
	f.status.state = "inactive";
	await reconcileGitHubMergePlan(async () => plan, f.services, options);
	assert.equal(f.states.get(head), "failure");
	assert.equal(f.states.get(group), "failure");
	const writes = f.writes.length;
	await reconcileGitHubMergePlan(async () => plan, f.services, options);
	assert.equal(f.writes.length, writes);
});

test("pending intent resumes when a prerequisite merges and deploys", async () => {
	const f = fixture();
	f.queue.data.repository.mergeQueue.entries.nodes = [];
	f.prerequisite.merged = false;
	await reconcileGitHubMergePlan(async () => plan, f.services, options);
	assert.equal(f.states.get(head), "failure");
	assert.equal(
		f.writes.some((write) => write.path.endsWith("merge-async")),
		false,
	);
	f.prerequisite.merged = true;
	await reconcileGitHubMergePlan(async () => plan, f.services, options);
	assert.equal(f.states.get(head), "success");
	assert.equal(f.writes.at(-1)?.path, "pulls/2/merge-async");
});

test("a waiting downstream candidate cannot deadlock an earlier queue group", async () => {
	const f = fixture();
	f.prerequisite.merged = false;
	f.queue.data.repository.mergeQueue.entries.nodes = [
		{
			position: 1,
			headCommit: { oid: group },
			pullRequest: { number: 3, headRefOid: otherHead, stack: null },
		},
	];
	await reconcileGitHubMergePlan(async () => plan, f.services, options);
	assert.equal(f.states.get(group), "success");
	assert.equal(f.states.get(head), "failure");
});

test("updated heads and malformed evidence cannot retain green queue checks", async () => {
	const f = fixture();
	await reconcileGitHubMergePlan(async () => plan, f.services, options);
	f.candidate.head.sha = otherHead;
	await reconcileGitHubMergePlan(async () => plan, f.services, options);
	assert.equal(f.states.get(group), "failure");
	f.responses["pulls/1"] = {};
	await assert.rejects(
		reconcileGitHubMergePlan(async () => plan, f.services, options),
		/reconciliation failed/,
	);
	assert.equal(f.states.get(group), "error");
});

test("invalid plan source invalidates the live queue", async () => {
	const f = fixture();
	await reconcileGitHubMergePlan(async () => plan, f.services, options);
	await assert.rejects(
		reconcileGitHubMergePlan(async () => "{broken", f.services, options),
		/reconciliation failed/,
	);
	assert.equal(f.states.get(group), "error");
});

test("deployment reconciliation does not enumerate ordinary PRs", async () => {
	const f = fixture();
	await reconcileGitHubMergePlan(async () => plan, f.services, options);
	assert.equal(f.reads.filter((url) => url.endsWith("graphql")).length, 1);
	assert.equal(
		f.reads.some((url) => url.includes("pulls?")),
		false,
	);
});

test("another publisher cannot suppress our required failure status", async () => {
	const f = fixture();
	await reconcileGitHubMergePlan(async () => plan, f.services, options);
	f.status.state = "failure";
	f.receipts.set(head, {
		context: githubMergePlanContext,
		state: "failure",
		creator: { login: "other[bot]" },
	});
	const before = f.writes.length;
	await reconcileGitHubMergePlan(async () => plan, f.services, options);
	const write = f.writes.slice(before).find((item) => item.path === `statuses/${head}`);
	assert.equal(write?.body["state"], "failure");
	assert.equal(write?.body["target_url"], options.runUrl);
});

test("status publication and admission consume one decision snapshot", async () => {
	const f = fixture();
	let reads = 0;
	const request: typeof fetch = async (url, init) => {
		if (String(url).includes("deployments/5/statuses")) {
			reads += 1;
			if (reads > 1) f.status.state = "inactive";
		}
		return f.services.request(url, init);
	};
	await reconcileGitHubMergePlan(async () => plan, { ...f.services, request }, options);
	assert.equal(reads, 1);
	assert.equal(f.states.get(group), "success");
	assert.ok(f.writes.some((write) => write.path.endsWith("merge-async")));
});
