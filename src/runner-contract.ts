import { z } from "zod";

import {
	runnerContractSchema,
	runnerProbeSchema,
	type RunnerArchitecture,
	type RunnerContract,
	type RunnerDifference,
	type RunnerEnvironmentName,
	type RunnerProbe,
} from "./runner-schema";

export type {
	RunnerContract,
	RunnerDifference,
	RunnerPackageProbe,
	RunnerPathProbe,
	RunnerProbe,
	RunnerToolProbe,
} from "./runner-schema";

export const defineRunnerContract = (contract: RunnerContract): RunnerContract => {
	assertUnique(contract.architectures, "runner contract architectures");
	assertUnique(contract.paths, "runner contract paths");
	assertUniqueNames(contract.tools, "runner contract tools");
	return contract;
};

export const verifyRunner = (
	contract: RunnerContract,
	probe: RunnerProbe,
): readonly RunnerDifference[] => {
	const differences: RunnerDifference[] = [];
	difference(differences, "schemaVersion", contract.schemaVersion, probe.schemaVersion);
	difference(differences, "platform.os.id", contract.os.id, probe.platform.os.id);
	difference(
		differences,
		"platform.os.versionId",
		contract.os.versionId,
		probe.platform.os.versionId,
	);
	if (!contract.architectures.includes(probe.platform.architecture as RunnerArchitecture)) {
		differences.push({
			category: "contract",
			actual: probe.platform.architecture,
			expected: contract.architectures,
			path: "platform.architecture",
		});
	}
	for (const [name, expected] of Object.entries(contract.environment)) {
		difference(
			differences,
			`environment.${name}`,
			expected,
			probe.environment[name as RunnerEnvironmentName],
		);
	}
	for (const name of contract.paths) {
		const path = probe.paths.find((candidate) => candidate.name === name);
		difference(differences, `paths.${name}.status`, "ready", path?.status);
		if (path?.status === "ready") {
			difference(differences, `paths.${name}.absolute`, true, path.absolute);
			difference(differences, `paths.${name}.exists`, true, path.exists);
			difference(differences, `paths.${name}.writable`, true, path.writable);
		}
	}
	for (const expected of contract.tools) {
		const tool = probe.tools.find((candidate) => candidate.name === expected.name);
		difference(differences, `tools.${expected.name}.status`, "ready", tool?.status);
		if (
			tool?.status === "ready" &&
			expected.versionPrefix !== undefined &&
			!tool.version.startsWith(expected.versionPrefix)
		) {
			differences.push({
				category: "contract",
				actual: tool.version,
				expected: `${expected.versionPrefix}*`,
				path: `tools.${expected.name}.version`,
			});
		}
	}
	return differences;
};

export const compareRunnerProbes = (
	expected: RunnerProbe,
	actual: RunnerProbe,
): readonly RunnerDifference[] =>
	compareValues("", comparisonShape(expected), comparisonShape(actual));

export const parseRunnerContract = (contents: string): RunnerContract =>
	defineRunnerContract(parseJson(runnerContractSchema, contents, "runner contract"));

export const parseRunnerProbe = (contents: string): RunnerProbe => {
	const probe = parseJson(runnerProbeSchema, contents, "runner probe");
	assertUniqueNames(probe.packages.packages, "runner probe packages");
	assertUniqueNames(probe.paths, "runner probe paths");
	assertUniqueNames(probe.tools, "runner probe tools");
	return probe;
};

const parseJson = <Schema extends z.ZodType>(
	schema: Schema,
	contents: string,
	name: string,
): z.infer<Schema> => {
	let value: unknown;
	try {
		value = JSON.parse(contents);
	} catch (error) {
		throw new Error(`${name} is not valid JSON`, { cause: error });
	}
	const result = schema.safeParse(value);
	if (result.success) {
		return result.data;
	}
	const issue = result.error.issues[0];
	const path = issue === undefined || issue.path.length === 0 ? "" : ` at ${issue.path.join(".")}`;
	throw new Error(`${name} is invalid${path}: ${issue?.message ?? "unknown schema error"}`, {
		cause: result.error,
	});
};

const comparisonShape = (probe: RunnerProbe): unknown => ({
	...probe,
	packages: {
		...probe.packages,
		packages: Object.fromEntries(
			probe.packages.packages.map((entry) => [entry.name, entry]),
		),
	},
	paths: Object.fromEntries(probe.paths.map((entry) => [entry.name, entry])),
	tools: Object.fromEntries(probe.tools.map((entry) => [entry.name, entry])),
});

const compareValues = (path: string, expected: unknown, actual: unknown): RunnerDifference[] => {
	if (Object.is(expected, actual)) {
		return [];
	}
	if (Array.isArray(expected) && Array.isArray(actual)) {
		const length = Math.max(expected.length, actual.length);
		return Array.from({ length }, (_, index) =>
			compareValues(joinPath(path, String(index)), expected[index], actual[index]),
		).flat();
	}
	if (isRecord(expected) && isRecord(actual)) {
		const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
		return keys.flatMap((key) =>
			compareValues(joinPath(path, key), expected[key], actual[key]),
		);
	}
	return [{ category: differenceCategory(path), actual, expected, path }];
};

const differenceCategory = (path: string): RunnerDifference["category"] => {
	if (/^(identity|platform\.(architecture|capabilities|cgroup|kernel))/.test(path)) {
		return "provider";
	}
	if (
		/^(packages|toolCache)/.test(path) ||
		/^tools\.[^.]+\.(path|version)$/.test(path) ||
		/^environment\.Image(?:OS|Version)$/.test(path) ||
		/^paths\.[^.]+\.value$/.test(path)
	) {
		return "inventory";
	}
	return "contract";
};

const difference = (
	differences: RunnerDifference[],
	path: string,
	expected: unknown,
	actual: unknown,
): void => {
	if (!Object.is(expected, actual)) {
		differences.push({ category: "contract", actual, expected, path });
	}
};

const assertUniqueNames = (
	entries: readonly Readonly<{ name: string }>[],
	name: string,
): void => assertUnique(entries.map(({ name }) => name), `${name} names`);

const assertUnique = (values: readonly string[], name: string): void => {
	if (new Set(values).size !== values.length) {
		throw new Error(`${name} must be unique`);
	}
};

const joinPath = (prefix: string, suffix: string): string =>
	prefix === "" ? suffix : `${prefix}.${suffix}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);
