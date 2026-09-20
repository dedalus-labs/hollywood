import { join } from "node:path";

import { action } from "../src/index";

export const checkParallelModel = action({
	name: "Check parallel join model",
	description: "Check bounded join safety, broken guards, and reachable outcomes with TLC.",
	localActionPath: "check-parallel-model",
	inputs: {},
	outputs: {},
	run: async ({ exec }) => {
		const temporary = process.env["RUNNER_TEMP"];
		const javaHome = process.env["JAVA_HOME_21_X64"];
		if (!temporary || !javaHome) throw new Error("RUNNER_TEMP and JAVA_HOME_21_X64 are required");
		const jar = join(temporary, "tla2tools.jar");
		await exec("curl", [
			"--fail",
			"--location",
			"--silent",
			"--show-error",
			"--max-time",
			"30",
			"--output",
			jar,
			"https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar",
		]);
		await exec("node", [
			"models/check.mjs",
			"--jar",
			jar,
			"--java",
			join(javaHome, "bin/java"),
			"--output",
			join(temporary, "parallel-models"),
		]);
		return {};
	},
});
