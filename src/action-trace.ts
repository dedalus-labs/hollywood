import { AsyncLocalStorage } from "node:async_hooks";
import { basename } from "node:path";
import {
	ROOT_CONTEXT, SpanStatusCode, trace,
	type Attributes, type Context, type Span,
} from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
	AlwaysOnSampler, InMemorySpanExporter, SimpleSpanProcessor, TracerProvider,
	type ReadableSpan,
} from "@opentelemetry/sdk-trace";

import type { ScriptActionServices } from "./script";

/** Export one action's completed span tree, including partial work on failure. */
export type ActionTraceOptions = Readonly<{
	onEnd: (spans: readonly ReadableSpan[]) => Promise<void>;
	/** Non-secret identity attributes for the root action. */
	attributes?: Attributes;
}>;

export class ActionTraceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ActionTraceError";
	}
}

/** A private async context keeps concurrent actions independent of global telemetry. */
export class ActionTracer {
	readonly #context = new AsyncLocalStorage<Context>();
	readonly #pending = new Set<Span>();
	readonly #exporter = new InMemorySpanExporter();
	readonly #provider = new TracerProvider({
		sampler: new AlwaysOnSampler(),
		resource: resourceFromAttributes({ "service.name": "hollywood" }),
		spanProcessors: [new SimpleSpanProcessor({ exporter: this.#exporter })],
	});
	readonly #tracer = this.#provider.getTracer("@dedalus-labs/hollywood/runtime");
	#closed = false;

	async run<Value>(
		kind: "action" | "command" | "file" | "group",
		name: string,
		run: (span: Span) => Promise<Value>,
		attributes: Attributes = {},
	): Promise<Value> {
		if (this.#closed) throw new ActionTraceError("Action trace is closed.");
		const parent = this.#context.getStore();
		const span = this.#tracer.startSpan(name, { attributes: {
			...attributes,
			"hollywood.kind": kind,
			"hollywood.timing.available": true,
		} }, parent ?? ROOT_CONTEXT);
		this.#pending.add(span);
		try {
			const value = await this.#context.run(trace.setSpan(parent ?? ROOT_CONTEXT, span), () => run(span));
			if (parent === undefined && this.#pending.size > 1)
				throw new ActionTraceError("Action returned with unfinished operations.");
			if (span.isRecording()) span.setAttribute("hollywood.result", "success");
			return value;
		} catch (error) {
			if (span.isRecording()) {
				span.setStatus({ code: SpanStatusCode.ERROR });
				span.setAttribute("hollywood.result", "failure");
				span.setAttribute("error.type", error instanceof Error ? error.name : typeof error);
			}
			throw error;
		} finally {
			if (parent === undefined) {
				this.#closed = true;
				for (const pending of this.#pending) {
					if (pending === span) continue;
					pending.setAttributes({ "hollywood.result": "unfinished", "hollywood.timing.partial": true });
					pending.end();
				}
				this.#pending.clear();
			}
			if (span.isRecording()) span.end();
			this.#pending.delete(span);
		}
	}

	services(services: ScriptActionServices): ScriptActionServices {
		return {
			...services,
			exec: (file, args, options) => this.run("command", basename(file), async (span) => {
				const result = await services.exec(file, args, options);
				if (span.isRecording()) span.setAttribute("process.exit.code", result.exitCode);
				return result;
			}),
			fs: { readText: (path) => this.run("file", "Read file", () => services.fs.readText(path)) },
			log: {
				...services.log,
				group: (name, run) => this.run("group", name, () => services.log.group(name, run)),
			},
		};
	}

	async finish(onEnd: ActionTraceOptions["onEnd"]): Promise<void> {
		try {
			await this.#provider.forceFlush();
			await onEnd([...this.#exporter.getFinishedSpans()]);
		} finally {
			this.#context.disable();
			await this.#provider.shutdown();
		}
	}
}

export const traceAction = async <Value>(
	name: string,
	options: ActionTraceOptions,
	run: (tracer: ActionTracer) => Promise<Value>,
): Promise<Value> => {
	const recorder = new ActionTracer();
	let result: { ok: true; value: Value } | { ok: false; error: unknown };
	try {
		result = { ok: true, value: await recorder.run("action", name, () => run(recorder), options.attributes) };
	} catch (error) {
		result = { ok: false, error };
	}
	try {
		await recorder.finish(options.onEnd);
	} catch (error) {
		if (!result.ok)
			throw new AggregateError([result.error, error], "Action failed and its trace could not be exported.");
		throw error;
	}
	if (!result.ok) throw result.error;
	return result.value;
};
