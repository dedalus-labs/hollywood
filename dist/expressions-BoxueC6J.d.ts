
//#region src/expressions.d.ts
declare const githubExpressionBrand: unique symbol;
type GitHubExpression<Value = unknown> = string & {
  readonly [githubExpressionBrand]: Value;
};
type GitHubExpressionValue = GitHubExpression<unknown> | boolean | number | string;
type GitHubBooleanValue = GitHubExpression<boolean> | boolean;
type GitHubNumberValue = GitHubExpression<number> | number;
type GitHubLiteralString = string & {
  readonly [githubExpressionBrand]?: never;
};
type GitHubStringValue = GitHubExpression<string> | GitHubLiteralString;
declare const GitHubJobResult: {
  readonly Success: "success";
  readonly Failure: "failure";
  readonly Cancelled: "cancelled";
  readonly Skipped: "skipped";
};
type GitHubJobResultValue = (typeof GitHubJobResult)[keyof typeof GitHubJobResult];
type GitHubMatrixValues = {
  readonly [name: string]: readonly GitHubExpressionPrimitive[] | readonly GitHubExpressionObject[];
};
type GitHubTypedMatrix<Matrix extends GitHubMatrixValues> = Readonly<{
  values: Matrix;
  refs: GitHubMatrixRefs<Matrix>;
}> & GitHubMatrixRefs<Matrix>;
type AnyGitHubTypedMatrix = Readonly<{
  values: GitHubMatrixValues;
  refs: {
    readonly [name: string]: GitHubExpression<unknown>;
  };
}>;
type GitHubExpressionPrimitive = boolean | number | string;
type GitHubExpressionObject = Readonly<{
  readonly [name: string]: GitHubExpressionPrimitive;
}>;
type GitHubMatrixRefs<Matrix extends GitHubMatrixValues> = { readonly [Name in Exclude<keyof Matrix, "exclude" | "include" | "refs" | "values"> & string]: GitHubExpression<GitHubMatrixAxisValue<Matrix[Name]>> };
type GitHubMatrixAxisValue<Value> = Value extends readonly (infer Item)[] ? Item extends GitHubExpressionPrimitive ? Item : never : never;
declare const expr: <Value = unknown>(body: string) => GitHubExpression<Value>;
declare const github: {
  readonly actor: GitHubExpression<string>;
  readonly baseRef: GitHubExpression<string>;
  readonly eventName: GitHubExpression<string>;
  readonly headRef: GitHubExpression<string>;
  readonly ref: GitHubExpression<string>;
  readonly refName: GitHubExpression<string>;
  readonly repositoryOwner: GitHubExpression<string>;
  readonly repository: GitHubExpression<string>;
  readonly runId: GitHubExpression<number>;
  readonly sha: GitHubExpression<string>;
  readonly token: GitHubExpression<string>;
  readonly workflow: GitHubExpression<string>;
};
declare const runner: {
  readonly arch: GitHubExpression<string>;
  readonly name: GitHubExpression<string>;
  readonly os: GitHubExpression<string>;
};
declare const gh: {
  readonly github: {
    readonly actor: GitHubExpression<string>;
    readonly baseRef: GitHubExpression<string>;
    readonly eventName: GitHubExpression<string>;
    readonly headRef: GitHubExpression<string>;
    readonly ref: GitHubExpression<string>;
    readonly refName: GitHubExpression<string>;
    readonly repositoryOwner: GitHubExpression<string>;
    readonly repository: GitHubExpression<string>;
    readonly runId: GitHubExpression<number>;
    readonly sha: GitHubExpression<string>;
    readonly token: GitHubExpression<string>;
    readonly workflow: GitHubExpression<string>;
  };
  readonly runner: {
    readonly arch: GitHubExpression<string>;
    readonly name: GitHubExpression<string>;
    readonly os: GitHubExpression<string>;
  };
};
declare const defineMatrix: <const Matrix extends GitHubMatrixValues>(values: Matrix) => GitHubTypedMatrix<Matrix>;
declare const input: <Value = unknown>(name: string) => GitHubExpression<Value>;
declare const matrix: <Value = unknown>(name: string) => GitHubExpression<Value>;
declare const envVar: <Value = string>(name: string) => GitHubExpression<Value>;
declare const secret: <Value = string>(name: string) => GitHubExpression<Value>;
declare const needsOutput: <Value = unknown>(job: string, output: string) => GitHubExpression<Value>;
declare const needsResult: (job: string) => GitHubExpression<GitHubJobResultValue>;
declare const stepOutput: <Value = unknown>(step: string, output: string) => GitHubExpression<Value>;
declare const format: (template: string, ...values: readonly GitHubExpressionValue[]) => GitHubExpression<string>;
declare const contains: (search: GitHubExpressionValue, item: GitHubExpressionValue) => GitHubExpression;
declare const hashFiles: (first: string, ...rest: readonly string[]) => GitHubExpression;
declare const eq: (left: GitHubExpressionValue, right: GitHubExpressionValue) => GitHubExpression<boolean>;
declare const ne: (left: GitHubExpressionValue, right: GitHubExpressionValue) => GitHubExpression<boolean>;
declare const needsResultIs: (job: string, result: GitHubJobResultValue) => GitHubExpression<boolean>;
declare const needsResultIn: (job: string, results: readonly [GitHubJobResultValue, ...GitHubJobResultValue[]]) => GitHubExpression<boolean>;
declare const and: (first: GitHubExpressionValue, second: GitHubExpressionValue, ...rest: readonly GitHubExpressionValue[]) => GitHubExpression<boolean>;
declare const or: (first: GitHubExpressionValue, second: GitHubExpressionValue, ...rest: readonly GitHubExpressionValue[]) => GitHubExpression<boolean>;
declare const selectString: (condition: GitHubExpression<boolean>, whenTrue: GitHubStringValue, whenFalse: GitHubStringValue) => GitHubExpression<string>;
declare function valueOr(first: GitHubBooleanValue, second: GitHubBooleanValue, ...rest: readonly GitHubBooleanValue[]): GitHubExpression<boolean>;
declare function valueOr(first: GitHubNumberValue, second: GitHubNumberValue, ...rest: readonly GitHubNumberValue[]): GitHubExpression<number>;
declare function valueOr(first: GitHubStringValue, second: GitHubStringValue, ...rest: readonly GitHubStringValue[]): GitHubExpression<string>;
declare const not: (value: GitHubExpressionValue) => GitHubExpression<boolean>;
declare const always: () => GitHubExpression<boolean>;
declare const cancelled: () => GitHubExpression<boolean>;
declare const failure: () => GitHubExpression<boolean>;
declare const success: () => GitHubExpression<boolean>;
//#endregion
export { runner as A, ne as C, needsResultIs as D, needsResultIn as E, valueOr as F, selectString as M, stepOutput as N, not as O, success as P, matrix as S, needsResult as T, format as _, GitHubJobResultValue as a, hashFiles as b, always as c, contains as d, defineMatrix as f, failure as g, expr as h, GitHubJobResult as i, secret as j, or as k, and as l, eq as m, GitHubExpression as n, GitHubMatrixValues as o, envVar as p, GitHubExpressionValue as r, GitHubTypedMatrix as s, AnyGitHubTypedMatrix as t, cancelled as u, gh as v, needsOutput as w, input as x, github as y };