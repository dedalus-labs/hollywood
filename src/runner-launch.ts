import { spawn } from "node:child_process";

const jitConfig = process.env["HOLLYWOOD_RUNNER_JIT_CONFIG"];
if (jitConfig === undefined || jitConfig === "") {
	throw new Error("HOLLYWOOD_RUNNER_JIT_CONFIG is required.");
}
delete process.env["HOLLYWOOD_RUNNER_JIT_CONFIG"];

const runner = spawn("/home/runner/bin/Runner.Listener", ["run", "--jitconfig", jitConfig], {
	env: process.env,
	stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
	process.once(signal, () => runner.kill(signal));
}

const exitCode = await new Promise<number>((resolve, reject) => {
	runner.once("error", reject);
	runner.once("close", (code, signal) => {
		if (signal !== null) {
			reject(new Error(`Runner.Listener exited after signal ${signal}.`));
			return;
		}
		resolve(code ?? 1);
	});
});
if (exitCode !== 0) {
	throw new Error(`Runner.Listener exited with code ${exitCode}.`);
}
