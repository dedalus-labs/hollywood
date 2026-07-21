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

type GitHubExecListeners = Readonly<{
	stderr?: (data: Buffer) => void;
	stdout?: (data: Buffer) => void;
}>;

export type GitHubExecOptions = Readonly<{
	cwd?: string;
	env?: CommandEnvironment;
	ignoreReturnCode?: boolean;
	listeners?: GitHubExecListeners;
	silent?: boolean;
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
): Promise<ActionOutputValues<Outputs> | undefined> => {
	const githubCore = options.core ?? core;
	const report = createCommandReport(scriptAction.name);
	try {
		const runtime = {
			core: githubCore,
			exec: options.exec ?? actionsExec,
			fs: options.fs ?? nodeFs,
			runner: options.runner ?? currentRunner(),
		};
		const outputs = await runAction(scriptAction, {
			with: readGitHubInputs(scriptAction.inputs, runtime.core),
			exec: githubScriptExec(runtime.exec, runtime.core, report),
			fs: runtime.fs,
			log: githubScriptLog(runtime.core),
			runner: runtime.runner,
			summary: githubScriptSummary(runtime.core),
		});
		for (const [name, value] of Object.entries(outputs)) {
			runtime.core.setOutput(toGitHubName(name), value);
		}
		await writeCommandSummary(runtime.core, report);
		return outputs;
	} catch (error: unknown) {
		await writeCommandSummary(githubCore, report);
		githubCore.setFailed(errorMessage(error));
		return undefined;
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
	(githubExec: GitHubExec, githubCore: GitHubCore, report: CommandReport) =>
	async (
		file: string,
		args: readonly string[],
		commandOptions: CommandOptions = {},
	): Promise<CommandResult> => {
		const options = githubExecOptions(commandOptions);
		const command = formatCommandLabel(file, args);
		return githubCore.group(command, async () => {
			logCommandMetadata(githubCore, commandOptions);
			const startedAt = Date.now();
			let result: CommandResult;
			try {
				result = await githubExec.getExecOutput(file, [...args], options);
			} catch (error: unknown) {
				const elapsed = formatElapsed(Date.now() - startedAt);
				report.commands.push({
					elapsed,
					label: command,
					status: "fail",
				});
				logCommandStatus(githubCore, command, elapsed, "fail");
				throw error;
			}
			const elapsed = formatElapsed(Date.now() - startedAt);
			const status = commandStatus(result, commandOptions);
			const label = commandStatusLabel(command, result);
			report.commands.push({
				elapsed,
				label,
				status,
			});
			logCommandStatus(githubCore, label, elapsed, status);
			if (result.exitCode !== 0 && commandOptions.exitPolicy !== "any") {
				throw new Error(`${command} exited ${result.exitCode}`);
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
	label: string,
	elapsed: string,
	status: CommandStatus,
): void => {
	githubCore.info(statusLine(status, elapsed, label));
};

const commandStatus = (
	result: CommandResult,
	commandOptions: CommandOptions,
): CommandStatus => {
	if (result.exitCode === 0) {
		return "ok";
	}
	if (commandOptions.exitPolicy === "any") {
		return "exit";
	}
	return "fail";
};

const commandStatusLabel = (label: string, result: CommandResult): string => {
	if (result.exitCode === 0) {
		return label;
	}
	return `${label} (exit ${result.exitCode})`;
};

type CommandReport = Readonly<{
	actionName: string;
	commands: CommandReportEntry[];
}>;

type CommandReportEntry = Readonly<{
	elapsed: string;
	label: string;
	status: CommandStatus;
}>;

const createCommandReport = (actionName: string): CommandReport => ({
	actionName,
	commands: [],
});

const writeCommandSummary = async (
	githubCore: GitHubCore,
	report: CommandReport,
): Promise<void> => {
	if (githubCore.summary === undefined || report.commands.length === 0) {
		return;
	}
	try {
		githubCore.summary.addRaw(renderCommandSummary(report), true);
		await githubCore.summary.write();
	} catch (error: unknown) {
		githubCore.warning(`could not write Hollywood step summary: ${errorMessage(error)}`);
	}
};

const renderCommandSummary = (report: CommandReport): string => [
	`### Hollywood: ${escapeHtml(report.actionName)}`,
	"",
	"<table>",
	"<thead><tr><th>Status</th><th>Time</th><th>Command</th></tr></thead>",
	"<tbody>",
	...report.commands.map(summaryRow),
	"</tbody>",
	"</table>",
].join("\n");

const summaryRow = (command: CommandReportEntry): string => [
	"<tr>",
	`<td><code>${command.status}</code></td>`,
	`<td align="right"><code>${escapeHtml(command.elapsed)}</code></td>`,
	`<td><code>${escapeHtml(command.label)}</code></td>`,
	"</tr>",
].join("");

const formatCommandLabel = (file: string, args: readonly string[]): string =>
	formatCompactCommand(file, args);

const formatCompactCommand = (file: string, args: readonly string[]): string => {
	const shownArgs = args.slice(0, 6).map(compactArgument);
	const hidden = args.length - shownArgs.length;
	const command = [file, ...shownArgs].map(displayQuote).join(" ");
	return hidden > 0 ? `${command} ... +${hidden} args` : command;
};

const compactArgument = (value: string): string => compactUri(value) ?? compactPath(value);

const compactUri = (value: string): string | undefined => {
	const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/]+)\/?(.*)$/.exec(value);
	if (match === null) {
		return undefined;
	}
	const [, scheme, authority, path] = match;
	if (scheme === undefined || authority === undefined) {
		return undefined;
	}
	if (path === undefined || path.length === 0) {
		return `${scheme}://${authority}`;
	}
	const trailingSlash = path.endsWith("/");
	const parts = path.split("/").filter((part) => part.length > 0);
	if (parts.length <= 2 && value.length <= 96) {
		return value;
	}
	const tail = parts.slice(-2).map(compactSegment).join("/");
	return `${scheme}://${authority}/.../${tail}${trailingSlash ? "/" : ""}`;
};

const compactPath = (value: string): string => {
	if (value.includes("\n") || value.includes("\r")) {
		return "<inline script>";
	}
	if (value.length <= 96) {
		return value;
	}
	const parts = value.split("/").filter((part) => part.length > 0);
	if (parts.length >= 3 && value.startsWith("/")) {
		return `/.../${parts.slice(-2).map(compactSegment).join("/")}`;
	}
	return compactSegment(value);
};

const compactSegment = (value: string): string => {
	if (value.length <= 48) {
		return value;
	}
	return `${value.slice(0, 20)}...${value.slice(-20)}`;
};

const shellQuote = (value: string): string => {
	if (value.length === 0) {
		return "''";
	}
	if (/^[A-Za-z0-9_/@%+=:,./-]+$/.test(value)) {
		return value;
	}
	return `'${value.replaceAll("'", "'\\''")}'`;
};

const displayQuote = (value: string): string => {
	if (value.startsWith("<") && value.endsWith(">")) {
		return value;
	}
	return shellQuote(value);
};

const formatElapsed = (elapsedMs: number): string => {
	if (elapsedMs < 1_000) {
		return `${elapsedMs}ms`;
	}
	return `${(elapsedMs / 1_000).toFixed(2)}s`;
};

type CommandStatus = "exit" | "fail" | "ok";

const statusLine = (status: CommandStatus, elapsed: string, message: string): string =>
	`  ${statusColor(status)(status)}${" ".repeat(4 - status.length)}  ${elapsed.padStart(7)}  ${message}`;

const statusColor = (status: CommandStatus): ((message: string) => string) => {
	if (status === "ok") {
		return green;
	}
	if (status === "exit") {
		return yellow;
	}
	return red;
};

const color = (code: number, message: string): string => `\u001B[${code}m${message}\u001B[0m`;
const dim = (message: string): string => color(2, message);
const green = (message: string): string => color(32, message);
const red = (message: string): string => color(31, message);
const yellow = (message: string): string => color(33, message);

const githubExecOptions = (commandOptions: CommandOptions): GitHubExecOptions => {
	const options: {
		cwd?: string;
		env?: CommandEnvironment;
		ignoreReturnCode: boolean;
		listeners: GitHubExecListeners;
		silent: boolean;
	} = {
		ignoreReturnCode: true,
		listeners: {
			stderr: (data) => {
				process.stderr.write(data);
			},
			stdout: (data) => {
				process.stdout.write(data);
			},
		},
		silent: true,
	};
	if (commandOptions.cwd !== undefined) {
		options.cwd = commandOptions.cwd;
	}
	if (commandOptions.env !== undefined) {
		options.env = commandEnvironment(commandOptions.env);
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
