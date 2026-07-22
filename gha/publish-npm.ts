import { action, booleanInput, job, pathInput, stringInput, uses, workflow } from "../src/index";
import {
	checkHollywoodStateCommand,
	checkoutAction,
	createGitHubAppTokenAction,
	setupNodeAction,
} from "./actions";

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

export const createGitHubRelease = action({
	name: "Create GitHub release",
	description: "Create the GitHub release after npm publication succeeds.",
	localActionPath: "create-github-release",
	inputs: {
		packageJson: pathInput({ description: "Path to package.json.", default: "package.json" }),
		repository: stringInput({ description: "GitHub owner/repository name." }),
		target: stringInput({ description: "Git commit to tag." }),
		token: stringInput({ description: "GitHub token with release permissions." }),
	},
	outputs: {},
	run: async ({ exec, fs, input }) => {
		const packageJson = JSON.parse(await fs.readText(input.packageJson)) as unknown;
		const version = requiredString(recordField(packageJson, "version"), "package.json version");
		const prerelease = publishTagForVersion(version) !== "latest";
		const tag = `v${version}`;

		await exec(
			"gh",
			[
				"release",
				"create",
				tag,
				"--repo",
				input.repository,
				"--target",
				input.target,
				"--title",
				tag,
				"--generate-notes",
				...(prerelease ? ["--prerelease"] : []),
			],
			{ env: { GH_TOKEN: input.token } },
		);

		return {};
	},
});

export const publishNpm = workflow({
	name: "Publish NPM",
	on: {
		push: { branches: ["main"], paths: [".release-please-manifest.json"] },
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
				{ name: "Build local actions", run: "npm run actions" },
				{ name: "Check Hollywood state", run: checkHollywoodStateCommand },
				uses(publishNpmPackage, { name: "Publish to npm" }),
			],
		}),
		release: job({
			name: "Create GitHub Release",
			needs: "publish",
			if: "github.repository == 'dedalus-labs/hollywood'",
			"runs-on": "ubuntu-latest",
			permissions: { contents: "read" },
			steps: [
				{ uses: checkoutAction, with: { "persist-credentials": false } },
				{ uses: setupNodeAction, with: { "node-version": "24" } },
				{ name: "Install dependencies", run: "npm ci" },
				{ name: "Build Hollywood", run: "npm run build" },
				{ name: "Build local actions", run: "npm run actions" },
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
						"permission-metadata": "read",
					},
				},
				uses(createGitHubRelease, {
					name: "Create GitHub release",
					with: {
						repository: "${{ github.repository }}",
						target: "${{ github.sha }}",
						token: "${{ steps.cind-token.outputs.token }}",
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
