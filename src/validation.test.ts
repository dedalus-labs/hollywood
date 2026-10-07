import * as assert from "node:assert/strict";
import { test } from "vitest";

import {
	assertValidActionMetadataContent,
	assertValidWorkflowContent,
	validateActionMetadataContent,
	validateWorkflowContent,
} from "./validation";

test("validateWorkflowContent accepts GitHub workflow YAML", () => {
	const result = validateWorkflowContent({
		name: ".github/workflows/ci.yml",
		content: `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
`,
	});

	assert.deepEqual(result, { status: "valid", errors: [] });
});

for (const [name, steps] of [
	[
		"command",
		`- run: npm test
  env: \${{ fromJSON(vars.ENV) }}`,
	],
	[
		"action",
		`- uses: ./test
  env: \${{ fromJSON(vars.ENV) }}`,
	],
	[
		"background_command",
		`- id: test
  run: npm test
  env: \${{ fromJSON(vars.ENV) }}
  background: true
- wait: test`,
	],
	[
		"background_action",
		`- id: test
  uses: ./test
  env: \${{ fromJSON(vars.ENV) }}
  background: true
- wait: test`,
	],
	[
		"parallel_children",
		`- parallel:
    - run: npm test
      env: \${{ fromJSON(vars.ENV) }}
    - uses: ./test
      env: \${{ fromJSON(vars.ENV) }}`,
	],
] as const) {
	test(`invariant_step_environment_expressions_remain_valid_${name}`, () => {
		const result = validateWorkflowContent({
			name: ".github/workflows/ci.yml",
			content: `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
${steps
				.split("\n")
				.map((line) => `      ${line}`)
				.join("\n")}
`,
		});

		assert.deepEqual(result, { status: "valid", errors: [] });
	});
}

test("invariant_environment_expressions_preserve_step_semantic_checks", () => {
	const result = validateWorkflowContent({
		name: ".github/workflows/ci.yml",
		content: `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - parallel:
          - run: npm test
            env: \${{ fromJSON(vars.ENV) }}
            background: true
`,
	});

	assert.equal(result.status, "invalid");
	assert.match(result.errors[0].message, /'background' is not allowed inside a parallel block/);
});

test("invariant_invalid_environment_expressions_are_rejected", () => {
	const result = validateWorkflowContent({
		name: ".github/workflows/ci.yml",
		content: `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
        env: \${{ fromJSON(unrelated.ENV) }}
`,
	});

	assert.equal(result.status, "invalid");
	assert.match(result.errors[0].message, /Unrecognized named-value: 'unrelated'/);
});

test("validateWorkflowContent rejects invalid GitHub workflow YAML", () => {
	const result = validateWorkflowContent({
		name: ".github/workflows/ci.yml",
		content: `
name: Missing trigger and runner
jobs:
  test:
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
`,
	});

	assert.equal(result.status, "invalid");
	assert.match(result.errors[0].message, /Required property is missing/);
});

test("assertValidWorkflowContent fails closed on invalid workflow YAML", () => {
	assert.throws(
		() =>
			assertValidWorkflowContent({
				name: ".github/workflows/ci.yml",
				content: "jobs: {}",
			}),
		/GitHub workflow YAML is invalid/,
	);
});

test("validateActionMetadataContent accepts GitHub action metadata YAML", () => {
	const result = validateActionMetadataContent({
		name: ".github/actions/publish-container-image/action.yml",
		content: `
name: publish-container-image
description: Build and publish a container image.
runs:
  using: node24
  main: dist/index.js
`,
	});

	assert.deepEqual(result, { status: "valid", errors: [] });
});

test("validateActionMetadataContent rejects invalid action metadata YAML", () => {
	const result = validateActionMetadataContent({
		name: ".github/actions/publish-container-image/action.yml",
		content: `
name: publish-container-image
description: Build and publish a container image.
runs:
  using: node99
  main: dist/index.js
`,
	});

	assert.equal(result.status, "invalid");
	assert.match(result.errors[0].message, /Unexpected value 'node99'/);
});

test("assertValidActionMetadataContent fails closed on invalid action metadata YAML", () => {
	assert.throws(
		() =>
			assertValidActionMetadataContent({
				name: ".github/actions/publish-container-image/action.yml",
				content: "name: missing-runs\ndescription: Missing runs.",
			}),
		/GitHub action metadata YAML is invalid/,
	);
});
