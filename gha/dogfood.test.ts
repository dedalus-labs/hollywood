import assert from "node:assert/strict";
import { test } from "vitest";

import type { GitHubWorkflow } from "../src/index";
import { ci } from "./ci";
import { cla } from "./cla";
import { docs } from "./docs";
import { flowers } from "./flowers";
import { publishNpm } from "./publish-npm";
import { release } from "./release";

const workflows = [ci, cla, docs, flowers, publishNpm, release] satisfies readonly GitHubWorkflow[];

test("repository workflows invoke Hollywood actions as local action steps", () => {
	for (const workflow of workflows) {
		for (const [jobName, job] of Object.entries(workflow.jobs)) {
			if (!("steps" in job)) {
				continue;
			}
			for (const step of job.steps) {
				if ("run" in step) {
					assert.ok(
						!step.run.includes("dist/cli.js run"),
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
				if ("run" in step && step.run === "npm run actions") {
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
