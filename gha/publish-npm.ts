import {
	action,
	always,
	and,
	booleanInput,
	eq,
	gh,
	GitHubJobResult,
	job,
	needsOutput,
	needsResultIn,
	needsResultIs,
	pathInput,
	stepOutput,
	uses,
	workflow,
} from "../src/index";
import {
	buildHollywoodCommand,
	buildLocalActionsCommand,
	checkHollywoodStateCommand,
	checkoutAction,
	createGitHubAppTokenAction,
	installDependenciesCommand,
	lintCommand,
	releasePleaseAction,
	setupNodeAction,
	testCommand,
	typecheckCommand,
} from "./actions";
import { detectReleaseComponents, publishDraftReleases } from "./release-actions";

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
		const version = requiredString(recordField(packageJson, "version"), "package.json version");
		const tag = publishTagForVersion(version);

		await exec("npm", [
			"publish",
			"--access",
			"public",
			"--tag",
			tag,
			"--provenance",
			...(input.dryRun ? ["--dry-run"] : []),
		]);

		return {};
	},
});

export const publishNpm = workflow({
	name: "Publish release",
	on: {
		push: { branches: ["main"], paths: [".release-please-manifest.json"] },
		workflow_dispatch: {},
	},
	permissions: { contents: "read" },
	jobs: {
		detect: job({
			name: "Detect release components",
			"runs-on": "ubuntu-latest",
			outputs: {
				hollywood: stepOutput("components", "hollywood"),
				"hollywood-tag": stepOutput("components", "hollywood-tag"),
				runner: stepOutput("components", "runner"),
				"runner-tag": stepOutput("components", "runner-tag"),
			},
			steps: [
				{
					uses: checkoutAction,
					with: {
						"fetch-depth": 0,
						"persist-credentials": false,
					},
				},
				{ uses: setupNodeAction, with: { "node-version": "24" } },
				{ name: "Install dependencies", run: installDependenciesCommand },
				{ name: "Build Hollywood", run: buildHollywoodCommand },
				{ name: "Build local actions", run: buildLocalActionsCommand },
				uses(detectReleaseComponents, {
					id: "components",
					name: "Detect components",
					with: {
						before: gh.github.event.before,
						current: gh.github.sha,
					},
				}),
			],
		}),
		publish: job({
			name: "Publish",
			needs: "detect",
			if: and(
				eq(gh.github.repository, "dedalus-labs/hollywood"),
				eq(needsOutput("detect", "hollywood"), "true"),
			),
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
				{ name: "Install dependencies", run: installDependenciesCommand },
				{ name: "Lint", run: lintCommand },
				{ name: "Typecheck", run: typecheckCommand },
				{ name: "Test", run: testCommand },
				{ name: "Build", run: buildHollywoodCommand },
				{ name: "Build local actions", run: buildLocalActionsCommand },
				{ name: "Check Hollywood state", run: checkHollywoodStateCommand },
				uses(publishNpmPackage, { name: "Publish to npm" }),
			],
		}),
		release: job({
			name: "Create GitHub Release",
			needs: ["detect", "publish"],
			if: and(
				always(),
				eq(gh.github.repository, "dedalus-labs/hollywood"),
				needsResultIs("detect", GitHubJobResult.Success),
				needsResultIn("publish", [GitHubJobResult.Success, GitHubJobResult.Skipped]),
			),
			"runs-on": "ubuntu-latest",
			permissions: { contents: "read" },
			steps: [
				{ uses: checkoutAction, with: { "persist-credentials": false } },
				{ uses: setupNodeAction, with: { "node-version": "24" } },
				{ name: "Install dependencies", run: installDependenciesCommand },
				{ name: "Build Hollywood", run: buildHollywoodCommand },
				{ name: "Build local actions", run: buildLocalActionsCommand },
				{
					id: "cind-token",
					name: "Create Cind app token",
					uses: createGitHubAppTokenAction,
					with: {
						"client-id": "${{ secrets.CIND_BOT_CLIENT_ID }}",
						"private-key": "${{ secrets.CIND_BOT_APP_PRIVATE_KEY }}",
						owner: "${{ github.repository_owner }}",
						repositories: "hollywood",
						"permission-contents": "write",
						"permission-issues": "write",
						"permission-metadata": "read",
						"permission-pull-requests": "write",
					},
				},
				{
					id: "release",
					name: "Create draft releases",
					uses: releasePleaseAction,
					with: {
						token: "${{ steps.cind-token.outputs.token }}",
						"config-file": "release-please-config.json",
						"manifest-file": ".release-please-manifest.json",
						"skip-github-pull-request": "true",
					},
				},
				uses(publishDraftReleases, {
					name: "Publish immutable releases",
					with: {
						hollywoodTag: needsOutput("detect", "hollywood-tag"),
						repository: gh.github.repository,
						runnerTag: needsOutput("detect", "runner-tag"),
						token: stepOutput("cind-token", "token"),
					},
				}),
			],
		}),
	},
});

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

const publishTagForVersion = (version: string): string => {
	const match = /^\d+\.\d+\.\d+(?:-([0-9A-Za-z-]+)(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
	if (match === null) {
		throw new Error(`package.json version must be semver: ${version}`);
	}
	const prereleaseTag = match[1];
	if (prereleaseTag === undefined) {
		return "latest";
	}
	if (/^\d+$/.test(prereleaseTag)) {
		throw new Error(`npm prerelease dist-tag must not be numeric: ${prereleaseTag}`);
	}
	return prereleaseTag;
};
