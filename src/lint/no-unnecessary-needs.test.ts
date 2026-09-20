import { describe, expect, it } from "vitest";

import { command, unsafeShell } from "../workflow-command";
import {
	generateWorkflowFile,
	renderWorkflowFile,
	type GitHubWorkflow,
	type GitHubWorkflowJob,
	type GitHubWorkflowStep,
} from "../generate";
import { validateWorkflowModel } from "../validation";
import { checkUnnecessaryNeeds } from "./no-unnecessary-needs";

const upstream: GitHubWorkflowJob = {
	"runs-on": "ubuntu-latest",
	steps: [{ run: command({ file: "true", args: [] }) }],
};
const dependent: GitHubWorkflowJob = { ...upstream, needs: ["test"] };

function warnings(job: GitHubWorkflowJob, producer = upstream) {
	return checkUnnecessaryNeeds("deploy", job, { test: producer });
}

describe("dependency advice", () => {
	it.each([
		["needs.test.result == 'success'", 0],
		["needs.test.outputs.ready", 0],
		["needs['test']['result'] == 'success'", 0],
		["needs['test']['outputs']['ready']", 0],
		["NEEDS.TEST.RESULT == 'success'", 0],
		["always() && !(needs.test.result != 'success')", 0],
		["contains(needs.test.outputs.ready, 'yes')", 0],
		["needs.other.outputs[needs.test.outputs.key]", 0],
		["contains(github.event.labels.*.name, 'ready') && needs.test.result == 'success'", 0],
		["contains(needs.*.result, 'failure')", 0],
		["toJSON(needs)", 0],
		["needs[inputs.job].result", 0],
		["needs.other.result == 'success'", 1],
		["steps.test.outputs.ready", 1],
		["'needs.test.outputs.ready'", 1],
	])("checks the needs root in %s", (expression, count) => {
		expect(warnings({ ...dependent, if: `\${{ ${expression} }}` })).toHaveLength(count);
	});

	it.each([
		["plain needs.test.outputs.ready", 1],
		["prefix ${{ needs['test']['outputs'].ready }} suffix", 0],
		["${{ '}}' }} ${{ needs.test.outputs.ready }}", 0],
		["${{ 'it''s }} needs.test.outputs.ready' }}", 1],
	])("extracts expressions from run, env, and with: %s", (text, count) => {
		const steps: GitHubWorkflowStep[] = [
			{ run: unsafeShell(text) },
			{ uses: "./.github/actions/noop", env: { VALUE: text } },
			{ uses: "./.github/actions/noop", with: { value: text } },
		];
		for (const step of steps) expect(warnings({ ...dependent, steps: [step] })).toHaveLength(count);
	});

	it("parses implicit job and step conditions without treating env keys as conditions", () => {
		expect(warnings({ ...dependent, if: "needs.test.result == 'success'" })).toHaveLength(0);
		expect(
			warnings({
				...dependent,
				steps: [{ uses: "./.github/actions/noop", if: "needs.test.result == 'success'" }],
			}),
		).toHaveLength(0);
		expect(warnings({ ...dependent, env: { if: "plain text" } })).toHaveLength(1);
	});

	it.each(["${{ needs.test.result == }}", "prefix ${{ needs.test.result", "${{ }}"])(
		"rejects malformed expressions: %s",
		(text) => {
			expect(() => warnings({ ...dependent, env: { VALUE: text } })).toThrow(/expression/);
		},
	);

	it.each([
		["actions/upload-artifact@v4", {}, "actions/download-artifact@v4", { name: "artifact" }, 0],
		["actions/upload-artifact@v4", { name: "build" }, "actions/download-artifact@v4", {}, 0],
		[
			"actions/upload-artifact@v4",
			{ name: "build" },
			"actions/download-artifact@v4",
			{ pattern: "build-*" },
			0,
		],
		[
			"actions/upload-artifact@v4",
			{ name: "${{ matrix.name }}" },
			"actions/download-artifact@v4",
			{ name: "build" },
			0,
		],
		["actions/upload-pages-artifact@v3", {}, "actions/deploy-pages@v4", {}, 0],
		[
			"actions/upload-pages-artifact@v3",
			{ name: "site" },
			"actions/deploy-pages@v4",
			{ artifact_name: "site" },
			0,
		],
		[
			"actions/upload-artifact@v4",
			{ name: "other" },
			"actions/download-artifact@v4",
			{ name: "build" },
			1,
		],
		[
			"acme/upload-artifact@v4",
			{ name: "build" },
			"actions/download-artifact@v4",
			{ name: "build" },
			1,
		],
	])(
		"handles artifact candidates %s %j -> %s %j",
		(upload, uploadWith, download, downloadWith, count) => {
			const producer = { ...upstream, steps: [{ uses: upload, with: uploadWith }] };
			const consumer = { ...dependent, steps: [{ uses: download, with: downloadWith }] };
			expect(warnings(consumer, producer)).toHaveLength(count);
		},
	);

	it.each([
		["build", "", 0],
		["build", " \t\n", 0],
		[" build ", "build", 0],
		["build", " build ", 0],
		[" build ", " other ", 1],
		["build", " ${{ matrix.artifact }} ", 0],
	])("normalizes artifact names %j -> %j", (uploaded, downloaded, count) => {
		const producer = {
			...upstream,
			steps: [{ uses: "actions/upload-artifact@v4", with: { name: uploaded } }],
		};
		const consumer = {
			...dependent,
			steps: [{ uses: "actions/download-artifact@v4", with: { name: downloaded } }],
		};
		expect(warnings(consumer, producer)).toHaveLength(count);
	});

	it("keeps ordering-only dependencies authoritative", () => {
		const job = { ...dependent, if: "${{ always() }}" };
		const workflow: GitHubWorkflow = {
			name: "Deploy",
			on: { push: {} },
			jobs: { test: upstream, deploy: job },
		};
		const file = generateWorkflowFile({
			sourcePath: "gha/deploy.ts",
			sourceRoot: "gha",
			workflowsDir: ".github/workflows",
			workflow,
		});
		const before = renderWorkflowFile(file);
		const result = validateWorkflowModel(workflow, { rules: ["no-unnecessary-needs"] });
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]?.message).toContain("ordering");
		expect(result).not.toHaveProperty("errors");
		expect(renderWorkflowFile(file)).toBe(before);
		expect(before).toContain("needs:\n      - test");
	});

	it("rejects unknown rules from direct callers", () => {
		const workflow: GitHubWorkflow = { name: "Empty", on: { push: {} }, jobs: {} };
		// @ts-expect-error JavaScript callers can supply unknown rules.
		expect(() => validateWorkflowModel(workflow, { rules: ["typo"] })).toThrow(/unknown lint rule/);
		// @ts-expect-error Advisory rules cannot become blocking checks.
		expect(() => validateWorkflowModel(workflow, { level: "error" })).toThrow(/severity/);
	});
});
