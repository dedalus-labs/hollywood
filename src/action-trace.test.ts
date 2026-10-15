import * as assert from "node:assert/strict";
import { test, vi } from "vitest";
import { SpanStatusCode } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace";

import { action, runAction, type ScriptActionContext } from "./script";
import { nodeExec } from "./local";

const define = (run: (context: ScriptActionContext<{}>) => Promise<{}>) =>
	action({ name: "Example", description: "Trace fixture", inputs: {}, outputs: {}, run });
const services = {
	with: {},
	exec: nodeExec,
	fs: { readText: async () => "private contents" },
	runner: { uidGid: "1001:1001" },
};
const barrier = () => {
	let release = () => {};
	const promise = new Promise<void>((resolve) => { release = resolve; });
	return { promise, release };
};
const parentName = (spans: readonly ReadableSpan[], child: ReadableSpan) =>
	spans.find((span) => span.spanContext().spanId === child.parentSpanContext?.spanId)?.name;

test("parallel operations retain their async parents and real command intervals", async () => {
	let spans: readonly ReadableSpan[] = [];
	const left = barrier();
	const right = barrier();
	await runAction(define(async ({ log, call }) => {
		await Promise.all(["Left", "Right"].map((name) => log.group(name, async () => {
			(name === "Left" ? left : right).release();
			await (name === "Left" ? right : left).promise;
			await call(define(async ({ exec, fs }) => {
				await fs.readText("private-path");
				await exec(process.execPath, ["-e", "setTimeout(() => {}, 20)"]);
				return {};
			}), {});
		})));
		return {};
	}), { ...services, trace: { onEnd: async (recorded) => { spans = recorded; } } });
	assert.equal(spans.length, 9);
	assert.equal(new Set(spans.map((span) => span.spanContext().traceId)).size, 1);
	const nested = spans.filter((span) => span.name === "Example" && span.parentSpanContext);
	assert.deepEqual(nested.map((span) => parentName(spans, span)).sort(), ["Left", "Right"]);
	for (const command of spans.filter((span) => span.attributes["hollywood.kind"] === "command")) {
		assert.equal(parentName(spans, command), "Example");
		assert.equal(command.attributes["process.exit.code"], 0);
		assert.ok(command.duration[0] > 0 || command.duration[1] > 20_000_000);
	}
	assert.ok(spans.every((span) => span.attributes["hollywood.result"] === "success"));
});

test("trace payload excludes command arguments, paths, output, environment, and error messages", async () => {
	let spans: readonly ReadableSpan[] = [];
	const failure = new Error("private error");
	await assert.rejects(runAction(define(async ({ exec, fs }) => {
		await fs.readText("private-path");
		await exec("/private-directory/tool", ["private-argument"], { env: { TOKEN: "private-env" } });
		throw failure;
	}), {
		...services,
		exec: async () => ({ exitCode: 0, stdout: "private-output", stderr: "private-stderr" }),
		trace: { onEnd: async (recorded) => { spans = recorded; } },
	}), (error) => error === failure);
	assert.equal(spans.length, 3);
	assert.doesNotMatch(JSON.stringify(spans.map(({ name, attributes, events, status }) =>
		({ name, attributes, events, status }))), /private/);
	assert.equal(spans.at(-1)?.status.code, SpanStatusCode.ERROR);
});

test("allowed nonzero exits remain successful operations", async () => {
	let spans: readonly ReadableSpan[] = [];
	await runAction(define(async ({ exec }) => {
		await exec(process.execPath, ["-e", "process.exit(7)"], { exitPolicy: "any" });
		return {};
	}), { ...services, trace: { onEnd: async (recorded) => { spans = recorded; } } });
	assert.equal(spans[0]?.attributes["process.exit.code"], 7);
	assert.equal(spans[0]?.attributes["hollywood.result"], "success");
});

test("early failure exports unfinished siblings once without claiming their completion", async () => {
	let spans: readonly ReadableSpan[] = [];
	const gate = barrier();
	const failure = new Error("action failed");
	let pending: Promise<unknown> = Promise.resolve();
	await assert.rejects(runAction(define(async ({ log }) => {
		pending = log.group("Pending", () => gate.promise);
		throw failure;
	}), { ...services, trace: { onEnd: async (recorded) => { spans = recorded; } } }),
	(error) => error === failure);
	const unfinished = spans.find((span) => span.name === "Pending");
	assert.equal(unfinished?.attributes["hollywood.result"], "unfinished");
	assert.equal(unfinished?.attributes["hollywood.timing.partial"], true);
	const before = JSON.stringify(unfinished?.attributes);
	gate.release();
	await pending;
	assert.equal(JSON.stringify(unfinished?.attributes), before);
	assert.equal(spans.length, 2);
});

test("original action errors survive an export failure", async () => {
	const failure = new Error("action failed");
	const exportFailure = new Error("export failed");
	await assert.rejects(runAction(define(async () => { throw failure; }), {
		...services,
		trace: { onEnd: async () => { throw exportFailure; } },
	}), (error) => error instanceof AggregateError &&
		error.errors[0] === failure && error.errors[1] === exportFailure);
});

test("a completed trace rejects later operations before running them", async () => {
	let captured: ScriptActionContext<{}> | undefined;
	let calls = 0;
	await runAction(define(async (context) => { captured = context; return {}; }), {
		...services,
		exec: async () => { calls++; return { exitCode: 0, stdout: "", stderr: "" }; },
		trace: { onEnd: async () => {} },
	});
	assert.ok(captured);
	await assert.rejects(captured.exec("tool", []), /trace is closed/);
	assert.equal(calls, 0);
});

test("returning with outstanding work rejects the action", async () => {
	const gate = barrier();
	let pending: Promise<unknown> = Promise.resolve();
	await assert.rejects(runAction(define(async ({ log }) => {
		pending = log.group("Pending", () => gate.promise);
		return {};
	}), { ...services, trace: { onEnd: async () => {} } }), /unfinished operations/);
	gate.release();
	await pending;
});

test("concurrent action invocations own separate roots", async () => {
	const traces: (readonly ReadableSpan[])[] = [];
	const gate = barrier();
	let entered = 0;
	const script = define(async ({ log }) => {
		await log.group("Parallel", async () => {
			if (++entered === 2) gate.release();
			await gate.promise;
		});
		return {};
	});
	await Promise.all([0, 1].map(() => runAction(script, {
		...services, trace: { onEnd: async (spans) => { traces.push(spans); } },
	})));
	assert.equal(traces.length, 2);
	assert.equal(new Set(traces.map((spans) => spans[0]?.spanContext().traceId)).size, 2);
	assert.ok(traces.every((spans) => spans.length === 2 && spans.at(-1)?.parentSpanContext === undefined));
});

test("an export failure rejects an otherwise successful action", async () => {
	const failure = new Error("export failed");
	await assert.rejects(runAction(define(async () => ({})), {
		...services, trace: { onEnd: async () => { throw failure; } },
	}), (error) => error === failure);
});

test("nested intervals share one monotonic clock despite wall-clock offsets", async () => {
	let spans: readonly ReadableSpan[] = [];
	let wallTime = Date.now();
	const clock = vi.spyOn(Date, "now").mockImplementation(() => wallTime += 10);
	try {
		await runAction(define(async ({ log }) => {
			await log.group("Child", async () => {});
			return {};
		}), { ...services, trace: { onEnd: async (recorded) => { spans = recorded; } } });
	} finally {
		clock.mockRestore();
	}
	const child = spans[0];
	const root = spans[1];
	assert.ok(child && root);
	const nanos = (time: readonly [number, number]) => BigInt(time[0]) * 1_000_000_000n + BigInt(time[1]);
	assert.ok(nanos(child.startTime) >= nanos(root.startTime));
	assert.ok(nanos(child.endTime) <= nanos(root.endTime));
});
