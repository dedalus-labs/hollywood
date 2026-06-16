import type { GitHubStepWorkflowJob } from "./generate";
import { eq, expr, needsOutput, stepOutput, type GitHubExpression } from "./expressions";

export type GitHubPathPattern = string;

export type GitHubPathPatternList = readonly [GitHubPathPattern, ...GitHubPathPattern[]];

export type GitHubPathDependency<Name extends string = string> = Readonly<{
	changed: GitHubExpression<boolean>;
	name: Name;
	paths: GitHubPathPatternList;
}>;

export type GitHubPathDependencyDefinitions = Readonly<{
	[name: string]: GitHubPathPatternList;
}>;

export type GitHubPathDependencyJobOptions = Readonly<{
	checkoutUses?: string;
	name?: string;
	runsOn?: string;
}>;

export type GitHubPathDependencies<
	JobId extends string,
	Definitions extends GitHubPathDependencyDefinitions,
> = GitHubPathDependencyRefs<Definitions> &
	Readonly<{
		job: (options?: GitHubPathDependencyJobOptions) => GitHubStepWorkflowJob;
		jobId: JobId;
		workflowPaths: readonly GitHubPathPattern[];
	}>;

type GitHubPathDependencyRefs<Definitions extends GitHubPathDependencyDefinitions> = {
	readonly [Name in keyof Definitions & string]: GitHubPathDependencyRef<Name>;
};

type GitHubPathDependencyRef<Name extends string> = Readonly<{
	changed: GitHubExpression<boolean>;
	name: Name;
	paths: GitHubPathPatternList;
}>;

const reservedPathDependencyNames = new Set(["job", "jobId", "workflowPaths"]);
const defaultCheckoutAction = "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10";

export const pathDependencies = <
	const JobId extends string,
	const Definitions extends GitHubPathDependencyDefinitions,
>(
	jobId: JobId,
	definitions: Definitions,
): GitHubPathDependencies<JobId, Definitions> => {
	assertValidPathDependencyJobId(jobId);
	const normalizedDefinitions = normalizeDefinitions(definitions);
	const refs = new Map<string, GitHubPathDependency>();
	for (const [name, paths] of Object.entries(normalizedDefinitions)) {
		refs.set(name, {
			changed: eq(needsOutput(jobId, name), "true") as GitHubExpression<boolean>,
			name,
			paths,
		});
	}
	return Object.assign(Object.fromEntries(refs), {
		job: (options?: GitHubPathDependencyJobOptions) =>
			pathDependencyJob(jobId, normalizedDefinitions, options),
		jobId,
		workflowPaths: positiveWorkflowPaths(normalizedDefinitions),
	}) as GitHubPathDependencies<JobId, Definitions>;
};

export const matchPathDependency = (
	path: string,
	dependency: Pick<GitHubPathDependency, "paths">,
): boolean => matchesPatternList(normalizePath(path), dependency.paths);

const pathDependencyJob = (
	jobId: string,
	definitions: GitHubPathDependencyDefinitions,
	options: GitHubPathDependencyJobOptions = {},
): GitHubStepWorkflowJob => ({
	name: options.name ?? "Detect changed paths",
	"runs-on": options.runsOn ?? "ubuntu-24.04",
	outputs: Object.fromEntries(
		Object.keys(definitions).map((name) => [name, stepOutput("detect", name)]),
	),
	steps: [
		{
			uses: options.checkoutUses ?? defaultCheckoutAction,
			with: { "fetch-depth": "0" },
		},
		{
			id: "detect",
			name: "Detect changed paths",
			shell: "bash",
			env: {
				BASE_SHA: expr(
					"github.event_name == 'pull_request' && github.event.pull_request.base.sha || github.event.before",
				),
				HEAD_SHA: expr(
					"github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha",
				),
			},
			run: detectorScript(jobId, definitions),
		},
	],
});

const detectorScript = (jobId: string, definitions: GitHubPathDependencyDefinitions): string =>
	[
		"set -euo pipefail",
		"node <<'HOLLYWOOD_PATH_DEPENDENCIES'",
		"const { execFileSync } = require('node:child_process');",
		"const { appendFileSync } = require('node:fs');",
		`const jobId = ${JSON.stringify(jobId)};`,
		`const pathDependencies = ${JSON.stringify(definitions, null, "\t")};`,
		"",
		"const requiredEnv = (name) => {",
		"  const value = process.env[name];",
		"  if (value === undefined || value.length === 0) {",
		"    throw new Error(`${name} is required for ${jobId} path detection`);",
		"  }",
		"  return value;",
		"};",
		"const base = requiredEnv('BASE_SHA');",
		"const head = requiredEnv('HEAD_SHA');",
		"const output = requiredEnv('GITHUB_OUTPUT');",
		"const changedFiles = /^0+$/.test(base)",
		"  ? null",
		"  : execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' })",
		"      .split(/\\r?\\n/)",
		"      .filter(Boolean);",
		"if (changedFiles === null) {",
		"  console.log('::notice::base SHA is zero; marking all path dependencies changed');",
		"}",
		"",
		"const normalizePath = (path) => path.replace(/^\\/+/, '');",
		"const regexSpecial = /[.+^${}()|[\\]\\\\]/g;",
		"const globToRegExp = (pattern) => {",
		"  let source = '';",
		"  for (let index = 0; index < pattern.length; index += 1) {",
		"    const char = pattern[index];",
		"    const next = pattern[index + 1];",
		"    if (char === '*' && next === '*') {",
		"      if (pattern[index + 2] === '/') {",
		"        source += '(?:.*/)?';",
		"        index += 2;",
		"      } else {",
		"        source += '.*';",
		"        index += 1;",
		"      }",
		"    } else if (char === '*') {",
		"      source += '[^/]*';",
		"    } else if (char === '?') {",
		"      source += '[^/]';",
		"    } else {",
		"      source += char.replace(regexSpecial, '\\\\$&');",
		"    }",
		"  }",
		"  return new RegExp(`^${source}$`);",
		"};",
		"const matchesPattern = (path, pattern) => globToRegExp(normalizePath(pattern)).test(path);",
		"const matchesPatternList = (path, patterns) => {",
		"  let matched = false;",
		"  for (const pattern of patterns) {",
		"    const negated = pattern.startsWith('!');",
		"    const rawPattern = negated ? pattern.slice(1) : pattern;",
		"    if (matchesPattern(path, rawPattern)) {",
		"      matched = !negated;",
		"    }",
		"  }",
		"  return matched;",
		"};",
		"for (const [name, patterns] of Object.entries(pathDependencies)) {",
		"  const changed = changedFiles === null",
		"    ? true",
		"    : changedFiles.some((file) => matchesPatternList(normalizePath(file), patterns));",
		"  appendFileSync(output, `${name}=${changed ? 'true' : 'false'}\\n`);",
		"}",
		"HOLLYWOOD_PATH_DEPENDENCIES",
	].join("\n");

const normalizeDefinitions = <const Definitions extends GitHubPathDependencyDefinitions>(
	definitions: Definitions,
): Definitions => {
	for (const [name, paths] of Object.entries(definitions)) {
		assertValidPathDependencyName(name);
		if (paths.length === 0) {
			throw new Error(`path dependency ${name} must include at least one path`);
		}
		for (const path of paths) {
			assertValidPathPattern(name, path);
		}
		if (!paths.some((path) => !path.startsWith("!"))) {
			throw new Error(`path dependency ${name} must include at least one positive path`);
		}
	}
	return definitions;
};

const positiveWorkflowPaths = (
	definitions: GitHubPathDependencyDefinitions,
): readonly GitHubPathPattern[] => {
	const paths = new Set<GitHubPathPattern>();
	for (const dependencyPaths of Object.values(definitions)) {
		for (const path of dependencyPaths) {
			if (!path.startsWith("!")) {
				paths.add(path);
			}
		}
	}
	return [...paths];
};

const matchesPatternList = (path: string, patterns: readonly GitHubPathPattern[]): boolean => {
	let matched = false;
	for (const pattern of patterns) {
		const negated = pattern.startsWith("!");
		const rawPattern = negated ? pattern.slice(1) : pattern;
		if (matchesPattern(path, rawPattern)) {
			matched = !negated;
		}
	}
	return matched;
};

const matchesPattern = (path: string, pattern: GitHubPathPattern): boolean =>
	globToRegExp(normalizePath(pattern)).test(path);

const globToRegExp = (pattern: string): RegExp => {
	let source = "";
	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index];
		const next = pattern[index + 1];
		if (char === "*" && next === "*") {
			if (pattern[index + 2] === "/") {
				source += "(?:.*/)?";
				index += 2;
			} else {
				source += ".*";
				index += 1;
			}
		} else if (char === "*") {
			source += "[^/]*";
		} else if (char === "?") {
			source += "[^/]";
		} else if (char !== undefined) {
			source += escapeRegExp(char);
		}
	}
	return new RegExp(`^${source}$`);
};

const normalizePath = (path: string): string => path.replace(/^\/+/, "");

const escapeRegExp = (value: string): string => value.replace(/[.+^${}()|[\]\\]/g, "\\$&");

const assertValidPathDependencyJobId = (jobId: string): void => {
	if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(jobId)) {
		throw new Error(`invalid path dependency job id: ${jobId}`);
	}
};

const assertValidPathDependencyName = (name: string): void => {
	if (reservedPathDependencyNames.has(name)) {
		throw new Error(`reserved path dependency name: ${name}`);
	}
	if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) {
		throw new Error(`invalid path dependency name: ${name}`);
	}
};

const assertValidPathPattern = (name: string, path: string): void => {
	if (path.length === 0 || path.trim() !== path || path === "!") {
		throw new Error(`invalid path pattern for ${name}: ${path}`);
	}
};
