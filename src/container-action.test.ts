import * as assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "vitest";

import { parseActionResult, runContainerAction } from "./container-action";
import type { ContainerProvider } from "./container";

const image =
	"ghcr.io/actions/actions-runner@sha256:0cfdcc701ce933c6d243c6b0b2da767366dc9f2e99961d4c3754b0b78084cdda";

const testProvider = (): ContainerProvider | undefined => {
	const provider = process.env["HOLLYWOOD_CONTAINER_PROVIDER"];
	if (provider === undefined) {
		return undefined;
	}
	if (provider === "container" || provider === "docker" || provider === "podman") {
		return provider;
	}
	throw new Error(`unsupported test container provider: ${provider}`);
};

test("parseActionResult reads string outputs", () => {
	assert.deepEqual(parseActionResult('{"first":"one","second":""}'), {
		first: "one",
		second: "",
	});
});

test("parseActionResult rejects non-string outputs", () => {
	assert.throws(
		() => parseActionResult('{"result":1}'),
		/container action returned invalid outputs/,
	);
});

const runtimeProvider = testProvider();
const containerProviderTest = runtimeProvider === undefined ? test.skip : test;

containerProviderTest(
	"runContainerAction executes the action inside the provider",
	async () => {
		const workspace = await mkdtemp(join(process.cwd(), ".hollywood-container-action-"));
		const source = join(workspace, "inspect.ts");
		await writeFile(
			source,
			[
				'import { action, stringInput, stringOutput } from "../src/index.ts";',
				"",
				"export const inspect = action({",
				'  name: "inspect",',
				'  description: "Inspect the runner.",',
				'  inputs: { value: stringInput({ description: "Value." }) },',
				'  outputs: { observation: stringOutput({ description: "Observation." }) },',
				"  run: async ({ exec, fs, input }) => {",
				"    await exec('node', ['-e', \"require('node:fs').writeFileSync('state.txt', 'persistent\\\\n')\"]);",
				"    const workspace = (await exec('printenv', ['GITHUB_WORKSPACE'])).stdout.trim();",
				"    const state = (await fs.readText('state.txt')).trim();",
				"    return { observation: `${input.value}:${workspace}:${state}` };",
				"  },",
				"});",
				"",
			].join("\n"),
		);
		try {
			const result = await runContainerAction({
				actionRuntime: join(process.cwd(), "src/action-runtime.ts"),
				exportName: "inspect",
				image,
				provider: required(runtimeProvider),
				source,
				with: { value: "hello" },
				workspace,
			});
			assert.deepEqual(result.outputs, {
				observation: "hello:/github/workspace:persistent",
			});
		} finally {
			await rm(workspace, { force: true, recursive: true });
		}
	},
	120_000,
);

const required = <Value>(value: Value | undefined): Value => {
	assert.notEqual(value, undefined);
	return value as Value;
};
