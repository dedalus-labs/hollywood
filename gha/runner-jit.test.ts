import assert from "node:assert/strict";
import { test } from "vitest";

import { runnerJit } from "./runner-jit";

test("connected runner proof is manual and selects one dedicated label", () => {
	assert.deepEqual(runnerJit.on, { workflow_dispatch: {} });
	assert.deepEqual(runnerJit.permissions, { contents: "read" });
	const proof = runnerJit.jobs.proof;
	assert.ok(proof !== undefined && "steps" in proof);
	assert.deepEqual(proof["runs-on"], ["self-hosted", "hollywood-local"]);
	assert.equal(proof["timeout-minutes"], 30);
});

test("connected runner proof exercises local actions and retains a probe", () => {
	const proof = runnerJit.jobs.proof;
	assert.ok(proof !== undefined && "steps" in proof);
	assert.deepEqual(
		proof.steps.map((step) => ("name" in step ? step.name : undefined)),
		[
			undefined,
			undefined,
			"Install dependencies",
			"Build Hollywood",
			"Build local actions",
			"Capture runner",
			"Verify runner",
			"Upload runner probe",
		],
	);
	for (const step of proof.steps) {
		if ("uses" in step && !step.uses.startsWith("./")) {
			assert.match(step.uses, /@[0-9a-f]{40}$/);
		}
	}
	const upload = proof.steps.at(-1);
	assert.ok(upload !== undefined && "with" in upload);
	assert.deepEqual(upload.with, {
		name: "connected-runner-probe",
		path: "runner-probe.json",
		"if-no-files-found": "error",
		"retention-days": 30,
	});
});
