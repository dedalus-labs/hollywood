import { Command } from "@commander-js/extra-typings";

import { compareRunnerProbes, verifyRunner, type RunnerDifference } from "./runner-contract";
import {
	probeRunner,
	readRunnerContract,
	readRunnerProbe,
	writeRunnerProbe,
} from "./runner";

export type RunnerCliIo = Readonly<{
	writeOut: (message: string) => void;
}>;

export type RunnerCliServices = Readonly<{
	probe: typeof probeRunner;
}>;

export const createRunnerCommand = (
	io: RunnerCliIo,
	services: RunnerCliServices = { probe: probeRunner },
): Command => {
	const runner = new Command("runner").description("Inspect and verify runner environments");

	runner
		.command("probe")
		.description("Write a sanitized runner inventory")
		.option("-o, --output <path>", "Output JSON path")
		.action(async (options) => {
			const probe = await services.probe();
			if (options.output === undefined) {
				io.writeOut(`${JSON.stringify(probe, undefined, 2)}\n`);
				return;
			}
			await writeRunnerProbe(options.output, probe);
			io.writeOut(`wrote\t${options.output}\n`);
		});

	runner
		.command("verify")
		.description("Verify a runner probe against a curated contract")
		.argument("<contract>", "Runner contract JSON")
		.argument("<probe>", "Runner probe JSON")
		.action(async (contractPath, probePath) => {
			const differences = verifyRunner(
				await readRunnerContract(contractPath),
				await readRunnerProbe(probePath),
			);
			writeDifferences(io, differences);
			if (differences.length > 0) {
				throw new Error(`runner contract failed with ${differences.length} difference(s)`);
			}
			io.writeOut("ok\trunner contract\n");
		});

	runner
		.command("compare")
		.description("Classify drift between two runner probes")
		.argument("<expected>", "Reference runner probe JSON")
		.argument("<actual>", "Candidate runner probe JSON")
		.action(async (expectedPath, actualPath) => {
			const differences = compareRunnerProbes(
				await readRunnerProbe(expectedPath),
				await readRunnerProbe(actualPath),
			);
			writeDifferences(io, differences);
			if (differences.length === 0) {
				io.writeOut("ok\tidentical runner probes\n");
			}
		});

	return runner;
};

const writeDifferences = (io: RunnerCliIo, differences: readonly RunnerDifference[]): void => {
	for (const difference of differences) {
		io.writeOut(
			`${difference.category}\t${difference.path}\t${render(difference.expected)}\t${render(difference.actual)}\n`,
		);
	}
};

const render = (value: unknown): string =>
	value === undefined ? "(missing)" : JSON.stringify(value);
