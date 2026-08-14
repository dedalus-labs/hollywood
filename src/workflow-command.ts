import { expr, type GitHubExpression } from "./expressions";

const workflowRunBrand = Symbol.for("@dedalus-labs/hollywood.workflow-run");

export type WorkflowCommandOptions = Readonly<{
	file: string;
	args: readonly string[];
}>;

export type WorkflowCommand = Readonly<{
	kind: "command";
	file: string;
	args: readonly string[];
	[workflowRunBrand]: true;
}>;

export type UnsafeShell = Readonly<{
	kind: "unsafe-shell";
	script: string;
	[workflowRunBrand]: true;
}>;

export type WorkflowRun = UnsafeShell | WorkflowCommand;

type WorkflowEnvironment = Readonly<Record<string, boolean | number | string>>;

export type RenderedWorkflowRun = Readonly<{
	run: string;
	env?: WorkflowEnvironment;
	shell?: "bash";
}>;

export const command = (options: WorkflowCommandOptions): WorkflowCommand => {
	assertCommandFile(options.file);
	for (const argument of options.args) {
		assertNoNullByte(argument, "command argument");
	}
	return {
		kind: "command",
		file: options.file,
		args: [...options.args],
		[workflowRunBrand]: true,
	};
};

export const unsafeShell = (script: string): UnsafeShell => {
	if (script.trim() === "") {
		throw new Error("unsafeShell script is required");
	}
	assertNoNullByte(script, "unsafeShell script");
	return {
		kind: "unsafe-shell",
		script,
		[workflowRunBrand]: true,
	};
};

export const renderWorkflowRun = (
	workflowRun: WorkflowRun,
	environment: WorkflowEnvironment | undefined,
): RenderedWorkflowRun => {
	assertWorkflowRun(workflowRun);
	if (workflowRun.kind === "unsafe-shell") {
		return { run: workflowRun.script };
	}

	const generatedEnvironment: Record<string, boolean | number | string> = { ...environment };
	const argumentsForShell = workflowRun.args.map((argument, index) => {
		const expression = completeExpression(argument);
		if (expression === null) {
			if (argument.includes("${{")) {
				throw new Error(
					"command arguments cannot embed GitHub expressions; use a complete GitHubExpression argument",
				);
			}
			return quotePosix(argument);
		}
		const name = `HOLLYWOOD_COMMAND_ARG_${index}`;
		if (name in generatedEnvironment) {
			throw new Error(`${name} is reserved for a Hollywood command expression argument`);
		}
		generatedEnvironment[name] = expression;
		return `"$${name}"`;
	});

	return {
		run: [quotePosix(workflowRun.file), ...argumentsForShell].join(" "),
		shell: "bash",
		...(Object.keys(generatedEnvironment).length === 0 ? {} : { env: generatedEnvironment }),
	};
};

const assertWorkflowRun = (value: WorkflowRun): void => {
	if (
		typeof value !== "object" ||
		value === null ||
		(value as Readonly<Record<symbol, unknown>>)[workflowRunBrand] !== true
	) {
		throw new Error("workflow run must use command() or unsafeShell()");
	}
};

const assertCommandFile = (file: string): void => {
	if (file.trim() === "") {
		throw new Error("command file is required");
	}
	assertNoNullByte(file, "command file");
	if (file.includes("${{")) {
		throw new Error("command file must be a literal executable path");
	}
};

const assertNoNullByte = (value: string, name: string): void => {
	if (value.includes("\0")) {
		throw new Error(`${name} must not contain a null byte`);
	}
};

const completeExpression = (value: string): GitHubExpression | null => {
	if (!value.startsWith("${{") || !value.endsWith("}}")) {
		return null;
	}
	const body = value.slice(3, -2);
	expr(body);
	return value as GitHubExpression;
};

const quotePosix = (value: string): string => {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
		return value;
	}
	return `'${value.replaceAll("'", `'"'"'`)}'`;
};
