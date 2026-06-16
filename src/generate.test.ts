import * as assert from "node:assert/strict";
import { test } from "vitest";

import {
	generateActionEntrypointFile,
	generateActionFile,
	generateActionFiles,
	generateActionMetadata,
	generateUsesStep,
	generateWorkflowFile,
	job,
	localAction,
	renderActionFile,
	renderWorkflowFile,
	uses,
	workflow,
	type GitHubConcurrency,
	type GitHubWorkflowStep,
} from "./generate";
import { defineMatrix, expr } from "./expressions";
import {
	action,
	integerInput,
	pathInput,
	stringInput,
	stringOutput,
	type WorkflowInputValues,
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
	run: async () => ({ imageRef: "ghcr.io/acme/api:sha-abc123" }),
});

const pathfulPublishImage = action({
	...publishImage,
	localActionPath: "containers/publish-image",
});

const terraformPlan = localAction({
	name: "Terraform Plan",
	localActionPath: "terraform/plan",
	inputs: {
		tfDir: pathInput({ description: "Terraform working directory." }),
		varFile: pathInput({ description: "Terraform var file." }),
		extraArgs: stringInput({ description: "Additional plan args.", default: "" }),
		artifactName: stringInput({ description: "Plan artifact name." }),
	},
});

const installKubectl = localAction({
	name: "Install kubectl",
	localActionPath: "platform/install-kubectl",
	inputs: {},
});

test("generateActionMetadata emits a GitHub JavaScript action contract", () => {
	assert.deepEqual(generateActionMetadata(publishImage), {
		name: "publish-container-image",
		description: "Build and publish a container image without embedding shell in workflow YAML.",
		inputs: {
			image: { description: "Container image name, including registry.", required: true },
			tag: { description: "Container image tag.", required: true },
			context: { description: "Build context path.", required: false, default: "." },
			dockerfile: { description: "Dockerfile path.", required: false, default: "Dockerfile" },
			"build-attempt": { description: "CI build attempt number.", required: true },
		},
		outputs: {
			"image-ref": { description: "Published image reference." },
		},
		runs: { using: "node24", main: "dist/index.js" },
	});
});

test("generateActionMetadata rejects duplicate GitHub input names", () => {
	const duplicateInputs = action({
		name: "duplicate-inputs",
		description: "Reject ambiguous generated input names.",
		inputs: {
			fooBar: stringInput({ description: "Camel case input." }),
			"foo-bar": stringInput({ description: "Already kebab input." }),
		},
		outputs: {},
		run: async () => ({}),
	});

	assert.throws(
		() => generateActionMetadata(duplicateInputs),
		/duplicate GitHub input name: foo-bar/,
	);
});

test("generateActionMetadata rejects duplicate GitHub output names", () => {
	const duplicateOutputs = action({
		name: "duplicate-outputs",
		description: "Reject ambiguous generated output names.",
		inputs: {},
		outputs: {
			imageRef: stringOutput({ description: "Camel case output." }),
			"image-ref": stringOutput({ description: "Already kebab output." }),
		},
		run: async () => ({ imageRef: "", "image-ref": "" }),
	});

	assert.throws(
		() => generateActionMetadata(duplicateOutputs),
		/duplicate GitHub output name: image-ref/,
	);
});

test("generateUsesStep rejects duplicate GitHub input names", () => {
	const duplicateInputs = action({
		name: "duplicate-uses-inputs",
		description: "Reject ambiguous generated with values.",
		inputs: {
			fooBar: stringInput({ description: "Camel case input." }),
			"foo-bar": stringInput({ description: "Already kebab input." }),
		},
		outputs: {},
		run: async () => ({}),
	});

	assert.throws(
		() =>
			generateUsesStep(duplicateInputs, {
				name: "Duplicate inputs",
				uses: "./.github/actions/duplicate-uses-inputs",
				with: { fooBar: "one", "foo-bar": "two" },
			}),
		/duplicate GitHub input name: foo-bar/,
	);
});

test("generateUsesStep emits a workflow action step without run shell", () => {
	const withInputs = {
		image: "ghcr.io/acme/api",
		tag: "${{ github.sha }}",
		buildAttempt: "${{ github.run_attempt }}",
	} satisfies WorkflowInputValues<typeof publishImage.inputs>;

	assert.deepEqual(
		generateUsesStep(publishImage, {
			name: "Publish container image",
			uses: "./.github/actions/publish-container-image",
			with: withInputs,
		}),
		{
			name: "Publish container image",
			uses: "./.github/actions/publish-container-image",
			with: {
				image: "ghcr.io/acme/api",
				tag: "${{ github.sha }}",
				"build-attempt": "${{ github.run_attempt }}",
			},
		},
	);
});

test("uses derives a local workflow step from a Hollywood action path", () => {
	assert.deepEqual(
		uses(pathfulPublishImage, {
			id: "publish",
			name: "Publish container image",
			with: {
				image: "ghcr.io/acme/api",
				tag: "${{ github.sha }}",
				buildAttempt: "${{ github.run_attempt }}",
			},
		}),
		{
			id: "publish",
			name: "Publish container image",
			uses: "./.github/actions/containers/publish-image",
			with: {
				image: "ghcr.io/acme/api",
				tag: "${{ github.sha }}",
				"build-attempt": "${{ github.run_attempt }}",
			},
		},
	);
});

test("uses derives a typed step from an existing local action descriptor", () => {
	assert.deepEqual(
		uses(terraformPlan, {
			id: "plan",
			name: "Terraform Plan",
			with: {
				tfDir: "infra/terraform",
				varFile: "environments/${{ inputs.environment }}.tfvars",
				extraArgs: "-var=image_tag=${{ needs.build.outputs.image_tag }}",
				artifactName: "terraform-plan-${{ inputs.environment }}",
			},
		}),
		{
			id: "plan",
			name: "Terraform Plan",
			uses: "./.github/actions/terraform/plan",
			with: {
				"tf-dir": "infra/terraform",
				"var-file": "environments/${{ inputs.environment }}.tfvars",
				"extra-args": "-var=image_tag=${{ needs.build.outputs.image_tag }}",
				"artifact-name": "terraform-plan-${{ inputs.environment }}",
			},
		},
	);
});

test("uses omits empty with blocks", () => {
	assert.deepEqual(
		uses(installKubectl, {
			name: "Install kubectl",
		}),
		{
			name: "Install kubectl",
			uses: "./.github/actions/platform/install-kubectl",
		},
	);
});

test("uses keeps existing local action descriptors typed at workflow call sites", () => {
	if (process.env["HOLLYWOOD_TYPE_TESTS"] === "1") {
		uses(terraformPlan, {
			name: "Terraform Plan",
			// @ts-expect-error Missing required local action inputs should fail at compile time.
			with: { tfDir: "infra/terraform" },
		});
	}
	assert.ok(true);
});

test("uses rejects actions without a local action path", () => {
	assert.throws(
		() =>
			uses(publishImage, {
				name: "Publish container image",
				with: {
					image: "ghcr.io/acme/api",
					tag: "${{ github.sha }}",
					buildAttempt: "${{ github.run_attempt }}",
				},
			}),
		/localActionPath is required/,
	);
});

test("uses keeps action inputs typed at workflow call sites", () => {
	if (process.env["HOLLYWOOD_TYPE_TESTS"] === "1") {
		uses(pathfulPublishImage, {
			name: "Publish container image",
			// @ts-expect-error Missing required action inputs should fail at compile time.
			with: { image: "ghcr.io/acme/api" },
		});
	}
	assert.ok(true);
});

test("generateActionFile flattens nested script sources into .github actions", () => {
	const actionFile = generateActionFile(publishImage, {
		sourcePath: "ci/containers/publish-image.ts",
		actionsDir: ".github/actions",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
	});

	assert.equal(actionFile.sourcePath, "ci/containers/publish-image.ts");
	assert.equal(actionFile.path, ".github/actions/publish-container-image/action.yml");
	assert.equal(
		actionFile.header,
		"# @generated by Hollywood at 2026-05-14T00:00:00.000Z. Do not edit by hand.",
	);
	assert.equal(actionFile.metadata.runs.main, "dist/index.js");
	assert.equal(actionFile.metadata.runs.using, "node24");
});

test("generateActionFile uses explicit local action paths", () => {
	const actionFile = generateActionFile(pathfulPublishImage, {
		sourcePath: "ci/containers/publish-image.ts",
		actionsDir: ".github/actions",
	});

	assert.equal(actionFile.path, ".github/actions/containers/publish-image/action.yml");
});

test("generateActionFile uses stable generated headers by default", () => {
	const actionFile = generateActionFile(publishImage, {
		sourcePath: "ci/containers/publish-image.ts",
		actionsDir: ".github/actions",
	});
	const entrypoint = generateActionEntrypointFile(publishImage, {
		sourcePath: "ci/containers/publish-image.ts",
		actionsDir: ".github/actions",
		exportName: "publishImage",
	});

	assert.equal(actionFile.header, "# @generated by Hollywood. Do not edit by hand.");
	assert.equal(entrypoint.header, "// @generated by Hollywood. Do not edit by hand.");
});

test("generateActionFile preserves colocated action source directories", () => {
	const actionFile = generateActionFile(publishImage, {
		sourcePath: ".github/actions/containers/publish-image/src/action.ts",
		actionsDir: ".github/actions",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
	});

	assert.equal(actionFile.path, ".github/actions/containers/publish-image/action.yml");
	assert.equal(actionFile.metadata.name, "publish-container-image");
});

test("generateActionEntrypointFile preserves colocated action source directories", () => {
	const entrypoint = generateActionEntrypointFile(publishImage, {
		sourcePath: ".github/actions/containers/publish-image/src/action.ts",
		actionsDir: ".github/actions",
		exportName: "publishImage",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
	});

	assert.equal(entrypoint.path, ".github/actions/containers/publish-image/src/index.ts");
	assert.match(entrypoint.content, /import \{ publishImage \} from "\.\/action\.ts";/);
});

test("generateActionFile rejects mismatched explicit and colocated action paths", () => {
	const movedPublishImage = action({
		...publishImage,
		localActionPath: "containers/moved-publish-image",
	});

	assert.throws(
		() =>
			generateActionFile(movedPublishImage, {
				sourcePath: ".github/actions/containers/publish-image/src/action.ts",
				actionsDir: ".github/actions",
			}),
		/localActionPath containers\/moved-publish-image does not match colocated action directory containers\/publish-image/,
	);
});

test("generateActionFile rejects escaping explicit local action paths", () => {
	const escapingPublishImage = action({
		...publishImage,
		localActionPath: "../publish-container-image",
	});

	assert.throws(
		() =>
			generateActionFile(escapingPublishImage, {
				sourcePath: "ci/containers/publish-image.ts",
				actionsDir: ".github/actions",
			}),
		/invalid action directory: \.\.\/publish-container-image/,
	);
});

test("generateActionFile rejects escaping generated action directories", () => {
	assert.throws(
		() =>
			generateActionFile(publishImage, {
				sourcePath: ".github/actions/../publish-container-image/src/action.ts",
				actionsDir: ".github/actions",
			}),
		/invalid action directory: \.\.\/publish-container-image/,
	);
});

test("generateActionEntrypointFile wires a typed script to GitHub actions", () => {
	const entrypoint = generateActionEntrypointFile(publishImage, {
		sourcePath: "ci/containers/publish-image.ts",
		actionsDir: ".github/actions",
		exportName: "publishImage",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
	});

	assert.equal(entrypoint.sourcePath, "ci/containers/publish-image.ts");
	assert.equal(entrypoint.path, ".github/actions/publish-container-image/src/index.ts");
	assert.equal(
		entrypoint.header,
		"// @generated by Hollywood at 2026-05-14T00:00:00.000Z. Do not edit by hand.",
	);
	assert.equal(
		entrypoint.content,
		'// @generated by Hollywood at 2026-05-14T00:00:00.000Z. Do not edit by hand.\n\nimport { runGitHubAction } from "@dedalus-labs/hollywood/action-runtime";\nimport { publishImage } from "../../../../ci/containers/publish-image.ts";\n\nvoid runGitHubAction(publishImage);\n',
	);
});

test("generateActionEntrypointFile supports default action exports", () => {
	const entrypoint = generateActionEntrypointFile(publishImage, {
		sourcePath: "ci/containers/publish-image.ts",
		actionsDir: ".github/actions",
		exportName: "default",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
	});

	assert.match(entrypoint.content, /import scriptAction from/);
	assert.match(entrypoint.content, /void runGitHubAction\(scriptAction\)/);
});

test("generateActionEntrypointFile rejects invalid TypeScript export names", () => {
	assert.throws(
		() =>
			generateActionEntrypointFile(publishImage, {
				sourcePath: "ci/containers/publish-image.ts",
				actionsDir: ".github/actions",
				exportName: "publish-image",
			}),
		/invalid TypeScript export name: publish-image/,
	);
});

test("renderActionFile validates action metadata before returning YAML", () => {
	const actionFile = generateActionFile(publishImage, {
		sourcePath: "ci/containers/publish-image.ts",
		actionsDir: ".github/actions",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
	});

	const content = renderActionFile(actionFile);

	assert.match(
		content,
		/^# @generated by Hollywood at 2026-05-14T00:00:00.000Z\. Do not edit by hand\.\n\n/,
	);
	assert.match(content, /using: node24/);
});

test("renderActionFile rejects invalid generated action metadata", () => {
	const actionFile = generateActionFile(publishImage, {
		sourcePath: "ci/containers/publish-image.ts",
		actionsDir: ".github/actions",
	});

	assert.throws(
		() =>
			renderActionFile({
				...actionFile,
				metadata: {
					...actionFile.metadata,
					runs: { using: "node99", main: "dist/index.js" },
				} as never,
			}),
		/GitHub action metadata YAML is invalid/,
	);
});

test("generateActionFiles rejects duplicate flat action paths", () => {
	assert.throws(
		() =>
			generateActionFiles([
				{
					action: publishImage,
					sourcePath: "ci/containers/publish-image.ts",
					actionsDir: ".github/actions",
				},
				{
					action: publishImage,
					sourcePath: "ci/other/publish-image.ts",
					actionsDir: ".github/actions",
				},
			]),
		/duplicate generated action path: .github\/actions\/publish-container-image\/action.yml/,
	);
});

test("generateWorkflowFile flattens nested workflow sources into .github workflows", () => {
	const usesStep = generateUsesStep(publishImage, {
		name: "Publish container image",
		uses: "./.github/actions/publish-container-image",
		with: {
			image: "ghcr.io/acme/api",
			tag: "${{ github.sha }}",
			buildAttempt: "${{ github.run_attempt }}",
		},
	});

	assert.deepEqual(
		generateWorkflowFile({
			sourcePath: "ci/containers/release.ts",
			sourceRoot: "ci",
			workflowsDir: ".github/workflows",
			generatedAt: new Date("2026-05-14T00:00:00.000Z"),
			workflow: {
				name: "Container Release",
				on: { workflow_dispatch: {} },
				jobs: {
					publish_image: {
						"runs-on": "ubuntu-latest",
						steps: [usesStep],
					},
				},
			},
		}),
		{
			sourcePath: "ci/containers/release.ts",
			path: ".github/workflows/containers-release.yml",
			header: "# @generated by Hollywood at 2026-05-14T00:00:00.000Z. Do not edit by hand.",
			workflow: {
				name: "Container Release",
				on: { workflow_dispatch: {} },
				jobs: {
					publish_image: {
						"runs-on": "ubuntu-latest",
						steps: [usesStep],
					},
				},
			},
		},
	);
});

test("renderWorkflowFile validates workflow before returning YAML", () => {
	const usesStep = generateUsesStep(publishImage, {
		name: "Publish container image",
		uses: "./.github/actions/publish-container-image",
		with: {
			image: "ghcr.io/acme/api",
			tag: "${{ github.sha }}",
			buildAttempt: "${{ github.run_attempt }}",
		},
	});

	const workflowFile = generateWorkflowFile({
		sourcePath: "ci/containers/release.ts",
		sourceRoot: "ci",
		workflowsDir: ".github/workflows",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
		workflow: {
			name: "Container Release",
			on: { workflow_dispatch: {} },
			jobs: {
				publish_image: {
					"runs-on": "ubuntu-latest",
					steps: [usesStep],
				},
			},
		},
	});

	const content = renderWorkflowFile(workflowFile);

	assert.match(
		content,
		/^# @generated by Hollywood at 2026-05-14T00:00:00.000Z\. Do not edit by hand\.\n\n/,
	);
	assert.match(content, /uses: \.\/\.github\/actions\/publish-container-image/);
});

test("renderWorkflowFile supports common GitHub orchestration fields", () => {
	const build = defineMatrix({
		go: ["1.24", "1.25"],
		os: ["ubuntu-latest", "macos-latest"],
	} as const);
	const workflowFile = generateWorkflowFile({
		sourcePath: "ci/go/s3-cache.ts",
		sourceRoot: "ci",
		workflowsDir: ".github/workflows",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
		workflow: workflow({
			name: "Go S3 Cache",
			on: { workflow_dispatch: {} },
			permissions: { contents: "read", "id-token": "write" },
			concurrency: {
				group: expr("format('go-s3-cache-{0}', github.ref)"),
				queue: "max",
			},
			env: { AWS_REGION: "us-west-2" },
			jobs: {
				cache: job({
					name: "Cache Go dependencies",
					needs: ["lint", "test"],
					if: expr("always()"),
					"runs-on": build.os,
					environment: "Development",
					concurrency: {
						group: expr("format('cache-{0}-{1}', github.workflow, matrix.go)"),
						"cancel-in-progress": expr("!contains(github.ref, 'release/')"),
					},
					strategy: {
						"fail-fast": false,
						"max-parallel": 2,
						matrix: build,
					},
					services: {
						minio: {
							image: "minio/minio:latest",
							ports: ["9000:9000"],
							env: { MINIO_ROOT_USER: "hollywood" },
						},
					},
					steps: [
						{ uses: "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10" },
						{
							id: "cache",
							name: "Run cache action",
							uses: "./.github/actions/go-s3-cache",
							with: {
								mode: "restore",
								bucket: "ci-cache",
								prefix: "go",
								key: build.go,
							},
						},
					],
				}),
			},
		}),
	});

	const content = renderWorkflowFile(workflowFile);

	assert.match(content, /queue: max/);
	assert.match(content, /max-parallel: 2/);
	assert.match(content, /cancel-in-progress: \$\{\{ !contains\(github.ref, 'release\/'\) \}\}/);
	assert.match(content, /id-token: write/);
	assert.match(content, /environment: Development/);
	assert.match(content, /needs:/);
	assert.match(content, /minio:/);
	assert.match(content, /go:/);
	assert.match(content, /os:/);
	assert.match(content, /runs-on: \$\{\{ matrix.os \}\}/);
	assert.match(content, /key: \$\{\{ matrix.go \}\}/);
});

test("renderWorkflowFile supports reusable workflow jobs", () => {
	const workflowFile = generateWorkflowFile({
		sourcePath: "ci/deploy/production.ts",
		sourceRoot: "ci",
		workflowsDir: ".github/workflows",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
		workflow: workflow({
			name: "Production Deploy",
			on: { workflow_dispatch: {} },
			jobs: {
				deploy: {
					if: "${{ github.event_name != 'pull_request' }}",
					needs: ["detect"],
					uses: "./.github/workflows/terraform-flux-cd.yml",
					secrets: "inherit",
					with: {
						environment: "${{ needs.detect.outputs.environment }}",
						apply_enabled: true,
					},
				},
			},
		}),
	});

	const content = renderWorkflowFile(workflowFile);

	assert.match(content, /uses: \.\/\.github\/workflows\/terraform-flux-cd\.yml/);
	assert.match(content, /secrets: inherit/);
	assert.match(content, /apply_enabled: true/);
});

test("expr validates GitHub expression syntax before YAML generation", () => {
	assert.equal(
		expr("format('{0}-{1}', github.workflow, github.ref)"),
		"${{ format('{0}-{1}', github.workflow, github.ref) }}",
	);
	assert.throws(() => expr("github.workflow + '-' + github.ref"), /invalid GitHub expression/);
});

test("concurrency queue max cannot cancel in-progress runs", () => {
	const concurrency: GitHubConcurrency = {
		group: "deploy",
		queue: "max",
		// @ts-expect-error queue: max and cancel-in-progress describe conflicting schedulers.
		"cancel-in-progress": true,
	};
	assert.deepEqual(concurrency, {
		group: "deploy",
		queue: "max",
		"cancel-in-progress": true,
	});
});

test("workflow steps cannot be both run and uses steps", () => {
	if (process.env["HOLLYWOOD_TYPE_TESTS"] === "1") {
		// @ts-expect-error A GitHub step must choose either run or uses.
		const step: GitHubWorkflowStep = {
			name: "Invalid",
			run: "echo hi",
			uses: "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
		};
		void step;
	}
	assert.ok(true);
});

test("renderWorkflowFile rejects invalid generated workflow states", () => {
	const workflowFile = generateWorkflowFile({
		sourcePath: "ci/containers/release.ts",
		sourceRoot: "ci",
		workflowsDir: ".github/workflows",
		workflow: {
			name: "Container Release",
			on: { workflow_dispatch: {} },
			jobs: {
				publish_image: {
					steps: [
						{ name: "Publish container image", uses: "./.github/actions/publish-container-image", with: {} },
					],
				} as never,
			},
		},
	});

	assert.throws(() => renderWorkflowFile(workflowFile), /GitHub workflow YAML is invalid/);
});

test("renderWorkflowFile emits duplicate objects without YAML aliases", () => {
	const permissions = { contents: "read" } as const;
	const workflowFile = generateWorkflowFile({
		sourcePath: "ci/shared-permissions.ts",
		sourceRoot: "ci",
		workflowsDir: ".github/workflows",
		workflow: workflow({
			name: "Shared permissions",
			on: { workflow_dispatch: {} },
			jobs: {
				first: job({
					"runs-on": "ubuntu-latest",
					permissions,
					steps: [{ run: "true" }],
				}),
				second: job({
					"runs-on": "ubuntu-latest",
					permissions,
					steps: [{ run: "true" }],
				}),
			},
		}),
	});

	const content = renderWorkflowFile(workflowFile);

	assert.doesNotMatch(content, /[&*]a\d+/);
	assert.match(content, /first:/);
	assert.match(content, /second:/);
});
