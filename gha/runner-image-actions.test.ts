import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import {
	currentRunner,
	githubActionsRunnerImage,
	nodeExec,
	nodeFs,
	parseRunnerContract,
	runAction,
	type ContainerProvider,
} from "../src/index";
import { verifyRunnerImage } from "./runner-image-actions";

test("runner image source pins its base and requires a revision", async () => {
	const containerfile = await readFile("runner/Containerfile", "utf8");
	const contract = parseRunnerContract(await readFile("runner/contract.json", "utf8"));

	assert.deepEqual(contract.architectures, ["arm64", "x64"]);
	assert.equal("ImageOS" in contract.environment, false);
	assert.equal(contract.os.versionId, "24.04");
	assert.match(githubActionsRunnerImage, /^ghcr\.io\/actions\/actions-runner@sha256:[0-9a-f]{64}$/);
	assert.equal(containerfile.split("\n")[0], `FROM ${githubActionsRunnerImage}`);
	assert.match(containerfile, /^ARG SOURCE_REVISION\nRUN test -n "\$\{SOURCE_REVISION\}"$/m);
});

const provider = process.env["HOLLYWOOD_RUNNER_IMAGE_PROVIDER"];
const realImageTest = provider === undefined ? test.skip : test;

realImageTest(
	"runner image builds and satisfies its contract",
	async () => {
		if (!isContainerProvider(provider)) {
			throw new Error(`unsupported runner image test provider: ${String(provider)}`);
		}
		const previousWorkspace = process.env["GITHUB_WORKSPACE"];
		const previousSha = process.env["GITHUB_SHA"];
		process.env["GITHUB_WORKSPACE"] = process.cwd();
		process.env["GITHUB_SHA"] = "0123456789abcdef0123456789abcdef01234567";
		try {
			await runAction(verifyRunnerImage, {
				with: { provider },
				exec: nodeExec,
				fs: nodeFs,
				runner: currentRunner(),
			});
		} finally {
			restoreVariable("GITHUB_WORKSPACE", previousWorkspace);
			restoreVariable("GITHUB_SHA", previousSha);
		}
	},
	120_000,
);

const isContainerProvider = (value: string | undefined): value is ContainerProvider =>
	value === "container" || value === "docker" || value === "podman";

const restoreVariable = (name: string, value: string | undefined): void => {
	if (value === undefined) {
		delete process.env[name];
		return;
	}
	process.env[name] = value;
};
