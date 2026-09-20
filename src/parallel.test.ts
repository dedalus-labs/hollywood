import assert from "node:assert/strict";
import { build } from "esbuild";
import { test } from "vitest";
import { parse } from "yaml";

import {
	command,
	generateWorkflowFile,
	renderWorkflowFile,
	type GitHubParallelStep,
	type GitHubWorkflow,
} from "./index";

test("parallel groups render every command before the following step", async () => {
	const workflow: GitHubWorkflow = {
		name: "Parallel checks",
		on: { push: {} },
		jobs: {
			check: {
				"runs-on": "ubuntu-latest",
				steps: [
					{
						parallel: [
							{ run: command({ file: "node", args: ["lint.mjs"] }) },
							{ run: command({ file: "node", args: ["test.mjs", "two words"] }) },
							{ uses: "owner/check@0123456789012345678901234567890123456789" },
						],
					},
					{ run: command({ file: "node", args: ["publish.mjs"] }) },
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
				{ run: "node lint.mjs", shell: "bash" },
				{ run: "node test.mjs 'two words'", shell: "bash" },
				{ uses: "owner/check@0123456789012345678901234567890123456789" },
			],
		},
		{ run: "node publish.mjs", shell: "bash" },
	]);
	assert.equal(JSON.stringify(workflow), before);
	// Bundle the upstream parser's JSON imports as Hollywood's build does.
	const semantic = await build({
		stdin: {
			resolveDir: process.cwd(),
			contents: `
			import assert from 'node:assert/strict';
			import {parseWorkflow, convertWorkflowTemplate, NoOperationTraceWriter} from '@actions/workflow-parser';
			import {FeatureFlags} from '@actions/expressions/features';
			const parsed = parseWorkflow(${JSON.stringify({ name: file.path, content })}, new NoOperationTraceWriter());
			const model = await convertWorkflowTemplate(parsed.context, parsed.value, undefined, {
				featureFlags: new FeatureFlags({allowBackgroundSteps: true})
			});
			assert.equal(model.errors, undefined);
		`,
		},
		bundle: true,
		platform: "node",
		format: "esm",
		write: false,
		banner: {
			js: "import {createRequire} from 'node:module'; const require = createRequire(process.cwd() + '/package.json');",
		},
	});
	assert.ok(semantic.outputFiles[0]);
	await import(
		`data:text/javascript;base64,${Buffer.from(semantic.outputFiles[0].text).toString("base64")}`
	);
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
