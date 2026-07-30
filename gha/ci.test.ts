import assert from "node:assert/strict";
import { test } from "vitest";

import { currentRunner, nodeFs, runAction, type Command } from "../src/index";
import { assertSha256, ci, testContainerProvider } from "./ci";

test("artifact checksum verification accepts only matching contents", () => {
	const contents = Buffer.from("Hollywood");
	const digest = "2805150bc18835691f42ef2169ccb5820c392d931145085bcd7e794600f1c7e2";

	assert.doesNotThrow(() => assertSha256(contents, digest));
	assert.throws(() => assertSha256(Buffer.from("tampered"), digest), /checksum mismatch/);
});

test("container provider tests run through a typed local action", () => {
	const container = ci.jobs.container;
	assert.ok(container !== undefined && "steps" in container);
	assert.deepEqual(container.steps.at(-1), {
		name: "Test provider",
		uses: "./.github/actions/test-container-provider",
	});
});
test("container provider integration files share one runtime at a time", async () => {
	const commands: Command[] = [];
	await runAction(testContainerProvider, {
		with: {},
		exec: async (file, args, options) => {
			commands.push({ file, args, ...options });
			return { exitCode: 0, stderr: "", stdout: "" };
		},
		fs: nodeFs,
		runner: currentRunner(),
	});

	assert.deepEqual(commands, [
		{
			file: "npm",
			args: [
				"test",
				"--",
				"--no-file-parallelism",
				"src/container.test.ts",
				"src/container-action.test.ts",
			],
		},
	]);
});
