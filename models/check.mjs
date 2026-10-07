import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, copyFileSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const jarHash = "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88";
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const json = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const { values } = parseArgs({
	options: {
		jar: { type: "string" },
		output: { type: "string" },
		java: { type: "string", default: "java" },
	},
});
if (!values.jar || !values.output) {
	throw new Error("Required: --jar <tla2tools.jar> --output <new directory>");
}
const jar = resolve(values.jar);
if (hash(jar) !== jarHash) {
	throw new Error("TLC v1.7.4 SHA-256 mismatch");
}
// Bare executable names retain PATH lookup. Paths are anchored before case execution.
const java = basename(values.java) === values.java ? values.java : resolve(values.java);
const version = spawnSync(java, ["-version"], { encoding: "utf8", timeout: 5000 });
if (version.error || version.status !== 0) {
	throw new Error("Java is unavailable", { cause: version.error });
}
const output = resolve(values.output);
mkdirSync(output); // Never replace an earlier run's evidence.
const source = dirname(fileURLToPath(import.meta.url));
const cases = [
	["TwoTasks.cfg", null],
	["ThreeTasks.cfg", null],
	["SkipWait.mutant.cfg", "JoinWaits"],
	["IgnoreFailure.mutant.cfg", "ContinuationSafe"],
	["Success.witness.cfg", "NoSuccess"],
	["Failure.witness.cfg", "NoFailureJoin"],
	["Cancelled.witness.cfg", "NoCancelledJoin"],
];
const receipts = [];
for (const [config, expectedViolation] of cases) {
	const directory = join(output, config);
	mkdirSync(directory);
	const files = {};
	for (const file of ["ParallelJoin.tla", config]) {
		copyFileSync(join(source, "parallel-join", file), join(directory, file));
		files[file] = hash(join(directory, file));
	}
	// TLC extracts standard modules into this directory. Each run owns its copies.
	const temporary = join(directory, "tmp");
	mkdirSync(temporary);
	const args = [
		"-Xmx256m",
		`-Djava.io.tmpdir=${temporary}`,
		"-XX:+UseParallelGC",
		"-cp",
		jar,
		"tlc2.TLC",
		"-tool",
		"-workers",
		"1",
		"-seed",
		"1",
		"-fp",
		"0",
		"-config",
		config,
		"ParallelJoin.tla",
	];
	const fd = openSync(join(directory, "tlc.log"), "wx");
	const started = Date.now();
	const result = spawnSync(java, args, {
		cwd: directory,
		stdio: ["ignore", fd, fd],
		timeout: 30000,
		killSignal: "SIGKILL",
	});
	closeSync(fd);
	const log = readFileSync(join(directory, "tlc.log"), "utf8");
	const violations = [...log.matchAll(/^Invariant (\w+) is violated\./gm)].map((match) => match[1]);
	// TLC_STATE_PRINT1/2 frame complete states, including their action and variable values.
	const states = [
		...log.matchAll(/^@!@!@STARTMSG (2216|2217):\d+ @!@!@\r?\n([\s\S]*?)^@!@!@ENDMSG \1 @!@!@$/gm),
	].map((match) => match[2]);
	const traceError =
		expectedViolation &&
		(states.length < 2 ||
			!states[0].startsWith("1: <Initial predicate>") ||
			!states[1].startsWith("2: <"))
			? "Expected an initial state and a following state in the TLC trace"
			: null;
	if (expectedViolation && !traceError) {
		json(join(directory, "counterexample.json"), { states });
	}
	const completed = !result.error && !result.signal;
	const safe =
		result.status === 0 && log.includes("Model checking completed. No error has been found.");
	const counterexample =
		result.status === 12 &&
		violations.length === 1 &&
		violations[0] === expectedViolation &&
		!traceError;
	const passed = completed && (expectedViolation === null ? safe : counterexample);
	const receipt = {
		config,
		expectedViolation,
		passed,
		exitCode: result.status,
		signal: result.signal,
		error: result.error?.code ?? null,
		elapsedMs: Date.now() - started,
		violations,
		traceError,
		states: log.match(/([\d,]+) distinct states found/)?.[1] ?? null,
		depth: log.match(/depth of the complete state graph search is (\d+)/)?.[1] ?? null,
		files,
		jarSha256: jarHash,
		checkerSha256: hash(fileURLToPath(import.meta.url)),
		javaVersion: version.stdout + version.stderr,
		timeoutMs: 30000,
		args: args.map((argument) => (argument === jar ? "<verified-tlc-jar>" : argument)),
	};
	json(join(directory, "receipt.json"), receipt);
	receipts.push(receipt);
	console.log(
		`${passed ? "PASS" : "FAIL"} ${config}: ${receipt.states} states, ${receipt.elapsedMs} ms`,
	);
}
json(join(output, "receipt.json"), receipts);
process.exitCode = receipts.every((receipt) => receipt.passed) ? 0 : 1;
