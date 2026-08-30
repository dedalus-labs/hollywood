import * as assert from "node:assert/strict";
import { test } from "vitest";

import {
	assertPinnedActions,
	findUnpinnedActions,
	isPinnedActionReference,
	parseActionReference,
	validateActionPinning,
} from "./action-pinning";

const sha = "df4cb1c069e1874edd31b4311f1884172cec0e10";
const digest = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const workflow = (...steps: readonly string[]): string =>
	[
		"name: CI",
		"on: push",
		"jobs:",
		"  test:",
		"    runs-on: ubuntu-latest",
		"    steps:",
		...steps,
		"",
	].join("\n");

const pinned = (uses: string): boolean => isPinnedActionReference(parseActionReference(uses));

test("parseActionReference reads a third-party action", () => {
	assert.deepEqual(parseActionReference(`actions/checkout@${sha}`), {
		kind: "repository",
		owner: "actions",
		repo: "checkout",
		ref: sha,
	});
});

test("parseActionReference reads an action in a repository subdirectory", () => {
	assert.deepEqual(parseActionReference(`owner/repo/tools/lint@${sha}`), {
		kind: "repository",
		owner: "owner",
		repo: "repo",
		path: "tools/lint",
		ref: sha,
	});
});

test("parseActionReference reads a local action path", () => {
	assert.deepEqual(parseActionReference("./.github/actions/hello"), {
		kind: "local",
		path: "./.github/actions/hello",
	});
});

test("parseActionReference reads a container action digest", () => {
	assert.deepEqual(parseActionReference(`docker://ghcr.io/acme/tool@${digest}`), {
		kind: "docker",
		image: "ghcr.io/acme/tool",
		digest,
	});
});

test("parseActionReference reads a workflow expression", () => {
	assert.deepEqual(parseActionReference("${{ matrix.action }}"), {
		kind: "expression",
		value: "${{ matrix.action }}",
	});
});

test("action references pinned to a commit SHA are accepted", () => {
	assert.ok(pinned(`actions/checkout@${sha}`));
	assert.ok(pinned(`owner/repo/tools/lint@${sha}`));
	assert.ok(pinned(`owner/repo/.github/workflows/release.yml@${sha}`));
	assert.ok(pinned(`actions/checkout@${sha.repeat(2).slice(0, 64)}`));
});

test("local action references are always accepted", () => {
	assert.ok(pinned("./.github/actions/hello"));
	assert.ok(pinned("./.github/workflows/reusable.yml"));
});

test("container action references pinned to a digest are accepted", () => {
	assert.ok(pinned(`docker://ghcr.io/acme/tool@${digest}`));
	assert.ok(pinned(`docker://alpine@${digest}`));
});

test("mutable action references are rejected", () => {
	assert.ok(!pinned("actions/checkout@v4"));
	assert.ok(!pinned("actions/checkout@main"));
	assert.ok(!pinned("actions/checkout@v4.1.2"));
	assert.ok(!pinned("actions/checkout@refs/tags/v1"));
	assert.ok(!pinned(`actions/checkout@${sha.slice(0, 7)}`));
	assert.ok(!pinned(`actions/checkout@${sha.slice(0, 39)}`));
	assert.ok(!pinned(`actions/checkout@${sha}0`));
});

test("action references without a ref are rejected", () => {
	assert.ok(!pinned("actions/checkout"));
	assert.ok(!pinned("actions/checkout@"));
});

test("container action references without a digest are rejected", () => {
	assert.ok(!pinned("docker://alpine:3.19"));
	assert.ok(!pinned("docker://alpine"));
	assert.ok(!pinned("docker://alpine@latest"));
});

test("unparsable action references are rejected", () => {
	assert.ok(!pinned(""));
	assert.ok(!pinned("checkout"));
	assert.ok(!pinned("${{ matrix.action }}"));
});

test("findUnpinnedActions reports the reason and line for each finding", () => {
	const findings = findUnpinnedActions({
		name: ".github/workflows/ci.yml",
		content: workflow(
			"      - uses: actions/checkout@v4",
			`      - uses: actions/setup-node@${sha}`,
			"      - uses: docker://alpine:3.19",
		),
	});

	assert.deepEqual(
		findings.map((finding) => [finding.line, finding.reason, finding.uses]),
		[
			[7, "mutable-ref", "actions/checkout@v4"],
			[9, "mutable-image", "docker://alpine:3.19"],
		],
	);
});

test("findUnpinnedActions ignores commented workflow steps", () => {
	const findings = findUnpinnedActions({
		name: ".github/workflows/ci.yml",
		content: workflow(
			"      # - uses: actions/checkout@v4",
			`      - uses: actions/checkout@${sha}`,
		),
	});

	assert.deepEqual(findings, []);
});

test("findUnpinnedActions ignores an action input named uses", () => {
	const findings = findUnpinnedActions({
		name: ".github/workflows/ci.yml",
		content: workflow(
			`      - uses: ./.github/actions/hello`,
			"        with:",
			"          uses: actions/checkout@v4",
		),
	});

	assert.deepEqual(findings, []);
});

test("findUnpinnedActions reads reusable workflow jobs", () => {
	const findings = findUnpinnedActions({
		name: ".github/workflows/ci.yml",
		content: [
			"name: CI",
			"on: push",
			"jobs:",
			"  release:",
			"    uses: owner/repo/.github/workflows/release.yml@v1",
			"",
		].join("\n"),
	});

	assert.deepEqual(
		findings.map((finding) => finding.reason),
		["mutable-ref"],
	);
});

test("findUnpinnedActions returns no findings for malformed YAML", () => {
	assert.deepEqual(
		findUnpinnedActions({ name: ".github/workflows/ci.yml", content: "jobs: [\n  - :" }),
		[],
	);
});

test("findUnpinnedActions reads quoted action references in TypeScript sources", () => {
	const findings = findUnpinnedActions({
		name: "gha/ci.ts",
		content: [
			"export const workflow = {",
			`	steps: [`,
			`		{ uses: "actions/checkout@${sha}" },`,
			`		{ uses: "actions/setup-node@v6" },`,
			`		{ uses: "./.github/actions/hello" },`,
			`		// { uses: "actions/stale@v9" },`,
			"	],",
			"};",
			"",
		].join("\n"),
	});

	assert.deepEqual(
		findings.map((finding) => finding.uses),
		["actions/setup-node@v6"],
	);
});

test("findUnpinnedActions exempts references matching an allow pattern", () => {
	const file = {
		name: ".github/workflows/ci.yml",
		content: workflow("      - uses: my-org/my-action@v1", "      - uses: docker://alpine:3.19"),
	};

	assert.deepEqual(findUnpinnedActions(file, { allowUnpinned: ["my-org/*", "docker://alpine"] }), []);
	assert.equal(findUnpinnedActions(file, { allowUnpinned: ["other-org/*"] }).length, 2);
});

test("validateActionPinning reports unpinned references as validation errors", () => {
	const result = validateActionPinning({
		name: ".github/workflows/ci.yml",
		content: workflow("      - uses: actions/checkout@v4"),
	});

	assert.equal(result.status, "invalid");
	assert.match(
		result.errors[0].message,
		/\.github\/workflows\/ci\.yml:7: action reference is not pinned to a commit SHA: actions\/checkout@v4/,
	);
});

test("validateActionPinning accepts a fully pinned workflow", () => {
	const result = validateActionPinning({
		name: ".github/workflows/ci.yml",
		content: workflow(`      - uses: actions/checkout@${sha}`, "      - uses: ./.github/actions/hello"),
	});

	assert.deepEqual(result, { status: "valid", errors: [] });
});

test("assertPinnedActions fails closed on an unpinned action reference", () => {
	assert.throws(
		() =>
			assertPinnedActions({
				name: ".github/workflows/ci.yml",
				content: workflow("      - uses: actions/checkout@v4"),
			}),
		/GitHub action references are not pinned/,
	);
});
