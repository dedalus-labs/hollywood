import { strict as assert } from "node:assert";
import { test } from "vitest";
import {
	deploymentFixture,
	head,
	merged,
	repository,
	requirement,
} from "./deployment-receipt.fixture";
import {
	admitGitHubMergePlan,
	evaluateGitHubMergePlan,
	parseGitHubMergePlan,
	type GitHubMergePlan,
} from "./merge-plan";

const plan: GitHubMergePlan = {
	repository,
	base: "main",
	candidates: [{ pull: 2, head, after: [{ pull: 1, deployment: requirement }] }],
};
const pull = (number: number, isMerged = false) => ({
	number,
	state: isMerged ? "closed" : "open",
	draft: false,
	merged: isMerged,
	merge_commit_sha: isMerged ? merged : null,
	base: { ref: "main", repo: { full_name: repository } },
	head: { sha: head, repo: { full_name: repository } },
});
const fixture = () => {
	const evidence = deploymentFixture();
	const candidate = pull(2);
	const prerequisite = pull(1, true);
	const calls: { path: string; method: string; body: unknown }[] = [];
	const responses: Record<string, unknown> = {
		"/user": { login: "merge-user", type: "User" },
		"pulls/2": candidate,
		"pulls/1": prerequisite,
		...evidence.responses,
		"pulls/2/merge-async": {
			status: "pending",
			details: { expected_head_sha: head, merge_action: "merge_queue", uuid: "request" },
		},
	};
	let mergeStatus = 202;
	const request: typeof fetch = async (input, init) => {
		const path =
			String(input) === "https://api.github.com/user"
				? "/user"
				: String(input).replace(`https://api.github.com/repos/${repository}/`, "");
		assert.equal(
			new Headers(init?.headers).get("Authorization"),
			path === "/user" || path.endsWith("merge-async") ? "Bearer writer" : "Bearer test",
		);
		assert.equal(init?.redirect, "error");
		calls.push({
			path,
			method: init?.method ?? "GET",
			body: init?.body ? JSON.parse(String(init.body)) : undefined,
		});
		assert.ok(path in responses, `unexpected request ${path}`);
		return Response.json(responses[path], {
			status: path.endsWith("merge-async") ? mergeStatus : 200,
		});
	};
	return {
		services: { token: "test", mergeToken: "writer", mergeActor: "merge-user", request },
		calls,
		responses,
		candidate,
		prerequisite,
		setMergeStatus: (value: number) => {
			mergeStatus = value;
		},
	};
};

test("a verified deployment admits the exact candidate through the native queue API", async () => {
	const f = fixture();
	const decisions = await admitGitHubMergePlan(plan, f.services);
	assert.equal(decisions[0]?.state, "ready");
	assert.deepEqual(f.calls.at(-1), {
		path: "pulls/2/merge-async",
		method: "PUT",
		body: { sha: head, merge_action: "merge_queue" },
	});
});

test("prerequisite-free candidates enter the queue", async () => {
	const f = fixture();
	await admitGitHubMergePlan({ ...plan, candidates: [{ pull: 2, head, after: [] }] }, f.services);
	assert.equal(f.calls.length, 3);
});

test("an event before merge stays outside the queue and a later event resumes intent", async () => {
	const f = fixture();
	f.prerequisite.merged = false;
	assert.equal((await admitGitHubMergePlan(plan, f.services))[0]?.state, "blocked");
	assert.equal(
		f.calls.some((call) => call.method === "PUT"),
		false,
	);
	f.prerequisite.merged = true;
	assert.equal((await admitGitHubMergePlan(plan, f.services))[0]?.state, "ready");
	f.setMergeStatus(409);
	await admitGitHubMergePlan(plan, f.services);
	f.candidate.merged = true;
	f.candidate.merge_commit_sha = merged;
	assert.equal((await admitGitHubMergePlan(plan, f.services))[0]?.state, "merged");
});

const mismatches: Record<string, (f: ReturnType<typeof fixture>) => void> = {
	"updated candidate": (f) => {
		f.candidate.head.sha = merged;
	},
	"other base": (f) => {
		f.candidate.base.ref = "release";
	},
	"fork candidate": (f) => {
		f.candidate.head.repo.full_name = "other/project";
	},
	"closed candidate": (f) => {
		f.candidate.state = "closed";
	},
	"draft candidate": (f) => {
		f.candidate.draft = true;
	},
};
for (const [name, mutate] of Object.entries(mismatches)) {
	test(`${name} cannot admit a candidate`, async () => {
		const f = fixture();
		mutate(f);
		assert.equal((await admitGitHubMergePlan(plan, f.services))[0]?.state, "blocked");
		assert.equal(
			f.calls.some((call) => call.method === "PUT"),
			false,
		);
	});
}

test("a duplicate request with different options is rejected", async () => {
	const f = fixture();
	f.setMergeStatus(409);
	f.responses["pulls/2/merge-async"] = {
		status: "pending",
		details: { expected_head_sha: merged, merge_action: "direct_merge" },
	};
	await assert.rejects(admitGitHubMergePlan(plan, f.services), /different options/);
});

test("malformed API data and transport failures fail closed", async () => {
	const f = fixture();
	f.responses["pulls/2"] = {};
	await assert.rejects(admitGitHubMergePlan(plan, f.services));
	await assert.rejects(
		admitGitHubMergePlan(plan, {
			token: "test",
			mergeToken: "writer",
			mergeActor: "merge-user",
			request: async () => new Response("denied", { status: 403 }),
		}),
		/failed: 403/,
	);
});

test("cyclic plans are rejected before any request", async () => {
	const f = fixture();
	const cyclic = {
		...plan,
		candidates: [
			{ pull: 2, head, after: [{ pull: 1 }] },
			{ pull: 1, head, after: [{ pull: 2 }] },
		],
	};
	await assert.rejects(admitGitHubMergePlan(cyclic, f.services), /cycle/);
	assert.equal(f.calls.length, 0);
	assert.throws(
		() => parseGitHubMergePlan({ ...plan, candidates: [plan.candidates[0], plan.candidates[0]] }),
		/duplicate/,
	);
});

test("deployment prerequisites cannot share an open atomic stack", async () => {
	const f = fixture();
	const stack = { number: 10, position: 2, size: 2, base: { ref: "main" } };
	f.responses["pulls/2"] = { ...f.candidate, stack };
	f.responses["pulls/1"] = { ...f.prerequisite, merged: false, stack: { ...stack, position: 1 } };
	await assert.rejects(evaluateGitHubMergePlan(plan, f.services), /split a stack/);
});

test("a PR response must match the requested identity", async () => {
	const f = fixture();
	f.candidate.number = 3;
	await assert.rejects(admitGitHubMergePlan(plan, f.services), /different PR/);
});

test("native stack admission requires the configured user principal", async () => {
	const f = fixture();
	f.responses["/user"] = { login: "other-user", type: "User" };
	await assert.rejects(admitGitHubMergePlan(plan, f.services), /another user/);
	f.responses["/user"] = { login: "merge-user", type: "Bot" };
	await assert.rejects(admitGitHubMergePlan(plan, f.services));
	assert.equal(
		f.calls.some((call) => call.method === "PUT"),
		false,
	);
});

test("pending responses must identify the exact request options", async () => {
	for (const status of [202, 409]) {
		const f = fixture();
		f.setMergeStatus(status);
		f.responses["pulls/2/merge-async"] = { status: "pending", details: { uuid: "request" } };
		await assert.rejects(admitGitHubMergePlan(plan, f.services), /different options/);
	}
});
