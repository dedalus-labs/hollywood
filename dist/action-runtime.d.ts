
import { A as ScriptLog, C as RunnerContext, D as ScriptActionServices, E as ScriptActionContext, F as integerInput, I as pathInput, L as runAction, M as action, N as booleanInput, O as ScriptExec, P as choiceInput, R as stringInput, S as RunActionOptions, T as ScriptActionCall, _ as InputDefinitions, b as OutputDefinitions, c as ActionInputValues, d as Command, f as CommandEnvironment, g as InputDefinition, h as CommandResult, j as WorkflowInputValues, k as ScriptFs, l as ActionOutputValues, m as CommandOptions, o as runGitHubAction, p as CommandExitPolicy, s as ActionCallInputValues, w as ScriptAction, y as OutputDefinition, z as stringOutput } from "./github-D8eY-lV0.js";

//#region src/git-tree-match.d.ts
/** Metadata about a successful GitHub Actions workflow run. */
type WorkflowRunInfo = Readonly<{
  id: number;
  url: string;
  conclusion: string;
  createdAt: string;
  headSha: string;
  name: string;
}>;
/**
 * Result of comparing the current tree hash against recent successful
 * workflow runs. Uses a discriminated union so consumers must handle
 * both the match and no-match cases exhaustively.
 */
type GitTreeMatchResult = {
  found: true;
  run: WorkflowRunInfo;
} | {
  found: false;
  reason: string;
};
/**
 * Options for `gitTreeMatch`.
 *
 * @param path — The repository-relative path whose tree hash to compare
 *   (e.g. `"packages/typescript/databases/core/supabase/migrations"`).
 * @param workflow — The name of the GitHub Actions workflow to filter runs by.
 * @param branch — The branch to look for recent successful runs on.
 * @param repository — The `owner/repo` string (e.g. `"dedalus-labs/hollywood"`).
 * @param limit — Maximum number of recent successful runs to scan. Clamped
 *   to 100 (GitHub API `per_page` maximum). Defaults to 10.
 * @param exec — Hollywood `ScriptExec` for running `git rev-parse` locally.
 * @param token — Optional GitHub personal access token for authenticated API
 *   calls. Unauthenticated requests are rate-limited to 60/hour.
 */
type GitTreeMatchOptions = Readonly<{
  path: string;
  workflow: string;
  branch: string;
  repository: string;
  limit?: number;
  exec: ScriptExec;
  token?: string;
}>;
/**
 * Compares the current tree hash for a given path against recent successful
 * workflow runs on a branch. If a prior run has the same tree hash for that
 * path, the gate passes without waiting — reusing the prior run's result.
 *
 * This solves the cross-workflow gate problem: when a CD pipeline requires
 * a dependent workflow to pass (e.g. database migrations), but the dependent
 * workflow didn't trigger for the current commit because the relevant source
 * tree didn't change.
 *
 * @param options — Configuration as described in `GitTreeMatchOptions`.
 * @returns A `GitTreeMatchResult` — `{ found: true, run }` if a matching
 *   prior run exists, or `{ found: false, reason }` otherwise.
 *
 * @example
 * ```ts
 * const match = await gitTreeMatch({
 *   path: "packages/typescript/databases/core/supabase/migrations",
 *   workflow: "DB CD",
 *   branch: input.branch,
 *   repository: input.repository,
 *   limit: 10,
 *   exec,
 * });
 *
 * if (match.found) {
 *   log.info(`Tree unchanged since ${match.run.url}`);
 *   return match.run;
 * }
 * ```
 */
declare const gitTreeMatch: (options: GitTreeMatchOptions) => Promise<GitTreeMatchResult>;
//#endregion
export { type ActionCallInputValues, type ActionInputValues, type ActionOutputValues, type Command, type CommandEnvironment, type CommandExitPolicy, type CommandOptions, type CommandResult, type GitTreeMatchOptions, type GitTreeMatchResult, type InputDefinition, type InputDefinitions, type OutputDefinition, type OutputDefinitions, type RunActionOptions, type RunnerContext, type ScriptAction, type ScriptActionCall, type ScriptActionContext, type ScriptActionServices, type ScriptExec, type ScriptFs, type ScriptLog, type WorkflowInputValues, type WorkflowRunInfo, action, booleanInput, choiceInput, gitTreeMatch, integerInput, pathInput, runAction, runGitHubAction, stringInput, stringOutput };