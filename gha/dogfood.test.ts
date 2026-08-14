import assert from "node:assert/strict";
import { test } from "vitest";

import type { GitHubWorkflow } from "../src/index";
import { buildLocalActionsCommand } from "./actions";
import { ci } from "./ci";
import { cla } from "./cla";
import { docs } from "./docs";
import { flowers } from "./flowers";
import { publishNpm } from "./publish-npm";
import { runnerJit } from "./runner-jit";
import { release } from "./release";
import { runnerImageWorkflow } from "./runner-image";

const workflows = [
	ci,
	cla,
	docs,
	flowers,
	publishNpm,
	release,
	runnerJit,
	runnerImageWorkflow,
] satisfies readonly GitHubWorkflow[];

test("repository workflows invoke Hollywood actions as local action steps", () => {
	for (const workflow of workflows) {
		for (const [jobName, job] of Object.entries(workflow.jobs)) {
			if (!("steps" in job)) {
				continue;
			}
			for (const step of job.steps) {
				if ("run" in step) {
					assert.equal(step.run.kind, "command");
					assert.ok(
						step.run.kind !== "command" ||
							step.run.file !== "node" ||
							step.run.args[0] !== "dist/cli.js" ||
							step.run.args[1] !== "run",
						`${workflow.name}/${jobName} invokes a Hollywood action through shell`,
					);
				}
			}
		}
	}
});

test("repository workflows bundle ignored local actions before use", () => {
	for (const workflow of workflows) {
		for (const [jobName, job] of Object.entries(workflow.jobs)) {
			if (!("steps" in job)) {
				continue;
			}

			let actionsBuilt = false;
			for (const step of job.steps) {
				if ("run" in step && step.run === buildLocalActionsCommand) {
					actionsBuilt = true;
				}
				if ("uses" in step && step.uses.startsWith("./.github/actions/")) {
					assert.ok(
						actionsBuilt,
						`${workflow.name}/${jobName} uses an ignored local action bundle before building it`,
					);
				}
			}
		}
	}
});

test("contributor checks always check out the trusted base commit", () => {
	for (const contributorJob of [cla.jobs.cla, cla.jobs.vouch]) {
		const checkout = contributorJob.steps[0];
		assert.ok(checkout !== undefined && "with" in checkout);
		assert.equal(checkout.with?.ref, "${{ github.event.pull_request.base.sha }}");
	}
});

test("required checks report on merge queue heads", () => {
	assert.deepEqual(ci.on.merge_group, { types: ["checks_requested"] });
	assert.deepEqual(cla.on.merge_group, { types: ["checks_requested"] });
	for (const contributorJob of [cla.jobs.cla, cla.jobs.vouch]) {
		assert.equal(contributorJob.if, "${{ github.event_name == 'pull_request' }}");
	}
});
