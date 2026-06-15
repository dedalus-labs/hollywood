import * as assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "vitest";

import { createHollywoodCli, generate, run } from "./cli-program";

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
	const sourcePath = join(root, "ci/dcs/guest-artifacts.ts");
	const output: string[] = [];

	await writeSource(sourcePath, [
		"export const guestArtifacts = {",
		'  name: "Guest Artifacts",',
		"  on: { workflow_dispatch: {} },",
		"  jobs: {",
		"    test: {",
		'      \"runs-on\": \"ubuntu-latest\",',
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

	assert.deepEqual(output, ["created\t.github/workflows/dcs-guest-artifacts.yml\n"]);
	assert.match(
		await readFile(join(root, ".github/workflows/dcs-guest-artifacts.yml"), "utf8"),
		/name: Guest Artifacts/,
	);
});

test("generate ignores test sources matched by workflow globs", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const sourcePath = join(root, "ci/dcs/guest-artifacts.ts");
	const testPath = join(root, "ci/dcs/conditions.test.ts");
	const output: string[] = [];

	await writeSource(sourcePath, [
		"export const guestArtifacts = {",
		'  name: "Guest Artifacts",',
		"  on: { workflow_dispatch: {} },",
		"  jobs: {",
		"    test: {",
		'      \"runs-on\": \"ubuntu-latest\",',
		'      steps: [{ run: "echo ok" }],',
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

	assert.deepEqual(output, ["created\t.github/workflows/dcs-guest-artifacts.yml\n"]);
});

test("createHollywoodCli parses space-separated generate command", async () => {
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

	await createHollywoodCli({ writeOut: (message) => output.push(message) }).parseAsync([
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

test("run executes an exported action on the host", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const sourcePath = join(root, "ci/hello.ts");
	const output: string[] = [];

	await writeSource(sourcePath, [
		"export const hello = {",
		'  name: "hello",',
		'  description: "Say hello.",',
		"  inputs: { name: { kind: 'string', description: 'Name.' } },",
		"  outputs: { greeting: { description: 'Greeting.' } },",
		"  run: async ({ input }) => ({ greeting: `hello ${input.name}` }),",
		"};",
		"",
	]);

	await run(
		{
			exportName: "hello",
			inputs: ["name=Hollywood"],
			requireContainerd: false,
			requireKvm: false,
			source: sourcePath,
			startVm: false,
		},
		{ writeOut: (message) => output.push(message) },
	);

	assert.deepEqual(output, ["output\tgreeting=hello Hollywood\n"]);
});

test("run bundles source package imports before loading", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const sourcePath = join(root, "ci/hello.ts");
	const output: string[] = [];
	await writeSource(join(root, "node_modules/hello-helper/package.json"), [
		'{ "name": "hello-helper", "version": "0.0.0", "type": "module", "main": "index.js" }',
		"",
	]);
	await writeSource(join(root, "node_modules/hello-helper/index.js"), [
		"export const greeting = (name) => `hello ${name}`;",
		"",
	]);
	await writeSource(sourcePath, [
		'import { greeting } from "hello-helper";',
		"export const hello = {",
		'  name: "hello",',
		'  description: "Say hello.",',
		"  inputs: { name: { kind: 'string', description: 'Name.' } },",
		"  outputs: { greeting: { description: 'Greeting.' } },",
		"  run: async ({ input }) => ({ greeting: greeting(input.name) }),",
		"};",
		"",
	]);

	await run(
		{
			exportName: "hello",
			inputs: ["name=Hollywood"],
			requireContainerd: false,
			requireKvm: false,
			source: sourcePath,
			startVm: false,
		},
		{ writeOut: (message) => output.push(message) },
	);

	assert.deepEqual(output, ["output\tgreeting=hello Hollywood\n"]);
});

test("createHollywoodCli parses space-separated run command", async () => {
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

	await createHollywoodCli({ writeOut: (message) => output.push(message) }).parseAsync([
		"node",
		"hollywood",
		"run",
		sourcePath,
		"--with",
		"name=Hollywood",
	]);

	assert.deepEqual(output, ["output\tgreeting=hello Hollywood\n"]);
});

test("run wraps action commands in Lima when requested", async () => {
	const root = await mkdtemp(join(tmpdir(), "hollywood-cli-"));
	const sourcePath = join(root, "ci/uname.ts");
	const output: string[] = [];
	const originalPath = process.env["PATH"];
	const binDir = join(root, "bin");
	const logPath = join(root, "limactl.log");
	await mkdir(binDir, { recursive: true });
	await writeFile(
		join(binDir, "limactl"),
		[
			"#!/usr/bin/env node",
			"const fs = require('node:fs');",
			"const args = process.argv.slice(2);",
			`fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(args) + "\\n");`,
			"if (args[0] === 'list') { console.log(JSON.stringify({ name: 'kvm', status: 'Running' })); process.exit(0); }",
			"const command = args.slice(args.indexOf('--') + 1);",
			"if (command[0] === 'uname') { console.log('Linux'); process.exit(0); }",
			"if (command[0] === 'id' && command[1] === '-u') { console.log('1000'); process.exit(0); }",
			"if (command[0] === 'id' && command[1] === '-g') { console.log('1000'); process.exit(0); }",
			"process.exit(1);",
		].join("\n"),
		{ mode: 0o755 },
	);
	await writeSource(sourcePath, [
		"export const uname = {",
		'  name: "uname",',
		'  description: "Report guest OS.",',
		"  inputs: {},",
		"  outputs: { os: { description: 'OS.' }, uidGid: { description: 'Runner uid/gid.' } },",
		"  run: async ({ exec, runner }) => {",
		"    const result = await exec('uname', ['-s']);",
		"    return { os: result.stdout.trim(), uidGid: runner.uidGid };",
		"  },",
		"};",
		"",
	]);

	process.env["PATH"] = `${binDir}${process.platform === "win32" ? ";" : ":"}${originalPath ?? ""}`;
	try {
		await run(
			{
				exportName: "uname",
				inputs: [],
				lima: "kvm",
				requireContainerd: false,
				requireKvm: false,
				source: sourcePath,
				startVm: true,
			},
			{ writeOut: (message) => output.push(message) },
		);
	} finally {
		restoreEnv("PATH", originalPath);
	}

	assert.deepEqual(output, ["output\tos=Linux\n", "output\tuidGid=1000:1000\n"]);
	const commands = (await readFile(logPath, "utf8"))
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as readonly string[]);
	assert.deepEqual(commands.at(0), ["list", "--json"]);
	assert.deepEqual(commands.at(1), ["shell", "kvm", "--", "uname", "-s"]);
	assert.deepEqual(commands.at(-1), [
		"shell",
		"--tty=false",
		"--start",
		"kvm",
		"--",
		"uname",
		"-s",
	]);
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

const restoreEnv = (name: string, value: string | undefined): void => {
	if (value === undefined) {
		delete process.env[name];
		return;
	}
	process.env[name] = value;
};
