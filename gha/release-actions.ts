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
		hollywoodTag: stringOutput({ description: "Expected npm package release tag." }),
		runner: stringOutput({ description: "Whether the runner image version changed." }),
		runnerTag: stringOutput({ description: "Expected runner image release tag." }),
	},
	run: async ({ exec, fs, input }) => {
		assertRevision(input.current);
		const before =
			input.before === ""
				? (await exec("git", ["rev-parse", `${input.current}^`])).stdout.trim()
				: input.before;
		assertRevision(before);
		const previous = parseReleaseManifest(
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
		if (current.runner !== undefined) {
			assertVersionSource(
				"runner/version.txt",
				releaseVersion(
					(await fs.readText("runner/version.txt")).trim(),
					"runner",
					"runner/version.txt",
				),
				current.runner,
			);
		}
		const hollywood = previous.hollywood !== current.hollywood;
		const runner = current.runner !== undefined && previous.runner !== current.runner;
		if (!hollywood && !runner) {
			throw new Error("Release manifest changed without changing a configured component version.");
		}
		return {
			hollywood: String(hollywood),
			hollywoodTag: hollywood ? `v${current.hollywood}` : "",
			runner: String(runner),
			runnerTag: runner ? `runner-v${current.runner}` : "",
		};
	},
});

export const publishDraftReleases = action({
	name: "Publish draft releases",
	description: "Publish validated component drafts as immutable GitHub releases.",
	localActionPath: "publish-draft-releases",
	inputs: {
		hollywoodTag: stringInput({ description: "Hollywood release tag.", default: "" }),
		repository: stringInput({ description: "GitHub owner/repository name." }),
		runnerTag: stringInput({ description: "Runner release tag.", default: "" }),
		token: stringInput({ description: "GitHub token with release write access." }),
	},
	outputs: {},
	run: async ({ exec, input }) => {
		assertRepository(input.repository);
		const tags = [input.hollywoodTag, input.runnerTag].filter((tag) => tag !== "");
		if (tags.length === 0) {
			throw new Error("At least one release tag is required.");
		}

		for (const tag of tags) {
			assertReleaseTag(tag);
			const options = { env: { GH_TOKEN: input.token } };
			const release = parseGitHubRelease(
				(
					await exec(
						"gh",
						["api", `repos/${input.repository}/releases/tags/${tag}`],
						options,
					)
				).stdout,
				tag,
			);
			if (!release.draft) {
				assertImmutableRelease(release);
				continue;
			}

			const published = parseGitHubRelease(
				(
					await exec(
						"gh",
						[
							"api",
							`repos/${input.repository}/releases/${release.id}`,
							"--method",
							"PATCH",
							"-F",
							"draft=false",
						],
						options,
					)
				).stdout,
				tag,
			);
			assertImmutableRelease(published);
		}

		return {};
	},
});

type GitHubRelease = Readonly<{
	draft: boolean;
	id: number;
	immutable: boolean;
	tagName: string;
}>;

const parseGitHubRelease = (source: string, expectedTag: string): GitHubRelease => {
	const record = parseJsonRecord(source, `GitHub release ${expectedTag}`);
	const id = record["id"];
	const tagName = record["tag_name"];
	const draft = record["draft"];
	const immutable = record["immutable"];
	if (!Number.isSafeInteger(id) || (id as number) <= 0) {
		throw new Error(`GitHub release ${expectedTag} must contain a positive integer id.`);
	}
	if (tagName !== expectedTag) {
		throw new Error(`GitHub release tag ${String(tagName)} does not match ${expectedTag}.`);
	}
	if (typeof draft !== "boolean" || typeof immutable !== "boolean") {
		throw new Error(`GitHub release ${expectedTag} must contain draft and immutable booleans.`);
	}
	return { draft, id: id as number, immutable, tagName };
};

const assertImmutableRelease = (release: GitHubRelease): void => {
	if (release.draft) {
		throw new Error(`Release ${release.tagName} is still a draft.`);
	}
	if (!release.immutable) {
		throw new Error(`Release ${release.tagName} is published but is not immutable.`);
	}
};

const assertRepository = (value: string): void => {
	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
		throw new Error(`GitHub repository must use owner/name form: ${value}.`);
	}
};

const assertReleaseTag = (value: string): void => {
	const version = value.startsWith("runner-v")
		? value.slice("runner-v".length)
		: value.startsWith("v")
			? value.slice(1)
			: "";
	releaseVersion(version, "tag", value);
};

type ReleaseManifest = Readonly<{
	hollywood: string;
	runner?: string;
}>;

const parseReleaseManifest = (source: string, name: string): ReleaseManifest => {
	const record = parseJsonRecord(source, name);
	const keys = Object.keys(record).sort();
	if (
		!((keys.length === 1 && keys[0] === ".") ||
			(keys.length === 2 && keys[0] === "." && keys[1] === "runner"))
	) {
		throw new Error("Release manifest must contain '.' and may contain 'runner'.");
	}
	return {
		hollywood: releaseVersion(record["."], ".", name),
		...(record["runner"] === undefined
			? {}
			: { runner: releaseVersion(record["runner"], "runner", name) }),
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
