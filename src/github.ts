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
	ScriptSummary,
	SummaryCell,
	SummaryTableRow,
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
	summary?: GitHubSummary;
	warning: (message: string) => void;
}>;

export type GitHubSummary = Readonly<{
	addRaw: (text: string, addEOL?: boolean) => GitHubSummary;
	write: () => Promise<unknown>;
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
			exec: githubScriptExec(runtime.exec, runtime.core),
			fs: runtime.fs,
			log: githubScriptLog(runtime.core),
			runner: runtime.runner,
			summary: githubScriptSummary(runtime.core),
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
	(githubExec: GitHubExec, githubCore: GitHubCore) =>
	async (
		file: string,
		args: readonly string[],
		commandOptions: CommandOptions = {},
	): Promise<CommandResult> => {
		const options = githubExecOptions(commandOptions);
		const command = formatCommand(file, args);
		return githubCore.group(command, async () => {
			logCommandMetadata(githubCore, commandOptions);
			const startedAt = Date.now();
			const result = await githubExec.getExecOutput(file, [...args], options);
			const elapsed = formatElapsed(Date.now() - startedAt);
			logCommandStatus(githubCore, command, result, elapsed);
			if (result.exitCode !== 0 && commandOptions.exitPolicy !== "any") {
				throw new Error(commandFailureMessage(command, result));
			}
			return result;
		});
	};

const logCommandMetadata = (githubCore: GitHubCore, commandOptions: CommandOptions): void => {
	if (commandOptions.cwd !== undefined) {
		githubCore.info(dim(`  cwd  ${commandOptions.cwd}`));
	}
	if (commandOptions.env !== undefined) {
		const names = Object.keys(commandOptions.env).sort();
		if (names.length > 0) {
			githubCore.info(dim(`  env  ${names.join(", ")}`));
		}
	}
};

const logCommandStatus = (
	githubCore: GitHubCore,
	command: string,
	result: CommandResult,
	elapsed: string,
): void => {
	if (result.exitCode === 0) {
		githubCore.info(statusLine("ok", elapsed, command));
		return;
	}
	githubCore.info(statusLine("fail", elapsed, `${command} (exit ${result.exitCode})`));
};

const commandFailureMessage = (command: string, result: CommandResult): string => {
	const output = [formatOutputSection("stderr", result.stderr), formatOutputSection("stdout", result.stdout)]
		.filter((section) => section.length > 0)
		.join("\n");
	if (output.length === 0) {
		return `${command} exited ${result.exitCode}`;
	}
	return `${command} exited ${result.exitCode}\n${output}`;
};

const formatOutputSection = (name: "stderr" | "stdout", output: string): string => {
	const trimmed = output.trimEnd();
	if (trimmed.length === 0) {
		return "";
	}
	return `${name}:\n${trimmed}`;
};

const formatCommand = (file: string, args: readonly string[]): string =>
	[file, ...args].map(shellQuote).join(" ");

const shellQuote = (value: string): string => {
	if (value.length === 0) {
		return "''";
	}
	if (/^[A-Za-z0-9_/@%+=:,./-]+$/.test(value)) {
		return value;
	}
	return `'${value.replaceAll("'", "'\\''")}'`;
};

const formatElapsed = (elapsedMs: number): string => {
	if (elapsedMs < 1_000) {
		return `${elapsedMs}ms`;
	}
	return `${(elapsedMs / 1_000).toFixed(2)}s`;
};

const statusLine = (status: "fail" | "ok", elapsed: string, message: string): string =>
	`  ${statusColor(status)(status)}${" ".repeat(4 - status.length)}  ${elapsed.padStart(7)}  ${message}`;

const statusColor = (status: "fail" | "ok"): ((message: string) => string) =>
	status === "ok" ? green : red;

const color = (code: number, message: string): string => `\u001B[${code}m${message}\u001B[0m`;
const dim = (message: string): string => color(2, message);
const green = (message: string): string => color(32, message);
const red = (message: string): string => color(31, message);

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

const githubScriptSummary = (githubCore: GitHubCore): ScriptSummary => ({
	table: async (title, rows) => {
		if (githubCore.summary === undefined) {
			throw new Error("GitHub step summary is unavailable");
		}
		githubCore.summary.addRaw(renderSummaryTable(title, rows), true);
		await githubCore.summary.write();
	},
});

const renderSummaryTable = (title: string, rows: readonly SummaryTableRow[]): string => [
	`<h2>${escapeHtml(title)}</h2>`,
	"<table>",
	"<thead><tr><th>Detail</th><th>Value</th></tr></thead>",
	"<tbody>",
	...rows.map(summaryTableRow),
	"</tbody>",
	"</table>",
].join("\n");

const summaryTableRow = (row: SummaryTableRow): string =>
	`<tr><td>${escapeHtml(row.label)}</td><td>${formatSummaryCell(row.value)}</td></tr>`;

const formatSummaryCell = (cell: SummaryCell): string => {
	if (cell.format === "text") {
		return escapeHtml(cell.value);
	}
	if (cell.format === "code") {
		return `<code>${escapeHtml(cell.value)}</code>`;
	}
	const exhaustive: never = cell;
	return exhaustive;
};

const errorMessage = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
};

const escapeHtml = (value: string): string =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
