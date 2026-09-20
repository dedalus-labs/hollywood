import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "vitest";

import { gitTreeMatch, GitTreeMatchError } from "./git-tree-match";
import { nodeExec } from "./local";

let directory: string;
let referenceCommit: string;
const git = (...args: string[]) => execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
const commit = () => {
	git("add", "--all");
	git("commit", "--quiet", "--allow-empty", "-m", "fixture");
	return git("rev-parse", "HEAD");
};
const paths = ["src", "package-lock.json", ".github/workflows/ci.yml"];
const compare = (
	candidateCommit: string, inputs = paths, reference = referenceCommit, cwd = directory,
) =>
	gitTreeMatch({
		candidateCommit,
		referenceCommit: reference,
		paths: inputs,
		exec: (file, args, options) => nodeExec(file, args, { ...options, cwd }),
	});

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), "hollywood-git-inputs-"));
	git("init", "--quiet");
	git("config", "user.name", "Git fixture");
	git("config", "user.email", "fixture@example.test");
	git("config", "commit.gpgsign", "false");
	mkdirSync(join(directory, "src"));
	mkdirSync(join(directory, ".github/workflows"), { recursive: true });
	writeFileSync(join(directory, "src/code.ts"), "export const value = 1;\n");
	writeFileSync(join(directory, "package-lock.json"), "{}\n");
	writeFileSync(join(directory, ".github/workflows/ci.yml"), "name: CI\n");
	referenceCommit = commit();
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

test("equal declared inputs preserve both commit identities despite unrelated changes", async () => {
	writeFileSync(join(directory, "README.md"), "unrelated\n");
	const candidateCommit = commit();
	assert.notEqual(candidateCommit, referenceCommit);
	writeFileSync(join(directory, "src/code.ts"), "uncommitted\n");
	const result = await compare(candidateCommit, paths, referenceCommit, join(directory, "src"));
	assert.equal(result.matches, true);
	assert.equal(result.candidateCommit, candidateCommit);
	assert.equal(result.referenceCommit, referenceCommit);
	assert.deepEqual(result.inputs.map((input) => input.path), paths);
	for (const input of result.inputs) {
		assert.equal(input.candidateEntry, input.referenceEntry);
	}
});

for (const path of ["src/code.ts", ...paths.slice(1)]) {
	test(`changing declared input ${path} prevents equality`, async () => {
		writeFileSync(join(directory, path), "changed\n");
		assert.equal((await compare(commit())).matches, false);
	});
}

test("file mode changes invalidate equality with unchanged blob bytes", async () => {
	git("update-index", "--chmod=+x", "src/code.ts");
	git("commit", "--quiet", "-m", "mode");
	const result = await compare(git("rev-parse", "HEAD"), ["src/code.ts"]);
	assert.equal(result.matches, false);
	const input = result.inputs[0];
	assert.ok(input);
	assert.match(input.candidateEntry, /^100755 blob /);
	assert.match(input.referenceEntry, /^100644 blob /);
});

test("literal filenames cannot expand to other inputs", async () => {
	writeFileSync(join(directory, "src/[x]*.ts"), "literal\n");
	referenceCommit = commit();
	writeFileSync(join(directory, "src/x-other.ts"), "changed\n");
	assert.equal((await compare(commit(), ["src/[x]*.ts"])).matches, true);
});

test("local replacement objects cannot hide changed committed inputs", async () => {
	writeFileSync(join(directory, "src/code.ts"), "changed\n");
	const candidateCommit = commit();
	git("replace", candidateCommit, referenceCommit);
	assert.equal((await compare(candidateCommit)).matches, false);
});

test("missing paths on either commit fail, including after a changed input", async () => {
	rmSync(join(directory, "package-lock.json"));
	writeFileSync(join(directory, "src/code.ts"), "changed\n");
	const candidateCommit = commit();
	await assert.rejects(compare(candidateCommit), { code: "missing_input" });
	await assert.rejects(compare(referenceCommit, paths, candidateCommit), { code: "missing_input" });
	await assert.rejects(compare(referenceCommit, ["absent"]), { code: "missing_input" });
});

test("mutable, abbreviated, missing, and non-commit revisions fail", async () => {
	for (const ref of ["HEAD", "main", referenceCommit.slice(0, 12), `${referenceCommit}^0`]) {
		await assert.rejects(compare(ref), { code: "invalid_commit" });
		await assert.rejects(compare(referenceCommit, paths, ref), { code: "invalid_commit" });
	}
	await assert.rejects(compare("0".repeat(40)), { code: "git_failed" });
	await assert.rejects(compare(git("rev-parse", "HEAD:src/code.ts")), { code: "invalid_commit" });
});

test("empty, duplicate, and non-relative paths fail", async () => {
	for (const inputs of [
		[], ["src", "src"], [""], ["/src"], ["src/"],
		["src/../src"], ["./src"], ["src\\code.ts"], ["src\0"],
	]) {
		await assert.rejects(compare(referenceCommit, inputs), { code: "invalid_path" });
	}
});

test("Git failure cannot produce an equality receipt", async () => {
	await assert.rejects(compare(referenceCommit, paths, referenceCommit, tmpdir()), GitTreeMatchError);
});

test("comparison snapshots the declared input list before Git runs", async () => {
	const inputs = ["src"];
	const pending = compare(referenceCommit, inputs);
	inputs.length = 0;
	assert.deepEqual((await pending).inputs.map((input) => input.path), ["src"]);
});

test("a missing Git executable fails with a typed error", async () => {
	await assert.rejects(
		gitTreeMatch({
			candidateCommit: referenceCommit,
			referenceCommit,
			paths,
			exec: (_file, args, options) => nodeExec(join(directory, "absent-git"), args, options),
		}),
		{ code: "git_failed" },
	);
});
