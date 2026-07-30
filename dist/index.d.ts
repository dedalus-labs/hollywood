
import { A as ScriptFs, B as choiceInput, C as RunActionOptions, D as ScriptActionContext, E as ScriptActionCall, F as SummaryTableRow, G as stringOutput, H as pathInput, I as SummaryText, K as summaryCode, L as WorkflowInputValues, M as ScriptSummary, N as SummaryCell, O as ScriptActionServices, P as SummaryCode, R as action, S as RequiredInputName, T as ScriptAction, U as runAction, V as integerInput, W as stringInput, _ as InputDefinition, a as GitHubLogColor, b as OutputDefinition, c as ActionCallInputValues, d as ChoiceInputDefinition, f as Command, g as CommandResult, h as CommandOptions, i as GitHubInputOptions, j as ScriptLog, k as ScriptExec, l as ActionInputValues, m as CommandExitPolicy, n as GitHubExec, o as RunGitHubActionOptions, p as CommandEnvironment, q as summaryText, r as GitHubExecOptions, s as runGitHubAction, t as GitHubCore, u as ActionOutputValues, v as InputDefinitions, w as RunnerContext, x as OutputDefinitions, y as InputKind, z as booleanInput } from "./github-LHaDutAi.js";
import { AccountName, EnvironmentAccount, EnvironmentAccounts, EnvironmentDefinition, EnvironmentDefinitions, EnvironmentName, EnvironmentRegistry, EnvironmentSelector, ResolvedEnvironment, defineEnvironmentRegistry, resolveEnvironment, selectEnvironmentName } from "./environments.js";
import { A as runner, C as ne, D as needsResultIs, E as needsResultIn, F as valueOr, M as selectString, N as stepOutput, O as not, P as success, S as matrix, T as needsResult, _ as format, a as GitHubJobResultValue, b as hashFiles, c as always, d as contains, f as defineMatrix, g as failure, h as expr, i as GitHubJobResult, j as secret, k as or, l as and, m as eq, n as GitHubExpression, o as GitHubMatrixValues, p as envVar, r as GitHubExpressionValue, s as GitHubTypedMatrix, t as AnyGitHubTypedMatrix, u as cancelled, v as gh, w as needsOutput, x as input, y as github } from "./expressions-CNeNMhG5.js";
import { z } from "zod";

//#region src/local.d.ts
declare const nodeFs: ScriptFs;
declare const nodeExec: ScriptExec;
declare const nodeLog: ScriptLog;
declare const currentRunner: () => RunnerContext;
//#endregion
//#region src/runner-schema.d.ts
declare const runnerProbeSchemaVersion: 1;
declare const runnerEnvironmentNames: readonly ["CI", "GITHUB_ACTIONS", "ImageOS", "ImageVersion", "RUNNER_ARCH", "RUNNER_OS"];
declare const runnerPathEnvironmentNames: readonly ["GITHUB_ENV", "GITHUB_EVENT_PATH", "GITHUB_OUTPUT", "GITHUB_PATH", "GITHUB_STEP_SUMMARY", "GITHUB_WORKSPACE", "HOME", "RUNNER_TEMP", "RUNNER_TOOL_CACHE"];
declare const runnerToolNames: readonly ["bash", "cargo", "clang", "cmake", "curl", "docker", "gcc", "gh", "git", "go", "java", "jq", "make", "node", "npm", "podman", "python3", "ruby", "rustc", "tar", "zstd"];
declare const runnerProbeSchema: z.ZodObject<{
  schemaVersion: z.ZodLiteral<1>;
  environment: z.ZodRecord<z.ZodEnum<{
    CI: "CI";
    GITHUB_ACTIONS: "GITHUB_ACTIONS";
    ImageOS: "ImageOS";
    ImageVersion: "ImageVersion";
    RUNNER_ARCH: "RUNNER_ARCH";
    RUNNER_OS: "RUNNER_OS";
  }> & z.core.$partial, z.ZodString>;
  identity: z.ZodObject<{
    gid: z.ZodNumber;
    groups: z.ZodArray<z.ZodString>;
    uid: z.ZodNumber;
  }, z.core.$strict>;
  packages: z.ZodDiscriminatedUnion<[z.ZodObject<{
    manager: z.ZodLiteral<"none">;
    packages: z.ZodTuple<[], null>;
  }, z.core.$strict>, z.ZodObject<{
    manager: z.ZodLiteral<"dpkg">;
    packages: z.ZodArray<z.ZodObject<{
      name: z.ZodString;
      version: z.ZodString;
    }, z.core.$strict>>;
  }, z.core.$strict>], "manager">;
  paths: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    name: z.ZodEnum<{
      GITHUB_ENV: "GITHUB_ENV";
      GITHUB_EVENT_PATH: "GITHUB_EVENT_PATH";
      GITHUB_OUTPUT: "GITHUB_OUTPUT";
      GITHUB_PATH: "GITHUB_PATH";
      GITHUB_STEP_SUMMARY: "GITHUB_STEP_SUMMARY";
      GITHUB_WORKSPACE: "GITHUB_WORKSPACE";
      HOME: "HOME";
      RUNNER_TEMP: "RUNNER_TEMP";
      RUNNER_TOOL_CACHE: "RUNNER_TOOL_CACHE";
    }>;
    status: z.ZodLiteral<"absent">;
  }, z.core.$strict>, z.ZodObject<{
    absolute: z.ZodBoolean;
    exists: z.ZodBoolean;
    name: z.ZodEnum<{
      GITHUB_ENV: "GITHUB_ENV";
      GITHUB_EVENT_PATH: "GITHUB_EVENT_PATH";
      GITHUB_OUTPUT: "GITHUB_OUTPUT";
      GITHUB_PATH: "GITHUB_PATH";
      GITHUB_STEP_SUMMARY: "GITHUB_STEP_SUMMARY";
      GITHUB_WORKSPACE: "GITHUB_WORKSPACE";
      HOME: "HOME";
      RUNNER_TEMP: "RUNNER_TEMP";
      RUNNER_TOOL_CACHE: "RUNNER_TOOL_CACHE";
    }>;
    status: z.ZodLiteral<"ready">;
    value: z.ZodString;
    writable: z.ZodBoolean;
  }, z.core.$strict>], "status">>;
  platform: z.ZodObject<{
    architecture: z.ZodString;
    capabilities: z.ZodString;
    cgroup: z.ZodEnum<{
      v1: "v1";
      v2: "v2";
    }>;
    kernelRelease: z.ZodString;
    kernelVersion: z.ZodString;
    os: z.ZodObject<{
      id: z.ZodString;
      prettyName: z.ZodString;
      versionId: z.ZodString;
    }, z.core.$strict>;
  }, z.core.$strict>;
  tools: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    name: z.ZodEnum<{
      bash: "bash";
      cargo: "cargo";
      clang: "clang";
      cmake: "cmake";
      curl: "curl";
      docker: "docker";
      gcc: "gcc";
      gh: "gh";
      git: "git";
      go: "go";
      java: "java";
      jq: "jq";
      make: "make";
      node: "node";
      npm: "npm";
      podman: "podman";
      python3: "python3";
      ruby: "ruby";
      rustc: "rustc";
      tar: "tar";
      zstd: "zstd";
    }>;
    status: z.ZodLiteral<"absent">;
  }, z.core.$strict>, z.ZodObject<{
    name: z.ZodEnum<{
      bash: "bash";
      cargo: "cargo";
      clang: "clang";
      cmake: "cmake";
      curl: "curl";
      docker: "docker";
      gcc: "gcc";
      gh: "gh";
      git: "git";
      go: "go";
      java: "java";
      jq: "jq";
      make: "make";
      node: "node";
      npm: "npm";
      podman: "podman";
      python3: "python3";
      ruby: "ruby";
      rustc: "rustc";
      tar: "tar";
      zstd: "zstd";
    }>;
    path: z.ZodString;
    status: z.ZodLiteral<"ready">;
    version: z.ZodString;
  }, z.core.$strict>], "status">>;
  toolCache: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
declare const runnerContractSchema: z.ZodObject<{
  schemaVersion: z.ZodLiteral<1>;
  environment: z.ZodRecord<z.ZodEnum<{
    CI: "CI";
    GITHUB_ACTIONS: "GITHUB_ACTIONS";
    ImageOS: "ImageOS";
    ImageVersion: "ImageVersion";
    RUNNER_ARCH: "RUNNER_ARCH";
    RUNNER_OS: "RUNNER_OS";
  }> & z.core.$partial, z.ZodString>;
  os: z.ZodObject<{
    id: z.ZodString;
    versionId: z.ZodString;
  }, z.core.$strict>;
  paths: z.ZodArray<z.ZodEnum<{
    GITHUB_ENV: "GITHUB_ENV";
    GITHUB_EVENT_PATH: "GITHUB_EVENT_PATH";
    GITHUB_OUTPUT: "GITHUB_OUTPUT";
    GITHUB_PATH: "GITHUB_PATH";
    GITHUB_STEP_SUMMARY: "GITHUB_STEP_SUMMARY";
    GITHUB_WORKSPACE: "GITHUB_WORKSPACE";
    HOME: "HOME";
    RUNNER_TEMP: "RUNNER_TEMP";
    RUNNER_TOOL_CACHE: "RUNNER_TOOL_CACHE";
  }>>;
  tools: z.ZodArray<z.ZodObject<{
    name: z.ZodEnum<{
      bash: "bash";
      cargo: "cargo";
      clang: "clang";
      cmake: "cmake";
      curl: "curl";
      docker: "docker";
      gcc: "gcc";
      gh: "gh";
      git: "git";
      go: "go";
      java: "java";
      jq: "jq";
      make: "make";
      node: "node";
      npm: "npm";
      podman: "podman";
      python3: "python3";
      ruby: "ruby";
      rustc: "rustc";
      tar: "tar";
      zstd: "zstd";
    }>;
    versionPrefix: z.ZodOptional<z.ZodString>;
  }, z.core.$strict>>;
}, z.core.$strict>;
type DeepReadonly<Value> = Value extends readonly unknown[] ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> } : Value extends object ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> } : Value;
type RunnerEnvironmentName = (typeof runnerEnvironmentNames)[number];
type RunnerPathEnvironmentName = (typeof runnerPathEnvironmentNames)[number];
type RunnerToolName = (typeof runnerToolNames)[number];
type RunnerContract = DeepReadonly<z.infer<typeof runnerContractSchema>>;
type RunnerProbe = DeepReadonly<z.infer<typeof runnerProbeSchema>>;
type RunnerPackageProbe = RunnerProbe["packages"];
type RunnerPathProbe = RunnerProbe["paths"][number];
type RunnerToolProbe = RunnerProbe["tools"][number];
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
declare const workflow: <const Workflow extends GitHubWorkflow>(definition: Workflow, options?: GitHubWorkflowOptions) => Workflow;
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
export { type AccountName, type ActionCallInputValues, type ActionInputValues, type ActionOutputValues, type ChoiceInputDefinition, type Command, type CommandEnvironment, type CommandExitPolicy, type CommandOptions, type CommandResult, type ContainerOptions, type ContainerProvider, ContainerProviderUnavailableError, type ContainerServices, type EnvironmentAccount, type EnvironmentAccounts, type EnvironmentDefinition, type EnvironmentDefinitions, type EnvironmentName, type EnvironmentRegistry, type EnvironmentSelector, type GeneratedFile, GeneratedFilePathCollisionError, type GeneratedFileWriteResult, type GeneratedFileWriteStatus, type GitHubActionEntrypointFile, type GitHubActionFile, type GitHubActionInputMetadata, type GitHubActionMetadata, type GitHubActionOutputMetadata, type GitHubConcurrency, type GitHubCore, type GitHubEnvironmentVariables, type GitHubExec, type GitHubExecOptions, type GitHubExpression, type GitHubExpressionString, type GitHubExpressionValue, type GitHubInputOptions, type GitHubJobOutputs, GitHubJobResult, type GitHubJobResultValue, type GitHubLocalAction, type GitHubLocalActionStepOptions, type GitHubLogColor, type GitHubMatrix, type GitHubMatrixObject, type GitHubMatrixValue, type GitHubMatrixValues, type GitHubNeeds, type GitHubPermission, type GitHubPermissions, type GitHubReusableWorkflowJob, type GitHubReusableWorkflowSecrets, type GitHubRunStep, type GitHubService, type GitHubServices, type GitHubStepWorkflowJob, type GitHubStrategy, type GitHubTypedMatrix, type GitHubUsesStep, type GitHubUsesStepOptions, type GitHubWithValues, type GitHubWorkflow, type GitHubWorkflowCallWithValues, type GitHubWorkflowFile, type GitHubWorkflowJob, type GitHubWorkflowOptions, type GitHubWorkflowStep, type GitHubYamlFile, type GitHubYamlValidation, type GitHubYamlValidationError, type InputDefinition, type InputDefinitions, type InputKind, InvalidWorkflowFilenameError, type OutputDefinition, type OutputDefinitions, type RenderedGeneratedFile, type ResolvedEnvironment, type RunActionOptions, type RunGitHubActionOptions, type RunnerContext, type RunnerContract, type RunnerDifference, type RunnerEnvironmentName, type RunnerPackageProbe, type RunnerPathEnvironmentName, type RunnerPathProbe, type RunnerProbe, type RunnerProbeSource, type RunnerToolName, type RunnerToolProbe, type ScriptAction, type ScriptActionCall, type ScriptActionContext, type ScriptActionServices, type ScriptExec, type ScriptFs, type ScriptLog, type ScriptSummary, type SummaryCell, type SummaryCode, type SummaryTableRow, type SummaryText, type WorkflowInputValues, type WriteGeneratedFilesOptions, action, always, and, assertValidActionMetadataContent, assertValidWorkflowContent, booleanInput, cancelled, choiceInput, compareRunnerProbes, contains, currentRunner, defineEnvironmentRegistry, defineMatrix, defineRunnerContract, envVar, eq, expr, failure, format, generateActionEntrypointFile, generateActionFile, generateActionFiles, generateActionMetadata, generateUsesStep, generateWorkflowFile, gh, github, githubActionsRunnerImage, hashFiles, input, integerInput, job, localAction, matrix, ne, needsOutput, needsResult, needsResultIn, needsResultIs, nodeExec, nodeFs, nodeLog, not, or, parseRunnerContract, parseRunnerProbe, pathInput, probeRunner, readRunnerContract, readRunnerProbe, renderActionFile, renderGeneratedFile, renderWorkflowFile, resolveEnvironment, runAction, runGitHubAction, runner, runnerProbeSchemaVersion, secret, selectEnvironmentName, selectString, stepOutput, stringInput, stringOutput, success, summaryCode, summaryText, uses, validateActionMetadataContent, validateWorkflowContent, valueOr, verifyRunner, withContainer, withLocalContainer, workflow, writeGeneratedFiles, writeRunnerProbe };