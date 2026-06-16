import { dirname, relative } from "node:path/posix";

import { stringify } from "yaml";

import type {
	InputDefinition,
	InputDefinitions,
	OutputDefinitions,
	RequiredInputName,
	ScriptAction,
	WorkflowInputValues,
} from "./script";
import {
	githubTypedMatrixValues,
	isGitHubTypedMatrix,
	type AnyGitHubTypedMatrix,
	type GitHubExpression,
} from "./expressions";
import { toGitHubName } from "./names";
import { assertValidActionMetadataContent, assertValidWorkflowContent } from "./validation";

type ScriptActionDescriptor<
	Inputs extends InputDefinitions,
	Outputs extends OutputDefinitions,
> = Pick<
	ScriptAction<Inputs, Outputs>,
	"description" | "inputs" | "localActionPath" | "name" | "outputs"
>;

export type GitHubLocalAction<Inputs extends InputDefinitions> = Readonly<{
	name: string;
	localActionPath: string;
	inputs: Inputs;
}>;

type WorkflowActionDescriptor<Inputs extends InputDefinitions> =
	| Pick<ScriptAction<Inputs, OutputDefinitions>, "inputs" | "localActionPath" | "name">
	| GitHubLocalAction<Inputs>;

export type GitHubActionMetadata = Readonly<{
	name: string;
	description: string;
	inputs: GitHubActionInputMetadataByName;
	outputs: GitHubActionOutputMetadataByName;
	runs: Readonly<{
		using: "node24";
		main: "dist/index.js";
	}>;
}>;

export type GitHubActionInputMetadataByName = {
	readonly [name: string]: GitHubActionInputMetadata;
};

export type GitHubActionInputMetadata = Readonly<{
	description: string;
	required: boolean;
	default?: string;
}>;

export type GitHubActionOutputMetadata = Readonly<{
	description: string;
}>;

export type GitHubActionOutputMetadataByName = {
	readonly [name: string]: GitHubActionOutputMetadata;
};

type GitHubScalar = boolean | number | string;

export type GitHubEnvironmentVariables = {
	readonly [name: string]: GitHubScalar;
};

export type GitHubWithValues = {
	readonly [name: string]: boolean | number | string;
};

export type GitHubWorkflowCallWithValues = GitHubWithValues;

export type GitHubReusableWorkflowSecrets =
	| "inherit"
	| Readonly<{
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

export type GitHubUsesStepOptions<Inputs extends InputDefinitions> = GitHubStepBase &
	Readonly<{
		name: GitHubExpressionString;
		uses: string;
	}> &
	GitHubActionInputOption<Inputs>;

export type GitHubLocalActionStepOptions<Inputs extends InputDefinitions> = GitHubStepBase &
	Readonly<{
		actionsDir?: string;
	}> &
	GitHubActionInputOption<Inputs>;

type GitHubActionInputOption<Inputs extends InputDefinitions> =
	RequiredInputName<Inputs> extends never
		? Readonly<{ with?: WorkflowInputValues<Inputs> }>
		: Readonly<{ with: WorkflowInputValues<Inputs> }>;

export type GitHubUsesStep = GitHubStepBase &
	Readonly<{
		uses: string;
		with?: GitHubWithValues;
		run?: never;
		shell?: never;
		"working-directory"?: never;
	}>;

export type GitHubRunStep = GitHubStepBase &
	Readonly<{
		run: string;
		shell?: string;
		"working-directory"?: string;
		uses?: never;
		with?: never;
	}>;

export type GitHubActionFile = Readonly<{
	sourcePath: string;
	path: string;
	header: string;
	metadata: GitHubActionMetadata;
}>;

export type GitHubActionEntrypointFile = Readonly<{
	sourcePath: string;
	path: string;
	header: string;
	content: string;
}>;

export type GitHubWorkflowStep = GitHubRunStep | GitHubUsesStep;

export type GitHubExpressionString = GitHubExpression | string;

export type GitHubNeeds = readonly string[] | string;

export type GitHubJobOutputs = {
	readonly [name: string]: GitHubExpressionString;
};

export type GitHubPermission = "none" | "read" | "write";

export type GitHubPermissions =
	| "read-all"
	| "write-all"
	| Readonly<{
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

export type GitHubConcurrency =
	| string
	| Readonly<{
			group: GitHubExpressionString;
			queue?: "single";
			"cancel-in-progress"?: boolean | GitHubExpressionString;
	  }>
	| Readonly<{
			group: GitHubExpressionString;
			queue: "max";
			"cancel-in-progress"?: never;
	  }>;

export type GitHubStrategy = Readonly<{
	matrix?: AnyGitHubTypedMatrix | GitHubMatrix;
	"fail-fast"?: boolean;
	"max-parallel"?: number;
}>;

export type GitHubMatrixValue = boolean | number | string;

export type GitHubMatrix = Readonly<{
	readonly [name: string]: readonly GitHubMatrixValue[] | readonly GitHubMatrixObject[];
}>;

export type GitHubMatrixObject = Readonly<{
	readonly [name: string]: GitHubMatrixValue;
}>;

export type GitHubService = Readonly<{
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

export type GitHubServices = {
	readonly [name: string]: GitHubService;
};

type GitHubWorkflowJobBase = Readonly<{
	name?: GitHubExpressionString;
	needs?: GitHubNeeds;
	if?: GitHubExpressionString;
	environment?: string | Readonly<{ name: string; url?: GitHubExpressionString }>;
	outputs?: GitHubJobOutputs;
	permissions?: GitHubPermissions;
	concurrency?: GitHubConcurrency;
	env?: GitHubEnvironmentVariables;
	strategy?: GitHubStrategy;
	services?: GitHubServices;
	"timeout-minutes"?: number;
}>;

export type GitHubStepWorkflowJob = GitHubWorkflowJobBase &
	Readonly<{
		"runs-on": string | readonly string[];
		steps: readonly GitHubWorkflowStep[];
		uses?: never;
		with?: never;
		secrets?: never;
	}>;

export type GitHubReusableWorkflowJob = Omit<
	GitHubWorkflowJobBase,
	"environment" | "env" | "outputs" | "services" | "timeout-minutes"
> &
	Readonly<{
		uses: string;
		with?: GitHubWorkflowCallWithValues;
		secrets?: GitHubReusableWorkflowSecrets;
		"runs-on"?: never;
		steps?: never;
	}>;

export type GitHubWorkflowJob = GitHubStepWorkflowJob | GitHubReusableWorkflowJob;

export type GitHubWorkflow = Readonly<{
	name: string;
	on: GitHubWorkflowTriggers;
	permissions?: GitHubPermissions;
	concurrency?: GitHubConcurrency;
	env?: GitHubEnvironmentVariables;
	jobs: GitHubWorkflowJobs;
}>;

export type GitHubWorkflowTriggers = {
	readonly [name: string]: unknown;
};

export type GitHubWorkflowJobs = {
	readonly [name: string]: GitHubWorkflowJob;
};

export type GitHubWorkflowFile = Readonly<{
	sourcePath: string;
	path: string;
	header: string;
	workflow: GitHubWorkflow;
}>;

export const workflow = <const Workflow extends GitHubWorkflow>(definition: Workflow): Workflow =>
	definition;

export const job = <const Job extends GitHubWorkflowJob>(definition: Job): Job => definition;

export const localAction = <const Inputs extends InputDefinitions>(
	definition: GitHubLocalAction<Inputs>,
): GitHubLocalAction<Inputs> => definition;

export const generateActionMetadata = <
	const Inputs extends InputDefinitions,
	const Outputs extends OutputDefinitions,
>(
	action: ScriptActionDescriptor<Inputs, Outputs>,
): GitHubActionMetadata => {
	const inputs = new Map<string, GitHubActionInputMetadata>();
	for (const [name, input] of Object.entries(action.inputs)) {
		const githubName = uniqueGitHubName(inputs, name, "input");
		inputs.set(githubName, inputMetadata(input));
	}

	const outputs = new Map<string, GitHubActionOutputMetadata>();
	for (const [name, output] of Object.entries(action.outputs)) {
		const githubName = uniqueGitHubName(outputs, name, "output");
		outputs.set(githubName, { description: output.description });
	}

	return {
		name: action.name,
		description: action.description,
		inputs: mapToObject(inputs),
		outputs: mapToObject(outputs),
		runs: { using: "node24", main: "dist/index.js" },
	};
};

export const generateActionFile = <
	const Inputs extends InputDefinitions,
	const Outputs extends OutputDefinitions,
>(
	action: ScriptActionDescriptor<Inputs, Outputs>,
	options: Readonly<{
		sourcePath: string;
		actionsDir: string;
		generatedAt?: Date;
	}>,
): GitHubActionFile => ({
	sourcePath: options.sourcePath,
	path: `${trimTrailingSlash(options.actionsDir)}/${actionDirectory({
		action,
		actionsDir: options.actionsDir,
		sourcePath: options.sourcePath,
	})}/action.yml`,
	header: generatedHeader(options.generatedAt),
	metadata: generateActionMetadata(action),
});

export const generateActionEntrypointFile = <
	const Inputs extends InputDefinitions,
	const Outputs extends OutputDefinitions,
>(
	action: ScriptActionDescriptor<Inputs, Outputs>,
	options: Readonly<{
		sourcePath: string;
		actionsDir: string;
		exportName: string;
		generatedAt?: Date;
	}>,
): GitHubActionEntrypointFile => {
	assertTypeScriptIdentifier(options.exportName);
	const path = `${trimTrailingSlash(options.actionsDir)}/${actionDirectory({
		action,
		actionsDir: options.actionsDir,
		sourcePath: options.sourcePath,
	})}/src/index.ts`;
	const header = generatedTypeScriptHeader(options.generatedAt);
	const importPath = relativeImportPath(path, options.sourcePath);
	const importStatement =
		options.exportName === "default"
			? `import scriptAction from "${importPath}";`
			: `import { ${options.exportName} } from "${importPath}";`;
	const bindingName = options.exportName === "default" ? "scriptAction" : options.exportName;
	return {
		sourcePath: options.sourcePath,
		path,
		header,
		content: [
			header,
			'import { runGitHubAction } from "@dedalus-labs/hollywood/action-runtime";',
			importStatement,
			"",
			`void runGitHubAction(${bindingName});`,
			"",
		].join("\n"),
	};
};

export const generateActionFiles = (
	files: readonly Readonly<{
		action: ScriptActionDescriptor<InputDefinitions, OutputDefinitions>;
		sourcePath: string;
		actionsDir: string;
		generatedAt?: Date;
	}>[],
): readonly GitHubActionFile[] => {
	const paths = new Set<string>();
	return files.map((file) => {
		const generated = generateActionFile(file.action, file);
		if (paths.has(generated.path)) {
			throw new Error(`duplicate generated action path: ${generated.path}`);
		}
		paths.add(generated.path);
		return generated;
	});
};

export const generateUsesStep = <const Inputs extends InputDefinitions>(
	_action: Pick<WorkflowActionDescriptor<Inputs>, "inputs">,
	options: GitHubUsesStepOptions<Inputs>,
): GitHubUsesStep => {
	const {
		uses: actionPath,
		with: withValues = {},
		...step
	} = options as GitHubStepBase &
		Readonly<{
			name: GitHubExpressionString;
			uses: string;
			with?: WorkflowInputValues<Inputs>;
		}>;
	const withInputs = new Map<string, string>();
	const providedInputs = withValues as { readonly [name: string]: string };
	for (const [name, value] of Object.entries(providedInputs)) {
		const githubName = uniqueGitHubName(withInputs, name, "input");
		withInputs.set(githubName, value);
	}
	return {
		...step,
		uses: actionPath,
		...(withInputs.size === 0 ? {} : { with: mapToObject(withInputs) }),
	};
};

export const uses = <const Inputs extends InputDefinitions>(
	action: WorkflowActionDescriptor<Inputs>,
	options: GitHubLocalActionStepOptions<Inputs>,
): GitHubUsesStep => {
	const { actionsDir = ".github/actions", name = action.name, ...step } = options;
	return generateUsesStep(action, {
		...step,
		name,
		uses: localActionUsesPath(action, actionsDir),
	} as GitHubUsesStepOptions<Inputs>);
};

export const generateWorkflowFile = (
	options: Readonly<{
		sourcePath: string;
		sourceRoot: string;
		workflowsDir: string;
		generatedAt?: Date;
		workflow: GitHubWorkflow;
	}>,
): GitHubWorkflowFile => ({
	sourcePath: options.sourcePath,
	path: `${trimTrailingSlash(options.workflowsDir)}/${flattenSourcePath(
		options.sourcePath,
		options.sourceRoot,
	)}.yml`,
	header: generatedHeader(options.generatedAt),
	workflow: options.workflow,
});

export const renderActionFile = (file: GitHubActionFile): string => {
	const content = renderYaml(file.header, file.metadata);
	assertValidActionMetadataContent({ name: file.path, content });
	return content;
};

export const renderWorkflowFile = (file: GitHubWorkflowFile): string => {
	const content = renderYaml(file.header, workflowForYaml(file.workflow));
	assertValidWorkflowContent({ name: file.path, content });
	return content;
};

const workflowForYaml = (workflow: GitHubWorkflow): GitHubWorkflow => ({
	...workflow,
	jobs: Object.fromEntries(
		Object.entries(workflow.jobs).map(([name, workflowJob]) => [name, jobForYaml(workflowJob)]),
	),
});

const jobForYaml = (workflowJob: GitHubWorkflowJob): GitHubWorkflowJob => {
	const matrix = workflowJob.strategy?.matrix;
	if (matrix === undefined || !isGitHubTypedMatrix(matrix)) {
		return workflowJob;
	}
	return {
		...workflowJob,
		strategy: {
			...workflowJob.strategy,
			matrix: githubTypedMatrixValues(matrix),
		},
	};
};

const inputMetadata = (input: InputDefinition): GitHubActionInputMetadata =>
	input.default === undefined
		? { description: input.description, required: true }
		: { description: input.description, required: false, default: input.default };

const uniqueGitHubName = <Value>(
	values: ReadonlyMap<string, Value>,
	sourceName: string,
	kind: "input" | "output",
): string => {
	const githubName = toGitHubName(sourceName);
	if (values.has(githubName)) {
		throw new Error(`duplicate GitHub ${kind} name: ${githubName}`);
	}
	return githubName;
};

const mapToObject = <Value>(
	values: ReadonlyMap<string, Value>,
): { readonly [name: string]: Value } => Object.fromEntries(values);

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const actionDirectory = (
	options: Readonly<{
		action: ScriptActionDescriptor<InputDefinitions, OutputDefinitions>;
		actionsDir: string;
		sourcePath: string;
	}>,
): string => {
	const explicitDirectory = options.action.localActionPath;
	const colocatedDirectory = colocatedActionDirectory(options.sourcePath, options.actionsDir);
	if (
		explicitDirectory !== undefined &&
		colocatedDirectory !== null &&
		explicitDirectory !== colocatedDirectory
	) {
		throw new Error(
			`localActionPath ${explicitDirectory} does not match colocated action directory ${colocatedDirectory}`,
		);
	}
	const directory = explicitDirectory ?? colocatedDirectory ?? options.action.name;
	assertRelativeGeneratedPath(directory, "action directory");
	return directory;
};

const localActionUsesPath = (
	action: WorkflowActionDescriptor<InputDefinitions>,
	actionsDir: string,
): string => {
	if (action.localActionPath === undefined) {
		throw new Error(`localActionPath is required to derive workflow uses path: ${action.name}`);
	}
	assertRelativeGeneratedPath(action.localActionPath, "action directory");
	const directory = trimSlashes(actionsDir);
	assertRelativeGeneratedPath(directory, "actions directory");
	return `./${directory}/${action.localActionPath}`;
};

const colocatedActionDirectory = (sourcePath: string, actionsDir: string): string | null => {
	const actionsRoot = trimSlashes(actionsDir);
	const source = trimSlashes(sourcePath);
	if (!source.startsWith(`${actionsRoot}/`)) {
		return null;
	}
	const relativeSource = source.slice(actionsRoot.length + 1);
	const sourceDirMarker = "/src/";
	const marker = relativeSource.indexOf(sourceDirMarker);
	if (marker <= 0) {
		return null;
	}
	return relativeSource.slice(0, marker);
};

const assertRelativeGeneratedPath = (value: string, kind: string): void => {
	const segments = value.split("/");
	if (
		value.length === 0 ||
		value.startsWith("/") ||
		value.includes("\\") ||
		segments.some((segment) => segment === "" || segment === "." || segment === "..")
	) {
		throw new Error(`invalid ${kind}: ${value}`);
	}
};

const flattenSourcePath = (sourcePath: string, sourceRoot: string): string => {
	const root = trimSlashes(sourceRoot);
	const source = trimSlashes(sourcePath);
	if (!source.startsWith(`${root}/`)) {
		throw new Error(`source path is outside source root: ${sourcePath}`);
	}
	const withoutRoot = source.slice(root.length + 1);
	const withoutExtension = withoutRoot.replace(/\.[^.]+$/, "");
	if (withoutExtension.length === 0) {
		throw new Error(`source path has no generated name: ${sourcePath}`);
	}
	return withoutExtension.split("/").join("-");
};

const trimSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, "");

const generatedHeader = (generatedAt?: Date): string =>
	generatedAt === undefined
		? "# @generated by Hollywood. Do not edit by hand."
		: `# @generated by Hollywood at ${generatedAt.toISOString()}. Do not edit by hand.`;

const generatedTypeScriptHeader = (generatedAt?: Date): string =>
	generatedAt === undefined
		? "// @generated by Hollywood. Do not edit by hand."
		: `// @generated by Hollywood at ${generatedAt.toISOString()}. Do not edit by hand.`;

const renderYaml = (header: string, value: unknown): string =>
	`${header}\n${stringify(value, { aliasDuplicateObjects: false, lineWidth: 0 })}`;

const relativeImportPath = (fromPath: string, toPath: string): string => {
	const path = relative(dirname(fromPath), toPath);
	if (path.startsWith(".")) {
		return path;
	}
	return `./${path}`;
};

const assertTypeScriptIdentifier = (value: string): void => {
	if (value === "default") {
		return;
	}
	if (/^[A-Za-z_$][\w$]*$/.test(value)) {
		return;
	}
	throw new Error(`invalid TypeScript export name: ${value}`);
};
