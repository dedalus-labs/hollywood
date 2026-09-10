import { strict as assert } from "node:assert";
import { test, vi } from "vitest";
import {
	generateActionFile,
	generateWorkflowFile,
	renderActionFile,
	renderWorkflowFile,
} from "../src/generate";
import { runAction } from "../src/script";
import { mergePlanWorkflow, reconcileMergePlan } from "./merge-plan-workflow";

test("merge-plan workflow limits credentials to the protected main controller", () => {
	const yaml = renderWorkflowFile(
		generateWorkflowFile({
			sourcePath: "gha/merge-plan-workflow.ts",
			sourceRoot: "gha",
			workflowsDir: ".github/workflows",
			workflow: mergePlanWorkflow,
		}),
	);
	for (const field of [
		"schedule:",
		"environment: merge-plan-controller",
		"ref: main",
		"persist-credentials: false",
		"cancel-in-progress: false",
		"permission-statuses: write",
	])
		assert.ok(yaml.includes(field), field);
	assert.ok(!yaml.includes("pull_request_target"));
	assert.ok(!yaml.includes("workflow_run"));
	assert.ok(!yaml.includes("merge_group"));
	assert.ok(!yaml.includes("deployment_status"));
	const metadata = renderActionFile(
		generateActionFile(reconcileMergePlan, {
			sourcePath: "gha/merge-plan-workflow.ts",
			actionsDir: ".github/actions",
		}),
	);
	assert.ok(metadata.includes("using: node24"));
});

test("the action rejects a plan aimed at another repository before any mutation", async () => {
	vi.stubGlobal("fetch", async () =>
		Response.json({
			data: {
				repository: {
					mergeQueue: {
						entries: {
							nodes: [],
							pageInfo: { hasNextPage: false, endCursor: null },
						},
					},
				},
			},
		}),
	);
	try {
		await assert.rejects(
			runAction(reconcileMergePlan, {
				with: {
					token: "test",
					mergeToken: "writer",
					mergeActor: "merge-user",
					repository: "acme/project",
					statusPublisher: "status[bot]",
					runUrl: "https://github.com/acme/project/actions/runs/10",
				},
				fs: {
					readText: async () =>
						JSON.stringify({ repository: "other/project", base: "main", candidates: [] }),
				},
				exec: async () => {
					throw new Error("unexpected command");
				},
				runner: { uidGid: "1000:1000" },
			}),
			/reconciliation failed/,
		);
	} finally {
		vi.unstubAllGlobals();
	}
});
