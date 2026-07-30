import {
	action,
	choiceInput,
	pathInput,
	stringInput,
	type ActionInputValues,
	type ScriptExec,
	type ScriptLog,
} from "../src/index";
import { withLocalContainer, type ContainerProvider } from "../src/container";
import { verifyRunner } from "../src/runner-contract";
import {
	probeRunner,
	readRunnerContract,
	readRunnerProbe,
	writeRunnerProbe,
} from "../src/runner";

export const captureRunnerProbe = action({
	name: "Capture runner probe",
	description: "Write a sanitized, typed inventory of the current runner.",
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
	description: "Prove that a runner probe satisfies the Hollywood contract.",
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
			throw new Error(`runner contract failed: ${JSON.stringify(differences)}`);
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
	description: "Build the runner image and prove its Hollywood contract.",
	localActionPath: "verify-runner-image",
	inputs: verifyRunnerImageInputs,
	outputs: {},
	run: verifyRunnerImageRun,
});

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
				"runner image verification and cleanup failed",
			);
		}
		throw cleanupError;
	}
	if (failure !== undefined) {
		throw failure;
	}
};

const removeImageArgs = (
	provider: ContainerProvider,
	image: string,
): readonly string[] =>
	provider === "container"
		? ["image", "delete", image]
		: ["image", "rm", "--force", image];

const requiredVariable = (name: string): string => {
	const value = process.env[name];
	if (value === undefined || value === "") {
		throw new Error(`${name} is required`);
	}
	return value;
};
