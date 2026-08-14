import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "vitest";

import {
	command,
	generateWorkflowFile,
	renderWorkflowFile,
	unsafeShell,
	type GitHubWorkflowStep,
} from "./index";
import { github } from "./expressions";
import { renderWorkflowRun } from "./workflow-command";

const renderStep = (step: GitHubWorkflowStep): string =>
	renderWorkflowFile(
		generateWorkflowFile({
			sourcePath: "gha/commands.ts",
			sourceRoot: "gha",
			workflowsDir: ".github/workflows",
			workflow: {
				name: "Commands",
				on: { workflow_dispatch: {} },
				jobs: {
					test: {
						"runs-on": "ubuntu-latest",
						steps: [step],
					},
				},
			},
		}),
	);

test("command renders one executable and argv without shell interpolation", () => {
	const content = renderStep({
		name: "Run command",
		run: command({
			file: "npm",
			args: ["run", "check package", "it's literal"],
		}),
	});

	assert.match(content, /run: npm run 'check package' 'it'"'"'s literal'/);
	assert.match(content, /shell: bash/);
});

test("command preserves shell metacharacters as one literal argument", () => {
	const argument = "'; printf injected; # $(printf substituted)";
	const rendered = renderWorkflowRun(
		command({ file: "printf", args: ["%s", argument] }),
		undefined,
	);

	assert.equal(
		execFileSync("bash", ["-c", rendered.run], { encoding: "utf8" }),
		argument,
	);
});

test("command passes expression arguments through generated environment variables", () => {
	const content = renderStep({
		name: "Print actor",
		env: { EXISTING: "value" },
		run: command({ file: "printf", args: ["%s\\n", github.actor] }),
	});

	assert.match(content, /EXISTING: value/);
	assert.match(content, /HOLLYWOOD_COMMAND_ARG_1: \$\{\{ github\.actor \}\}/);
	assert.match(content, /run: printf '%s\\n' "\$HOLLYWOOD_COMMAND_ARG_1"/);
});

test("command keeps expression values outside shell source", () => {
	const argument = "$(printf injected); ' quoted";
	const rendered = renderWorkflowRun(
		command({ file: "printf", args: ["%s", github.actor] }),
		undefined,
	);

	assert.equal(
		execFileSync("bash", ["-c", rendered.run], {
			encoding: "utf8",
			env: { ...process.env, HOLLYWOOD_COMMAND_ARG_1: argument },
		}),
		argument,
	);
});

test("command rejects an environment variable reserved for an expression argument", () => {
	assert.throws(
		() =>
			renderStep({
				env: { HOLLYWOOD_COMMAND_ARG_0: "occupied" },
				run: command({ file: "printf", args: [github.actor] }),
			}),
		/HOLLYWOOD_COMMAND_ARG_0 is reserved/,
	);
});

test("command rejects an expression embedded in a literal argument", () => {
	assert.throws(
		() =>
			renderStep({
				run: command({ file: "printf", args: [`actor=${github.actor}`] }),
			}),
		/use a complete GitHubExpression argument/,
	);
});

test("unsafeShell renders an explicitly unstructured script", () => {
	const content = renderStep({
		run: unsafeShell("printf '%s\\n' ok | tee result.txt"),
	});

	assert.match(content, /printf '%s\\n' ok \| tee result\.txt/);
});

test("workflow commands reject empty required fields", () => {
	assert.throws(() => command({ file: "", args: [] }), /command file is required/);
	assert.throws(() => unsafeShell(""), /unsafeShell script is required/);
});

test("run steps reject unstructured shell strings at compile time", () => {
	if (process.env["HOLLYWOOD_TYPE_TESTS"] === "1") {
		const raw: GitHubWorkflowStep = {
			// @ts-expect-error Raw workflow shell requires unsafeShell().
			run: "npm test",
		};
		void raw;

		// @ts-expect-error Structured commands select the portable bash contract.
		const wrongShell: GitHubWorkflowStep = {
			run: command({ file: "npm", args: ["test"] }),
			shell: "pwsh",
		};
		void wrongShell;
	}
	assert.ok(true);
});
