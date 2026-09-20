import type { ScriptExec } from "./script";

export type GitTreeMatchOptions = Readonly<{
	/** Full commit object IDs, already present in the local repository. */
	candidateCommit: string;
	referenceCommit: string;
	/** Nonempty, literal repository-relative paths to committed files or directories. */
	paths: readonly string[];
	exec: ScriptExec;
}>;

/** Git entry identities include file mode, object type, and full object ID. */
export type GitTreeMatchResult = Readonly<{
	matches: boolean;
	candidateCommit: string;
	referenceCommit: string;
	inputs: readonly Readonly<{ path: string; candidateEntry: string; referenceEntry: string }>[];
}>;

export class GitTreeMatchError extends Error {
	constructor(
		readonly code: "invalid_commit" | "invalid_path" | "missing_input" | "git_failed",
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "GitTreeMatchError";
	}
}

/**
 * Compares declared Git inputs at two immutable commits, including executable modes.
 * Callers own input completeness and any decision to reuse a successful test or artifact.
 * Equality alone proves neither CI success nor deployment readiness.
 * Missing inputs, invalid revisions, and Git failures throw GitTreeMatchError.
 */
export const gitTreeMatch = async ({
	candidateCommit,
	referenceCommit,
	paths: declaredPaths,
	exec,
}: GitTreeMatchOptions): Promise<GitTreeMatchResult> => {
	const paths = [...declaredPaths];
	for (const commit of [candidateCommit, referenceCommit]) {
		if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)) {
			throw new GitTreeMatchError("invalid_commit", `Expected a full commit object ID: ${commit}`);
		}
	}
	if (paths.length === 0 || new Set(paths).size !== paths.length) {
		throw new GitTreeMatchError("invalid_path", "Expected nonempty, distinct input paths");
	}
	for (const path of paths) {
		if (
			/[\0\\]/.test(path) ||
			path.split("/").some((part) => part === "" || part === "." || part === "..")
		) {
			throw new GitTreeMatchError("invalid_path", `Expected a literal repository-relative path: ${path}`);
		}
	}
	const git = async (args: readonly string[]): Promise<string> => {
		const result = await exec("git", ["--no-replace-objects", "--literal-pathspecs", ...args], {
			exitPolicy: "any",
			output: "capture",
		}).catch((cause: unknown) => {
			throw new GitTreeMatchError("git_failed", "Could not execute git", { cause });
		});
		if (result.exitCode !== 0) {
			throw new GitTreeMatchError("git_failed", `git ${args.join(" ")} failed: ${result.stderr.trim()}`);
		}
		return result.stdout;
	};
	for (const commit of [candidateCommit, referenceCommit]) {
		if ((await git(["cat-file", "-t", commit])).trim() !== "commit") {
			throw new GitTreeMatchError("invalid_commit", `Expected a commit object: ${commit}`);
		}
	}
	const entry = async (commit: string, path: string): Promise<string> => {
		const output = await git(["ls-tree", "-z", "--full-tree", commit, "--", path]);
		const tab = output.indexOf("\t");
		const identity = output.slice(0, tab);
		if (
			tab < 0 ||
			output.slice(tab + 1) !== `${path}\0` ||
			!/^[0-7]{6} (blob|tree|commit) (?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(identity)
		) {
			throw new GitTreeMatchError("missing_input", `Expected one Git entry at ${commit}:${path}`);
		}
		return identity;
	};
	const inputs: { path: string; candidateEntry: string; referenceEntry: string }[] = [];
	for (const path of paths) {
		const [candidateEntry, referenceEntry] = await Promise.all([
			entry(candidateCommit, path),
			entry(referenceCommit, path),
		]);
		inputs.push({ path, candidateEntry, referenceEntry });
	}
	return {
		matches: inputs.every((input) => input.candidateEntry === input.referenceEntry),
		candidateCommit,
		referenceCommit,
		inputs,
	};
};
