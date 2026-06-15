import { Lexer, Parser } from "@actions/expressions";

declare const githubExpressionBrand: unique symbol;

const typedMatrixSymbol = Symbol.for("@dedalus/hollywood.typed-matrix");

export type GitHubExpression<Value = unknown> = string & {
	readonly [githubExpressionBrand]: Value;
};

export type GitHubExpressionValue = GitHubExpression<unknown> | boolean | number | string;

type GitHubBooleanValue = GitHubExpression<boolean> | boolean;

type GitHubNumberValue = GitHubExpression<number> | number;

type GitHubLiteralString = string & { readonly [githubExpressionBrand]?: never };

type GitHubStringValue = GitHubExpression<string> | GitHubLiteralString;

export const GitHubJobResult = {
	Success: "success",
	Failure: "failure",
	Cancelled: "cancelled",
	Skipped: "skipped",
} as const;

export type GitHubJobResultValue = (typeof GitHubJobResult)[keyof typeof GitHubJobResult];

export type GitHubMatrixValues = {
	readonly [name: string]: readonly GitHubExpressionPrimitive[] | readonly GitHubExpressionObject[];
};

export type GitHubTypedMatrix<Matrix extends GitHubMatrixValues> = Readonly<{
	values: Matrix;
	refs: GitHubMatrixRefs<Matrix>;
}> &
	GitHubMatrixRefs<Matrix>;

export type AnyGitHubTypedMatrix = Readonly<{
	values: GitHubMatrixValues;
	refs: { readonly [name: string]: GitHubExpression<unknown> };
}>;

type GitHubExpressionPrimitive = boolean | number | string;

type GitHubExpressionObject = Readonly<{
	readonly [name: string]: GitHubExpressionPrimitive;
}>;

type GitHubMatrixRefs<Matrix extends GitHubMatrixValues> = {
	readonly [Name in Exclude<keyof Matrix, "exclude" | "include" | "refs" | "values"> &
		string]: GitHubExpression<GitHubMatrixAxisValue<Matrix[Name]>>;
};

type GitHubMatrixAxisValue<Value> = Value extends readonly (infer Item)[]
	? Item extends GitHubExpressionPrimitive
		? Item
		: never
	: never;

type GitHubTypedMatrixRecord<Matrix extends GitHubMatrixValues> = Readonly<{
	[name: symbol]: Matrix;
}>;

export const expr = <Value = unknown>(body: string): GitHubExpression<Value> => {
	const trimmed = body.trim();
	if (trimmed === "") {
		throw new Error("GitHub expression body is required");
	}
	parseGitHubExpression(trimmed);
	return `\${{ ${trimmed} }}` as GitHubExpression<Value>;
};

export const github = {
	actor: expr<string>("github.actor"),
	baseRef: expr<string>("github.base_ref"),
	eventName: expr<string>("github.event_name"),
	headRef: expr<string>("github.head_ref"),
	ref: expr<string>("github.ref"),
	refName: expr<string>("github.ref_name"),
	repositoryOwner: expr<string>("github.repository_owner"),
	repository: expr<string>("github.repository"),
	runId: expr<number>("github.run_id"),
	sha: expr<string>("github.sha"),
	token: expr<string>("github.token"),
	workflow: expr<string>("github.workflow"),
} as const;

export const runner = {
	arch: expr<string>("runner.arch"),
	name: expr<string>("runner.name"),
	os: expr<string>("runner.os"),
} as const;

export const gh = { github, runner } as const;

export const defineMatrix = <const Matrix extends GitHubMatrixValues>(
	values: Matrix,
): GitHubTypedMatrix<Matrix> => {
	assertNoReservedMatrixAxes(values);
	const refs = matrixRefs(values) as GitHubMatrixRefs<Matrix>;
	Object.defineProperties(refs, {
		refs: { value: refs },
		values: { value: values },
		[typedMatrixSymbol]: { value: values },
	});
	return refs as GitHubTypedMatrix<Matrix>;
};

export const isGitHubTypedMatrix = (value: unknown): value is AnyGitHubTypedMatrix =>
	typeof value === "object" && value !== null && typedMatrixSymbol in value;

export const githubTypedMatrixValues = (matrix: AnyGitHubTypedMatrix): GitHubMatrixValues => {
	const values = (matrix as unknown as GitHubTypedMatrixRecord<GitHubMatrixValues>)[
		typedMatrixSymbol
	];
	if (values === undefined) {
		throw new Error("Hollywood matrix values are missing");
	}
	return values;
};

export const input = <Value = unknown>(name: string): GitHubExpression<Value> =>
	expr(property("inputs", name));

export const matrix = <Value = unknown>(name: string): GitHubExpression<Value> =>
	expr(property("matrix", name));

export const envVar = <Value = string>(name: string): GitHubExpression<Value> =>
	expr(property("env", name));

export const secret = <Value = string>(name: string): GitHubExpression<Value> =>
	expr(property("secrets", name));

export const needsOutput = <Value = unknown>(
	job: string,
	output: string,
): GitHubExpression<Value> => expr(property(property(property("needs", job), "outputs"), output));

export const needsResult = (job: string): GitHubExpression<GitHubJobResultValue> =>
	expr(property(property("needs", job), "result"));

export const stepOutput = <Value = unknown>(
	step: string,
	output: string,
): GitHubExpression<Value> => expr(property(property(property("steps", step), "outputs"), output));

export const format = (
	template: string,
	...values: readonly GitHubExpressionValue[]
): GitHubExpression<string> => callExpression("format", template, ...values);

export const contains = (
	search: GitHubExpressionValue,
	item: GitHubExpressionValue,
): GitHubExpression => callExpression("contains", search, item);

export const hashFiles = (first: string, ...rest: readonly string[]): GitHubExpression =>
	callExpression("hashFiles", first, ...rest);

export const eq = (
	left: GitHubExpressionValue,
	right: GitHubExpressionValue,
): GitHubExpression<boolean> =>
	expr(`${comparisonExpressionValue(left)} == ${comparisonExpressionValue(right)}`);

export const ne = (
	left: GitHubExpressionValue,
	right: GitHubExpressionValue,
): GitHubExpression<boolean> =>
	expr(`${comparisonExpressionValue(left)} != ${comparisonExpressionValue(right)}`);

export const needsResultIs = (
	job: string,
	result: GitHubJobResultValue,
): GitHubExpression<boolean> => eq(needsResult(job), result);

export const needsResultIn = (
	job: string,
	results: readonly [GitHubJobResultValue, ...GitHubJobResultValue[]],
): GitHubExpression<boolean> => {
	const [first, ...rest] = results;
	return joinExpressions("||", [
		needsResultIs(job, first),
		...rest.map((result) => needsResultIs(job, result)),
	]);
};

export const and = (
	first: GitHubExpressionValue,
	second: GitHubExpressionValue,
	...rest: readonly GitHubExpressionValue[]
): GitHubExpression<boolean> =>
	expr([first, second, ...rest].map((value) => booleanExpressionValue(value, "&&")).join(" && "));

export const or = (
	first: GitHubExpressionValue,
	second: GitHubExpressionValue,
	...rest: readonly GitHubExpressionValue[]
): GitHubExpression<boolean> =>
	expr([first, second, ...rest].map((value) => booleanExpressionValue(value, "||")).join(" || "));

export const selectString = (
	condition: GitHubExpression<boolean>,
	whenTrue: GitHubStringValue,
	whenFalse: GitHubStringValue,
): GitHubExpression<string> =>
	expr(
		`${booleanExpressionValue(condition, "&&")} && ${expressionValue(whenTrue)} || ${expressionValue(whenFalse)}`,
	);

export function valueOr(
	first: GitHubBooleanValue,
	second: GitHubBooleanValue,
	...rest: readonly GitHubBooleanValue[]
): GitHubExpression<boolean>;
export function valueOr(
	first: GitHubNumberValue,
	second: GitHubNumberValue,
	...rest: readonly GitHubNumberValue[]
): GitHubExpression<number>;
export function valueOr(
	first: GitHubStringValue,
	second: GitHubStringValue,
	...rest: readonly GitHubStringValue[]
): GitHubExpression<string>;
export function valueOr(
	first: GitHubExpressionValue,
	second: GitHubExpressionValue,
	...rest: readonly GitHubExpressionValue[]
): GitHubExpression {
	return expr([first, second, ...rest].map((value) => expressionValue(value)).join(" || "));
}

export const not = (value: GitHubExpressionValue): GitHubExpression<boolean> =>
	expr(`!${booleanExpressionValue(value, "!")}`);

export const always = (): GitHubExpression<boolean> => expr("always()");

export const cancelled = (): GitHubExpression<boolean> => expr("cancelled()");

export const failure = (): GitHubExpression<boolean> => expr("failure()");

export const success = (): GitHubExpression<boolean> => expr("success()");

function parseGitHubExpression(body: string): void {
	try {
		const tokens = new Lexer(body).lex().tokens;
		new Parser(tokens, githubExpressionContexts(), githubExpressionFunctions()).parse();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`invalid GitHub expression: ${message}`);
	}
}

const callExpression = <Value = unknown>(
	name: string,
	...values: readonly GitHubExpressionValue[]
): GitHubExpression<Value> =>
	expr(`${name}(${values.map((value) => expressionValue(value)).join(", ")})`);

const joinExpressions = (
	operator: "&&" | "||",
	values: readonly [GitHubExpressionValue, ...GitHubExpressionValue[]],
): GitHubExpression<boolean> => {
	const body = values.map((value) => booleanExpressionValue(value, operator)).join(` ${operator} `);
	return expr(body) as GitHubExpression<boolean>;
};

const booleanExpressionValue = (
	value: GitHubExpressionValue,
	operator: "!" | "&&" | "||",
): string => {
	if (typeof value === "string" && isGitHubExpression(value)) {
		const body = expressionBody(value);
		return needsBooleanGrouping(body, operator) ? `(${body})` : body;
	}
	return expressionValue(value);
};

const needsBooleanGrouping = (body: string, operator: "!" | "&&" | "||"): boolean => {
	const operators = topLevelLogicalOperators(body);
	if (operator === "!") {
		return operators.size > 0;
	}
	return operator === "&&" && operators.has("||");
};

const topLevelLogicalOperators = (body: string): ReadonlySet<"&&" | "||"> => {
	const operators = new Set<"&&" | "||">();
	let depth = 0;
	let quoted = false;
	for (let index = 0; index < body.length; index += 1) {
		const char = body[index];
		if (quoted) {
			if (char === "'" && body[index + 1] === "'") {
				index += 1;
			} else if (char === "'") {
				quoted = false;
			}
			continue;
		}
		if (char === "'") {
			quoted = true;
		} else if (char === "(" || char === "[") {
			depth += 1;
		} else if (char === ")" || char === "]") {
			depth -= 1;
		} else if (depth === 0) {
			const pair = body.slice(index, index + 2);
			if (pair === "&&" || pair === "||") {
				operators.add(pair);
				index += 1;
			}
		}
	}
	return operators;
};

const expressionValue = (value: GitHubExpressionValue): string => {
	if (typeof value === "boolean" || typeof value === "number") {
		return value.toString();
	}
	if (isGitHubExpression(value)) {
		return expressionBody(value);
	}
	return `'${value.replaceAll("'", "''")}'`;
};

const comparisonExpressionValue = (value: GitHubExpressionValue): string => {
	if (typeof value === "string" && isGitHubExpression(value)) {
		const body = expressionBody(value);
		return topLevelLogicalOperators(body).size > 0 ? `(${body})` : body;
	}
	return expressionValue(value);
};

const isGitHubExpression = (value: string): value is GitHubExpression<unknown> =>
	value.startsWith("${{") && value.endsWith("}}");

const expressionBody = (value: GitHubExpression<unknown>): string => {
	const match = /^\$\{\{\s*([\s\S]*?)\s*\}\}$/.exec(value);
	if (!match?.[1]) {
		throw new Error(`invalid GitHub expression wrapper: ${value}`);
	}
	return match[1];
};

const property = (base: string, name: string): string => {
	if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) {
		return `${base}.${name}`;
	}
	return `${base}['${name.replaceAll("'", "''")}']`;
};

const matrixRefs = (values: GitHubMatrixValues): { readonly [name: string]: GitHubExpression } => {
	const refs = new Map<string, GitHubExpression>();
	for (const name of Object.keys(values)) {
		if (name !== "exclude" && name !== "include") {
			refs.set(name, matrix(name));
		}
	}
	return Object.fromEntries(refs);
};

const assertNoReservedMatrixAxes = (values: GitHubMatrixValues): void => {
	for (const name of Object.keys(values)) {
		if (name === "refs" || name === "values") {
			throw new Error(`reserved Hollywood matrix axis: ${name}`);
		}
	}
};

function githubExpressionContexts(): string[] {
	return [
		"github",
		"inputs",
		"vars",
		"needs",
		"strategy",
		"matrix",
		"secrets",
		"steps",
		"job",
		"runner",
		"env",
	];
}

function githubExpressionFunctions() {
	return [
		{ name: "always", minArgs: 0, maxArgs: 0 },
		{ name: "cancelled", minArgs: 0, maxArgs: 0 },
		{ name: "failure", minArgs: 0, maxArgs: 0 },
		{ name: "hashFiles", minArgs: 1, maxArgs: 255 },
		{ name: "success", minArgs: 0, maxArgs: 0 },
	];
}
