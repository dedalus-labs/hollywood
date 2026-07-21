export type InputKind = "boolean" | "choice" | "integer" | "path" | "string";

type ScalarInputDefault<Kind extends Exclude<InputKind, "choice">> = Kind extends "boolean"
	? "false" | "true"
	: Kind extends "integer"
		? `${bigint}`
		: string;

type ScalarInputDefinition<Kind extends Exclude<InputKind, "choice">> = Readonly<{
	kind: Kind;
	description: string;
	default?: ScalarInputDefault<Kind>;
}>;

export type ChoiceInputDefinition<
	Options extends readonly [string, ...string[]] = readonly [string, ...string[]],
> = Readonly<{
	kind: "choice";
	description: string;
	options: Options;
	default?: Options[number];
}>;

export type InputDefinition<Kind extends InputKind = InputKind> = Kind extends "choice"
	? ChoiceInputDefinition
	: Kind extends Exclude<InputKind, "choice">
		? ScalarInputDefinition<Kind>
		: never;

export type OutputDefinition = Readonly<{
	description: string;
}>;

export type CommandEnvironment = {
	readonly [name: string]: string;
};

export type CommandExitPolicy = "any" | "zero";

export type CommandOptions = Readonly<{
	cwd?: string;
	env?: CommandEnvironment;
	exitPolicy?: CommandExitPolicy;
}>;

export type Command = Readonly<{
	file: string;
	args: readonly string[];
}> &
	CommandOptions;

export type CommandResult = Readonly<{
	exitCode: number;
	stdout: string;
	stderr: string;
}>;

export type ScriptExec = (
	file: string,
	args: readonly string[],
	options?: CommandOptions,
) => Promise<CommandResult>;

export type ScriptFs = Readonly<{
	readText: (path: string) => Promise<string>;
}>;

export type ScriptLog = Readonly<{
	info: (message: string) => void;
	warning: (message: string) => void;
	group: <Value>(name: string, run: () => Promise<Value>) => Promise<Value>;
}>;

export type SummaryText = Readonly<{
	format: "text";
	value: string;
}>;

export type SummaryCode = Readonly<{
	format: "code";
	value: string;
}>;

export type SummaryCell = SummaryCode | SummaryText;

export type SummaryTableRow = Readonly<{
	label: string;
	value: SummaryCell;
}>;

export type ScriptSummary = Readonly<{
	table: (title: string, rows: readonly SummaryTableRow[]) => Promise<void>;
}>;

export type RunnerContext = Readonly<{
	uidGid: string;
}>;

export type InputDefinitions = {
	readonly [name: string]: InputDefinition;
};

export type OutputDefinitions = {
	readonly [name: string]: OutputDefinition;
};

type InputValue<Definition extends InputDefinition> = Definition["kind"] extends "integer"
	? number
	: Definition["kind"] extends "boolean"
		? boolean
		: Definition extends ChoiceInputDefinition<infer Options>
			? Options[number]
			: string;

export type ActionInputValues<Inputs extends InputDefinitions> = Readonly<{
	[Name in keyof Inputs]: InputValue<Inputs[Name]>;
}>;

export type ActionCallInputValues<Inputs extends InputDefinitions> = Readonly<
	{
		[Name in RequiredInputName<Inputs>]: InputValue<Inputs[Name]>;
	} & {
		[Name in OptionalInputName<Inputs>]?: InputValue<Inputs[Name]>;
	}
>;

export type ActionOutputValues<Outputs extends OutputDefinitions> = Readonly<{
	[Name in keyof Outputs]: string;
}>;

export type RequiredInputName<Inputs extends InputDefinitions> = {
	[Name in keyof Inputs]: Inputs[Name] extends { readonly default: string } ? never : Name;
}[keyof Inputs];

export type OptionalInputName<Inputs extends InputDefinitions> = Exclude<
	keyof Inputs,
	RequiredInputName<Inputs>
>;

export type WorkflowInputValues<Inputs extends InputDefinitions> = Readonly<
	{
		[Name in RequiredInputName<Inputs>]: string;
	} & {
		[Name in OptionalInputName<Inputs>]?: string;
	}
>;

export type ScriptActionCall = <
	const Inputs extends InputDefinitions,
	const Outputs extends OutputDefinitions,
>(
	scriptAction: ScriptAction<Inputs, Outputs>,
	input: ActionCallInputValues<Inputs>,
) => Promise<ActionOutputValues<Outputs>>;

export type ScriptActionServices = Readonly<{
	exec: ScriptExec;
	fs: ScriptFs;
	log: ScriptLog;
	runner: RunnerContext;
	summary: ScriptSummary;
}>;

export type ScriptActionContext<Inputs extends InputDefinitions> = ScriptActionServices &
	Readonly<{
		call: ScriptActionCall;
		input: ActionInputValues<Inputs>;
	}>;

export type ScriptAction<
	Inputs extends InputDefinitions,
	Outputs extends OutputDefinitions,
> = Readonly<{
	name: string;
	description: string;
	localActionPath?: string;
	inputs: Inputs;
	outputs: Outputs;
	run: (context: ScriptActionContext<Inputs>) => Promise<ActionOutputValues<Outputs>>;
}>;

export type RunActionOptions<Inputs extends InputDefinitions> = Readonly<{
	with: WorkflowInputValues<Inputs>;
	exec: ScriptExec;
	fs: ScriptFs;
	log?: ScriptLog;
	runner: RunnerContext;
	summary?: ScriptSummary;
}>;

export const action = <
	const Inputs extends InputDefinitions,
	const Outputs extends OutputDefinitions,
>(
	definition: ScriptAction<Inputs, Outputs>,
): ScriptAction<Inputs, Outputs> => definition;

export const runAction = async <
	const Inputs extends InputDefinitions,
	const Outputs extends OutputDefinitions,
>(
	scriptAction: ScriptAction<Inputs, Outputs>,
	options: RunActionOptions<Inputs>,
): Promise<ActionOutputValues<Outputs>> => {
	const services = {
		exec: options.exec,
		fs: options.fs,
		log: options.log ?? silentLog,
		runner: options.runner,
		summary: options.summary ?? silentSummary,
	};
	return scriptAction.run({
		...services,
		call: createActionCall(services),
		input: parseActionInputs(scriptAction.inputs, options.with),
	});
};

export const stringInput = <const Definition extends Omit<InputDefinition<"string">, "kind">>(
	definition: Definition,
) => ({
	...definition,
	kind: "string" as const,
});

export const pathInput = <const Definition extends Omit<InputDefinition<"path">, "kind">>(
	definition: Definition,
) => ({
	...definition,
	kind: "path" as const,
});

export const integerInput = <const Definition extends Omit<InputDefinition<"integer">, "kind">>(
	definition: Definition,
) => ({
	...definition,
	kind: "integer" as const,
});

export const booleanInput = <const Definition extends Omit<InputDefinition<"boolean">, "kind">>(
	definition: Definition,
) => ({
	...definition,
	kind: "boolean" as const,
});

export const choiceInput = <
	const Options extends readonly [string, ...string[]],
	const Definition extends Omit<ChoiceInputDefinition<Options>, "kind">,
>(
	definition: Definition,
) => ({
	...definition,
	kind: "choice" as const,
});

export const stringOutput = (definition: OutputDefinition): OutputDefinition => definition;

export const summaryCode = (value: string): SummaryCode => ({ format: "code", value });

export const summaryText = (value: string): SummaryText => ({ format: "text", value });

const parseActionInputs = <const Inputs extends InputDefinitions>(
	inputs: Inputs,
	values: WorkflowInputValues<Inputs>,
): ActionInputValues<Inputs> => {
	const rawValues = values as { readonly [name: string]: string };
	const parsed = new Map<string, boolean | number | string>();
	for (const name of Object.keys(rawValues)) {
		if (!(name in inputs)) {
			throw new Error(`unknown input: ${name}`);
		}
	}
	for (const [name, definition] of Object.entries(inputs)) {
		const rawInput = rawValues[name];
		const raw =
			rawInput === undefined || rawInput.trim().length === 0 ? definition.default : rawInput.trim();
		if (raw === undefined) {
			throw new Error(`${name} is required`);
		}
		parsed.set(name, parseInputValue(name, definition, raw));
	}
	return mapToObject(parsed) as ActionInputValues<Inputs>;
};

const createActionCall = (services: ScriptActionServices): ScriptActionCall => {
	const call: ScriptActionCall = async (scriptAction, input) =>
		scriptAction.run({
			...services,
			call,
			input: parseActionCallInputs(scriptAction.inputs, input),
		});
	return call;
};

const parseActionCallInputs = <const Inputs extends InputDefinitions>(
	inputs: Inputs,
	values: ActionCallInputValues<Inputs>,
): ActionInputValues<Inputs> => {
	const rawValues = values as { readonly [name: string]: boolean | number | string };
	const parsed = new Map<string, boolean | number | string>();
	for (const name of Object.keys(rawValues)) {
		if (!(name in inputs)) {
			throw new Error(`unknown input: ${name}`);
		}
	}
	for (const [name, definition] of Object.entries(inputs)) {
		if (!Object.hasOwn(rawValues, name)) {
			parsed.set(name, parseDefaultInputValue(name, definition));
			continue;
		}
		const raw = rawValues[name];
		if (raw === undefined) {
			throw new Error(`${name} is required`);
		}
		parsed.set(name, validateActionInputValue(name, definition, raw));
	}
	return mapToObject(parsed) as ActionInputValues<Inputs>;
};

const mapToObject = <Value>(
	values: ReadonlyMap<string, Value>,
): { readonly [name: string]: Value } => Object.fromEntries(values);

const parseDefaultInputValue = (name: string, definition: InputDefinition): boolean | number | string => {
	if (definition.default === undefined) {
		throw new Error(`${name} is required`);
	}
	return parseInputValue(name, definition, definition.default);
};

const validateActionInputValue = (
	name: string,
	definition: InputDefinition,
	value: boolean | number | string,
): boolean | number | string => {
	if (definition.kind === "integer") {
		if (typeof value === "number" && Number.isInteger(value)) {
			return value;
		}
		throw new Error(`${name} must be an integer`);
	}
	if (definition.kind === "boolean") {
		if (typeof value === "boolean") {
			return value;
		}
		throw new Error(`${name} must be true or false`);
	}
	if (definition.kind === "choice") {
		if (typeof value === "string" && definition.options.includes(value)) {
			return value;
		}
		throw new Error(`${name} must be one of: ${definition.options.join(", ")}`);
	}
	if (typeof value !== "string") {
		throw new Error(`${name} must be a string`);
	}
	if (definition.default === undefined && value.trim().length === 0) {
		throw new Error(`${name} is required`);
	}
	return value;
};

const parseInputValue = (
	name: string,
	definition: InputDefinition,
	value: string,
): boolean | number | string => {
	if (definition.kind === "integer") {
		if (!/^-?\d+$/.test(value)) {
			throw new Error(`${name} must be an integer`);
		}
		return Number(value);
	}
	if (definition.kind === "boolean") {
		if (value === "true") {
			return true;
		}
		if (value === "false") {
			return false;
		}
		throw new Error(`${name} must be true or false`);
	}
	if (definition.kind === "choice") {
		if (definition.options.includes(value)) {
			return value;
		}
		throw new Error(`${name} must be one of: ${definition.options.join(", ")}`);
	}
	return value;
};

const silentLog: ScriptLog = {
	info: () => {},
	warning: () => {},
	group: async (_name, run) => run(),
};

const silentSummary: ScriptSummary = {
	table: async () => {},
};
