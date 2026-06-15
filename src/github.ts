import * as core from "@actions/core";
import * as actionsExec from "@actions/exec";

import type {
	ActionOutputValues,
	CommandEnvironment,
	CommandOptions,
	CommandResult,
	InputDefinitions,
	OutputDefinitions,
	RunnerContext,
	ScriptAction,
	ScriptFs,
	ScriptLog,
	WorkflowInputValues,
} from "./script";
import { currentRunner, nodeFs } from "./local";
import { toGitHubName } from "./names";
import { runAction } from "./script";

export type GitHubInputOptions = Readonly<{
	required?: boolean;
	trimWhitespace?: boolean;
}>;

export type GitHubCore = Readonly<{
	getInput: (name: string, options?: GitHubInputOptions) => string;
	group: <Value>(name: string, run: () => Promise<Value>) => Promise<Value>;
	info: (message: string) => void;
	setOutput: (name: string, value: string) => void;
	setFailed: (message: string) => void;
	warning: (message: string) => void;
}>;

export type GitHubExecOptions = Readonly<{
	cwd?: string;
	env?: CommandEnvironment;
	ignoreReturnCode?: boolean;
}>;

export type GitHubExec = Readonly<{
	getExecOutput: (
		file: string,
		args?: string[],
		options?: GitHubExecOptions,
	) => Promise<CommandResult>;
}>;

export type RunGitHubActionOptions = Readonly<{
	core?: GitHubCore;
	exec?: GitHubExec;
	fs?: ScriptFs;
	runner?: RunnerContext;
}>;

export const runGitHubAction = async <
	const Inputs extends InputDefinitions,
	const Outputs extends OutputDefinitions,
>(
	scriptAction: ScriptAction<Inputs, Outputs>,
	options: RunGitHubActionOptions = {},
): Promise<ActionOutputValues<Outputs>> => {
	const githubCore = options.core ?? core;
	try {
		const runtime = {
			core: githubCore,
			exec: options.exec ?? actionsExec,
			fs: options.fs ?? nodeFs,
			runner: options.runner ?? currentRunner(),
		};
		const outputs = await runAction(scriptAction, {
			with: readGitHubInputs(scriptAction.inputs, runtime.core),
			exec: githubScriptExec(runtime.exec),
			fs: runtime.fs,
			log: githubScriptLog(runtime.core),
			runner: runtime.runner,
		});
		for (const [name, value] of Object.entries(outputs)) {
			runtime.core.setOutput(toGitHubName(name), value);
		}
		return outputs;
	} catch (error: unknown) {
		githubCore.setFailed(errorMessage(error));
		throw error;
	}
};

const readGitHubInputs = <const Inputs extends InputDefinitions>(
	inputs: Inputs,
	githubCore: GitHubCore,
): WorkflowInputValues<Inputs> => {
	const values = new Map<string, string>();
	for (const [name, input] of Object.entries(inputs)) {
		const githubName = toGitHubName(name);
		const required = input.default === undefined;
		const value = githubCore.getInput(githubName, { required });
		if (value.length === 0) {
			if (required) {
				throw new Error(`${githubName} is required`);
			}
			continue;
		}
		values.set(name, value);
	}
	return Object.fromEntries(values) as WorkflowInputValues<Inputs>;
};

const githubScriptExec =
	(githubExec: GitHubExec) =>
	async (
		file: string,
		args: readonly string[],
		commandOptions: CommandOptions = {},
	): Promise<CommandResult> => {
		const options = githubExecOptions(commandOptions);
		const result = await githubExec.getExecOutput(file, [...args], options);
		if (result.exitCode !== 0 && commandOptions.exitPolicy !== "any") {
			throw new Error(`${file} exited ${result.exitCode}: ${result.stderr}${result.stdout}`);
		}
		return result;
	};

const githubExecOptions = (commandOptions: CommandOptions): GitHubExecOptions => {
	const options: { cwd?: string; env?: CommandEnvironment; ignoreReturnCode?: boolean } = {};
	if (commandOptions.cwd !== undefined) {
		options.cwd = commandOptions.cwd;
	}
	if (commandOptions.env !== undefined) {
		options.env = commandEnvironment(commandOptions.env);
	}
	if (commandOptions.exitPolicy === "any") {
		options.ignoreReturnCode = true;
	}
	return options;
};

const commandEnvironment = (overrides: CommandEnvironment): CommandEnvironment => ({
	...definedProcessEnvironment(),
	...overrides,
});

const definedProcessEnvironment = (): CommandEnvironment =>
	Object.fromEntries(
		Object.entries(process.env).filter(
			(entry): entry is [string, string] => entry[1] !== undefined,
		),
	);

const githubScriptLog = (githubCore: GitHubCore): ScriptLog => ({
	info: (message) => {
		githubCore.info(message);
	},
	warning: (message) => {
		githubCore.warning(message);
	},
	group: (name, run) => githubCore.group(name, run),
});

const errorMessage = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
};
