import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

import { generateWorkflowFile, job, renderWorkflowFile, workflow } from "./generate";
import { matchPathDependency, pathDependencies } from "./paths";

test("pathDependencies defines trigger paths, detector jobs, and typed guards", () => {
	const changes = pathDependencies("changes", {
		terraform: ["infra/terraform/**", ".github/actions/terraform/**"],
		web: ["apps/web/**", "packages/ui/**", "!apps/web/docs/**"],
	});

	assert.deepEqual(changes.workflowPaths, [
		"infra/terraform/**",
		".github/actions/terraform/**",
		"apps/web/**",
		"packages/ui/**",
	]);
	assert.equal(changes.terraform.changed, "${{ needs.changes.outputs.terraform == 'true' }}");
	assert.equal(changes.web.changed, "${{ needs.changes.outputs.web == 'true' }}");

	const detector = changes.job();
	assert.equal(detector.name, "Detect changed paths");
	assert.equal(detector["runs-on"], "ubuntu-24.04");
	assert.deepEqual(detector.outputs, {
		terraform: "${{ steps.detect.outputs.terraform }}",
		web: "${{ steps.detect.outputs.web }}",
	});
	assert.deepEqual(detector.steps[0], {
		uses: "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
		with: { "fetch-depth": "0" },
	});
	assert.deepEqual(detector.steps[1], {
		id: "detect",
		name: "Detect changed paths",
		shell: "bash",
		env: {
			BASE_SHA: "${{ github.event_name == 'pull_request' && github.event.pull_request.base.sha || github.event.before }}",
			HEAD_SHA: "${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}",
		},
		run: detector.steps[1]?.run,
	});
	assert.match(detector.steps[1]?.run ?? "", /const pathDependencies = /);
});

test("pathDependencies render valid workflow YAML with guarded jobs", () => {
	const changes = pathDependencies("changes", {
		terraform: ["infra/terraform/**", ".github/actions/terraform/**"],
	});

	const content = renderWorkflowFile(
		generateWorkflowFile({
			sourcePath: "ci/platform/static-validation.ts",
			sourceRoot: "ci",
			workflowsDir: ".github/workflows",
			workflow: workflow({
				name: "Platform Static Validation",
				on: {
					pull_request: { paths: changes.workflowPaths },
				},
				jobs: {
					[changes.jobId]: changes.job(),
					infracost: job({
						name: "Terraform cost",
						needs: changes.jobId,
						if: changes.terraform.changed,
						"runs-on": "ubuntu-24.04",
						steps: [{ run: "echo cost" }],
					}),
				},
			}),
		}),
	);

	assert.match(content, /paths:\n\s+- infra\/terraform\/\*\*/);
	assert.match(content, /outputs:\n\s+terraform: \$\{\{ steps\.detect\.outputs\.terraform \}\}/);
	assert.match(content, /if: \$\{\{ needs\.changes\.outputs\.terraform == 'true' \}\}/);
});

test("matchPathDependency follows positive and negative path patterns", () => {
	const changes = pathDependencies("changes", {
		terraform: ["infra/terraform/**", "!infra/terraform/docs/**"],
	});

	assert.equal(matchPathDependency("infra/terraform/main.tf", changes.terraform), true);
	assert.equal(matchPathDependency("infra/terraform/docs/readme.md", changes.terraform), false);
	assert.equal(matchPathDependency("apps/web/src/main.ts", changes.terraform), false);
});

test("generated detector script evaluates changed paths in git", async () => {
	const changes = pathDependencies("changes", {
		terraform: ["infra/terraform/**"],
		web: ["apps/web/**", "!apps/web/docs/**"],
	});
	const directory = await mkdtemp(join(tmpdir(), "hollywood-paths-"));
	execGit(directory, ["init"]);
	execGit(directory, ["config", "user.email", "hollywood@example.com"]);
	execGit(directory, ["config", "user.name", "Hollywood"]);
	await writeFile(join(directory, "README.md"), "start\n");
	execGit(directory, ["add", "README.md"]);
	execGit(directory, ["commit", "-m", "initial"]);
	const base = execGit(directory, ["rev-parse", "HEAD"]);

	await mkdir(join(directory, "infra/terraform"), { recursive: true });
	await mkdir(join(directory, "apps/web/docs"), { recursive: true });
	await writeFile(join(directory, "infra/terraform/main.tf"), "resource {}\n");
	await writeFile(join(directory, "apps/web/docs/readme.md"), "docs\n");
	execGit(directory, ["add", "."]);
	execGit(directory, ["commit", "-m", "change"]);
	const head = execGit(directory, ["rev-parse", "HEAD"]);
	const output = join(directory, "github-output");
	const detect = changes.job().steps[1];
	if (detect === undefined || !("run" in detect)) {
		throw new Error("path dependency detector step is missing");
	}

	execFileSync("bash", ["-c", detect.run], {
		cwd: directory,
		env: { ...process.env, BASE_SHA: base, GITHUB_OUTPUT: output, HEAD_SHA: head },
	});

	assert.equal(await readFile(output, "utf8"), "terraform=true\nweb=false\n");
});

test("pathDependencies reject invalid detector contracts", () => {
	assert.throws(
		() => pathDependencies("bad id", { terraform: ["apps/**"] }),
		/invalid path dependency job id: bad id/,
	);
	assert.throws(
		() => pathDependencies("changes", { job: ["apps/**"] }),
		/reserved path dependency name: job/,
	);
	assert.throws(
		() => pathDependencies("changes", { terraform: [] as never }),
		/path dependency terraform must include at least one path/,
	);
	assert.throws(
		() => pathDependencies("changes", { terraform: ["!apps/**"] }),
		/path dependency terraform must include at least one positive path/,
	);
});

const execGit = (cwd: string, args: readonly string[]): string =>
	execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

test("pathDependencies expose dependency names as compile-time properties", () => {
	if (process.env["HOLLYWOOD_TYPE_TESTS"] === "1") {
		const changes = pathDependencies("changes", {
			terraform: ["infra/terraform/**"],
		});
		void changes.terraform.changed;
		// @ts-expect-error Unknown path dependency names should fail at compile time.
		void changes.mysql.changed;
	}
	assert.ok(true);
});
