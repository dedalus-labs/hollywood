
//#region src/script.d.ts
type InputKind = "boolean" | "choice" | "integer" | "path" | "string";
type ScalarInputDefault<Kind extends Exclude<InputKind, "choice">> = Kind extends "boolean" ? "false" | "true" : Kind extends "integer" ? `${bigint}` : string;
type ScalarInputDefinition<Kind extends Exclude<InputKind, "choice">> = Readonly<{
  kind: Kind;
  description: string;
  default?: ScalarInputDefault<Kind>;
}>;
type ChoiceInputDefinition<Options extends readonly [string, ...string[]] = readonly [string, ...string[]]> = Readonly<{
  kind: "choice";
  description: string;
  options: Options;
  default?: Options[number];
}>;
type InputDefinition<Kind extends InputKind = InputKind> = Kind extends "choice" ? ChoiceInputDefinition : Kind extends Exclude<InputKind, "choice"> ? ScalarInputDefinition<Kind> : never;
type OutputDefinition = Readonly<{
  description: string;
}>;
type CommandEnvironment = {
  readonly [name: string]: string;
};
type CommandExitPolicy = "any" | "zero";
type CommandOptions = Readonly<{
  cwd?: string;
  env?: CommandEnvironment;
  exitPolicy?: CommandExitPolicy;
}>;
type Command = Readonly<{
  file: string;
  args: readonly string[];
}> & CommandOptions;
type CommandResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;
type ScriptExec = (file: string, args: readonly string[], options?: CommandOptions) => Promise<CommandResult>;
type ScriptFs = Readonly<{
  readText: (path: string) => Promise<string>;
}>;
type ScriptLog = Readonly<{
  info: (message: string) => void;
  warning: (message: string) => void;
  group: <Value>(name: string, run: () => Promise<Value>) => Promise<Value>;
}>;
type SummaryText = Readonly<{
  format: "text";
  value: string;
}>;
type SummaryCode = Readonly<{
  format: "code";
  value: string;
}>;
type SummaryCell = SummaryCode | SummaryText;
type SummaryTableRow = Readonly<{
  label: string;
  value: SummaryCell;
}>;
type ScriptSummary = Readonly<{
  table: (title: string, rows: readonly SummaryTableRow[]) => Promise<void>;
}>;
type RunnerContext = Readonly<{
  uidGid: string;
}>;
type InputDefinitions = {
  readonly [name: string]: InputDefinition;
};
type OutputDefinitions = {
  readonly [name: string]: OutputDefinition;
};
type InputValue<Definition extends InputDefinition> = Definition["kind"] extends "integer" ? number : Definition["kind"] extends "boolean" ? boolean : Definition extends ChoiceInputDefinition<infer Options> ? Options[number] : string;
type ActionInputValues<Inputs extends InputDefinitions> = Readonly<{ [Name in keyof Inputs]: InputValue<Inputs[Name]> }>;
type ActionCallInputValues<Inputs extends InputDefinitions> = Readonly<{ [Name in RequiredInputName<Inputs>]: InputValue<Inputs[Name]> } & { [Name in OptionalInputName<Inputs>]?: InputValue<Inputs[Name]> }>;
type ActionOutputValues<Outputs extends OutputDefinitions> = Readonly<{ [Name in keyof Outputs]: string }>;
type RequiredInputName<Inputs extends InputDefinitions> = { [Name in keyof Inputs]: Inputs[Name] extends {
  readonly default: string;
} ? never : Name }[keyof Inputs];
type OptionalInputName<Inputs extends InputDefinitions> = Exclude<keyof Inputs, RequiredInputName<Inputs>>;
type WorkflowInputValues<Inputs extends InputDefinitions> = Readonly<{ [Name in RequiredInputName<Inputs>]: string } & { [Name in OptionalInputName<Inputs>]?: string }>;
type ScriptActionCall = <const Inputs extends InputDefinitions, const Outputs extends OutputDefinitions>(scriptAction: ScriptAction<Inputs, Outputs>, input: ActionCallInputValues<Inputs>) => Promise<ActionOutputValues<Outputs>>;
type ScriptActionServices = Readonly<{
  exec: ScriptExec;
  fs: ScriptFs;
  log: ScriptLog;
  runner: RunnerContext;
  summary: ScriptSummary;
}>;
type ScriptActionContext<Inputs extends InputDefinitions> = ScriptActionServices & Readonly<{
  call: ScriptActionCall;
  input: ActionInputValues<Inputs>;
}>;
type ScriptAction<Inputs extends InputDefinitions, Outputs extends OutputDefinitions> = Readonly<{
  name: string;
  description: string;
  localActionPath?: string;
  inputs: Inputs;
  outputs: Outputs;
  run: (context: ScriptActionContext<Inputs>) => Promise<ActionOutputValues<Outputs>>;
}>;
type RunActionOptions<Inputs extends InputDefinitions> = Readonly<{
  with: WorkflowInputValues<Inputs>;
  exec: ScriptExec;
  fs: ScriptFs;
  log?: ScriptLog;
  runner: RunnerContext;
  summary?: ScriptSummary;
}>;
declare const action: <const Inputs extends InputDefinitions, const Outputs extends OutputDefinitions>(definition: ScriptAction<Inputs, Outputs>) => ScriptAction<Inputs, Outputs>;
declare const runAction: <const Inputs extends InputDefinitions, const Outputs extends OutputDefinitions>(scriptAction: ScriptAction<Inputs, Outputs>, options: RunActionOptions<Inputs>) => Promise<ActionOutputValues<Outputs>>;
declare const stringInput: <const Definition extends Omit<InputDefinition<"string">, "kind">>(definition: Definition) => Definition & {
  kind: "string";
};
declare const pathInput: <const Definition extends Omit<InputDefinition<"path">, "kind">>(definition: Definition) => Definition & {
  kind: "path";
};
declare const integerInput: <const Definition extends Omit<InputDefinition<"integer">, "kind">>(definition: Definition) => Definition & {
  kind: "integer";
};
declare const booleanInput: <const Definition extends Omit<InputDefinition<"boolean">, "kind">>(definition: Definition) => Definition & {
  kind: "boolean";
};
declare const choiceInput: <const Options extends readonly [string, ...string[]], const Definition extends Omit<ChoiceInputDefinition<Options>, "kind">>(definition: Definition) => Definition & {
  kind: "choice";
};
declare const stringOutput: (definition: OutputDefinition) => OutputDefinition;
declare const summaryCode: (value: string) => SummaryCode;
declare const summaryText: (value: string) => SummaryText;
//#endregion
//#region src/github.d.ts
type GitHubInputOptions = Readonly<{
  required?: boolean;
  trimWhitespace?: boolean;
}>;
type GitHubCore = Readonly<{
  getInput: (name: string, options?: GitHubInputOptions) => string;
  group: <Value>(name: string, run: () => Promise<Value>) => Promise<Value>;
  info: (message: string) => void;
  setOutput: (name: string, value: string) => void;
  setFailed: (message: string) => void;
  summary?: GitHubSummary;
  warning: (message: string) => void;
}>;
type GitHubSummary = Readonly<{
  addRaw: (text: string, addEOL?: boolean) => GitHubSummary;
  write: () => Promise<unknown>;
}>;
type GitHubExecListeners = Readonly<{
  stderr?: (data: Buffer) => void;
  stdout?: (data: Buffer) => void;
}>;
type GitHubExecOptions = Readonly<{
  cwd?: string;
  env?: CommandEnvironment;
  ignoreReturnCode?: boolean;
  listeners?: GitHubExecListeners;
  silent?: boolean;
}>;
type GitHubExec = Readonly<{
  getExecOutput: (file: string, args?: string[], options?: GitHubExecOptions) => Promise<CommandResult>;
}>;
type RunGitHubActionOptions = Readonly<{
  core?: GitHubCore;
  exec?: GitHubExec;
  fs?: ScriptFs;
  runner?: RunnerContext;
}>;
declare const runGitHubAction: <const Inputs extends InputDefinitions, const Outputs extends OutputDefinitions>(scriptAction: ScriptAction<Inputs, Outputs>, options?: RunGitHubActionOptions) => Promise<ActionOutputValues<Outputs> | undefined>;
//#endregion
export { ScriptLog as A, integerInput as B, RunnerContext as C, ScriptActionServices as D, ScriptActionContext as E, SummaryText as F, summaryCode as G, runAction as H, WorkflowInputValues as I, summaryText as K, action as L, SummaryCell as M, SummaryCode as N, ScriptExec as O, SummaryTableRow as P, booleanInput as R, RunActionOptions as S, ScriptActionCall as T, stringInput as U, pathInput as V, stringOutput as W, InputDefinitions as _, RunGitHubActionOptions as a, OutputDefinitions as b, ActionInputValues as c, Command as d, CommandEnvironment as f, InputDefinition as g, CommandResult as h, GitHubInputOptions as i, ScriptSummary as j, ScriptFs as k, ActionOutputValues as l, CommandOptions as m, GitHubExec as n, runGitHubAction as o, CommandExitPolicy as p, GitHubExecOptions as r, ActionCallInputValues as s, GitHubCore as t, ChoiceInputDefinition as u, InputKind as v, ScriptAction as w, RequiredInputName as x, OutputDefinition as y, choiceInput as z };