import assert from "node:assert/strict";
import { test } from "vitest";

import { runAction, type CommandResult, type ScriptExec } from "../src/index";
import { flowers, leaveFlower } from "./flowers";

const result = (stdout: string): CommandResult => ({ exitCode: 0, stderr: "", stdout });
const workflowRun = (headSha: string, name: string, path: string, number: number) => ({
	event: "push",
	head_sha: headSha,
	html_url: `https://github.test/actions/runs/${number}`,
	name,
	path,
	run_number: number,
});

test("post-merge comments link only deployment runs", async () => {
	const mergeSha = "a".repeat(40);
	const calls: string[][] = [];
	const exec: ScriptExec = async (_command, args) => {
		calls.push([...args]);
		const endpoint = args[1] ?? "";
		if (endpoint.endsWith(`/commits/${mergeSha}/pulls`)) {
			return result(JSON.stringify([[{ merged_at: "2026-08-25T14:30:00Z", number: 92 }]]));
		}
		if (endpoint.endsWith("/actions/runs")) {
			return result(
				JSON.stringify([
					{
						total_count: 3,
						workflow_runs: [
							workflowRun(mergeSha, "Docs", ".github/workflows/docs.yml", 30),
							workflowRun(
								mergeSha,
								"Publish release",
								".github/workflows/publish-npm.yml",
								20,
							),
							workflowRun(mergeSha, "Release", ".github/workflows/release.yml", 10),
						],
					},
				]),
			);
		}
		if (endpoint.endsWith("/issues/92/comments")) return result("[]");
		if (args.includes("POST")) return result("");
		throw new Error(`unexpected gh api call: ${args.join(" ")}`);
	};

	await runAction(leaveFlower, {
		exec,
		fs: { readText: async () => JSON.stringify({ after: mergeSha, commits: [] }) },
		runner: { uidGid: "1001:1001" },
		with: { eventPath: "event.json", repository: "dedalus-labs/hollywood", token: "token" },
	});

	const bodies = calls.flat().filter((argument) => argument.startsWith("body="));
	assert.equal(bodies[0], "body=Here's a flower for all your hard work! 🌸");
	const deploymentBody = bodies[1] ?? "";
	assert.match(deploymentBody, /### Deployments triggered by this merge/);
	assert.match(deploymentBody, /Docs.*#30/);
	assert.match(deploymentBody, /Publish release.*#20/);
	assert.doesNotMatch(deploymentBody, /\| Release \|/);
	assert.ok(calls.some((args) => args.includes(`head_sha=${mergeSha}`)));
});

test("post-merge workflow uses the native GitHub Actions token", () => {
	assert.deepEqual(flowers.permissions, {
		actions: "read",
		contents: "read",
		issues: "write",
		"pull-requests": "read",
	});
	const steps = flowers.jobs["leave-flower"].steps;
	assert.ok(!steps.some((step) => "name" in step && step.name?.includes("Cind")));
	assert.ok(
		steps.some(
			(step) =>
				"uses" in step &&
				step.uses === "./.github/actions/leave-flower" &&
				step.with?.["token"] === "${{ github.token }}",
		),
	);
});
