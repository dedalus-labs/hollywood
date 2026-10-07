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

test("parallel commands preserve argument quoting and environment", () => {
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

test("background controls preserve every generated step", () => {
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
	assert.deepEqual(parse(renderSteps(steps)).jobs.test.steps, [
		{ id: "server", run: "npm start", shell: "bash", background: true },
		{ id: "build", uses: "./.github/actions/build", background: true },
		{ id: "test", run: "npm test", shell: "bash", background: true },
		{ wait: "build", name: "Build complete" },
		{ wait: ["build", "test"], "continue-on-error": true },
		{ cancel: "server" },
		{ "wait-all": null },
		{ "wait-all": true },
	]);
});

for (const [name, steps, expected] of [
	["unknown wait target", "- wait: absent", /unknown step ID/],
	["unknown cancel target", "- cancel: absent", /unknown step ID/],
	[
		"self wait target",
		`- id: self
  wait: self`,
		/cannot reference itself/,
	],
	["false wait all", "- wait-all: false", /must be true or omitted/],
	[
		"background inside parallel",
		`- parallel:
    - run: echo hi
      background: true`,
		/background.*not allowed/,
	],
	[
		"nested parallel",
		`- parallel:
    - parallel:
        - run: echo hi`,
		/Nested 'parallel'/,
	],
	[
		"wait inside parallel",
		`- parallel:
    - id: build
      run: echo hi
    - wait: build`,
		/wait.*not allowed/,
	],
	[
		"conditional wait",
		`- wait: build
  if: always()`,
		/Unexpected value 'if'/,
	],
	[
		"mixed step kinds",
		`- run: echo hi
  wait: build`,
		/Unexpected value/,
	],
] as const) {
	test(`background validation rejects ${name}`, () => {
		const content = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
${steps
	.split("\n")
	.map((line) => `      ${line}`)
	.join("\n")}
`;
		const result = validateWorkflowContent({ name: "ci.yml", content });
		assert.equal(result.status, "invalid");
		assert.match(result.errors.map((error) => error.message).join("\n"), expected);
	});
}
