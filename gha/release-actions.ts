import { action, stringInput, stringOutput } from "../src/index";

const manifestPath = ".release-please-manifest.json";

export const detectReleaseComponents = action({
	name: "Detect release components",
	description: "Identify the Release Please component versions changed by the current commit.",
	localActionPath: "detect-release-components",
	inputs: {
		before: stringInput({ description: "Git revision before the release commit.", default: "" }),
		current: stringInput({ description: "Current release commit revision." }),
	},
	outputs: {
		hollywood: stringOutput({ description: "Whether the npm package version changed." }),
		runner: stringOutput({ description: "Whether the runner image version changed." }),
	},
	run: async ({ exec, fs, input }) => {
		assertRevision(input.current);
		const before =
			input.before === ""
				? (await exec("git", ["rev-parse", `${input.current}^`])).stdout.trim()
				: input.before;
		assertRevision(before);
		const previous = parsePreviousReleaseManifest(
			(await exec("git", ["show", `${before}:${manifestPath}`])).stdout,
			`${before}:${manifestPath}`,
		);
		const current = parseReleaseManifest(await fs.readText(manifestPath), manifestPath);
		assertVersionSource(
			"package.json",
			releaseVersion(
				parseJsonRecord(await fs.readText("package.json"), "package.json")["version"],
				".",
				"package.json",
			),
			current.hollywood,
		);
		assertVersionSource(
			"runner/version.txt",
			releaseVersion(
				(await fs.readText("runner/version.txt")).trim(),
				"runner",
				"runner/version.txt",
			),
			current.runner,
		);
		const hollywood = previous.hollywood !== current.hollywood;
		const runner = previous.runner !== current.runner;
		if (!hollywood && !runner) {
			throw new Error("Release manifest changed without changing a configured component version.");
		}
		return { hollywood: String(hollywood), runner: String(runner) };
	},
});

type ReleaseManifest = Readonly<{
	hollywood: string;
	runner: string;
}>;

type PreviousReleaseManifest = Readonly<{
	hollywood: string;
	runner?: string;
}>;

const parsePreviousReleaseManifest = (source: string, name: string): PreviousReleaseManifest => {
	const record = parseJsonRecord(source, name);
	const keys = Object.keys(record).sort();
	if (keys.length === 1 && keys[0] === ".") {
		return { hollywood: releaseVersion(record["."], ".", name) };
	}
	return parseReleaseManifest(source, name);
};

const parseReleaseManifest = (source: string, name: string): ReleaseManifest => {
	const record = parseJsonRecord(source, name);
	const keys = Object.keys(record).sort();
	if (keys.length !== 2 || keys[0] !== "." || keys[1] !== "runner") {
		throw new Error("Release manifest must contain exactly '.' and 'runner'.");
	}
	return {
		hollywood: releaseVersion(record["."], ".", name),
		runner: releaseVersion(record["runner"], "runner", name),
	};
};

const parseJsonRecord = (source: string, name: string): Record<string, unknown> => {
	let value: unknown;
	try {
		value = JSON.parse(source) as unknown;
	} catch (error: unknown) {
		throw new Error(`${name} is not valid JSON.`, { cause: error });
	}
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${name} must contain a JSON object.`);
	}
	return value as Record<string, unknown>;
};

const assertVersionSource = (name: string, actual: string, expected: string): void => {
	if (actual !== expected) {
		throw new Error(`${name} version ${actual} does not match release manifest version ${expected}.`);
	}
};

const releaseVersion = (value: unknown, component: string, name: string): string => {
	if (
		typeof value !== "string" ||
		!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
			value,
		)
	) {
		throw new Error(`${name} component '${component}' must contain a SemVer version.`);
	}
	return value;
};

const assertRevision = (value: string): void => {
	if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value)) {
		throw new Error(`Release base must be a full Git object ID: ${value}.`);
	}
};
