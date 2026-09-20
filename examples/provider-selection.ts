import { action, choiceInput, stringOutput } from "@dedalus-labs/hollywood";

const SCENARIOS = ["primary-ready", "secondary-after-timeout", "retry-read"] as const;
type Scenario = (typeof SCENARIOS)[number];

const POLL_INTERVAL_MS = 2_000;
const SELECTION_DEADLINE_MS = 300_000;
const READ_RETRY_DELAYS_MS = [0, 1_000, 2_000] as const;

type Provider = "primary" | "secondary";
type ProbeStatus = "cancelled" | "failed" | "queued" | "started";

type ProviderProbe = Readonly<{
	cancel: () => Promise<void>;
	dispatch: () => Promise<void>;
	nowMs: () => number;
	read: () => Promise<ProbeStatus>;
	sleep: (delayMs: number) => Promise<void>;
}>;

type SimulationState = {
	cancellations: number;
	dispatches: number;
	nowMs: number;
	readFailures: number;
	reads: number;
};

class RetryableProbeReadError extends Error {}

const readProbeStatus = async (probe: ProviderProbe): Promise<ProbeStatus> => {
	for (const delayMs of READ_RETRY_DELAYS_MS) {
		if (delayMs > 0) await probe.sleep(delayMs);
		try {
			return await probe.read();
		} catch (error: unknown) {
			if (!(error instanceof RetryableProbeReadError)) throw error;
		}
	}
	throw new RetryableProbeReadError("provider status remained unavailable after three reads");
};

const selectProvider = async (probe: ProviderProbe): Promise<Provider> => {
	const startedMs = probe.nowMs();
	await probe.dispatch();

	while (true) {
		const status = await readProbeStatus(probe);
		if (status === "started") return "primary";
		if (status === "failed") return "secondary";
		if (status !== "queued") throw new Error(`unexpected provider status: ${status}`);

		if (probe.nowMs() - startedMs >= SELECTION_DEADLINE_MS) {
			await probe.cancel();
			const finalStatus = await readProbeStatus(probe);
			if (finalStatus !== "cancelled") {
				throw new Error(`provider cancellation was not confirmed: ${finalStatus}`);
			}
			return "secondary";
		}
		await probe.sleep(POLL_INTERVAL_MS);
	}
};

const createSimulation = (
	scenario: Scenario,
): Readonly<{ probe: ProviderProbe; state: SimulationState }> => {
	const state: SimulationState = {
		cancellations: 0,
		dispatches: 0,
		nowMs: 0,
		readFailures: scenario === "retry-read" ? 2 : 0,
		reads: 0,
	};
	let isCancelled = false;
	const probe: ProviderProbe = {
		cancel: async () => {
			state.cancellations++;
			isCancelled = true;
		},
		dispatch: async () => {
			state.dispatches++;
		},
		nowMs: () => state.nowMs,
		read: async () => {
			state.reads++;
			if (state.readFailures > 0) {
				state.readFailures--;
				throw new RetryableProbeReadError("simulated transient read failure");
			}
			if (scenario !== "secondary-after-timeout") return "started";
			return isCancelled ? "cancelled" : "queued";
		},
		sleep: async (delayMs) => {
			state.nowMs += delayMs;
		},
	};
	return { probe, state };
};

export const providerSelectionSimulation = action({
	name: "provider-selection-simulation",
	description: "Simulate provider selection without external services.",
	localActionPath: "provider-selection-simulation",
	inputs: {
		scenario: choiceInput({ description: "Provider selection scenario.", options: SCENARIOS }),
	},
	outputs: {
		cancellations: stringOutput({ description: "Simulated cancellation count." }),
		dispatches: stringOutput({ description: "Simulated dispatch count." }),
		provider: stringOutput({ description: "Selected provider." }),
		reads: stringOutput({ description: "Simulated status read count." }),
		virtualMilliseconds: stringOutput({ description: "Elapsed virtual milliseconds." }),
	},
	run: async ({ input }) => {
		const simulation = createSimulation(input.scenario);
		const provider = await selectProvider(simulation.probe);
		return {
			cancellations: String(simulation.state.cancellations),
			dispatches: String(simulation.state.dispatches),
			provider,
			reads: String(simulation.state.reads),
			virtualMilliseconds: String(simulation.state.nowMs),
		};
	},
});
