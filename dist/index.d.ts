
import { A as ScriptFs, B as choiceInput, C as RunActionOptions, D as ScriptActionContext, E as ScriptActionCall, F as SummaryTableRow, G as stringOutput, H as pathInput, I as SummaryText, K as summaryCode, L as WorkflowInputValues, M as ScriptSummary, N as SummaryCell, O as ScriptActionServices, P as SummaryCode, R as action, S as RequiredInputName, T as ScriptAction, U as runAction, V as integerInput, W as stringInput, _ as InputDefinition, a as GitHubLogColor, b as OutputDefinition, c as ActionCallInputValues, d as ChoiceInputDefinition, f as Command, g as CommandResult, h as CommandOptions, i as GitHubInputOptions, j as ScriptLog, k as ScriptExec, l as ActionInputValues, m as CommandExitPolicy, n as GitHubExec, o as RunGitHubActionOptions, p as CommandEnvironment, q as summaryText, r as GitHubExecOptions, s as runGitHubAction, t as GitHubCore, u as ActionOutputValues, v as InputDefinitions, w as RunnerContext, x as OutputDefinitions, y as InputKind, z as booleanInput } from "./github-LHaDutAi.js";
import { AccountName, EnvironmentAccount, EnvironmentAccounts, EnvironmentDefinition, EnvironmentDefinitions, EnvironmentName, EnvironmentRegistry, EnvironmentSelector, ResolvedEnvironment, defineEnvironmentRegistry, resolveEnvironment, selectEnvironmentName } from "./environments.js";
import { A as runner, C as ne, D as needsResultIs, E as needsResultIn, F as success, I as valueOr, M as selectString, N as startsWith, O as not, P as stepOutput, S as matrix, T as needsResult, _ as format, a as GitHubJobResultValue, b as hashFiles, c as always, d as contains, f as defineMatrix, g as failure, h as expr, i as GitHubJobResult, j as secret, k as or, l as and, m as eq, n as GitHubExpression, o as GitHubMatrixValues, p as envVar, r as GitHubExpressionValue, s as GitHubTypedMatrix, t as AnyGitHubTypedMatrix, u as cancelled, v as gh, w as needsOutput, x as input, y as github } from "./expressions-sbe0iTuP.js";
import { z } from "zod";

//#region src/local.d.ts
declare const nodeFs: ScriptFs;
declare const nodeExec: ScriptExec;
declare const nodeLog: ScriptLog;
declare const currentRunner: () => RunnerContext;
//#endregion
//#region src/runner-schema.d.ts
declare const runnerProbeSchemaVersion: 1;
declare const runnerArchitectures: readonly ["arm64", "x64"];
declare const runnerEnvironmentNames: readonly ["CI", "GITHUB_ACTIONS", "ImageOS", "ImageVersion", "RUNNER_ARCH", "RUNNER_OS"];
declare const runnerPathEnvironmentNames: readonly ["GITHUB_ENV", "GITHUB_EVENT_PATH", "GITHUB_OUTPUT", "GITHUB_PATH", "GITHUB_STATE", "GITHUB_STEP_SUMMARY", "GITHUB_WORKSPACE", "HOME", "RUNNER_TEMP", "RUNNER_TOOL_CACHE"];
declare const runnerToolNames: readonly ["bash", "cargo", "clang", "cmake", "curl", "docker", "gcc", "gh", "git", "go", "java", "jq", "make", "node", "npm", "podman", "python3", "ruby", "rustc", "tar", "zstd"];
type RunnerToolName = (typeof runnerToolNames)[number];
type DeepReadonly<Value> = Value extends readonly unknown[] ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> } : Value extends object ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> } : Value;
type RunnerArchitecture = (typeof runnerArchitectures)[number];
type RunnerEnvironmentName = (typeof runnerEnvironmentNames)[number];
type RunnerPathEnvironmentName = (typeof runnerPathEnvironmentNames)[number];
type RunnerContract = DeepReadonly<{
  schemaVersion: typeof runnerProbeSchemaVersion;
  architectures: RunnerArchitecture[];
  environment: Partial<Record<RunnerEnvironmentName, string>>;
  os: {
    id: string;
    versionId: string;
  };
  paths: RunnerPathEnvironmentName[];
  tools: {
    name: RunnerToolName;
    versionPrefix?: string | undefined;
  }[];
}>;
type RunnerPackageProbe = DeepReadonly<{
  manager: "none";
  packages: [];
} | {
  manager: "dpkg";
  packages: {
    name: string;
    version: string;
  }[];
}>;
type RunnerPathProbe = DeepReadonly<{
  name: RunnerPathEnvironmentName;
  status: "absent";
} | {
  absolute: boolean;
  exists: boolean;
  name: RunnerPathEnvironmentName;
  status: "ready";
  value: string;
  writable: boolean;
}>;
type RunnerToolProbe = DeepReadonly<{
  name: RunnerToolName;
  status: "absent";
} | {
  name: RunnerToolName;
  path: string;
  status: "ready";
  version: string;
}>;
type RunnerProbe = DeepReadonly<{
  schemaVersion: typeof runnerProbeSchemaVersion;
  environment: Partial<Record<RunnerEnvironmentName, string>>;
  identity: {
    gid: number;
    groups: string[];
    uid: number;
  };
  packages: RunnerPackageProbe;
  paths: RunnerPathProbe[];
  platform: {
    architecture: string;
    capabilities: string;
    cgroup: "v1" | "v2";
    kernelRelease: string;
    kernelVersion: string;
    os: {
      id: string;
      prettyName: string;
      versionId: string;
    };
  };
  tools: RunnerToolProbe[];
  toolCache: Record<string, string[]>;
}>;
type RunnerDifference = Readonly<{
  category: "contract" | "inventory" | "provider";
  actual?: unknown;
  expected?: unknown;
  path: string;
}>;
//#endregion
//#region src/runner-contract.d.ts
declare const defineRunnerContract: (contract: RunnerContract) => RunnerContract;
declare const verifyRunner: (contract: RunnerContract, probe: RunnerProbe) => readonly RunnerDifference[];
declare const compareRunnerProbes: (expected: RunnerProbe, actual: RunnerProbe) => readonly RunnerDifference[];
declare const parseRunnerContract: (contents: string) => RunnerContract;
declare const parseRunnerProbe: (contents: string) => RunnerProbe;
//#endregion
//#region src/runner.d.ts
type RunnerProbeSource = Readonly<{
  architecture: string;
  env: Readonly<Record<string, string | undefined>>;
  exec: ScriptExec;
  gid: number;
  kernelRelease: string;
  kernelVersion: string;
  operatingSystem: string;
  pathDelimiter: string;
  readDirectory: (path: string) => Promise<readonly string[]>;
  readText: (path: string) => Promise<string>;
  testAccess: (path: string, mode?: number) => Promise<boolean>;
  uid: number;
}>;
declare const probeRunner: (source?: RunnerProbeSource) => Promise<RunnerProbe>;
declare const readRunnerContract: (path: string) => Promise<RunnerContract>;
declare const readRunnerProbe: (path: string) => Promise<RunnerProbe>;
declare const writeRunnerProbe: (path: string, probe: RunnerProbe) => Promise<void>;
//#endregion
//#region src/container.d.ts
type ContainerProvider = "container" | "docker" | "podman";
declare class ContainerProviderUnavailableError extends Error {
  readonly binary: string;
  readonly provider: ContainerProvider;
  constructor(provider: ContainerProvider, binary: string, cause: unknown);
}
declare const githubActionsRunnerImage = "ghcr.io/actions/actions-runner@sha256:0cfdcc701ce933c6d243c6b0b2da767366dc9f2e99961d4c3754b0b78084cdda";
declare const githubActionsRunnerVersion = "2.336.0";
type ContainerOptions = Readonly<{
  actionBundle?: string;
  hostExec?: ScriptExec;
  image: string;
  provider: ContainerProvider;
  workspace: string;
}>;
type ContainerServices = Readonly<{
  exec: ScriptExec;
  fs: ScriptFs;
  runner: RunnerContext;
}>;
declare const withContainer: <Value>(options: ContainerOptions, run: (services: ContainerServices) => Promise<Value>) => Promise<Value>;
declare const withLocalContainer: <Value>(options: ContainerOptions, run: (services: ContainerServices) => Promise<Value>) => Promise<Value>;
//#endregion
//#region src/github-runner.d.ts
declare const encodedGitHubJitConfigBrand: unique symbol;
type EncodedGitHubJitConfig = string & {
  readonly [encodedGitHubJitConfigBrand]: true;
};
type GitHubRunnerContainerEngine = Readonly<{
  kind: "docker-socket";
  path: string;
}>;
type GitHubRunnerHooks = Readonly<{
  container?: string;
  jobCompleted?: string;
  jobStarted?: string;
  requireJobContainer?: boolean;
}>;
type GitHubRunnerOptions = Readonly<{
  containerEngine?: GitHubRunnerContainerEngine;
  diagnostics?: string;
  encodedJitConfig: EncodedGitHubJitConfig;
  hooks?: GitHubRunnerHooks;
  image: string;
  provider: ContainerProvider;
}>;
type GitHubRunnerProcess = (command: Command) => Promise<void>;
type GitHubRunnerServices = Readonly<{
  process: GitHubRunnerProcess;
  runnerLauncher: URL;
}>;
declare const parseEncodedGitHubJitConfig: (value: string) => EncodedGitHubJitConfig;
declare const readEncodedGitHubJitConfig: (path: string) => Promise<EncodedGitHubJitConfig>;
declare const runGitHubRunner: (options: GitHubRunnerOptions, services?: GitHubRunnerServices) => Promise<void>;
//#endregion
//#region src/github-runner-api.d.ts
declare const githubApiTokenBrand: unique symbol;
declare const githubRepositoryBrand: unique symbol;
declare const githubRunnerJitRegistrationBrand: unique symbol;
type GitHubApiToken = string & {
  readonly [githubApiTokenBrand]: true;
};
type GitHubRepository = Readonly<{
  name: string;
  owner: string;
}> & {
  readonly [githubRepositoryBrand]: true;
};
type GitHubRunnerJitRegistrationOptions = Readonly<{
  labels: readonly string[];
  name: string;
  runnerGroupId: number;
  workFolder?: string;
}>;
type GitHubRunnerJitRegistration = Readonly<{
  labels: readonly [string, ...string[]];
  name: string;
  runnerGroupId: number;
  workFolder?: string;
}> & {
  readonly [githubRunnerJitRegistrationBrand]: true;
};
type GenerateGitHubRepositoryRunnerJitConfigOptions = Readonly<{
  apiUrl?: URL;
  repository: GitHubRepository;
  registration: GitHubRunnerJitRegistration;
  token: GitHubApiToken;
}>;
type GitHubRunnerApiResponse = Readonly<{
  json: () => Promise<unknown>;
  status: number;
  statusText: string;
}>;
type GitHubRunnerApiRequest = (url: URL, init: RequestInit) => Promise<GitHubRunnerApiResponse>;
type GitHubRunnerApiServices = Readonly<{
  request: GitHubRunnerApiRequest;
}>;
declare class GitHubRunnerApiError extends Error {
  readonly status: number;
  constructor(status: number, statusText: string);
}
declare const parseGitHubApiToken: (value: string) => GitHubApiToken;
declare const parseGitHubRepository: (value: string) => GitHubRepository;
declare const defineGitHubRunnerJitRegistration: (options: GitHubRunnerJitRegistrationOptions) => GitHubRunnerJitRegistration;
declare const generateGitHubRepositoryRunnerJitConfig: (options: GenerateGitHubRepositoryRunnerJitConfigOptions, services?: GitHubRunnerApiServices) => Promise<EncodedGitHubJitConfig>;
declare const writeEncodedGitHubJitConfig: (path: string, config: EncodedGitHubJitConfig) => Promise<void>;
//#endregion
//#region src/workflow-command.d.ts
declare const workflowRunBrand: unique symbol;
type WorkflowCommandOptions = Readonly<{
  file: string;
  args: readonly string[];
}>;
type WorkflowCommand = Readonly<{
  kind: "command";
  file: string;
  args: readonly string[];
  [workflowRunBrand]: true;
}>;
type UnsafeShell = Readonly<{
  kind: "unsafe-shell";
  script: string;
  [workflowRunBrand]: true;
}>;
type WorkflowRun = UnsafeShell | WorkflowCommand;
declare const command: (options: WorkflowCommandOptions) => WorkflowCommand;
declare const unsafeShell: (script: string) => UnsafeShell;
//#endregion
//#region src/workflow-triggers.d.ts
type GitHubActivityTrigger = Readonly<{
  types?: readonly string[];
}>;
type GitHubBranchFilter = Readonly<{
  branches?: readonly string[];
  "branches-ignore"?: readonly string[];
}>;
type GitHubPathFilter = Readonly<{
  paths?: readonly string[];
  "paths-ignore"?: readonly string[];
}>;
type GitHubTagFilter = Readonly<{
  tags?: readonly string[];
  "tags-ignore"?: readonly string[];
}>;
type GitHubPullRequestTrigger = GitHubActivityTrigger & GitHubBranchFilter & GitHubPathFilter;
type GitHubPushTrigger = GitHubBranchFilter & GitHubPathFilter & GitHubTagFilter;
type GitHubMergeGroupTrigger = GitHubBranchFilter & Readonly<{
  types?: readonly ["checks_requested"];
}>;
type GitHubWorkflowDispatchInputBase = Readonly<{
  description?: string;
  required?: boolean;
}>;
type GitHubWorkflowDispatchInput = (GitHubWorkflowDispatchInputBase & Readonly<{
  type: "boolean";
  default?: boolean;
  options?: never;
}>) | (GitHubWorkflowDispatchInputBase & Readonly<{
  type: "choice";
  default?: string;
  options: readonly string[];
}>) | (GitHubWorkflowDispatchInputBase & Readonly<{
  type: "environment";
  default?: string;
  options?: never;
}>) | (GitHubWorkflowDispatchInputBase & Readonly<{
  type: "number";
  default?: number;
  options?: never;
}>) | (GitHubWorkflowDispatchInputBase & Readonly<{
  type?: "string";
  default?: string;
  options?: never;
}>);
type GitHubWorkflowDispatchTrigger = Readonly<{
  inputs?: Readonly<Record<string, GitHubWorkflowDispatchInput>>;
}>;
type GitHubWorkflowCallInput = Readonly<{
  type: "boolean";
  description?: string;
  required?: boolean;
  default?: boolean;
}> | Readonly<{
  type: "number";
  description?: string;
  required?: boolean;
  default?: number;
}> | Readonly<{
  type: "string";
  description?: string;
  required?: boolean;
  default?: string;
}>;
type GitHubWorkflowCallTrigger = Readonly<{
  inputs?: Readonly<Record<string, GitHubWorkflowCallInput>>;
  outputs?: Readonly<Record<string, Readonly<{
    description?: string;
    value: string;
  }>>>;
  secrets?: Readonly<Record<string, Readonly<{
    description?: string;
    required?: boolean;
  }>>>;
}>;
type GitHubScheduleTrigger = readonly Readonly<{
  cron: string;
  timezone?: string;
}>[];
type GitHubWorkflowRunTrigger = GitHubActivityTrigger & GitHubBranchFilter & Readonly<{
  workflows?: readonly string[];
}>;
type GitHubImageVersionTrigger = GitHubActivityTrigger & Readonly<{
  names?: readonly string[];
  versions?: readonly string[];
}>;
type GitHubWorkflowTriggers = Readonly<{
  branch_protection_rule?: GitHubActivityTrigger | null;
  check_run?: GitHubActivityTrigger | null;
  check_suite?: GitHubActivityTrigger | null;
  create?: null;
  delete?: null;
  deployment?: null;
  deployment_status?: null;
  discussion?: GitHubActivityTrigger | null;
  discussion_comment?: GitHubActivityTrigger | null;
  fork?: null;
  gollum?: null;
  image_version?: GitHubImageVersionTrigger | null;
  issue_comment?: GitHubActivityTrigger | null;
  issues?: GitHubActivityTrigger | null;
  label?: GitHubActivityTrigger | null;
  merge_group?: GitHubMergeGroupTrigger | null;
  milestone?: GitHubActivityTrigger | null;
  page_build?: null;
  public?: null;
  pull_request?: GitHubPullRequestTrigger | null;
  pull_request_comment?: GitHubActivityTrigger | null;
  pull_request_review?: GitHubActivityTrigger | null;
  pull_request_review_comment?: GitHubActivityTrigger | null;
  pull_request_target?: GitHubPullRequestTrigger | null;
  push?: GitHubPushTrigger | null;
  registry_package?: GitHubActivityTrigger | null;
  release?: GitHubActivityTrigger | null;
  repository_dispatch?: GitHubActivityTrigger | null;
  schedule?: GitHubScheduleTrigger;
  status?: null;
  watch?: GitHubActivityTrigger | null;
  workflow_call?: GitHubWorkflowCallTrigger | null;
  workflow_dispatch?: GitHubWorkflowDispatchTrigger | null;
  workflow_run?: GitHubWorkflowRunTrigger | null;
}>;
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
type GitHubCommandStep = GitHubStepBase & Readonly<{
  run: WorkflowCommand;
  shell?: never;
  "working-directory"?: string;
  uses?: never;
  with?: never;
}>;
type GitHubUnsafeShellStep = GitHubStepBase & Readonly<{
  run: UnsafeShell;
  shell?: string;
  "working-directory"?: string;
  uses?: never;
  with?: never;
}>;
type GitHubRunStep = GitHubCommandStep | GitHubUnsafeShellStep;
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
type GitHubWorkflowJobs = {
  readonly [name: string]: GitHubWorkflowJob;
};
type GitHubWorkflowFile = Readonly<{
  sourcePath: string;
  sourceExport?: string;
  path: string;
  header: string;
  workflow: GitHubWorkflow;
}>;
type GitHubWorkflowOptions = Readonly<{
  filename: string;
}>;
declare class InvalidWorkflowFilenameError extends Error {
  readonly filename: string;
  readonly reason: string;
  constructor(filename: string, reason: string);
}
type ExactWorkflowTriggers<Triggers extends GitHubWorkflowTriggers> = Triggers & Readonly<Record<Exclude<keyof Triggers, keyof GitHubWorkflowTriggers>, never>>;
declare const workflow: <const Triggers extends GitHubWorkflowTriggers, const Workflow extends GitHubWorkflow & Readonly<{
  on: Triggers;
}>>(definition: Workflow & Readonly<{
  on: ExactWorkflowTriggers<Triggers>;
}>, options?: GitHubWorkflowOptions) => Workflow;
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
  rootImportAlias?: string;
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
  exportName?: string;
  generatedAt?: Date;
  workflow: GitHubWorkflow;
}>) => GitHubWorkflowFile;
declare const renderActionFile: (file: GitHubActionFile) => string;
declare const renderWorkflowFile: (file: GitHubWorkflowFile) => string;
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
declare class GeneratedFilePathCollisionError extends Error {
  readonly paths: readonly string[];
  readonly sources: readonly string[];
  constructor(first: GeneratedFile, second: GeneratedFile);
}
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
type ValidationOptions = Readonly<{
  rules?: readonly string[];
  level?: "warn" | "error";
}>;
type LintIssue = Readonly<{
  ruleId: string;
  message: string;
  jobId: string;
}>;
declare const validateWorkflowModel: (workflow: GitHubWorkflow, options?: ValidationOptions) => Readonly<{
  errors: LintIssue[];
  warnings: LintIssue[];
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
//#region src/lint/no-unnecessary-needs.d.ts
declare function checkUnnecessaryNeeds(jobId: string, job: GitHubWorkflowJob, allJobs: GitHubWorkflowJobs): LintIssue[];
//#endregion
export { type AccountName, type ActionCallInputValues, type ActionInputValues, type ActionOutputValues, type ChoiceInputDefinition, type Command, type CommandEnvironment, type CommandExitPolicy, type CommandOptions, type CommandResult, type ContainerOptions, type ContainerProvider, ContainerProviderUnavailableError, type ContainerServices, type EncodedGitHubJitConfig, type EnvironmentAccount, type EnvironmentAccounts, type EnvironmentDefinition, type EnvironmentDefinitions, type EnvironmentName, type EnvironmentRegistry, type EnvironmentSelector, type GenerateGitHubRepositoryRunnerJitConfigOptions, type GeneratedFile, GeneratedFilePathCollisionError, type GeneratedFileWriteResult, type GeneratedFileWriteStatus, type GitHubActionEntrypointFile, type GitHubActionFile, type GitHubActionInputMetadata, type GitHubActionMetadata, type GitHubActionOutputMetadata, type GitHubApiToken, type GitHubCommandStep, type GitHubConcurrency, type GitHubCore, type GitHubEnvironmentVariables, type GitHubExec, type GitHubExecOptions, type GitHubExpression, type GitHubExpressionString, type GitHubExpressionValue, type GitHubInputOptions, type GitHubJobOutputs, GitHubJobResult, type GitHubJobResultValue, type GitHubLocalAction, type GitHubLocalActionStepOptions, type GitHubLogColor, type GitHubMatrix, type GitHubMatrixObject, type GitHubMatrixValue, type GitHubMatrixValues, type GitHubMergeGroupTrigger, type GitHubNeeds, type GitHubPermission, type GitHubPermissions, type GitHubRepository, type GitHubReusableWorkflowJob, type GitHubReusableWorkflowSecrets, type GitHubRunStep, GitHubRunnerApiError, type GitHubRunnerApiRequest, type GitHubRunnerApiResponse, type GitHubRunnerApiServices, type GitHubRunnerContainerEngine, type GitHubRunnerHooks, type GitHubRunnerJitRegistration, type GitHubRunnerJitRegistrationOptions, type GitHubRunnerOptions, type GitHubRunnerProcess, type GitHubService, type GitHubServices, type GitHubStepWorkflowJob, type GitHubStrategy, type GitHubTypedMatrix, type GitHubUnsafeShellStep, type GitHubUsesStep, type GitHubUsesStepOptions, type GitHubWithValues, type GitHubWorkflow, type GitHubWorkflowCallWithValues, type GitHubWorkflowDispatchInput, type GitHubWorkflowDispatchTrigger, type GitHubWorkflowFile, type GitHubWorkflowJob, type GitHubWorkflowOptions, type GitHubWorkflowStep, type GitHubWorkflowTriggers, type GitHubYamlFile, type GitHubYamlValidation, type GitHubYamlValidationError, type InputDefinition, type InputDefinitions, type InputKind, InvalidWorkflowFilenameError, type LintIssue, type OutputDefinition, type OutputDefinitions, type RenderedGeneratedFile, type ResolvedEnvironment, type RunActionOptions, type RunGitHubActionOptions, type RunnerArchitecture, type RunnerContext, type RunnerContract, type RunnerDifference, type RunnerEnvironmentName, type RunnerPackageProbe, type RunnerPathEnvironmentName, type RunnerPathProbe, type RunnerProbe, type RunnerProbeSource, type RunnerToolName, type RunnerToolProbe, type ScriptAction, type ScriptActionCall, type ScriptActionContext, type ScriptActionServices, type ScriptExec, type ScriptFs, type ScriptLog, type ScriptSummary, type SummaryCell, type SummaryCode, type SummaryTableRow, type SummaryText, type UnsafeShell, type ValidationOptions, type WorkflowCommand, type WorkflowCommandOptions, type WorkflowInputValues, type WorkflowRun, type WriteGeneratedFilesOptions, action, always, and, assertValidActionMetadataContent, assertValidWorkflowContent, booleanInput, cancelled, checkUnnecessaryNeeds, choiceInput, command, compareRunnerProbes, contains, currentRunner, defineEnvironmentRegistry, defineGitHubRunnerJitRegistration, defineMatrix, defineRunnerContract, envVar, eq, expr, failure, format, generateActionEntrypointFile, generateActionFile, generateActionFiles, generateActionMetadata, generateGitHubRepositoryRunnerJitConfig, generateUsesStep, generateWorkflowFile, gh, github, githubActionsRunnerImage, githubActionsRunnerVersion, hashFiles, input, integerInput, job, localAction, matrix, ne, needsOutput, needsResult, needsResultIn, needsResultIs, nodeExec, nodeFs, nodeLog, not, or, parseEncodedGitHubJitConfig, parseGitHubApiToken, parseGitHubRepository, parseRunnerContract, parseRunnerProbe, pathInput, probeRunner, readEncodedGitHubJitConfig, readRunnerContract, readRunnerProbe, renderActionFile, renderGeneratedFile, renderWorkflowFile, resolveEnvironment, runAction, runGitHubAction, runGitHubRunner, runner, runnerProbeSchemaVersion, secret, selectEnvironmentName, selectString, startsWith, stepOutput, stringInput, stringOutput, success, summaryCode, summaryText, unsafeShell, uses, validateActionMetadataContent, validateWorkflowContent, validateWorkflowModel, valueOr, verifyRunner, withContainer, withLocalContainer, workflow, writeEncodedGitHubJitConfig, writeGeneratedFiles, writeRunnerProbe };