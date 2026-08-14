import {
	action,
	choiceInput,
	pathInput,
	stringInput,
	stringOutput,
	type ActionInputValues,
	type ScriptExec,
	type ScriptLog,
} from "../src/index";
import {
	githubActionsRunnerVersion,
	withLocalContainer,
	type ContainerProvider,
} from "../src/container";
import { verifyRunner } from "../src/runner-contract";
import { probeRunner, readRunnerContract, readRunnerProbe, writeRunnerProbe } from "../src/runner";

export const captureRunnerProbe = action({
	name: "Capture runner probe",
	description: "Write a sanitized inventory of the current runner.",
	localActionPath: "capture-runner-probe",
	inputs: {
		output: pathInput({ description: "Probe JSON output path." }),
	},
	outputs: {},
	run: async ({ input }) => {
		await writeRunnerProbe(input.output, await probeRunner());
		return {};
	},
});

export const verifyRunnerProbe = action({
	name: "Verify runner probe",
	description: "Verify that a runner probe satisfies the Hollywood contract.",
	localActionPath: "verify-runner-probe",
	inputs: {
		contract: pathInput({ description: "Runner contract JSON." }),
		probe: pathInput({ description: "Runner probe JSON." }),
	},
	outputs: {},
	run: async ({ input }) => {
		const differences = verifyRunner(
			await readRunnerContract(input.contract),
			await readRunnerProbe(input.probe),
		);
		if (differences.length > 0) {
			throw new Error(`Runner contract verification failed: ${JSON.stringify(differences)}.`);
		}
		return {};
	},
});

export class RunnerImageNotPublicError extends Error {
	readonly image: string;

	constructor(image: string, cause: unknown) {
		super(
			`Published runner image '${image}' is not anonymously readable. Change package visibility to Public in the GitHub Container registry package settings.`,
			{ cause },
		);
		this.name = "RunnerImageNotPublicError";
		this.image = image;
	}
}

export class RunnerImageAnonymousPullError extends Error {
	readonly exitCode: number;
	readonly image: string;

	constructor(image: string, exitCode: number, output: string) {
		super(`Anonymous pull of published runner image '${image}' exited ${exitCode}: ${output}`);
		this.name = "RunnerImageAnonymousPullError";
		this.exitCode = exitCode;
		this.image = image;
	}
}

const prepareRunnerImageReleaseInputs = {
	image: stringInput({ description: "OCI image name without a tag." }),
	ref: stringInput({ description: "Fully qualified Git ref." }),
	refName: stringInput({ description: "Git branch or tag name." }),
	revision: stringInput({ description: "Git revision embedded in the image." }),
	versionFile: pathInput({
		description: "Runner image version file.",
		default: "runner/version.txt",
	}),
} as const;

export const prepareRunnerImageRelease = action({
	name: "Prepare runner image release",
	description: "Validate the release identity and derive OCI tags.",
	localActionPath: "prepare-runner-image-release",
	inputs: prepareRunnerImageReleaseInputs,
	outputs: {
		sourceRef: stringOutput({ description: "Validated source ref." }),
		tags: stringOutput({ description: "Newline-separated OCI tags." }),
		version: stringOutput({ description: "OCI image version label." }),
	},
	run: async ({ fs, input }) => {
		assertImageName(input.image);
		assertRevision(input.revision);
		const version = parseImageVersion((await fs.readText(input.versionFile)).trim());
		const immutableTag = `${input.image}:sha-${input.revision}`;
		const expectedTag = `runner-v${version.value}`;
		if (input.ref !== `refs/tags/${input.refName}`) {
			throw new Error(`GitHub release ref ${input.ref} does not contain tag ${input.refName}.`);
		}
		if (input.refName !== expectedTag) {
			throw new Error(
				`GitHub release tag ${input.refName} does not match runner image version ${version.value}.`,
			);
		}

		const tags = [immutableTag, `${input.image}:${version.value}`];
		if (!version.prerelease) {
			tags.push(
				`${input.image}:${version.major}.${version.minor}`,
				`${input.image}:${version.value}-ubuntu-24.04`,
				`${input.image}:${version.major}.${version.minor}-ubuntu-24.04`,
				`${input.image}:latest`,
				`${input.image}:ubuntu-24.04`,
			);
		} else {
			tags.push(`${input.image}:${version.value}-ubuntu-24.04`);
		}
		return {
			sourceRef: input.ref,
			tags: tags.join("\n"),
			version: version.value,
		};
	},
});

const verifyPublishedRunnerImageInputs = {
	digest: stringInput({ description: "Published OCI manifest digest." }),
	image: stringInput({ description: "Published OCI image name without a tag." }),
	repository: stringInput({ description: "GitHub source repository." }),
	sourceDigest: stringInput({ description: "Git source revision attested by GitHub." }),
	sourceRef: stringInput({ description: "Git source ref attested by GitHub." }),
} as const;

export const verifyPublishedRunnerImage = action({
	name: "Verify published runner image",
	description: "Verify GitHub provenance and anonymous registry access.",
	localActionPath: "verify-published-runner-image",
	inputs: verifyPublishedRunnerImageInputs,
	outputs: {},
	run: async ({ exec, input }) => {
		assertImageName(input.image);
		assertDigest(input.digest);
		assertRevision(input.sourceDigest);
		assertRepository(input.repository);
		assertSourceRef(input.sourceRef);
		const subject = `${input.image}@${input.digest}`;
		await exec("gh", [
			"attestation",
			"verify",
			`oci://${subject}`,
			"--repo",
			input.repository,
			"--signer-workflow",
			`${input.repository}/.github/workflows/runner-image.yml`,
			"--source-digest",
			input.sourceDigest,
			"--source-ref",
			input.sourceRef,
			"--bundle-from-oci",
			"--deny-self-hosted-runners",
		]);
		await exec("docker", ["logout", "ghcr.io"]);
		const pull = await exec("docker", ["pull", subject], { exitPolicy: "any" });
		if (pull.exitCode !== 0) {
			const output = `${pull.stderr}${pull.stdout}`.trim();
			if (/\b(?:denied|unauthorized)\b/i.test(output)) {
				throw new RunnerImageNotPublicError(input.image, new Error(output));
			}
			throw new RunnerImageAnonymousPullError(input.image, pull.exitCode, output);
		}
		return {};
	},
});

const verifyRunnerImageInputs = {
	containerfile: pathInput({
		description: "Runner image Containerfile.",
		default: "runner/Containerfile",
	}),
	context: pathInput({ description: "Runner image build context.", default: "runner" }),
	contract: pathInput({
		description: "Runner contract JSON.",
		default: "runner/contract.json",
	}),
	image: stringInput({
		description: "Temporary local image tag.",
		default: "hollywood-runner:verify",
	}),
	provider: choiceInput({
		description: "Container provider used to build and verify.",
		options: ["container", "docker", "podman"] as const,
		default: "docker",
	}),
} as const;

export const verifyRunnerImage = action({
	name: "Verify runner image",
	description: "Build the runner image and verify its Hollywood contract.",
	localActionPath: "verify-runner-image",
	inputs: verifyRunnerImageInputs,
	outputs: {},
	run: verifyRunnerImageRun,
});

export const verifyRunnerVersion = async (exec: ScriptExec): Promise<void> => {
	const runnerVersion = (
		await exec("/home/runner/bin/Runner.Listener", ["--version"], {
			env: { ACTIONS_RUNNER_PRINT_LOG_TO_STDOUT: "0" },
		})
	).stdout.trim();
	if (runnerVersion !== githubActionsRunnerVersion) {
		throw new Error(
			`Runner.Listener version must be ${githubActionsRunnerVersion}. Received ${runnerVersion}.`,
		);
	}
};

async function verifyRunnerImageRun(
	context: Readonly<{
		exec: ScriptExec;
		input: ActionInputValues<typeof verifyRunnerImageInputs>;
		log: Pick<ScriptLog, "info">;
	}>,
): Promise<Record<never, never>> {
	const workspace = requiredVariable("GITHUB_WORKSPACE");
	const revision = requiredVariable("GITHUB_SHA");
	await withBuiltImage(
		{
			containerfile: context.input.containerfile,
			context: context.input.context,
			exec: context.exec,
			image: context.input.image,
			provider: context.input.provider,
			revision,
			workspace,
		},
		async () => {
			const verification = await withLocalContainer(
				{
					hostExec: context.exec,
					image: context.input.image,
					provider: context.input.provider,
					workspace,
				},
				async ({ exec }) => {
					await verifyRunnerVersion(exec);
					await exec("node", [
						"dist/cli.js",
						"runner",
						"probe",
						"--output",
						"/github/temp/runner.json",
					]);
					return exec("node", [
						"dist/cli.js",
						"runner",
						"verify",
						context.input.contract,
						"/github/temp/runner.json",
					]);
				},
			);
			context.log.info(verification.stdout.trim());
		},
	);
	return {};
}

type BuiltImageOptions = Readonly<{
	containerfile: string;
	context: string;
	exec: ScriptExec;
	image: string;
	provider: ContainerProvider;
	revision: string;
	workspace: string;
}>;

const withBuiltImage = async (
	options: BuiltImageOptions,
	run: () => Promise<void>,
): Promise<void> => {
	let failure: unknown;
	await options.exec(options.provider, [
		"build",
		"--file",
		options.containerfile,
		"--tag",
		options.image,
		"--build-arg",
		`SOURCE_REVISION=${options.revision}`,
		options.context,
	]);
	try {
		await run();
	} catch (error: unknown) {
		failure = error;
	}
	try {
		await options.exec(options.provider, removeImageArgs(options.provider, options.image));
	} catch (cleanupError: unknown) {
		if (failure !== undefined) {
			throw new AggregateError(
				[failure, cleanupError],
				"Runner image verification and cleanup failed.",
			);
		}
		throw cleanupError;
	}
	if (failure !== undefined) {
		throw failure;
	}
};

const removeImageArgs = (provider: ContainerProvider, image: string): readonly string[] =>
	provider === "container" ? ["image", "delete", image] : ["image", "rm", "--force", image];

const requiredVariable = (name: string): string => {
	const value = process.env[name];
	if (value === undefined || value === "") {
		throw new Error(`${name} is required.`);
	}
	return value;
};

type ImageVersion = Readonly<{
	major: string;
	minor: string;
	prerelease: boolean;
	value: string;
}>;

const parseImageVersion = (value: string): ImageVersion => {
	const match =
		/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
	if (match === null) {
		throw new Error(`Runner image version must be release-tag-compatible SemVer: ${value}.`);
	}
	return {
		major: match[1] as string,
		minor: match[2] as string,
		prerelease: match[4] !== undefined,
		value,
	};
};

const assertImageName = (value: string): void => {
	if (!/^ghcr\.io\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(value)) {
		throw new Error(`Runner image must be an untagged GHCR image name: ${value}.`);
	}
};

const assertDigest = (value: string): void => {
	if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
		throw new Error(`Runner image digest must be a SHA-256 digest: ${value}.`);
	}
};

const assertRevision = (value: string): void => {
	if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value)) {
		throw new Error(`Source revision must be a full Git object ID: ${value}.`);
	}
};

const assertRepository = (value: string): void => {
	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
		throw new Error(`GitHub repository must use the owner/name format: ${value}.`);
	}
};

const assertSourceRef = (value: string): void => {
	if (!/^refs\/(?:heads|tags)\/[A-Za-z0-9._/-]+$/.test(value)) {
		throw new Error(`Source ref must be a branch or tag ref: ${value}.`);
	}
};
