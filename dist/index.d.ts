
import { A as ScriptLog, C as RunnerContext, D as ScriptActionServices, E as ScriptActionContext, F as integerInput, I as pathInput, L as runAction, M as action, N as booleanInput, O as ScriptExec, P as choiceInput, R as stringInput, S as RunActionOptions, T as ScriptActionCall, _ as InputDefinitions, a as RunGitHubActionOptions, b as OutputDefinitions, c as ActionInputValues, d as Command, f as CommandEnvironment, g as InputDefinition, h as CommandResult, i as GitHubInputOptions, j as WorkflowInputValues, k as ScriptFs, l as ActionOutputValues, m as CommandOptions, n as GitHubExec, o as runGitHubAction, p as CommandExitPolicy, r as GitHubExecOptions, s as ActionCallInputValues, t as GitHubCore, u as ChoiceInputDefinition, v as InputKind, w as ScriptAction, x as RequiredInputName, y as OutputDefinition, z as stringOutput } from "./github-D8eY-lV0.js";
import { AccountName, EnvironmentAccount, EnvironmentAccounts, EnvironmentDefinition, EnvironmentDefinitions, EnvironmentName, EnvironmentRegistry, EnvironmentSelector, ResolvedEnvironment, defineEnvironmentRegistry, resolveEnvironment, selectEnvironmentName } from "./environments.js";
import { A as runner, C as ne, D as needsResultIs, E as needsResultIn, F as valueOr, M as selectString, N as stepOutput, O as not, P as success, S as matrix, T as needsResult, _ as format, a as GitHubJobResultValue, b as hashFiles, c as always, d as contains, f as defineMatrix, g as failure, h as expr, i as GitHubJobResult, j as secret, k as or, l as and, m as eq, n as GitHubExpression, o as GitHubMatrixValues, p as envVar, r as GitHubExpressionValue, s as GitHubTypedMatrix, t as AnyGitHubTypedMatrix, u as cancelled, v as gh, w as needsOutput, x as input, y as github } from "./expressions-CNeNMhG5.js";

//#region src/local.d.ts
declare const nodeFs: ScriptFs;
declare const nodeExec: ScriptExec;
declare const nodeLog: ScriptLog;
declare const currentRunner: () => RunnerContext;
//#endregion
//#region src/generate.d.ts
type ScriptActionDescriptor<Inputs extends InputDefinitions, Outputs extends OutputDefinitions> = Pick<ScriptAction<Inputs, Outputs>, "description" | "inputs" | "localActionPath" | "name" | "outputs">;
type GitHubLocalAction<Inputs extends InputDefinitions> = Readonly<{
  name: string;
  localActionPath: string;
  inputs: Inputs;
}>;
type WorkflowActionDescriptor<Inputs extends InputDefinitions> = Pick<ScriptAction<Inputs, OutputDefinitions>, "inputs" | "localActionPath" | "name"> | GitHubLocalAction<Inputs>;
type GitHubActionMetadata = Readonly<{
  name: string;
  description: string;
  inputs: GitHubActionInputMetadataByName;
  outputs: GitHubActionOutputMetadataByName;
  runs: Readonly<{
    using: "node24";
    main: "dist/index.js";
  }>;
}>;
type GitHubActionInputMetadataByName = {
  readonly [name: string]: GitHubActionInputMetadata;
};
type GitHubActionInputMetadata = Readonly<{
  description: string;
  required: boolean;
  default?: string;
}>;
type GitHubActionOutputMetadata = Readonly<{
  description: string;
}>;
type GitHubActionOutputMetadataByName = {
  readonly [name: string]: GitHubActionOutputMetadata;
};
type GitHubScalar = boolean | number | string;
type GitHubEnvironmentVariables = {
  readonly [name: string]: GitHubScalar;
};
type GitHubWithValues = {
  readonly [name: string]: boolean | number | string;
};
type GitHubWorkflowCallWithValues = GitHubWithValues;
type GitHubReusableWorkflowSecrets = "inherit" | Readonly<{
  readonly [name: string]: string;
}>;
type GitHubStepBase = Readonly<{
  id?: string;
  name?: GitHubExpressionString;
  if?: GitHubExpressionString;
  env?: GitHubEnvironmentVariables;
  "continue-on-error"?: boolean | string;
  "timeout-minutes"?: number;
}>;
type GitHubUsesStepOptions<Inputs extends InputDefinitions> = GitHubStepBase & Readonly<{
  name: GitHubExpressionString;
  uses: string;
}> & GitHubActionInputOption<Inputs>;
type GitHubLocalActionStepOptions<Inputs extends InputDefinitions> = GitHubStepBase & Readonly<{
  actionsDir?: string;
}> & GitHubActionInputOption<Inputs>;
type GitHubActionInputOption<Inputs extends InputDefinitions> = RequiredInputName<Inputs> extends never ? Readonly<{
  with?: WorkflowInputValues<Inputs>;
}> : Readonly<{
  with: WorkflowInputValues<Inputs>;
}>;
type GitHubUsesStep = GitHubStepBase & Readonly<{
  uses: string;
  with?: GitHubWithValues;
  run?: never;
  shell?: never;
  "working-directory"?: never;
}>;
type GitHubRunStep = GitHubStepBase & Readonly<{
  run: string;
  shell?: string;
  "working-directory"?: string;
  uses?: never;
  with?: never;
}>;
type GitHubActionFile = Readonly<{
  sourcePath: string;
  path: string;
  header: string;
  metadata: GitHubActionMetadata;
}>;
type GitHubActionEntrypointFile = Readonly<{
  sourcePath: string;
  path: string;
  header: string;
  content: string;
}>;
type GitHubWorkflowStep = GitHubRunStep | GitHubUsesStep;
type GitHubExpressionString = GitHubExpression | string;
type GitHubNeeds = readonly string[] | string;
type GitHubJobOutputs = {
  readonly [name: string]: GitHubExpressionString;
};
type GitHubPermission = "none" | "read" | "write";
type GitHubPermissions = "read-all" | "write-all" | Readonly<{
  actions?: GitHubPermission;
  attestations?: GitHubPermission;
  checks?: GitHubPermission;
  contents?: GitHubPermission;
  deployments?: GitHubPermission;
  discussions?: GitHubPermission;
  "id-token"?: GitHubPermission;
  issues?: GitHubPermission;
  packages?: GitHubPermission;
  pages?: GitHubPermission;
  "pull-requests"?: GitHubPermission;
  "repository-projects"?: GitHubPermission;
  "security-events"?: GitHubPermission;
  statuses?: GitHubPermission;
}>;
type GitHubConcurrency = string | Readonly<{
  group: GitHubExpressionString;
  queue?: "single";
  "cancel-in-progress"?: boolean | GitHubExpressionString;
}> | Readonly<{
  group: GitHubExpressionString;
  queue: "max";
  "cancel-in-progress"?: never;
}>;
type GitHubStrategy = Readonly<{
  matrix?: AnyGitHubTypedMatrix | GitHubMatrix;
  "fail-fast"?: boolean;
  "max-parallel"?: number;
}>;
type GitHubMatrixValue = boolean | number | string;
type GitHubMatrix = Readonly<{
  readonly [name: string]: readonly GitHubMatrixValue[] | readonly GitHubMatrixObject[];
}>;
type GitHubMatrixObject = Readonly<{
  readonly [name: string]: GitHubMatrixValue;
}>;
type GitHubService = Readonly<{
  image: string;
  credentials?: Readonly<{
    username: string;
    password: string;
  }>;
  env?: GitHubEnvironmentVariables;
  options?: string;
  ports?: readonly string[];
  volumes?: readonly string[];
}>;
type GitHubServices = {
  readonly [name: string]: GitHubService;
};
type GitHubWorkflowJobBase = Readonly<{
  name?: GitHubExpressionString;
  needs?: GitHubNeeds;
  if?: GitHubExpressionString;
  environment?: string | Readonly<{
    name: string;
    url?: GitHubExpressionString;
  }>;
  outputs?: GitHubJobOutputs;
  permissions?: GitHubPermissions;
  concurrency?: GitHubConcurrency;
  env?: GitHubEnvironmentVariables;
  strategy?: GitHubStrategy;
  services?: GitHubServices;
  "timeout-minutes"?: number;
}>;
type GitHubStepWorkflowJob = GitHubWorkflowJobBase & Readonly<{
  "runs-on": string | readonly string[];
  steps: readonly GitHubWorkflowStep[];
  uses?: never;
  with?: never;
  secrets?: never;
}>;
type GitHubReusableWorkflowJob = Omit<GitHubWorkflowJobBase, "environment" | "env" | "outputs" | "services" | "timeout-minutes"> & Readonly<{
  uses: string;
  with?: GitHubWorkflowCallWithValues;
  secrets?: GitHubReusableWorkflowSecrets;
  "runs-on"?: never;
  steps?: never;
}>;
type GitHubWorkflowJob = GitHubStepWorkflowJob | GitHubReusableWorkflowJob;
type GitHubWorkflow = Readonly<{
  name: string;
  on: GitHubWorkflowTriggers;
  permissions?: GitHubPermissions;
  concurrency?: GitHubConcurrency;
  env?: GitHubEnvironmentVariables;
  jobs: GitHubWorkflowJobs;
}>;
type GitHubWorkflowTriggers = {
  readonly [name: string]: unknown;
};
type GitHubWorkflowJobs = {
  readonly [name: string]: GitHubWorkflowJob;
};
type GitHubWorkflowFile = Readonly<{
  sourcePath: string;
  path: string;
  header: string;
  workflow: GitHubWorkflow;
}>;
declare const workflow: <const Workflow extends GitHubWorkflow>(definition: Workflow) => Workflow;
declare const job: <const Job extends GitHubWorkflowJob>(definition: Job) => Job;
declare const localAction: <const Inputs extends InputDefinitions>(definition: GitHubLocalAction<Inputs>) => GitHubLocalAction<Inputs>;
declare const generateActionMetadata: <const Inputs extends InputDefinitions, const Outputs extends OutputDefinitions>(action: ScriptActionDescriptor<Inputs, Outputs>) => GitHubActionMetadata;
declare const generateActionFile: <const Inputs extends InputDefinitions, const Outputs extends OutputDefinitions>(action: ScriptActionDescriptor<Inputs, Outputs>, options: Readonly<{
  sourcePath: string;
  actionsDir: string;
  generatedAt?: Date;
}>) => GitHubActionFile;
declare const generateActionEntrypointFile: <const Inputs extends InputDefinitions, const Outputs extends OutputDefinitions>(action: ScriptActionDescriptor<Inputs, Outputs>, options: Readonly<{
  sourcePath: string;
  actionsDir: string;
  exportName: string;
  generatedAt?: Date;
}>) => GitHubActionEntrypointFile;
declare const generateActionFiles: (files: readonly Readonly<{
  action: ScriptActionDescriptor<InputDefinitions, OutputDefinitions>;
  sourcePath: string;
  actionsDir: string;
  generatedAt?: Date;
}>[]) => readonly GitHubActionFile[];
declare const generateUsesStep: <const Inputs extends InputDefinitions>(_action: Pick<WorkflowActionDescriptor<Inputs>, "inputs">, options: GitHubUsesStepOptions<Inputs>) => GitHubUsesStep;
declare const uses: <const Inputs extends InputDefinitions>(action: WorkflowActionDescriptor<Inputs>, options: GitHubLocalActionStepOptions<Inputs>) => GitHubUsesStep;
declare const generateWorkflowFile: (options: Readonly<{
  sourcePath: string;
  sourceRoot: string;
  workflowsDir: string;
  generatedAt?: Date;
  workflow: GitHubWorkflow;
}>) => GitHubWorkflowFile;
declare const renderActionFile: (file: GitHubActionFile) => string;
declare const renderWorkflowFile: (file: GitHubWorkflowFile) => string;
//#endregion
//#region src/paths.d.ts
type GitHubPathPattern = string;
type GitHubPathPatternList = readonly [GitHubPathPattern, ...GitHubPathPattern[]];
type GitHubPathDependency<Name extends string = string> = Readonly<{
  changed: GitHubExpression<boolean>;
  name: Name;
  paths: GitHubPathPatternList;
}>;
type GitHubPathDependencyDefinitions = Readonly<{
  [name: string]: GitHubPathPatternList;
}>;
type GitHubPathDependencyJobOptions = Readonly<{
  checkoutUses?: string;
  name?: string;
  runsOn?: string;
}>;
type GitHubPathDependencies<JobId extends string, Definitions extends GitHubPathDependencyDefinitions> = GitHubPathDependencyRefs<Definitions> & Readonly<{
  job: (options?: GitHubPathDependencyJobOptions) => GitHubStepWorkflowJob;
  jobId: JobId;
  workflowPaths: readonly GitHubPathPattern[];
}>;
type GitHubPathDependencyRefs<Definitions extends GitHubPathDependencyDefinitions> = { readonly [Name in keyof Definitions & string]: GitHubPathDependencyRef<Name> };
type GitHubPathDependencyRef<Name extends string> = Readonly<{
  changed: GitHubExpression<boolean>;
  name: Name;
  paths: GitHubPathPatternList;
}>;
declare const pathDependencies: <const JobId extends string, const Definitions extends GitHubPathDependencyDefinitions>(jobId: JobId, definitions: Definitions) => GitHubPathDependencies<JobId, Definitions>;
declare const matchPathDependency: (path: string, dependency: Pick<GitHubPathDependency, "paths">) => boolean;
//#endregion
//#region src/files.d.ts
type GeneratedFile = GitHubActionFile | GitHubActionEntrypointFile | GitHubWorkflowFile;
type RenderedGeneratedFile = Readonly<{
  sourcePath: string;
  path: string;
  content: string;
}>;
type GeneratedFileWriteStatus = "created" | "unchanged" | "updated";
type GeneratedFileWriteResult = Readonly<{
  sourcePath: string;
  path: string;
  outputPath: string;
  status: GeneratedFileWriteStatus;
}>;
type WriteGeneratedFilesOptions = Readonly<{
  outputDir: string;
}>;
declare const renderGeneratedFile: (file: GeneratedFile) => RenderedGeneratedFile;
declare const writeGeneratedFiles: (files: readonly GeneratedFile[], options: WriteGeneratedFilesOptions) => Promise<readonly GeneratedFileWriteResult[]>;
//#endregion
//#region src/validation.d.ts
type GitHubYamlFile = Readonly<{
  name: string;
  content: string;
}>;
type GitHubYamlValidationError = Readonly<{
  message: string;
}>;
type GitHubYamlValidation = Readonly<{
  status: "valid";
  errors: readonly [];
}> | Readonly<{
  status: "invalid";
  errors: readonly [GitHubYamlValidationError, ...GitHubYamlValidationError[]];
}>;
declare const validateWorkflowContent: (file: GitHubYamlFile) => GitHubYamlValidation;
declare const validateActionMetadataContent: (file: GitHubYamlFile) => GitHubYamlValidation;
declare const assertValidWorkflowContent: (file: GitHubYamlFile) => void;
declare const assertValidActionMetadataContent: (file: GitHubYamlFile) => void;
//#endregion
//#region src/lima.d.ts
type LimaContainerRuntime = "nerdctl";
type LimaEnvironmentProbe = Readonly<{
  name: string;
  exec: ScriptExec;
  requireContainerd?: boolean;
  requireKvm?: boolean;
  start?: boolean;
}>;
type LimaExecOptions = Readonly<{
  name: string;
  exec: ScriptExec;
  start?: boolean;
}>;
type LimaEnvironmentResult = Readonly<{
  status: "ready";
  name: string;
  runtime?: LimaContainerRuntime;
}> | Readonly<{
  status: "rejected";
  name: string;
  reason: string;
}>;
declare const probeLimaEnvironment: (probe: LimaEnvironmentProbe) => Promise<LimaEnvironmentResult>;
declare const limaExec: (options: LimaExecOptions) => ScriptExec;
declare const limaRunner: (options: LimaExecOptions) => Promise<RunnerContext>;
//#endregion
export { type AccountName, type ActionCallInputValues, type ActionInputValues, type ActionOutputValues, type ChoiceInputDefinition, type Command, type CommandEnvironment, type CommandExitPolicy, type CommandOptions, type CommandResult, type EnvironmentAccount, type EnvironmentAccounts, type EnvironmentDefinition, type EnvironmentDefinitions, type EnvironmentName, type EnvironmentRegistry, type EnvironmentSelector, type GeneratedFile, type GeneratedFileWriteResult, type GeneratedFileWriteStatus, type GitHubActionEntrypointFile, type GitHubActionFile, type GitHubActionInputMetadata, type GitHubActionMetadata, type GitHubActionOutputMetadata, type GitHubConcurrency, type GitHubCore, type GitHubEnvironmentVariables, type GitHubExec, type GitHubExecOptions, type GitHubExpression, type GitHubExpressionString, type GitHubExpressionValue, type GitHubInputOptions, type GitHubJobOutputs, GitHubJobResult, type GitHubJobResultValue, type GitHubLocalAction, type GitHubLocalActionStepOptions, type GitHubMatrix, type GitHubMatrixObject, type GitHubMatrixValue, type GitHubMatrixValues, type GitHubNeeds, type GitHubPathDependencies, type GitHubPathDependency, type GitHubPathDependencyDefinitions, type GitHubPathDependencyJobOptions, type GitHubPathPattern, type GitHubPathPatternList, type GitHubPermission, type GitHubPermissions, type GitHubReusableWorkflowJob, type GitHubReusableWorkflowSecrets, type GitHubRunStep, type GitHubService, type GitHubServices, type GitHubStepWorkflowJob, type GitHubStrategy, type GitHubTypedMatrix, type GitHubUsesStep, type GitHubUsesStepOptions, type GitHubWithValues, type GitHubWorkflow, type GitHubWorkflowCallWithValues, type GitHubWorkflowFile, type GitHubWorkflowJob, type GitHubWorkflowStep, type GitHubYamlFile, type GitHubYamlValidation, type GitHubYamlValidationError, type InputDefinition, type InputDefinitions, type InputKind, type LimaContainerRuntime, type LimaEnvironmentProbe, type LimaEnvironmentResult, type LimaExecOptions, type OutputDefinition, type OutputDefinitions, type RenderedGeneratedFile, type ResolvedEnvironment, type RunActionOptions, type RunGitHubActionOptions, type RunnerContext, type ScriptAction, type ScriptActionCall, type ScriptActionContext, type ScriptActionServices, type ScriptExec, type ScriptFs, type ScriptLog, type WorkflowInputValues, type WriteGeneratedFilesOptions, action, always, and, assertValidActionMetadataContent, assertValidWorkflowContent, booleanInput, cancelled, choiceInput, contains, currentRunner, defineEnvironmentRegistry, defineMatrix, envVar, eq, expr, failure, format, generateActionEntrypointFile, generateActionFile, generateActionFiles, generateActionMetadata, generateUsesStep, generateWorkflowFile, gh, github, hashFiles, input, integerInput, job, limaExec, limaRunner, localAction, matchPathDependency, matrix, ne, needsOutput, needsResult, needsResultIn, needsResultIs, nodeExec, nodeFs, nodeLog, not, or, pathDependencies, pathInput, probeLimaEnvironment, renderActionFile, renderGeneratedFile, renderWorkflowFile, resolveEnvironment, runAction, runGitHubAction, runner, secret, selectEnvironmentName, selectString, stepOutput, stringInput, stringOutput, success, uses, validateActionMetadataContent, validateWorkflowContent, valueOr, workflow, writeGeneratedFiles };