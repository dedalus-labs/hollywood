import * as assert from "node:assert/strict";
import { test } from "vitest";

import {
	action,
	booleanInput,
	integerInput,
	pathInput,
	stringInput,
	stringOutput,
	runAction,
} from "./script";

const publishImage = action({
	name: "publish-container-image",
	description: "Build and publish a container image without embedding shell in workflow YAML.",
	inputs: {
		image: stringInput({ description: "Container image name, including registry." }),
		tag: stringInput({ description: "Container image tag." }),
		context: pathInput({ description: "Build context path.", default: "." }),
		dockerfile: pathInput({ description: "Dockerfile path.", default: "Dockerfile" }),
		buildAttempt: integerInput({ description: "CI build attempt number." }),
	},
	outputs: {
		imageRef: stringOutput({ description: "Published image reference." }),
	},
	run: async ({ exec, input }) => {
		const imageRef = `${input.image}:${input.tag}`;
		await exec("docker", [
			"buildx",
			"build",
			"--file",
			input.dockerfile,
			"--tag",
			imageRef,
			"--label",
			`ci.build-attempt=${input.buildAttempt}`,
			"--push",
			input.context,
		]);
		return { imageRef };
	},
});

test("action run emits execve-shaped commands", async () => {
	const commands: unknown[] = [];
	const outputs = await publishImage.run({
		input: {
			image: "ghcr.io/acme/api",
			tag: "sha-abc123",
			context: ".",
			dockerfile: "Dockerfile",
			buildAttempt: 3,
		},
		fs: { readText: async () => "" },
		log: {
			info: () => {},
			warning: () => {},
			group: async (_name, run) => run(),
		},
		call: async () => {
			throw new Error("unexpected child action call");
		},
		exec: async (file, args, options) => {
			commands.push({ file, args, ...options });
			return { exitCode: 0, stdout: "", stderr: "" };
		},
		runner: { uidGid: "1001:1001" },
	});

	assert.deepEqual(commands, [
		{
			file: "docker",
			args: [
				"buildx",
				"build",
				"--file",
				"Dockerfile",
				"--tag",
				"ghcr.io/acme/api:sha-abc123",
				"--label",
				"ci.build-attempt=3",
				"--push",
				".",
			],
		},
	]);
	assert.deepEqual(outputs, { imageRef: "ghcr.io/acme/api:sha-abc123" });
});

test("runAction binds workflow string inputs into typed script inputs", async () => {
	const commands: unknown[] = [];
	const outputs = await runAction(publishImage, {
		with: {
			image: "ghcr.io/acme/api",
			tag: "sha-abc123",
			buildAttempt: "3",
		},
		fs: { readText: async () => "" },
		exec: async (file, args, options) => {
			commands.push({ file, args, ...options });
			return { exitCode: 0, stdout: "", stderr: "" };
		},
		runner: { uidGid: "1001:1001" },
	});

	assert.equal(commands.length, 1);
	assert.deepEqual(outputs, { imageRef: "ghcr.io/acme/api:sha-abc123" });
});

test("runAction rejects invalid integer workflow inputs", async () => {
	await assert.rejects(
		() =>
			runAction(publishImage, {
				with: {
					image: "ghcr.io/acme/api",
					tag: "sha-abc123",
					buildAttempt: "a lot",
				},
				fs: { readText: async () => "" },
				exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
				runner: { uidGid: "1001:1001" },
			}),
		/buildAttempt must be an integer/,
	);
});

test("runAction rejects blank integer workflow inputs", async () => {
	await assert.rejects(
		() =>
			runAction(publishImage, {
				with: {
					image: "ghcr.io/acme/api",
					tag: "sha-abc123",
					buildAttempt: "",
				},
				fs: { readText: async () => "" },
				exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
				runner: { uidGid: "1001:1001" },
			}),
		/buildAttempt is required/,
	);
});

test("runAction rejects blank required workflow inputs", async () => {
	await assert.rejects(
		() =>
			runAction(publishImage, {
				with: {
					image: "   ",
					tag: "sha-abc123",
					buildAttempt: "3",
				},
				fs: { readText: async () => "" },
				exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
				runner: { uidGid: "1001:1001" },
			}),
		/image is required/,
	);
});

test("runAction uses defaults for blank optional workflow inputs", async () => {
	const outputs = await runAction(publishImage, {
		with: {
			image: "ghcr.io/acme/api",
			tag: "sha-abc123",
			context: "",
			buildAttempt: "3",
		},
		fs: { readText: async () => "" },
		exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
		runner: { uidGid: "1001:1001" },
	});

	assert.equal(outputs.imageRef, "ghcr.io/acme/api:sha-abc123");
});

test("runAction rejects unknown workflow inputs", async () => {
	await assert.rejects(
		() =>
			runAction(publishImage, {
				with: {
					image: "ghcr.io/acme/api",
					tag: "sha-abc123",
					buildAttempt: "3",
					unused: "silently accepting this would hide workflow drift",
				} as never,
				fs: { readText: async () => "" },
				exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
				runner: { uidGid: "1001:1001" },
			}),
		/unknown input: unused/,
	);
});

test("input helpers type-check default literals", () => {
	assert.equal(booleanInput({ description: "Boolean default.", default: "true" }).default, "true");
	assert.equal(integerInput({ description: "Integer default.", default: "42" }).default, "42");

	if (process.env["HOLLYWOOD_TYPE_TESTS"] === "1") {
		// @ts-expect-error Boolean defaults must be GitHub boolean strings.
		booleanInput({ description: "Invalid boolean default.", default: "yes" });
		// @ts-expect-error Integer defaults must be integer strings.
		integerInput({ description: "Invalid integer default.", default: "1.5" });
	}
});

test("runAction binds strict boolean workflow inputs", async () => {
	const deploy = action({
		name: "deploy",
		description: "Deploy with an explicit publish flag.",
		inputs: {
			publish: booleanInput({ description: "Publish artifacts." }),
			dryRun: booleanInput({ description: "Skip writes.", default: "false" }),
		},
		outputs: {
			mode: stringOutput({ description: "Resolved mode." }),
		},
		run: async ({ input }) => ({
			mode: `${input.publish ? "publish" : "skip"}:${input.dryRun ? "dry" : "write"}`,
		}),
	});

	assert.deepEqual(
		await runAction(deploy, {
			with: { publish: "true" },
			fs: { readText: async () => "" },
			exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
			runner: { uidGid: "1001:1001" },
		}),
		{ mode: "publish:write" },
	);
	assert.deepEqual(
		await runAction(deploy, {
			with: { publish: "false", dryRun: "true" },
			fs: { readText: async () => "" },
			exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
			runner: { uidGid: "1001:1001" },
		}),
		{ mode: "skip:dry" },
	);
	await assert.rejects(
		() =>
			runAction(deploy, {
				with: { publish: "yes" },
				fs: { readText: async () => "" },
				exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
				runner: { uidGid: "1001:1001" },
			}),
		/publish must be true or false/,
	);
});
