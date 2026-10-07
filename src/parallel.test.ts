import assert from "node:assert/strict";
import { test } from "vitest";
import { parse } from "yaml";

import { command, generateWorkflowFile, renderWorkflowFile } from "./index";
import type { GitHubParallelStep, GitHubWorkflow } from "./index";

test("parallel groups render every command before the following step", () => {
	const workflow: GitHubWorkflow = {
		name: "Parallel checks",
		on: { push: {} },
		jobs: {
			check: {
				"runs-on": "ubuntu-latest",
				steps: [
					{
						parallel: [
							{ run: command({ file: "node", args: ["lint.ts"] }) },
							{ run: command({ file: "node", args: ["test.ts", "two words"] }) },
							{ uses: "owner/check@0123456789012345678901234567890123456789" },
						],
					},
					{ run: command({ file: "node", args: ["publish.ts"] }) },
				],
			},
		},
	};
	const before = JSON.stringify(workflow);
	const file = generateWorkflowFile({
		sourcePath: "gha/parallel.ts",
		sourceRoot: "gha",
		workflowsDir: ".github/workflows",
		workflow,
	});
	const content = renderWorkflowFile(file);
	const rendered = parse(content);
	assert.deepEqual(rendered.jobs.check.steps, [
		{
			parallel: [
				{ run: "node lint.ts", shell: "bash" },
				{ run: "node test.ts 'two words'", shell: "bash" },
				{ uses: "owner/check@0123456789012345678901234567890123456789" },
			],
		},
		{ run: "node publish.ts", shell: "bash" },
	]);
	assert.equal(JSON.stringify(workflow), before);
});

test("parallel groups reject conflicting fields and nesting", () => {
	const conflicting: GitHubParallelStep = {
		parallel: [],
		// @ts-expect-error A parallel group cannot also contain a run command.
		run: command({ file: "false", args: [] }),
	};
	// @ts-expect-error GitHub does not allow nested parallel groups.
	const nested: GitHubParallelStep = { parallel: [{ parallel: [] }] };
	for (const invalid of [conflicting, nested])
		assert.throws(
			() =>
				renderWorkflowFile(
					generateWorkflowFile({
						sourcePath: "gha/invalid.ts",
						sourceRoot: "gha",
						workflowsDir: ".github/workflows",
						workflow: {
							name: "Invalid",
							on: { push: {} },
							jobs: {
								check: { "runs-on": "ubuntu-latest", steps: [invalid] },
							},
						},
					}),
				),
			/GitHub workflow YAML is invalid|parallel groups cannot be nested/,
		);
});
