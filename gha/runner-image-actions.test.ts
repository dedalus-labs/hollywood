import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import {
	type Command,
	currentRunner,
	githubActionsRunnerImage,
	githubActionsRunnerVersion,
	nodeExec,
	nodeFs,
	parseRunnerContract,
	runAction,
	type ContainerProvider,
} from "../src/index";
import {
	prepareRunnerImageRelease,
	verifyPublishedRunnerImage,
	verifyRunnerImage,
	verifyRunnerVersion,
} from "./runner-image-actions";

test("runner image source pins its base and requires a revision", async () => {
	const containerfile = await readFile("runner/Containerfile", "utf8");
	const contract = parseRunnerContract(await readFile("runner/contract.json", "utf8"));

	assert.deepEqual(contract.architectures, ["arm64", "x64"]);
	assert.equal("ImageOS" in contract.environment, false);
	assert.equal(contract.os.versionId, "24.04");
	assert.match(githubActionsRunnerImage, /^ghcr\.io\/actions\/actions-runner@sha256:[0-9a-f]{64}$/);
	assert.equal(githubActionsRunnerVersion, "2.336.0");
	assert.equal(containerfile.split("\n")[0], `FROM ${githubActionsRunnerImage}`);
	assert.match(containerfile, /^ARG SOURCE_REVISION\nRUN test -n "\$\{SOURCE_REVISION\}"$/m);
});

test("runner image releases derive stable tags from the package version", async () => {
	const outputs = await runAction(prepareRunnerImageRelease, {
		with: {
			event: "release",
			image: "ghcr.io/dedalus-labs/hollywood-runner",
			packageJson: "package.json",
			ref: "refs/tags/v1.2.3",
			refName: "v1.2.3",
			revision: "0123456789abcdef0123456789abcdef01234567",
		},
		exec: unexpectedExec,
		fs: { readText: async () => '{"version":"1.2.3"}' },
		runner: currentRunner(),
	});

	assert.deepEqual(outputs, {
		sourceRef: "refs/tags/v1.2.3",
		tags: [
			"ghcr.io/dedalus-labs/hollywood-runner:sha-0123456789abcdef0123456789abcdef01234567",
			"ghcr.io/dedalus-labs/hollywood-runner:1.2.3",
			"ghcr.io/dedalus-labs/hollywood-runner:1.2",
			"ghcr.io/dedalus-labs/hollywood-runner:latest",
			"ghcr.io/dedalus-labs/hollywood-runner:ubuntu-24.04",
		].join("\n"),
		version: "1.2.3",
	});
});

test("runner image main builds only move the development channel", async () => {
	const revision = "0123456789abcdef0123456789abcdef01234567";
	const outputs = await runAction(prepareRunnerImageRelease, {
		with: {
			event: "push",
			image: "ghcr.io/dedalus-labs/hollywood-runner",
			packageJson: "package.json",
			ref: "refs/heads/main",
			refName: "main",
			revision,
		},
		exec: unexpectedExec,
		fs: { readText: async () => '{"version":"1.2.3"}' },
		runner: currentRunner(),
	});

	assert.deepEqual(outputs, {
		sourceRef: "refs/heads/main",
		tags: [
			`ghcr.io/dedalus-labs/hollywood-runner:sha-${revision}`,
			"ghcr.io/dedalus-labs/hollywood-runner:edge",
		].join("\n"),
		version: `sha-${revision}`,
	});
});

test("runner image releases reject tags that disagree with package.json", async () => {
	await assert.rejects(
		runAction(prepareRunnerImageRelease, {
			with: {
				event: "release",
				image: "ghcr.io/dedalus-labs/hollywood-runner",
				packageJson: "package.json",
				ref: "refs/tags/v1.2.4",
				refName: "v1.2.4",
				revision: "0123456789abcdef0123456789abcdef01234567",
			},
			exec: unexpectedExec,
			fs: { readText: async () => '{"version":"1.2.3"}' },
			runner: currentRunner(),
		}),
		/GitHub release tag v1\.2\.4 does not match package version 1\.2\.3/,
	);
});

test("prerelease runner images omit stable aliases", async () => {
	const revision = "0123456789abcdef0123456789abcdef01234567";
	const outputs = await runAction(prepareRunnerImageRelease, {
		with: {
			event: "release",
			image: "ghcr.io/dedalus-labs/hollywood-runner",
			packageJson: "package.json",
			ref: "refs/tags/v1.3.0-rc.1",
			refName: "v1.3.0-rc.1",
			revision,
		},
		exec: unexpectedExec,
		fs: { readText: async () => '{"version":"1.3.0-rc.1"}' },
		runner: currentRunner(),
	});

	assert.equal(
		outputs.tags,
		[
			`ghcr.io/dedalus-labs/hollywood-runner:sha-${revision}`,
			"ghcr.io/dedalus-labs/hollywood-runner:1.3.0-rc.1",
		].join("\n"),
	);
});

test("published runner verification uses structured commands", async () => {
	const commands: Command[] = [];
	await runAction(verifyPublishedRunnerImage, {
		with: {
			digest: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			image: "ghcr.io/dedalus-labs/hollywood-runner",
			repository: "dedalus-labs/hollywood",
			sourceDigest: "0123456789abcdef0123456789abcdef01234567",
			sourceRef: "refs/tags/v1.2.3",
		},
		exec: async (file, args, options) => {
			commands.push({ file, args, ...options });
			return { exitCode: 0, stderr: "", stdout: "" };
		},
		fs: nodeFs,
		runner: currentRunner(),
	});

	assert.deepEqual(commands, [
		{
			file: "gh",
			args: [
				"attestation",
				"verify",
				"oci://ghcr.io/dedalus-labs/hollywood-runner@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
				"--repo",
				"dedalus-labs/hollywood",
				"--signer-workflow",
				"dedalus-labs/hollywood/.github/workflows/runner-image.yml",
				"--source-digest",
				"0123456789abcdef0123456789abcdef01234567",
				"--source-ref",
				"refs/tags/v1.2.3",
				"--bundle-from-oci",
				"--deny-self-hosted-runners",
			],
		},
		{ file: "docker", args: ["logout", "ghcr.io"] },
		{
			file: "docker",
			args: [
				"pull",
				"ghcr.io/dedalus-labs/hollywood-runner@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			],
		},
	]);
});

test("runner version verification disables diagnostic stdout", async () => {
	const commands: Command[] = [];
	await verifyRunnerVersion(async (file, args, options) => {
		commands.push({ file, args, ...options });
		return { exitCode: 0, stderr: "", stdout: `${githubActionsRunnerVersion}\n` };
	});

	assert.deepEqual(commands, [
		{
			file: "/home/runner/bin/Runner.Listener",
			args: ["--version"],
			env: { ACTIONS_RUNNER_PRINT_LOG_TO_STDOUT: "0" },
		},
	]);
	await assert.rejects(
		verifyRunnerVersion(async () => ({ exitCode: 0, stderr: "", stdout: "2.335.0\n" })),
		/Runner\.Listener version must be 2\.336\.0\. Received 2\.335\.0\./,
	);
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

const unexpectedExec = async (): Promise<never> => {
	throw new Error("exec was not expected");
};
