import * as assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "vitest";

import { buildActions, check, createCli, generate } from "./commands";
import { GeneratedFilePathCollisionError } from "./files";

const runnerImage = `ghcr.io/example/runner@sha256:${"a".repeat(64)}`;

test("generate discovers exported actions from source files", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const sourcePath = join(root, "ci/hello.ts");
	const output: string[] = [];

	await writeSource(sourcePath, [
		"export const helloAction = {",
		'  name: "hello",',
		'  description: "Say hello.",',
		"  inputs: {},",
		"  outputs: {},",
		"  run: async () => ({}),",
		"};",
		"",
	]);

	await generate(
		{
			actionsDir: ".github/actions",
			output: root,
			sourceRoot: "ci",
			sources: [sourcePath],
			workflowsDir: ".github/workflows",
		},
		{ writeOut: (message) => output.push(message) },
	);

	assert.deepEqual(output, [
		"created\t.github/actions/hello/action.yml\n",
		"created\t.github/actions/hello/src/index.ts\n",
	]);
	assert.match(
		await readFile(join(root, ".github/actions/hello/action.yml"), "utf8"),
		/name: hello/,
	);
	assert.match(
		await readFile(join(root, ".github/actions/hello/src/index.ts"), "utf8"),
		/import { helloAction } from "..\/..\/..\/..\/ci\/hello.ts";/,
	);
});

test("generate discovers exported workflows from globbed source files", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const sourcePath = join(root, "ci/containers/release.ts");
	const output: string[] = [];

	await writeSource(sourcePath, [
		"export const containerRelease = {",
		'  name: "Container Release",',
		"  on: { workflow_dispatch: {} },",
		"  jobs: {",
		"    test: {",
		'      "runs-on": "ubuntu-latest",',
		'      steps: [{ name: "Hello", uses: "./.github/actions/hello", with: {} }],',
		"    },",
		"  },",
		"};",
		"",
	]);

	await generate(
		{
			actionsDir: ".github/actions",
			output: root,
			sourceRoot: "ci",
			sources: [join(root, "ci/**/*.ts")],
			workflowsDir: ".github/workflows",
		},
		{ writeOut: (message) => output.push(message) },
	);

	assert.deepEqual(output, ["created\t.github/workflows/containers-release.yml\n"]);
	assert.match(
		await readFile(join(root, ".github/workflows/containers-release.yml"), "utf8"),
		/name: Container Release/,
	);
});

test("generate rejects case-insensitive workflow filename collisions before writing", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const cdSource = join(root, "automation/cd/release.ts");
	const ciSource = join(root, "automation/ci/release.ts");
	await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), "dir");

	const source = (name: string, filename: string): readonly string[] => [
		'import { workflow } from "@dedalus-labs/hollywood";',
		`export const release = workflow({ name: "${name}", on: { push: {} }, jobs: {} },`,
		`  { filename: "${filename}" });`,
		"",
	];
	await writeSource(cdSource, source("Release", "release.yml"));
	await writeSource(ciSource, source("Verify release", "RELEASE.yml"));

	await assert.rejects(
		() =>
			generate(
				{
					actionsDir: ".github/actions",
					output: root,
					sourceRoot: "automation",
					sources: [join(root, "automation/**/*.ts")],
					workflowsDir: ".github/workflows",
				},
				{ writeOut: () => {} },
			),
		(error: unknown) =>
			error instanceof GeneratedFilePathCollisionError &&
			/generated file path collision: .*release\.yml.*automation\/cd\/release\.ts#release.*automation\/ci\/release\.ts#release/is.test(
				error.message,
			),
	);
	await assert.rejects(() => readFile(join(root, ".github/workflows/release.yml"), "utf8"), {
		code: "ENOENT",
	});
});

test("generate ignores test sources matched by workflow globs", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const sourcePath = join(root, "ci/containers/release.ts");
	const testPath = join(root, "ci/containers/conditions.test.ts");
	const output: string[] = [];

	await writeSource(sourcePath, [
		`import { command } from ${JSON.stringify(join(process.cwd(), "src/index.ts"))};`,
		"",
		"export const containerRelease = {",
		'  name: "Container Release",',
		"  on: { workflow_dispatch: {} },",
		"  jobs: {",
		"    test: {",
		'      "runs-on": "ubuntu-latest",',
		'      steps: [{ run: command({ file: "echo", args: ["ok"] }) }],',
		"    },",
		"  },",
		"};",
		"",
	]);
	await writeSource(testPath, [
		'import { test } from "vitest";',
		'test("not a workflow source", () => {});',
		"",
	]);

	await generate(
		{
			actionsDir: ".github/actions",
			output: root,
			sourceRoot: "ci",
			sources: [join(root, "ci/**/*.ts")],
			workflowsDir: ".github/workflows",
		},
		{ writeOut: (message) => output.push(message) },
	);

	assert.deepEqual(output, ["created\t.github/workflows/containers-release.yml\n"]);
});

test("createCli parses space-separated generate command", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const sourcePath = join(root, "ci/hello.ts");
	const output: string[] = [];

	await writeSource(sourcePath, [
		"export default {",
		'  name: "hello",',
		'  description: "Say hello.",',
		"  inputs: {},",
		"  outputs: {},",
		"  run: async () => ({}),",
		"};",
		"",
	]);

	await createCli({ writeOut: (message) => output.push(message) }).parseAsync([
		"node",
		"hollywood",
		"generate",
		sourcePath,
		"--output",
		root,
	]);

	assert.deepEqual(output, [
		"created\t.github/actions/hello/action.yml\n",
		"created\t.github/actions/hello/src/index.ts\n",
	]);
	assert.match(
		await readFile(join(root, ".github/actions/hello/src/index.ts"), "utf8"),
		/import scriptAction from "..\/..\/..\/..\/ci\/hello.ts";/,
	);
});

test("createCli generates inferred source root when sources are omitted", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const sourcePath = join(root, "ci/hello.ts");
	const output: string[] = [];

	await writeSource(sourcePath, [
		"export default {",
		'  name: "hello",',
		'  description: "Say hello.",',
		"  inputs: {},",
		"  outputs: {},",
		"  run: async () => ({}),",
		"};",
		"",
	]);

	await createCli({ writeOut: (message) => output.push(message) }).parseAsync([
		"node",
		"hollywood",
		"generate",
		"--output",
		root,
	]);

	assert.deepEqual(output, [
		"created\t.github/actions/hello/action.yml\n",
		"created\t.github/actions/hello/src/index.ts\n",
	]);
});

test("generate uses tsconfig root alias for action entrypoints", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const sourcePath = join(root, "ci/hello.ts");

	await writeSource(join(root, "tsconfig.json"), [
		"{",
		'  "compilerOptions": {',
		'    "paths": {',
		'      "@/*": ["./*"]',
		"    }",
		"  }",
		"}",
		"",
	]);
	await writeSource(sourcePath, [
		"export const helloAction = {",
		'  name: "hello",',
		'  description: "Say hello.",',
		"  inputs: {},",
		"  outputs: {},",
		"  run: async () => ({}),",
		"};",
		"",
	]);

	await generate(
		{
			actionsDir: ".github/actions",
			output: root,
			sourceRoot: "ci",
			sources: [sourcePath],
			workflowsDir: ".github/workflows",
		},
		{ writeOut: () => {} },
	);

	assert.match(
		await readFile(join(root, ".github/actions/hello/src/index.ts"), "utf8"),
		/import { helloAction } from "@\/ci\/hello.ts";/,
	);
});

test("createCli passes root import aliases to generated action entrypoints", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const sourcePath = join(root, "ci/hello.ts");

	await writeSource(sourcePath, [
		"export default {",
		'  name: "hello",',
		'  description: "Say hello.",',
		"  inputs: {},",
		"  outputs: {},",
		"  run: async () => ({}),",
		"};",
		"",
	]);

	await createCli({ writeOut: () => {} }).parseAsync([
		"node",
		"hollywood",
		"generate",
		sourcePath,
		"--output",
		root,
		"--root-import-alias",
		"@",
	]);

	assert.match(
		await readFile(join(root, ".github/actions/hello/src/index.ts"), "utf8"),
		/import scriptAction from "@\/ci\/hello.ts";/,
	);
});

test("createCli parses space-separated run command", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const sourcePath = join(root, "ci/hello.ts");
	const output: string[] = [];

	await writeSource(sourcePath, [
		"export default {",
		'  name: "hello",',
		'  description: "Say hello.",',
		"  inputs: { name: { kind: 'string', description: 'Name.' } },",
		"  outputs: { greeting: { description: 'Greeting.' } },",
		"  run: async ({ input }) => ({ greeting: `hello ${input.name}` }),",
		"};",
		"",
	]);

	await createCli(
		{ writeOut: (message) => output.push(message) },
		{
			run: async (options, io) => {
				assert.equal(options.exportName, "default");
				assert.equal(options.provider, "docker");
				assert.equal(options.image, runnerImage);
				assert.deepEqual(options.inputs, ["name=Hollywood"]);
				io.writeOut("parsed\n");
			},
		},
	).parseAsync([
		"node",
		"hollywood",
		"run",
		sourcePath,
		"--export",
		"default",
		"--provider",
		"docker",
		"--image",
		runnerImage,
		"--with",
		"name=Hollywood",
	]);

	assert.deepEqual(output, ["parsed\n"]);
});

test("check accepts pinned workflows", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const output: string[] = [];
	await writeSource(join(root, ".github/workflows/ci.yml"), [
		"name: CI",
		"on: push",
		"jobs:",
		"  test:",
		"    runs-on: ubuntu-latest",
		"    steps:",
		"      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
		"",
	]);

	await check(
		{
			generated: false,
			output: root,
			sourceRoot: "ci",
			workflowSecurity: true,
			workflowsDir: ".github/workflows",
		},
		{ writeOut: (message) => output.push(message) },
	);

	assert.deepEqual(output, ["ok\tworkflow security\n"]);
});

test("check rejects mutable workflow actions", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	await writeSource(join(root, ".github/workflows/ci.yml"), [
		"name: CI",
		"on: push",
		"jobs:",
		"  test:",
		"    runs-on: ubuntu-latest",
		"    steps:",
		"      - uses: actions/checkout@v6",
		"",
	]);

	await assert.rejects(
		() =>
			check(
				{
					generated: false,
					output: root,
					sourceRoot: "ci",
					workflowSecurity: true,
					workflowsDir: ".github/workflows",
				},
				{ writeOut: () => {} },
			),
		/mutable action references/,
	);
});

test("check rejects handwritten workflow yaml", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	await writeWorkflowSource(root);
	await writeSource(join(root, ".github/workflows/manual.yml"), [
		"name: Manual",
		"on: push",
		"jobs: {}",
		"",
	]);

	await assert.rejects(
		() =>
			check(
				{
					generated: true,
					output: root,
					sourceRoot: "ci",
					workflowSecurity: false,
					workflowsDir: ".github/workflows",
				},
				{ writeOut: () => {} },
			),
		/handwritten GitHub Actions YAML found\n.*\.github\/workflows\/manual\.yml/s,
	);
});

test("check rejects handwritten local action metadata", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	await writeWorkflowSource(root);
	await writeSource(join(root, ".github/actions/manual/action.yml"), [
		"name: Manual",
		"description: Handwritten local action.",
		"runs:",
		"  using: node24",
		"  main: dist/index.js",
		"",
	]);

	await assert.rejects(
		() =>
			check(
				{
					generated: true,
					output: root,
					sourceRoot: "ci",
					workflowSecurity: false,
					workflowsDir: ".github/workflows",
				},
				{ writeOut: () => {} },
			),
		/handwritten GitHub Actions YAML found\n.*\.github\/actions\/manual\/action\.yml/s,
	);
});

test("createCli parses space-separated check command", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const output: string[] = [];
	await writeSource(join(root, ".github/workflows/ci.yml"), [
		"name: CI",
		"on: push",
		"jobs:",
		"  test:",
		"    runs-on: ubuntu-latest",
		"    steps:",
		"      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
		"",
	]);

	await createCli({ writeOut: (message) => output.push(message) }).parseAsync([
		"node",
		"hollywood",
		"check",
		"--workflow-security",
		"--output",
		root,
	]);

	assert.deepEqual(output, ["ok\tworkflow security\n"]);
});

test("buildActions bundles generated action entrypoints", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const output: string[] = [];
	await writeSource(join(root, ".github/actions/hello/src/index.ts"), [
		'console.log("hello action");',
		"",
	]);

	await buildActions(
		{
			actionsDir: ".github/actions",
			output: root,
			target: "node24",
		},
		{ writeOut: (message) => output.push(message) },
	);

	assert.deepEqual(output, ["built\t.github/actions/hello/dist/index.js\n"]);
	assert.match(
		await readFile(join(root, ".github/actions/hello/dist/index.js"), "utf8"),
		/hello action/,
	);
});

test("createCli parses space-separated build command", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const output: string[] = [];
	await writeSource(join(root, ".github/actions/hello/src/index.ts"), [
		'console.log("hello action");',
		"",
	]);

	await createCli({ writeOut: (message) => output.push(message) }).parseAsync([
		"node",
		"hollywood",
		"build",
		"--actions-dir",
		".github/actions",
		"--output",
		root,
		"--target",
		"node24",
	]);

	assert.deepEqual(output, ["built\t.github/actions/hello/dist/index.js\n"]);
	assert.match(
		await readFile(join(root, ".github/actions/hello/dist/index.js"), "utf8"),
		/hello action/,
	);
});

test("generate rejects patterns that match no files", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));

	await assert.rejects(
		() =>
			generate(
				{
					actionsDir: ".github/actions",
					output: root,
					sourceRoot: "ci",
					sources: [join(root, "ci/**/*.ts")],
					workflowsDir: ".github/workflows",
				},
				{ writeOut: () => {} },
			),
		{ message: `source pattern matched no files: ${join(root, "ci/**/*.ts")}` },
	);
});

test("generate rejects sources without Hollywood exports", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const sourcePath = join(root, "ci/helper.ts");

	await writeSource(sourcePath, ["export const helper = 1;", ""]);

	await assert.rejects(
		() =>
			generate(
				{
					actionsDir: ".github/actions",
					output: root,
					sourceRoot: "ci",
					sources: [sourcePath],
					workflowsDir: ".github/workflows",
				},
				{ writeOut: () => {} },
			),
		new RegExp(`no Hollywood actions or workflows exported by: ${sourcePath}`),
	);
});

const writeSource = async (path: string, lines: readonly string[]): Promise<void> => {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, lines.join("\n"), { flag: "w" });
};

const writeWorkflowSource = async (root: string): Promise<void> => {
	await writeSource(join(root, "ci/ci.ts"), [
		`import { command } from ${JSON.stringify(join(process.cwd(), "src/index.ts"))};`,
		"",
		"export const ci = {",
		'  name: "CI",',
		"  on: { push: {} },",
		"  jobs: {",
		"    test: {",
		'      "runs-on": "ubuntu-latest",',
		"      steps: [{ run: command({ file: 'echo', args: ['ok'] }) }],",
		"    },",
		"  },",
		"};",
		"",
	]);
};
