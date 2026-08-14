import {
	and,
	defineMatrix,
	eq,
	format,
	gh,
	job,
	ne,
	or,
	selectString,
	stepOutput,
	startsWith,
	uses,
	workflow,
} from "../src/index";
import { githubActionsRunnerImage, githubActionsRunnerVersion } from "../src/container";
import {
	attestBuildProvenanceAction,
	checkoutAction,
	dockerBuildPushAction,
	dockerLoginAction,
	dockerSetupBuildxAction,
	dockerSetupQemuAction,
	setupNodeAction,
	uploadArtifactAction,
} from "./actions";
import { trustedCiRun } from "./guards";
import {
	captureRunnerProbe,
	prepareRunnerImageRelease,
	verifyPublishedRunnerImage,
	verifyRunnerImage,
	verifyRunnerProbe,
} from "./runner-image-actions";

const runnerImage = "ghcr.io/dedalus-labs/hollywood-runner";
const runnerRelease = and(
	eq(gh.github.eventName, "release"),
	startsWith(gh.github.ref, "refs/tags/runner-v"),
);
const trustedRunnerImageRun = and(
	trustedCiRun,
	or(ne(gh.github.eventName, "release"), runnerRelease),
);
const runnerImagePaths = [
	"runner/**",
	"src/container*.ts",
	"src/github-runner*.ts",
	"src/runner*.ts",
	"gha/actions.ts",
	"gha/runner-image*.ts",
	".npmrc",
	"package.json",
	"package-lock.json",
	"tsdown.config.ts",
] as const;
const runnerArchitectures = defineMatrix({ architecture: ["amd64", "arm64"] } as const);
const imageProviders = defineMatrix({
	architecture: ["amd64", "arm64"],
	provider: ["docker", "podman"],
} as const);
const runnerForArchitecture = (architecture: typeof runnerArchitectures.architecture) =>
	selectString(eq(architecture, "amd64"), "ubuntu-24.04", "ubuntu-24.04-arm");
const setupSteps = [
	{ uses: checkoutAction, with: { "persist-credentials": false } },
	{ uses: setupNodeAction, with: { "node-version": "24" } },
	{ name: "Install dependencies", run: "npm ci" },
	{ name: "Audit dependencies", run: "npm audit --audit-level=high" },
	{ name: "Verify registry signatures", run: "npm audit signatures" },
	{ name: "Build Hollywood", run: "npm run build" },
	{ name: "Build local actions", run: "npm run actions" },
] as const;

export const runnerImageWorkflow = workflow({
	name: "Runner image",
	on: {
		pull_request: { branches: ["main"], paths: runnerImagePaths },
		push: { branches: ["main"], paths: runnerImagePaths },
		release: { types: ["published"] },
		schedule: [{ cron: "17 7 * * 1" }],
		workflow_dispatch: {},
	},
	concurrency: {
		group: "runner-image-${{ github.ref }}",
		"cancel-in-progress": true,
	},
	permissions: { contents: "read" },
	jobs: {
		observe: job({
			name: "Observe (${{ matrix.architecture }})",
			if: trustedRunnerImageRun,
			"runs-on": runnerForArchitecture(runnerArchitectures.architecture),
			strategy: { matrix: runnerArchitectures },
			steps: [
				...setupSteps,
				uses(captureRunnerProbe, {
					name: "Capture runner",
					with: { output: "runner-${{ matrix.architecture }}.json" },
				}),
				uses(verifyRunnerProbe, {
					name: "Verify runner",
					with: {
						contract: "runner/contract.json",
						probe: "runner-${{ matrix.architecture }}.json",
					},
				}),
				{
					name: "Upload runner probe",
					uses: uploadArtifactAction,
					with: {
						name: "runner-${{ matrix.architecture }}",
						path: "runner-${{ matrix.architecture }}.json",
						"if-no-files-found": "error",
						"retention-days": 30,
					},
				},
			],
		}),
		verify: job({
			name: "Verify image (${{ matrix.provider }}, ${{ matrix.architecture }})",
			if: trustedRunnerImageRun,
			"runs-on": runnerForArchitecture(imageProviders.architecture),
			strategy: { "fail-fast": false, matrix: imageProviders },
			steps: [
				...setupSteps,
				uses(verifyRunnerImage, {
					name: "Verify runner image",
					with: { provider: imageProviders.provider },
				}),
			],
		}),
		publish: job({
			name: "Publish image",
			needs: ["observe", "verify"],
			if: and(
				eq(gh.github.repository, "dedalus-labs/hollywood"),
				runnerRelease,
			),
			"runs-on": "ubuntu-24.04",
			permissions: {
				attestations: "write",
				contents: "read",
				"id-token": "write",
				packages: "write",
			},
			steps: [
				...setupSteps,
				uses(prepareRunnerImageRelease, {
					id: "release",
					name: "Prepare release",
					with: {
						image: runnerImage,
						ref: gh.github.ref,
						refName: gh.github.refName,
						revision: gh.github.sha,
					},
				}),
				{
					name: "Log in to GHCR",
					uses: dockerLoginAction,
					with: {
						registry: "ghcr.io",
						username: gh.github.actor,
						password: gh.github.token,
					},
				},
				{ name: "Set up QEMU", uses: dockerSetupQemuAction },
				{ name: "Set up Buildx", uses: dockerSetupBuildxAction },
				{
					id: "build",
					name: "Build and publish",
					uses: dockerBuildPushAction,
					with: {
						context: "runner",
						file: "runner/Containerfile",
						platforms: "linux/amd64,linux/arm64",
						push: true,
						tags: stepOutput("release", "tags"),
						labels: format(
							"org.opencontainers.image.base.name={0}\norg.opencontainers.image.version={1}\nio.dedalus.hollywood.github-actions-runner.version={2}",
							githubActionsRunnerImage,
							stepOutput("release", "version"),
							githubActionsRunnerVersion,
						),
						"build-args": format("SOURCE_REVISION={0}", gh.github.sha),
						"cache-from": "type=gha,scope=runner-image-main",
						"cache-to": "type=gha,mode=max,scope=runner-image-main",
						provenance: "mode=max",
						sbom: true,
					},
				},
				{
					name: "Attest image",
					uses: attestBuildProvenanceAction,
					with: {
						"subject-name": runnerImage,
						"subject-digest": stepOutput("build", "digest"),
						"push-to-registry": true,
					},
				},
				uses(verifyPublishedRunnerImage, {
					name: "Verify publication",
					env: { GH_TOKEN: gh.github.token },
					with: {
						digest: stepOutput("build", "digest"),
						image: runnerImage,
						repository: "dedalus-labs/hollywood",
						sourceDigest: gh.github.sha,
						sourceRef: stepOutput("release", "source-ref"),
					},
				}),
			],
		}),
	},
});
