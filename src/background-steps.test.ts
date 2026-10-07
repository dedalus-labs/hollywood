import assert from "node:assert/strict";
import { test } from "vitest";
import { parse } from "yaml";

import { command, expr, generateWorkflowFile, renderWorkflowFile } from "./index";
import type { GitHubWorkflowStep } from "./index";
import { validateWorkflowContent } from "./validation";

const renderSteps = (steps: readonly GitHubWorkflowStep[]): string =>
	renderWorkflowFile(
		generateWorkflowFile({
			sourcePath: "gha/parallel.ts",
			sourceRoot: "gha",
			workflowsDir: ".github/workflows",
			workflow: {
				name: "Parallel steps",
				on: { push: {} },
				jobs: { test: { "runs-on": "ubuntu-latest", steps } },
			},
		}),
	);

test("invariant_parallel_commands_keep_argument_and_environment_boundaries", () => {
	const content = renderSteps([
		{
			parallel: [
				{
					name: "Build",
					run: command({ file: "npm", args: ["run", expr("inputs.target")] }),
					env: { MODE: "test" },
					"working-directory": "web",
				},
				{ uses: "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10" },
			],
		},
	]);
	assert.deepEqual(parse(content).jobs.test.steps, [
		{
			parallel: [
				{
					name: "Build",
					run: 'npm run "$HOLLYWOOD_COMMAND_ARG_1"',
					shell: "bash",
					env: { MODE: "test", HOLLYWOOD_COMMAND_ARG_1: "${{ inputs.target }}" },
					"working-directory": "web",
				},
				{ uses: "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10" },
			],
		},
	]);
});

test("invariant_background_lifecycle_steps_preserve_native_yaml", () => {
	const steps: readonly GitHubWorkflowStep[] = [
		{ id: "server", run: command({ file: "npm", args: ["start"] }), background: true },
		{ id: "build", uses: "./.github/actions/build", background: true },
		{ id: "test", run: command({ file: "npm", args: ["test"] }), background: true },
		{ wait: "build", name: "Build complete" },
		{ wait: ["build", "test"], "continue-on-error": true },
		{ cancel: "server" },
		{ "wait-all": null },
		{ "wait-all": true },
	];
	const rendered = parse(renderSteps(steps)).jobs.test.steps;
	assert.deepEqual(rendered.slice(3), steps.slice(3));
	assert.equal(rendered[0].background, true);
	assert.equal(rendered[1].background, true);
});

for (const [name, steps, expected] of [
	["unknown_wait_target", "- wait: absent", /unknown step ID/],
	["unknown_cancel_target", "- cancel: absent", /unknown step ID/],
	["self_wait_target", "- id: self\n  wait: self", /cannot reference itself/],
	["false_wait_all", "- wait-all: false", /must be true or omitted/],
	[
		"background_inside_parallel",
		"- parallel:\n    - run: echo hi\n      background: true",
		/background.*not allowed/,
	],
	["nested_parallel", "- parallel:\n    - parallel:\n        - run: echo hi", /Nested 'parallel'/],
	[
		"wait_inside_parallel",
		"- parallel:\n    - id: build\n      run: echo hi\n    - wait: build",
		/wait.*not allowed/,
	],
	["conditional_wait", "- wait: build\n  if: always()", /Unexpected value 'if'/],
	["mixed_step_kinds", "- run: echo hi\n  wait: build", /Unexpected value/],
] as const) {
	test(`invariant_invalid_parallel_lifecycle_is_rejected_${name}`, () => {
		const content = `on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n${steps
			.split("\n")
			.map((line) => `      ${line}`)
			.join("\n")}\n`;
		const result = validateWorkflowContent({ name: "ci.yml", content });
		assert.equal(result.status, "invalid");
		assert.match(result.errors.map((error) => error.message).join("\n"), expected);
	});
}
