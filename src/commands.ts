import { readFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { Command } from "@commander-js/extra-typings";
import { build } from "esbuild";
import { glob } from "tinyglobby";
import { parse } from "yaml";

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

type PackageMetadata = Readonly<{ version?: unknown }>;

export type GenerateOptions = Readonly<{
	actionsDir: string;
	output: string;
	rootImportAlias?: string;
	sourceRoot?: string;
	sources?: readonly string[];
	workflowsDir: string;
}>;

export type RunOptions = Readonly<{
	exportName?: string;
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
	rootImportAlias?: string;
	sourceRoot?: string;
	workflowSecurity: boolean;
	workflowsDir: string;
}>;

export type BuildActionsOptions = Readonly<{
	actionsDir: string;
	output: string;
	target: string;
}>;

export type CliIo = Readonly<{
	writeOut: (message: string) => void;
}>;

export const createCli = (io: CliIo = processIo()): Command => {
	const program = new Command()
		.name("hollywood")
		.description("Lights, cameras, Actions!")
		.version(readHollywoodVersion());

	program
		.command("generate")
		.description("Generate GitHub Actions files")
		.argument("[sources...]", "Source files or glob patterns")
		.option("--actions-dir <dir>", "Generated actions directory", ".github/actions")
		.option("-o, --output <dir>", "Output directory", ".")
		.option("--root-import-alias <alias>", "Import alias for repository-root-relative action sources")
		.option("--source-root <dir>", "Workflow source root")
		.option("--workflows-dir <dir>", "Generated workflows directory", ".github/workflows")
		.action(async (sources, options) => {
			await generate({ ...options, ...(sources.length === 0 ? {} : { sources }) }, io);
		});

	program
		.command("check")
		.description("Run Hollywood repository checks")
		.option("--generated", "Check generated files are current", false)
		.option("--workflow-security", "Check workflow security policy", false)
		.option("-o, --output <dir>", "Repository root", ".")
		.option("--root-import-alias <alias>", "Import alias for repository-root-relative action sources")
		.option("--source-root <dir>", "Workflow source root")
		.option("--workflows-dir <dir>", "Generated workflows directory", ".github/workflows")
		.action(async (options) => {
			const selected = options.generated || options.workflowSecurity;
			await check(
				{
					generated: selected ? options.generated : true,
					output: options.output,
					...(options.rootImportAlias === undefined ? {} : { rootImportAlias: options.rootImportAlias }),
					...(options.sourceRoot === undefined ? {} : { sourceRoot: options.sourceRoot }),
					workflowSecurity: selected ? options.workflowSecurity : true,
					workflowsDir: options.workflowsDir,
				},
				io,
			);
		});

	program
		.command("build")
		.description("Bundle generated local GitHub actions")
		.option("--actions-dir <dir>", "Generated actions directory", ".github/actions")
		.option("-o, --output <dir>", "Repository root", ".")
		.option("--target <target>", "JavaScript action Node target", "node24")
		.action(async (options) => {
			await buildActions(options, io);
		});

	program
		.command("run")
		.description("Run an exported Hollywood action locally")
		.argument("<source>", "Source file exporting a Hollywood action")
		.option("--export <name>", "Action export name")
		.option("--with <name=value>", "Action input", collect, [] as string[])
		.option("--lima <name>", "Run commands inside the named Lima VM")
		.option("--require-containerd", "Require containerd and nerdctl in the Lima VM", false)
		.option("--require-kvm", "Require readable and writable /dev/kvm in the Lima VM", false)
		.option("--start-vm", "Start the Lima VM before running", false)
		.action(async (source, options) => {
			const runOptions = {
				inputs: options.with,
				requireContainerd: options.requireContainerd,
				requireKvm: options.requireKvm,
				source,
				startVm: options.startVm,
				...(options.export === undefined ? {} : { exportName: options.export }),
				...(options.lima === undefined ? {} : { lima: options.lima }),
			};
			await run(runOptions, io);
		});

	return program;
};

export const generate = async (options: GenerateOptions, io: CliIo): Promise<void> => {
	const resolved = await resolveGenerateOptions(options);
	const sourceFiles = await resolveSourceFiles(resolved.sources);
	const files = await discoverGeneratedFiles(sourceFiles, resolved);
	const results = await writeGeneratedFiles(files, { outputDir: resolved.output });
	for (const result of results) {
		io.writeOut(`${result.status}\t${result.path}\n`);
	}
	if (results.length === 0) {
		io.writeOut("unchanged\t(no generated files)\n");
	}
};

export const run = async (options: RunOptions, io: CliIo): Promise<void> => {
	const module = await loadHollywoodModule(options.source);
	const scriptAction = selectScriptAction(module, options);

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

const selectScriptAction = (
	module: HollywoodModule,
	options: RunOptions,
): ScriptAction<InputDefinitions, OutputDefinitions> => {
	if (options.exportName !== undefined) {
		const scriptAction = module[options.exportName];
		if (!isScriptAction(scriptAction)) {
			throw new Error(`Hollywood action export not found: ${options.exportName}`);
		}
		return scriptAction;
	}

	const defaultAction = module["default"];
	if (isScriptAction(defaultAction)) {
		return defaultAction;
	}

	const actions = Object.entries(module).filter((entry): entry is [
		string,
		ScriptAction<InputDefinitions, OutputDefinitions>,
	] => isScriptAction(entry[1]));
	if (actions.length === 1) {
		const action = actions[0];
		if (action === undefined) {
			throw new Error("Hollywood action export not found");
		}
		return action[1];
	}
	if (actions.length === 0) {
		throw new Error("Hollywood action export not found");
	}
	throw new Error(
		`multiple Hollywood actions exported: ${actions.map(([name]) => name).sort().join(", ")}; pass --export`,
	);
};

export const check = async (options: CheckOptions, io: CliIo): Promise<void> => {
	const resolved = await resolveCheckOptions(options);
	if (resolved.workflowSecurity) {
		await checkWorkflowSecurity(resolved, io);
	}
	if (resolved.generated) {
		await checkGeneratedFiles(resolved, io);
	}
};

export const buildActions = async (
	options: BuildActionsOptions,
	io: CliIo,
): Promise<void> => {
	const actionsDir = resolve(options.output, options.actionsDir);
	const entries = await actionEntrypoints(actionsDir);
	for (const entry of entries) {
		const outfile = join(dirname(dirname(entry)), "dist", "index.js");
		await buildAction({
			entry,
			outfile,
			target: options.target,
		});
		io.writeOut(`built\t${relative(options.output, outfile).split(sep).join("/")}\n`);
	}
	if (entries.length === 0) {
		io.writeOut("unchanged\t(no local actions)\n");
	}
};

type ResolvedGenerateOptions = Readonly<{
	actionsDir: string;
	output: string;
	rootImportAlias?: string;
	sourceRoot: string;
	sources: readonly string[];
	workflowsDir: string;
}>;

type ResolvedCheckOptions = Readonly<{
	generated: boolean;
	output: string;
	rootImportAlias?: string;
	sourceRoot: string;
	workflowSecurity: boolean;
	workflowsDir: string;
}>;

const checkGeneratedFiles = async (options: ResolvedCheckOptions, io: CliIo): Promise<void> => {
	const actionsDir = ".github/actions";
	const sourceRootPath = resolve(options.output, options.sourceRoot);
	await generate(
		{
			actionsDir,
			output: options.output,
			...(options.rootImportAlias === undefined ? {} : { rootImportAlias: options.rootImportAlias }),
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

const checkWorkflowSecurity = async (options: ResolvedCheckOptions, io: CliIo): Promise<void> => {
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

const actionEntrypoints = async (actionsDir: string): Promise<readonly string[]> => {
	if (!(await pathExists(actionsDir))) {
		return [];
	}
	const entries: string[] = [];
	for await (const file of walk(actionsDir)) {
		if (file.endsWith(join("src", "index.ts"))) {
			entries.push(file);
		}
	}
	return entries.sort();
};

const buildAction = async (
	options: Readonly<{
		entry: string;
		outfile: string;
		target: string;
	}>,
): Promise<void> => {
	await build({
		banner: {
			js: [
				"/* @generated by hollywood build. Do not edit by hand. */",
				'import { createRequire } from "node:module";',
				"const require = createRequire(import.meta.url);",
			].join("\n"),
		},
		bundle: true,
		define: { "import.meta.vitest": "undefined" },
		entryPoints: [options.entry],
		format: "esm",
		outfile: options.outfile,
		platform: "node",
		target: options.target,
	});
};

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

const globMatches = (source: string): Promise<readonly string[]> =>
	glob(source, { absolute: isAbsolute(source) });

const resolveGenerateOptions = async (options: GenerateOptions): Promise<ResolvedGenerateOptions> => {
	const output = resolve(options.output);
	const sourceRoot = await resolveSourceRoot({
		output,
		...(options.sourceRoot === undefined ? {} : { sourceRoot: options.sourceRoot }),
		sources: options.sources ?? [],
	});
	const rootImportAlias =
		options.rootImportAlias === undefined
			? await detectRootImportAlias(output)
			: normalizeRootImportAlias(options.rootImportAlias);
	return {
		actionsDir: options.actionsDir,
		output,
		...(rootImportAlias === undefined ? {} : { rootImportAlias }),
		sourceRoot,
		sources:
			options.sources === undefined || options.sources.length === 0
				? [`${resolve(output, sourceRoot)}/**/*.ts`]
				: options.sources,
		workflowsDir: options.workflowsDir,
	};
};

const resolveCheckOptions = async (options: CheckOptions): Promise<ResolvedCheckOptions> => {
	const output = resolve(options.output);
	const sourceRoot = await resolveSourceRoot({
		output,
		...(options.sourceRoot === undefined ? {} : { sourceRoot: options.sourceRoot }),
		sources: [],
	});
	const rootImportAlias =
		options.rootImportAlias === undefined
			? await detectRootImportAlias(output)
			: normalizeRootImportAlias(options.rootImportAlias);
	return {
		generated: options.generated,
		output,
		...(rootImportAlias === undefined ? {} : { rootImportAlias }),
		sourceRoot,
		workflowSecurity: options.workflowSecurity,
		workflowsDir: options.workflowsDir,
	};
};

const resolveSourceRoot = async (
	options: Readonly<{
		output: string;
		sourceRoot?: string;
		sources: readonly string[];
	}>,
): Promise<string> => {
	if (options.sourceRoot !== undefined) {
		return options.sourceRoot;
	}
	const sourceRoot = inferSourceRootFromSources(options.output, options.sources);
	if (sourceRoot !== undefined) {
		return sourceRoot;
	}
	if (await isDirectory(resolve(options.output, "gha"))) {
		return "gha";
	}
	if (await isDirectory(resolve(options.output, "ci"))) {
		return "ci";
	}
	return "gha";
};

const inferSourceRootFromSources = (output: string, sources: readonly string[]): string | undefined => {
	const roots = new Set<string>();
	for (const source of sources) {
		const root = inferSourceRootFromSource(output, source);
		if (root !== undefined) {
			roots.add(root);
		}
	}
	if (roots.size > 1) {
		throw new Error(`multiple source roots inferred: ${[...roots].sort().join(", ")}`);
	}
	return roots.values().next().value as string | undefined;
};

const inferSourceRootFromSource = (output: string, source: string): string | undefined => {
	const relativePattern = (isAbsolute(source) ? relative(output, source) : source)
		.split(sep)
		.join("/");
	if (relativePattern.startsWith("..")) {
		return undefined;
	}
	const segment = relativePattern.replace(/^\.\//, "").split("/")[0];
	if (segment === undefined || segment === "" || hasGlobSyntax(segment)) {
		return undefined;
	}
	return segment;
};

const hasGlobSyntax = (value: string): boolean => /[*?[\]{}]/.test(value);

type Tsconfig = Readonly<{
	compilerOptions?: Readonly<{
		paths?: Readonly<Record<string, unknown>>;
	}>;
}>;

const detectRootImportAlias = async (output: string): Promise<string | undefined> => {
	const tsconfigPath = resolve(output, "tsconfig.json");
	if (!(await pathExists(tsconfigPath))) {
		return undefined;
	}
	const parsed = parse(await readFile(tsconfigPath, "utf8")) as Tsconfig;
	const paths = parsed.compilerOptions?.paths;
	if (paths === undefined) {
		return undefined;
	}
	for (const [pattern, targets] of Object.entries(paths)) {
		const alias = rootImportAliasForPath(pattern, targets);
		if (alias !== undefined) {
			return alias;
		}
	}
	return undefined;
};

const rootImportAliasForPath = (pattern: string, targets: unknown): string | undefined => {
	if (!pattern.endsWith("/*") || !Array.isArray(targets)) {
		return undefined;
	}
	if (!targets.some((target) => target === "*" || target === "./*")) {
		return undefined;
	}
	return normalizeRootImportAlias(pattern);
};

const normalizeRootImportAlias = (alias: string): string => {
	const normalized = alias.replace(/\/\*$/, "").replace(/\/+$/, "");
	if (normalized === "" || normalized.includes("*")) {
		throw new Error(`invalid root import alias: ${alias}`);
	}
	return normalized;
};

const discoverGeneratedFiles = async (
	sourceFiles: readonly string[],
	options: ResolvedGenerateOptions,
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
						...(options.rootImportAlias === undefined
							? {}
							: { rootImportAlias: options.rootImportAlias }),
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

const readHollywoodVersion = (): string => {
	const metadata = JSON.parse(
		readFileSync(new URL("../package.json", import.meta.url), "utf8"),
	) as PackageMetadata;
	if (typeof metadata.version !== "string") {
		throw new Error("package.json version must be a string");
	}
	return metadata.version;
};
