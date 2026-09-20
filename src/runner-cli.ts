import { Command } from "@commander-js/extra-typings";

import { githubActionsRunnerImage, parseContainerProvider } from "./container";
import { readEncodedGitHubJitConfig, runGitHubRunner } from "./github-runner";
import {
	defineGitHubRunnerJitRegistration,
	generateGitHubRepositoryRunnerJitConfig,
	parseGitHubApiToken,
	parseGitHubRepository,
	writeEncodedGitHubJitConfig,
} from "./github-runner-api";
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
	generateJitConfig: typeof generateGitHubRepositoryRunnerJitConfig;
	listen: typeof runGitHubRunner;
	probe: typeof probeRunner;
	readEnvironmentVariable: (name: string) => string | undefined;
	writeJitConfig: typeof writeEncodedGitHubJitConfig;
}>;

export const createRunnerCommand = (
	io: RunnerCliIo,
	services: RunnerCliServices = {
		generateJitConfig: generateGitHubRepositoryRunnerJitConfig,
		listen: runGitHubRunner,
		probe: probeRunner,
		readEnvironmentVariable: (name) => process.env[name],
		writeJitConfig: writeEncodedGitHubJitConfig,
	},
): Command => {
	const runner = new Command("runner").description("Inspect and verify runner environments.");

	runner
		.command("jit-config")
		.description("Create one GitHub repository JIT runner configuration.")
		.argument("<repository>", "GitHub repository in OWNER/REPOSITORY format.")
		.requiredOption(
			"--runner-group-id <id>",
			"Runner group ID.",
			parsePositiveInteger,
		)
		.requiredOption("--label <labels...>", "One to 100 unique runner labels.")
		.option("--name <name>", "Runner name.", "hollywood-local")
		.option("--work-folder <path>", "Relative runner work folder.", "_work")
		.option("--output <path>", "New JIT configuration file.", ".hollywood-jit-config")
		.option("--token-env <name>", "Environment variable containing the GitHub token.", "GITHUB_TOKEN")
		.option("--api-url <url>", "GitHub REST API base URL.", parseGitHubApiUrl)
		.action(async (repository, options) => {
			const tokenEnvironmentVariable = parseEnvironmentVariableName(options.tokenEnv);
			const token = services.readEnvironmentVariable(tokenEnvironmentVariable);
			if (token === undefined) {
				throw new Error(
					`GitHub API token environment variable ${tokenEnvironmentVariable} is not set.`,
				);
			}
			const config = await services.generateJitConfig({
				...(options.apiUrl === undefined ? {} : { apiUrl: options.apiUrl }),
				repository: parseGitHubRepository(repository),
				registration: defineGitHubRunnerJitRegistration({
					labels: options.label,
					name: options.name,
					runnerGroupId: options.runnerGroupId,
					workFolder: options.workFolder,
				}),
				token: parseGitHubApiToken(token),
			});
			await services.writeJitConfig(options.output, config);
			io.writeOut(`wrote\t${options.output}\n`);
		});

	runner
		.command("listen")
		.description("Run one GitHub job with the official Actions runner.")
		.argument("<jit-config>", "File containing an encoded GitHub JIT configuration.")
		.requiredOption(
			"--provider <provider>",
			"Container provider: container, docker, or podman.",
			parseContainerProvider,
		)
		.option("--image <reference>", "Digest-pinned runner image.", githubActionsRunnerImage)
		.option(
			"--container-engine-socket <path>",
			"Docker-compatible API socket for container jobs and actions.",
		)
		.option("--diagnostics <dir>", "Directory that receives GitHub runner diagnostics.")
		.option("--job-started-hook <path>", "Executable GitHub job-started hook.")
		.option("--job-completed-hook <path>", "Executable GitHub job-completed hook.")
		.option("--container-hook <path>", "Bundled GitHub runner container hook.")
		.option("--require-job-container", "Fail jobs that do not declare a job container.", false)
		.action(async (jitConfigPath, options) => {
			await services.listen({
				...(options.containerEngineSocket === undefined
					? {}
					: {
							containerEngine: {
								kind: "docker-socket" as const,
								path: options.containerEngineSocket,
							},
						}),
				...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics }),
				encodedJitConfig: await readEncodedGitHubJitConfig(jitConfigPath),
				hooks: {
					...(options.containerHook === undefined
						? {}
						: { container: options.containerHook }),
					...(options.jobCompletedHook === undefined
						? {}
						: { jobCompleted: options.jobCompletedHook }),
					...(options.jobStartedHook === undefined
						? {}
						: { jobStarted: options.jobStartedHook }),
					requireJobContainer: options.requireJobContainer,
				},
				image: options.image,
				provider: options.provider,
			});
			io.writeOut("ok\tGitHub runner completed one job\n");
		});

	runner
		.command("probe")
		.description("Write a sanitized runner inventory.")
		.option("-o, --output <path>", "Output JSON path.")
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
		.description("Verify a runner probe against a curated contract.")
		.argument("<contract>", "Runner contract JSON.")
		.argument("<probe>", "Runner probe JSON.")
		.action(async (contractPath, probePath) => {
			const differences = verifyRunner(
				await readRunnerContract(contractPath),
				await readRunnerProbe(probePath),
			);
			writeDifferences(io, differences);
			if (differences.length > 0) {
				throw new Error(`Runner contract verification found ${differences.length} differences.`);
			}
			io.writeOut("ok\trunner contract\n");
		});

	runner
		.command("compare")
		.description("Classify differences between two runner probes.")
		.argument("<expected>", "Reference runner probe JSON.")
		.argument("<actual>", "Candidate runner probe JSON.")
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

const parsePositiveInteger = (value: string): number => {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`Runner group ID must be a positive integer. Received '${value}'.`);
	}
	return parsed;
};

const parseGitHubApiUrl = (value: string): URL => {
	try {
		return new URL(value);
	} catch (error: unknown) {
		throw new Error(`GitHub API URL is invalid: '${value}'.`, { cause: error });
	}
};

const parseEnvironmentVariableName = (value: string): string => {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
		throw new Error(`GitHub token environment variable name is invalid: '${value}'.`);
	}
	return value;
};
