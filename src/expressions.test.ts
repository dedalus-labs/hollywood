import * as assert from "node:assert/strict";
import { test } from "vitest";

import { gh as subpathGh } from "@dedalus/hollywood/expr";

import {
	always,
	and,
	contains,
	defineMatrix,
	eq,
	envVar,
	expr,
	format,
	gh,
	github,
	GitHubJobResult,
	hashFiles,
	input,
	matrix,
	ne,
	needsOutput,
	needsResult,
	needsResultIn,
	needsResultIs,
	not,
	or,
	runner,
	selectString,
	secret,
	stepOutput,
	success,
	valueOr,
	type GitHubExpression,
} from "./expressions";

test("expr validates raw GitHub expression syntax", () => {
	assert.equal(
		expr("format('{0}-{1}', github.workflow, github.ref)"),
		"${{ format('{0}-{1}', github.workflow, github.ref) }}",
	);
	assert.throws(() => expr("github.workflow + '-' + github.ref"), /invalid GitHub expression/);
});

test("typed context helpers generate expressions without stringly property access", () => {
	assert.equal(
		format("{0}-{1}", gh.github.workflow, gh.github.ref),
		"${{ format('{0}-{1}', github.workflow, github.ref) }}",
	);
	assert.equal(gh.runner.os, "${{ runner.os }}");
	assert.equal(github.repositoryOwner, "${{ github.repository_owner }}");
	assert.equal(github.token, "${{ github.token }}");
	assert.equal(eq(github.eventName, "push"), "${{ github.event_name == 'push' }}");
	assert.equal(
		ne(github.repository, "dedalus-labs/dedalus-sandbox"),
		"${{ github.repository != 'dedalus-labs/dedalus-sandbox' }}",
	);
	assert.equal(and(success(), eq(runner.os, "Linux")), "${{ success() && runner.os == 'Linux' }}");
	assert.equal(
		or(always(), contains(github.ref, "release/")),
		"${{ always() || contains(github.ref, 'release/') }}",
	);
	assert.equal(
		selectString(eq(github.refName, "main"), "prod", "dev"),
		"${{ github.ref_name == 'main' && 'prod' || 'dev' }}",
	);
	assert.equal(not(contains(github.ref, "release/")), "${{ !contains(github.ref, 'release/') }}");
	assert.equal(
		valueOr(github.headRef, github.refName),
		"${{ github.head_ref || github.ref_name }}",
	);
	assert.equal(
		format("ci-{0}", valueOr(github.headRef, github.refName)),
		"${{ format('ci-{0}', github.head_ref || github.ref_name) }}",
	);
	assert.equal(input("environment"), "${{ inputs.environment }}");
	const environmentInput: GitHubExpression<string> = input<string>("environment");
	void environmentInput;
	assert.equal(
		eq(valueOr(input<string>("environment"), github.baseRef, github.refName), "prod"),
		"${{ (inputs.environment || github.base_ref || github.ref_name) == 'prod' }}",
	);
	assert.equal(input("deploy/env"), "${{ inputs['deploy/env'] }}");
	assert.equal(matrix("node"), "${{ matrix.node }}");
	assert.equal(envVar("TF_DIR"), "${{ env.TF_DIR }}");
	assert.equal(secret("CIND_BOT_APP_PRIVATE_KEY"), "${{ secrets.CIND_BOT_APP_PRIVATE_KEY }}");
	assert.equal(hashFiles("go.sum", "go.mod"), "${{ hashFiles('go.sum', 'go.mod') }}");
	assert.equal(needsOutput("build", "digest"), "${{ needs.build.outputs.digest }}");
	const planEnvironment: GitHubExpression<string> = needsOutput<string>("plan", "environment");
	void planEnvironment;
	assert.equal(needsResult("build"), "${{ needs.build.result }}");
	assert.equal(
		needsResultIs("build", GitHubJobResult.Success),
		"${{ needs.build.result == 'success' }}",
	);
	assert.equal(
		needsResultIn("build", [GitHubJobResult.Success, GitHubJobResult.Skipped]),
		"${{ needs.build.result == 'success' || needs.build.result == 'skipped' }}",
	);
	assert.equal(
		and(
			needsResultIn("build", [GitHubJobResult.Success, GitHubJobResult.Skipped]),
			eq(github.refName, "dev"),
		),
		"${{ (needs.build.result == 'success' || needs.build.result == 'skipped') && github.ref_name == 'dev' }}",
	);
	assert.equal(stepOutput("meta", "image/tag"), "${{ steps.meta.outputs['image/tag'] }}");
	const imageTag: GitHubExpression<string> = stepOutput<string>("meta", "image_tag");
	void imageTag;

	// @ts-expect-error Unknown context properties should fail at compile time.
	const badProperty = github.workfloooooow;
	void badProperty;
});

test("expression subpath exports the typed namespace", () => {
	assert.equal(subpathGh.github.workflow, "${{ github.workflow }}");
});

test("defineMatrix exposes typed matrix references", () => {
	const build = defineMatrix({
		node: ["22", "24"],
		os: ["ubuntu-latest", "macos-latest"],
		include: [{ node: "24", os: "ubuntu-latest", experimental: true }],
	} as const);

	assert.deepEqual(build.values.node, ["22", "24"]);
	assert.equal(build.node, "${{ matrix.node }}");
	assert.equal(build.os, "${{ matrix.os }}");
	assert.equal(build.refs.node, "${{ matrix.node }}");
	assert.equal(build.refs.os, "${{ matrix.os }}");
	const nodeRef: GitHubExpression<"22" | "24"> = build.node;
	void nodeRef;

	// @ts-expect-error Matrix refs are only exposed for declared matrix axes.
	const badMatrixRef = build.ruby;
	void badMatrixRef;
});

test("valueOr preserves primitive expression types", () => {
	const branchRef: GitHubExpression<string> = valueOr(github.headRef, github.refName);
	void branchRef;

	// @ts-expect-error Value OR operands must share a primitive type.
	const mixedRef = valueOr(github.refName, github.runId);
	void mixedRef;

	// @ts-expect-error selectString requires a boolean condition.
	const badCondition = selectString(github.refName, "prod", "dev");
	void badCondition;
});

test("defineMatrix rejects reserved helper property axes", () => {
	assert.throws(() => defineMatrix({ values: ["x"] } as const), /reserved Hollywood matrix axis/);
	assert.throws(() => defineMatrix({ refs: ["x"] } as const), /reserved Hollywood matrix axis/);
});
