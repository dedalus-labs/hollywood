import * as assert from "node:assert/strict";
import { test } from "vitest";

import {
	action,
	choiceInput,
	integerInput,
	runAction,
	stringOutput,
	summaryText,
	type ScriptLog,
} from "./script";
import { nodeExec } from "./local";

const silentLog: ScriptLog = {
	info: () => {},
	warning: () => {},
	group: async (_name, run) => run(),
};

test("runAction binds strict choice workflow inputs", async () => {
	const cacheAction = action({
		name: "cache-action",
		description: "Restore or save caches.",
		inputs: {
			mode: choiceInput({
				description: "Cache mode.",
				options: ["restore", "save"] as const,
				default: "restore",
			}),
		},
		outputs: {
			selectedMode: stringOutput({ description: "Selected cache mode." }),
		},
		run: async ({ input }) => ({ selectedMode: input.mode }),
	});

	assert.deepEqual(
		await runAction(cacheAction, {
			with: {},
			exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
			fs: { readText: async () => "" },
			log: silentLog,
			runner: { uidGid: "1001:1001" },
		}),
		{ selectedMode: "restore" },
	);
	assert.deepEqual(
		await runAction(cacheAction, {
			with: { mode: "save" },
			exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
			fs: { readText: async () => "" },
			log: silentLog,
			runner: { uidGid: "1001:1001" },
		}),
		{ selectedMode: "save" },
	);
	await assert.rejects(
		() =>
			runAction(cacheAction, {
				with: { mode: "delete" },
				exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
				fs: { readText: async () => "" },
				log: silentLog,
				runner: { uidGid: "1001:1001" },
			}),
		/mode must be one of: restore, save/,
	);
});

test("command can explicitly allow nonzero exits", async () => {
	const result = await nodeExec(
		process.execPath,
		["-e", "process.stderr.write('miss'); process.exit(7)"],
		{ exitPolicy: "any" },
	);

	assert.equal(result.exitCode, 7);
	assert.equal(result.stderr, "miss");
	await assert.rejects(() => nodeExec(process.execPath, ["-e", "process.exit(7)"]), /exited 7/);
});

test("runAction provides a typed script logger", async () => {
	const events: string[] = [];
	const logAction = action({
		name: "log-action",
		description: "Exercise script logging.",
		inputs: {},
		outputs: {
			status: stringOutput({ description: "Log status." }),
		},
		run: async ({ log }) => {
			log.info("starting");
			await log.group("work", async () => {
				log.warning("careful");
			});
			return { status: "logged" };
		},
	});

	const outputs = await runAction(logAction, {
		with: {},
		exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
		fs: { readText: async () => "" },
		log: {
			info: (message) => events.push(`info:${message}`),
			warning: (message) => events.push(`warning:${message}`),
			group: async (name, run) => {
				events.push(`group:${name}`);
				return run();
			},
		},
		runner: { uidGid: "1001:1001" },
	});

	assert.deepEqual(outputs, { status: "logged" });
	assert.deepEqual(events, ["info:starting", "group:work", "warning:careful"]);
});

test("actions can call typed child actions with inherited runtime services", async () => {
	const commands: unknown[] = [];
	const childAction = action({
		name: "child-action",
		description: "Exercise action composition.",
		inputs: {
			count: integerInput({ description: "Child count." }),
			mode: choiceInput({
				description: "Child mode.",
				options: ["fast", "slow"] as const,
				default: "fast",
			}),
		},
		outputs: {
			value: stringOutput({ description: "Child value." }),
		},
		run: async ({ exec, fs, input, runner }) => {
			const marker = await fs.readText("/tmp/marker");
			await exec("child", [input.count.toString(), input.mode, runner.uidGid]);
			return { value: `${marker.trim()}:${input.count}:${input.mode}` };
		},
	});
	const parentAction = action({
		name: "parent-action",
		description: "Calls a child action.",
		inputs: {
			count: integerInput({ description: "Parent count." }),
		},
		outputs: {
			value: stringOutput({ description: "Parent value." }),
		},
		run: async ({ call, input }) => {
			const child = await call(childAction, { count: input.count + 1 });
			return { value: `parent:${child.value}` };
		},
	});

	const outputs = await runAction(parentAction, {
		with: { count: "41" },
		exec: async (file, args, options) => {
			commands.push({ file, args, ...options });
			return { exitCode: 0, stdout: "", stderr: "" };
		},
		fs: { readText: async () => "marker\n" },
		log: silentLog,
		runner: { uidGid: "1001:1001" },
	});

	assert.deepEqual(commands, [{ file: "child", args: ["42", "fast", "1001:1001"] }]);
	assert.deepEqual(outputs, { value: "parent:marker:42:fast" });
});

test("action calls keep child inputs typed", () => {
	if (process.env["HOLLYWOOD_TYPE_TESTS"] === "1") {
		const childAction = action({
			name: "child-action",
			description: "Exercise action composition.",
			inputs: {
				count: integerInput({ description: "Child count." }),
			},
			outputs: {
				value: stringOutput({ description: "Child value." }),
			},
			run: async ({ input }) => ({ value: input.count.toString() }),
		});
		const parentAction = action({
			name: "parent-action",
			description: "Calls a child action.",
			inputs: {},
			outputs: {},
			run: async ({ call }) => {
				// @ts-expect-error Missing child count should fail at compile time.
				await call(childAction, {});
				return {};
			},
		});
		void parentAction;
	}
	assert.ok(true);
});

test("summary tables require explicitly formatted cells", () => {
	if (process.env["HOLLYWOOD_TYPE_TESTS"] === "1") {
		const summaryAction = action({
			name: "summary-action",
			description: "Exercise summary cell types.",
			inputs: {},
			outputs: {},
			run: async ({ summary }) => {
				await summary.table("summary", [
					{ label: "Result", value: summaryText("PASS") },
					// @ts-expect-error Summary values must use summaryText or summaryCode.
					{ label: "Raw", value: "PASS" },
				]);
				return {};
			},
		});
		void summaryAction;
	}
	assert.ok(true);
});
