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
		name: ".github/actions/dcs-bake-vm-snapshot/action.yml",
		content: `
name: dcs-bake-vm-snapshot
description: Bake a Dedalus Machine snapshot.
runs:
  using: node24
  main: dist/index.js
`,
	});

	assert.deepEqual(result, { status: "valid", errors: [] });
});

test("validateActionMetadataContent rejects invalid action metadata YAML", () => {
	const result = validateActionMetadataContent({
		name: ".github/actions/dcs-bake-vm-snapshot/action.yml",
		content: `
name: dcs-bake-vm-snapshot
description: Bake a Dedalus Machine snapshot.
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
				name: ".github/actions/dcs-bake-vm-snapshot/action.yml",
				content: "name: missing-runs\ndescription: Missing runs.",
			}),
		/GitHub action metadata YAML is invalid/,
	);
});
