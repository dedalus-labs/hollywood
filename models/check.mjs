import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, copyFileSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const jarHash = "9d36716ffb5e49d1ba8fae4651eba59f3189887e12eb90e204a42d2e6e993fef";
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const json = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const { values } = parseArgs({ options: {
	jar: { type: "string" }, output: { type: "string" },
	java: { type: "string", default: "java" },
} });
if (!values.jar || !values.output) throw new Error("Required: --jar <tla2tools.jar> --output <new directory>");
const jar = resolve(values.jar);
if (hash(jar) !== jarHash) throw new Error("TLC v1.8.0 SHA-256 mismatch");
const version = spawnSync(values.java, ["-version"], { encoding: "utf8", timeout: 5000 });
if (version.error || version.status !== 0) throw new Error("Java is unavailable", { cause: version.error });
const output = resolve(values.output);
mkdirSync(output); // Never replace an earlier run's evidence.
const source = dirname(fileURLToPath(import.meta.url));
const cases = [
	["TwoTasks.cfg", null], ["ThreeTasks.cfg", null],
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
	const args = ["-Xmx256m", "-XX:+UseParallelGC", "-cp", jar, "tlc2.TLC",
		"-workers", "1", "-seed", "1", "-fp", "0", "-noGenerateSpecTE",
		"-config", config, "-dumpTrace", "json", "counterexample.json", "ParallelJoin.tla"];
	const fd = openSync(join(directory, "tlc.log"), "wx");
	const started = Date.now();
	const result = spawnSync(values.java, args, {
		cwd: directory, stdio: ["ignore", fd, fd], timeout: 30000, killSignal: "SIGKILL",
	});
	closeSync(fd);
	const log = readFileSync(join(directory, "tlc.log"), "utf8");
	const violations = [...log.matchAll(/Error: Invariant (\w+) is violated\./g)].map((match) => match[1]);
	let trace = null;
	let traceError = null;
	if (expectedViolation) {
		try {
			trace = JSON.parse(readFileSync(join(directory, "counterexample.json"), "utf8"));
			if (!Array.isArray(trace?.counterexample?.state) || trace.counterexample.state.length < 2
				|| !Array.isArray(trace?.counterexample?.action) || trace.counterexample.action.length < 1) {
				throw new Error("Expected a nonempty TLC state and action counterexample");
			}
		}
		catch (error) { traceError = error.message; }
	}
	const passed = !result.error && !result.signal && (expectedViolation === null
		? result.status === 0 && log.includes("Model checking completed. No error has been found.")
		: result.status === 12 && violations.length === 1 && violations[0] === expectedViolation
			&& trace !== null && !traceError);
	const receipt = {
		config, expectedViolation, passed, exitCode: result.status, signal: result.signal,
		error: result.error?.code ?? null, elapsedMs: Date.now() - started,
		violations, traceError, states: log.match(/([\d,]+) distinct states found/)?.[1] ?? null,
		depth: log.match(/depth of the complete state graph search is (\d+)/)?.[1] ?? null,
		files, jarSha256: jarHash, checkerSha256: hash(fileURLToPath(import.meta.url)),
		javaVersion: version.stdout + version.stderr, timeoutMs: 30000,
		args: args.map((argument) => argument === jar ? "<verified-tlc-jar>" : argument),
	};
	json(join(directory, "receipt.json"), receipt);
	receipts.push(receipt);
	console.log(`${passed ? "PASS" : "FAIL"} ${config}: ${receipt.states} states, ${receipt.elapsedMs} ms`);
}
json(join(output, "receipt.json"), receipts);
process.exitCode = receipts.every((receipt) => receipt.passed) ? 0 : 1;
