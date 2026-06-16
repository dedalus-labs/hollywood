import { glob, mkdtemp, readdir, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { Command } from "@commander-js/extra-typings";
import { build } from "esbuild";

import {
	generateActionEntrypointFile,
	generateActionFile,
	generateWorkflowFile,
	type GitHubWorkflow,
} from "./generate";
import { writeGeneratedFiles, type GeneratedFile } from "./files";
import { currentRunner, nodeExec, nodeFs, nodeLog } from "./local";
import { limaExec, limaRunner, probeLimaEnvironment } from "./lima";
import {
	runAction,
	type InputDefinitions,
	type OutputDefinitions,
	type RunnerContext,
	type ScriptAction,
	type ScriptExec,
} from "./script";

type HollywoodModule = Readonly<{ readonly [name: string]: unknown }>;

const hollywoodVersion = "0.0.1-alpha.0"; // x-release-please-version

export type GenerateOptions = Readonly<{
	actionsDir: string;
	output: string;
	sourceRoot: string;
	sources: readonly string[];
	workflowsDir: string;
}>;

export type RunOptions = Readonly<{
	exportName: string;
	inputs: readonly string[];
	lima?: string;
	requireContainerd: boolean;
	requireKvm: boolean;
	source: string;
	startVm: boolean;
}>;

export type CheckOptions = Readonly<{
	generated: boolean;
	output: string;
	sourceRoot: string;
	workflowSecurity: boolean;
	workflowsDir: string;
}>;

export type CliIo = Readonly<{
	writeOut: (message: string) => void;
}>;

export const createHollywoodCli = (io: CliIo = processIo()): Command => {
	const program = new Command()
		.name("hollywood")
		.description("Lights, cameras, Actions!")
		.version(hollywoodVersion);

	program
		.command("generate")
		.description("Generate GitHub Actions files")
		.argument("<sources...>", "Source files or glob patterns")
		.option("--actions-dir <dir>", "Generated actions directory", ".github/actions")
		.option("-o, --output <dir>", "Output directory", ".")
		.option("--source-root <dir>", "Workflow source root", "ci")
		.option("--workflows-dir <dir>", "Generated workflows directory", ".github/workflows")
		.action(async (sources, options) => {
			await generate({ sources, ...options }, io);
		});

	program
		.command("check")
		.description("Run Hollywood repository checks")
		.option("--generated", "Check generated files are current", false)
		.option("--workflow-security", "Check workflow security policy", false)
		.option("-o, --output <dir>", "Repository root", ".")
		.option("--source-root <dir>", "Workflow source root", "ci")
		.option("--workflows-dir <dir>", "Generated workflows directory", ".github/workflows")
		.action(async (options) => {
			const selected = options.generated || options.workflowSecurity;
			await check(
				{
					generated: selected ? options.generated : true,
					output: options.output,
					sourceRoot: options.sourceRoot,
					workflowSecurity: selected ? options.workflowSecurity : true,
					workflowsDir: options.workflowsDir,
				},
				io,
			);
		});

	program
		.command("run")
		.description("Run an exported Hollywood action locally")
		.argument("<source>", "Source file exporting a Hollywood action")
		.option("--export <name>", "Action export name", "default")
		.option("--with <name=value>", "Action input", collect, [] as string[])
		.option("--lima <name>", "Run commands inside the named Lima VM")
		.option("--require-containerd", "Require containerd and nerdctl in the Lima VM", false)
		.option("--require-kvm", "Require readable and writable /dev/kvm in the Lima VM", false)
		.option("--start-vm", "Start the Lima VM before running", false)
		.action(async (source, options) => {
			await run(
				{
					exportName: options.export,
					inputs: options.with,
					requireContainerd: options.requireContainerd,
					requireKvm: options.requireKvm,
					source,
					startVm: options.startVm,
					...(options.lima === undefined ? {} : { lima: options.lima }),
				},
				io,
			);
		});

	return program;
};

export const generate = async (options: GenerateOptions, io: CliIo): Promise<void> => {
	const sourceFiles = await resolveSourceFiles(options.sources);
	const files = await discoverGeneratedFiles(sourceFiles, options);
	const results = await writeGeneratedFiles(files, { outputDir: options.output });
	for (const result of results) {
		io.writeOut(`${result.status}\t${result.path}\n`);
	}
	if (results.length === 0) {
		io.writeOut("unchanged\t(no generated files)\n");
	}
};

export const run = async (options: RunOptions, io: CliIo): Promise<void> => {
	const module = await loadHollywoodModule(options.source);
	const scriptAction = module[options.exportName];
	if (!isScriptAction(scriptAction)) {
		throw new Error(`Hollywood action export not found: ${options.exportName}`);
	}

	const runtime = await runRuntime(options);
	const outputs = await runAction(scriptAction, {
		with: parseInputPairs(options.inputs),
		exec: runtime.exec,
		fs: nodeFs,
		log: nodeLog,
		runner: runtime.runner,
	});
	const entries = Object.entries(outputs);
	if (entries.length === 0) {
		io.writeOut("ok\t(no outputs)\n");
		return;
	}
	for (const [name, value] of entries) {
		io.writeOut(`output\t${name}=${value}\n`);
	}
};

export const check = async (options: CheckOptions, io: CliIo): Promise<void> => {
	if (options.workflowSecurity) {
		await checkWorkflowSecurity(options, io);
	}
	if (options.generated) {
		await checkGeneratedFiles(options, io);
	}
};

const checkGeneratedFiles = async (options: CheckOptions, io: CliIo): Promise<void> => {
	const actionsDir = ".github/actions";
	const sourceRootPath = resolve(options.output, options.sourceRoot);
	await generate(
		{
			actionsDir,
			output: options.output,
			sourceRoot: options.sourceRoot,
			sources: [`${sourceRootPath}/**/*.ts`],
			workflowsDir: options.workflowsDir,
		},
		io,
	);
	await assertActionsYamlGenerated(options.output, options.workflowsDir, actionsDir);
	const diffPaths = ["dist", options.workflowsDir];
	if (await pathExists(resolve(options.output, actionsDir))) {
		diffPaths.push(actionsDir);
	}
	await nodeExec("git", ["diff", "--exit-code", "--", ...diffPaths], {
		cwd: options.output,
	});
	io.writeOut("ok\tgenerated files\n");
};

const generatedHeaderPrefix = "# @generated by Hollywood";

const assertActionsYamlGenerated = async (
	output: string,
	workflowsDir: string,
	actionsDir: string,
): Promise<void> => {
	const outputDir = resolve(output);
	const handwritten: string[] = [];
	for await (const file of scanActionsYamlFiles(
		resolve(outputDir, workflowsDir),
		resolve(outputDir, actionsDir),
	)) {
		const content = await readFile(file, "utf8");
		if (!content.startsWith(generatedHeaderPrefix)) {
			handwritten.push(relative(outputDir, file).split(sep).join("/"));
		}
	}
	if (handwritten.length > 0) {
		throw new Error(`handwritten GitHub Actions YAML found\n${handwritten.join("\n")}`);
	}
};

async function* scanActionsYamlFiles(
	workflowsDir: string,
	actionsDir: string,
): AsyncGenerator<string> {
	if (await pathExists(workflowsDir)) {
		for await (const file of walk(workflowsDir)) {
			if (isWorkflowYaml(file)) {
				yield file;
			}
		}
	}
	if (await pathExists(actionsDir)) {
		for await (const file of walk(actionsDir)) {
			if (isActionMetadataYaml(file)) {
				yield file;
			}
		}
	}
}

const isWorkflowYaml = (file: string): boolean => {
	const extension = extname(file);
	return extension === ".yaml" || extension === ".yml";
};

const isActionMetadataYaml = (file: string): boolean => {
	const name = basename(file);
	return name === "action.yaml" || name === "action.yml";
};

type WorkflowSecurityCheck = Readonly<{
	name: string;
	pattern: RegExp;
}>;

const workflowSecurityChecks: readonly WorkflowSecurityCheck[] = [
	{
		name: "privileged pull request triggers",
		pattern: /\b(?:pull_request_target|workflow_run)\b/g,
	},
	{
		name: "workflow cache sharing",
		pattern: /\bactions\/cache@|^\s*cache:\s*["']?npm["']?/gm,
	},
	{
		name: "mutable action references",
		pattern: /uses:\s+[^#\n]*@(?![0-9a-f]{40}(?:\s|$))[^#\n\s]+/g,
	},
];

const workflowSecurityExtensions = new Set([".ts", ".yaml", ".yml"]);

const checkWorkflowSecurity = async (options: CheckOptions, io: CliIo): Promise<void> => {
	const outputDir = resolve(options.output);
	const findings: string[] = [];
	for await (const file of scanWorkflowSecurityFiles([
		resolve(outputDir, options.workflowsDir),
		resolve(outputDir, options.sourceRoot),
	])) {
		const content = await readFile(file, "utf8");
		for (const check of workflowSecurityChecks) {
			for (const match of content.matchAll(check.pattern)) {
				const index = match.index;
				if (index === undefined) {
					continue;
				}
				const line = content.slice(0, index).split("\n").length;
				const path = relative(outputDir, file).split(sep).join("/");
				findings.push(`${path}:${line}: ${check.name}: ${match[0].trim()}`);
			}
		}
	}
	if (findings.length > 0) {
		throw new Error(`workflow security check failed\n${findings.join("\n")}`);
	}
	io.writeOut("ok\tworkflow security\n");
};

async function* scanWorkflowSecurityFiles(paths: readonly string[]): AsyncGenerator<string> {
	for (const path of paths) {
		if (!(await pathExists(path))) {
			continue;
		}
		for await (const file of walk(path)) {
			if (workflowSecurityExtensions.has(extname(file))) {
				yield file;
			}
		}
	}
}

async function* walk(path: string): AsyncGenerator<string> {
	for (const entry of await readdir(path, { withFileTypes: true })) {
		const child = resolve(path, entry.name);
		if (entry.isDirectory()) {
			yield* walk(child);
			continue;
		}
		if (entry.isFile()) {
			yield child;
		}
	}
}

const pathExists = async (path: string): Promise<boolean> => {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
};

const resolveSourceFiles = async (sources: readonly string[]): Promise<readonly string[]> => {
	const files = new Set<string>();
	for (const source of sources) {
		const matches = await globMatches(source);
		if (matches.length === 0) {
			throw new Error(`source pattern matched no files: ${source}`);
		}
		for (const match of matches) {
			if (!isTestSourceFile(match)) {
				files.add(match);
			}
		}
	}
	return [...files].sort();
};

const isTestSourceFile = (sourceFile: string): boolean =>
	sourceFile.endsWith(".test.ts") || sourceFile.endsWith(".spec.ts");

const globMatches = async (source: string): Promise<readonly string[]> => {
	const matches: string[] = [];
	for await (const match of glob(source)) {
		matches.push(match);
	}
	return matches;
};

const discoverGeneratedFiles = async (
	sourceFiles: readonly string[],
	options: GenerateOptions,
): Promise<readonly GeneratedFile[]> => {
	const files: GeneratedFile[] = [];
	for (const sourceFile of sourceFiles) {
		const module = await loadHollywoodModule(sourceFile);
		const sourcePath = relativeSourcePath(options.output, sourceFile);
		for (const [exportName, value] of Object.entries(module)) {
			if (isScriptAction(value)) {
				files.push(
					generateActionFile(value, {
						sourcePath,
						actionsDir: options.actionsDir,
					}),
					generateActionEntrypointFile(value, {
						sourcePath,
						actionsDir: options.actionsDir,
						exportName,
					}),
				);
			}
			if (isGitHubWorkflow(value)) {
				files.push(
					generateWorkflowFile({
						sourcePath,
						sourceRoot: options.sourceRoot,
						workflowsDir: options.workflowsDir,
						workflow: value,
					}),
				);
			}
		}
	}
	if (files.length === 0) {
		throw new Error(`no Hollywood actions or workflows exported by: ${sourceFiles.join(", ")}`);
	}
	assertUniqueGeneratedPaths(files);
	return files;
};

const loadHollywoodModule = async (sourceFile: string): Promise<HollywoodModule> => {
	const dir = await mkdtemp(`${tmpdir()}/hollywood-source-`);
	const outfile = `${dir}/source.mjs`;
	try {
		const nodeModules = await findNodeModules(sourceFile);
		if (nodeModules !== null) {
			await symlink(nodeModules, `${dir}/node_modules`, "dir");
		}
		await build({
			bundle: true,
			define: { "import.meta.vitest": "undefined" },
			entryPoints: [resolve(sourceFile)],
			format: "esm",
			outfile,
			packages: "external",
			platform: "node",
			sourcemap: "inline",
		});
		return (await import(pathToFileURL(outfile).href)) as HollywoodModule;
	} finally {
		await rm(dir, { force: true, recursive: true });
	}
};

const findNodeModules = async (sourceFile: string): Promise<string | null> => {
	let dir = dirname(resolve(sourceFile));
	while (true) {
		const candidate = resolve(dir, "node_modules");
		if (await isDirectory(candidate)) {
			return candidate;
		}
		const parent = dirname(dir);
		if (parent === dir) {
			return null;
		}
		dir = parent;
	}
};

const isDirectory = async (path: string): Promise<boolean> => {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
};

const runRuntime = async (
	options: RunOptions,
): Promise<Readonly<{ exec: ScriptExec; runner: RunnerContext }>> => {
	if (options.lima === undefined) {
		return { exec: nodeExec, runner: currentRunner() };
	}
	const probe = await probeLimaEnvironment({
		name: options.lima,
		exec: nodeExec,
		requireContainerd: options.requireContainerd,
		requireKvm: options.requireKvm,
		start: options.startVm,
	});
	if (probe.status !== "ready") {
		throw new Error(probe.reason);
	}
	const lima = { name: options.lima, exec: nodeExec, start: options.startVm };
	return { exec: limaExec(lima), runner: await limaRunner(lima) };
};

const parseInputPairs = (inputs: readonly string[]): { readonly [name: string]: string } => {
	const parsed = new Map<string, string>();
	for (const input of inputs) {
		const separator = input.indexOf("=");
		if (separator <= 0) {
			throw new Error(`invalid input, expected name=value: ${input}`);
		}
		const name = input.slice(0, separator);
		if (parsed.has(name)) {
			throw new Error(`duplicate input: ${name}`);
		}
		parsed.set(name, input.slice(separator + 1));
	}
	return Object.fromEntries(parsed);
};

const collect = (value: string, previous: string[]): string[] => [...previous, value];

const relativeSourcePath = (outputDir: string, sourceFile: string): string => {
	const path = relative(resolve(outputDir), resolve(sourceFile));
	if (path.startsWith("..") || isAbsolute(path)) {
		throw new Error(`source file is outside output directory: ${sourceFile}`);
	}
	return path.split(sep).join("/");
};

const isScriptAction = (
	value: unknown,
): value is ScriptAction<InputDefinitions, OutputDefinitions> =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as { readonly name?: unknown }).name === "string" &&
	typeof (value as { readonly description?: unknown }).description === "string" &&
	typeof (value as { readonly inputs?: unknown }).inputs === "object" &&
	(value as { readonly inputs?: unknown }).inputs !== null &&
	typeof (value as { readonly outputs?: unknown }).outputs === "object" &&
	(value as { readonly outputs?: unknown }).outputs !== null &&
	typeof (value as { readonly run?: unknown }).run === "function";

const isGitHubWorkflow = (value: unknown): value is GitHubWorkflow =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as { readonly name?: unknown }).name === "string" &&
	typeof (value as { readonly on?: unknown }).on === "object" &&
	(value as { readonly on?: unknown }).on !== null &&
	typeof (value as { readonly jobs?: unknown }).jobs === "object" &&
	(value as { readonly jobs?: unknown }).jobs !== null;

const assertUniqueGeneratedPaths = (files: readonly GeneratedFile[]): void => {
	const paths = new Set<string>();
	for (const file of files) {
		if (paths.has(file.path)) {
			throw new Error(`duplicate generated file path: ${file.path}`);
		}
		paths.add(file.path);
	}
};

const processIo = (): CliIo => ({
	writeOut: (message) => {
		process.stdout.write(message);
	},
});
