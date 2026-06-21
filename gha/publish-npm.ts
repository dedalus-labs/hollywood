import { action, booleanInput, job, pathInput, workflow, type ScriptExec } from "../src/index";
import { checkHollywoodStateCommand, checkoutAction, setupNodeAction } from "./actions";

export const publishNpmPackage = action({
	name: "Publish npm package",
	description: "Publish the package with the correct npm dist-tag.",
	localActionPath: "publish-npm",
	inputs: {
		packageJson: pathInput({ description: "Path to package.json.", default: "package.json" }),
		dryRun: booleanInput({ description: "Run npm publish without mutating the registry.", default: "false" }),
	},
	outputs: {},
	run: async ({ exec, fs, input }) => {
		const packageJson = JSON.parse(await fs.readText(input.packageJson)) as unknown;
		const packageName = requiredString(recordField(packageJson, "name"), "package.json name");
		const version = requiredString(recordField(packageJson, "version"), "package.json version");
		const prereleaseTag = prereleaseName(version);
		const latestVersion = await npmLatestVersion(exec, packageName);
		const tag =
			prereleaseTag !== undefined &&
			latestVersion !== undefined &&
			prereleaseName(latestVersion) === undefined
				? prereleaseTag
				: "latest";

		await exec("npm", [
			"publish",
			"--access",
			"public",
			"--tag",
			tag,
			"--provenance",
			...(input.dryRun ? ["--dry-run"] : []),
		]);

		if (prereleaseTag !== undefined && tag === "latest" && !input.dryRun) {
			await exec("npm", ["dist-tag", "add", `${packageName}@${version}`, prereleaseTag]);
		}

		return {};
	},
});

export const publishNpm = workflow({
	name: "Publish NPM",
	on: {
		workflow_dispatch: {},
		release: { types: ["published"] },
	},
	permissions: { contents: "read" },
	jobs: {
		publish: job({
			name: "Publish",
			if: "github.repository == 'dedalus-labs/hollywood'",
			"runs-on": "ubuntu-latest",
			permissions: {
				contents: "read",
				"id-token": "write",
			},
			environment: {
				name: "npm",
				url: "https://www.npmjs.com/package/@dedalus-labs/hollywood",
			},
			steps: [
				{
					uses: checkoutAction,
					with: {
						ref: "${{ github.event.release.tag_name || github.ref }}",
						"persist-credentials": false,
					},
				},
				{
					uses: setupNodeAction,
					with: {
						"node-version": "24",
						"registry-url": "https://registry.npmjs.org",
					},
				},
				{ name: "Install dependencies", run: "npm ci" },
				{ name: "Lint", run: "npm run lint" },
				{ name: "Typecheck", run: "npm run typecheck" },
				{ name: "Test", run: "npm test" },
				{ name: "Build", run: "npm run build" },
				{ name: "Check Hollywood state", run: checkHollywoodStateCommand },
				{
					name: "Publish to npm",
					run: "node dist/cli.js run gha/publish-npm.ts --export publishNpmPackage",
				},
			],
		}),
	},
});

const npmLatestVersion = async (exec: ScriptExec, name: string): Promise<string | undefined> => {
	const result = await exec("npm", ["view", name, "version", "--json"], { exitPolicy: "any" });
	if (result.exitCode !== 0) {
		if (result.stderr.includes("E404")) {
			return undefined;
		}
		throw new Error(result.stderr || `npm view ${name} failed`);
	}
	const version = JSON.parse(result.stdout) as unknown;
	return requiredString(version, `npm ${name} latest version`);
};

const requiredString = (value: unknown, name: string): string => {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${name} is required`);
	}
	return value;
};

const recordField = (value: unknown, key: string): unknown => {
	if (value === null || typeof value !== "object") {
		return undefined;
	}
	return (value as Record<string, unknown>)[key];
};

const prereleaseName = (value: string): string | undefined => {
	const match = /^\d+\.\d+\.\d+-([0-9A-Za-z-]+)/.exec(value);
	return match?.[1];
};
