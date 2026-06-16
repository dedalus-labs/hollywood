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

const bakeSnapshot = action({
	name: "dcs-package-artifact",
	description: "Run artifact-pack without embedding shell in workflow YAML.",
	inputs: {
		toolBinary: pathInput({ description: "Path to artifact-packager." }),
		kernel: pathInput({ description: "Path to guest vmlinux." }),
		rootfs: pathInput({ description: "Path to mutable rootfs.raw." }),
		output: pathInput({ description: "Snapshot output directory." }),
		memoryMibMax: integerInput({ description: "Maximum guest memory in MiB." }),
		maxVcpus: integerInput({ description: "Maximum vCPU count." }),
		imageName: stringInput({ description: "Guest image name.", default: "noble" }),
		rootfsVersionFile: pathInput({
			description: "File containing the guest rootfs version.",
			default: "/tmp/guest/rootfs-version",
		}),
		epoch0Dir: pathInput({ description: "Epoch0 output directory.", default: "/tmp/epoch0" }),
		lsvdBlkBinary: pathInput({
			description: "Path to dm-lsvd-blk.",
			default: "/usr/local/bin/dm-lsvd-blk",
		}),
	},
	outputs: {
		snapshotDir: stringOutput({ description: "Snapshot output directory." }),
		templatesDir: stringOutput({ description: "Upper template output directory." }),
		epoch0Dir: stringOutput({ description: "Epoch0 output directory." }),
	},
	run: async () => ({
		snapshotDir: "/tmp/snapshot",
		templatesDir: "/tmp/templates",
		epoch0Dir: "/tmp/epoch0",
	}),
});

const pathfulBakeSnapshot = action({
	...bakeSnapshot,
	localActionPath: "dcs/dm/package-artifact",
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
	assert.deepEqual(generateActionMetadata(bakeSnapshot), {
		name: "dcs-package-artifact",
		description: "Run artifact-pack without embedding shell in workflow YAML.",
		inputs: {
			"tool-binary": { description: "Path to artifact-packager.", required: true },
			kernel: { description: "Path to guest vmlinux.", required: true },
			rootfs: { description: "Path to mutable rootfs.raw.", required: true },
			output: { description: "Snapshot output directory.", required: true },
			"memory-mib-max": { description: "Maximum guest memory in MiB.", required: true },
			"max-vcpus": { description: "Maximum vCPU count.", required: true },
			"image-name": { description: "Guest image name.", required: false, default: "noble" },
			"rootfs-version-file": {
				description: "File containing the guest rootfs version.",
				required: false,
				default: "/tmp/guest/rootfs-version",
			},
			"epoch0-dir": {
				description: "Epoch0 output directory.",
				required: false,
				default: "/tmp/epoch0",
			},
			"lsvd-blk-binary": {
				description: "Path to dm-lsvd-blk.",
				required: false,
				default: "/usr/local/bin/dm-lsvd-blk",
			},
		},
		outputs: {
			"snapshot-dir": { description: "Snapshot output directory." },
			"templates-dir": { description: "Upper template output directory." },
			"epoch0-dir": { description: "Epoch0 output directory." },
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
			snapshotDir: stringOutput({ description: "Camel case output." }),
			"snapshot-dir": stringOutput({ description: "Already kebab output." }),
		},
		run: async () => ({ snapshotDir: "", "snapshot-dir": "" }),
	});

	assert.throws(
		() => generateActionMetadata(duplicateOutputs),
		/duplicate GitHub output name: snapshot-dir/,
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
		toolBinary: "/usr/local/bin/artifact-packager",
		kernel: "/tmp/vmlinux",
		rootfs: "/tmp/rootfs.raw",
		output: "/tmp/snapshot",
		memoryMibMax: "${{ inputs.max_machine_memory_mib }}",
		maxVcpus: "${{ inputs.max_machine_burst_vcpus }}",
	} satisfies WorkflowInputValues<typeof bakeSnapshot.inputs>;

	assert.deepEqual(
		generateUsesStep(bakeSnapshot, {
			name: "Bake release artifact",
			uses: "./.github/actions/dcs-package-artifact",
			with: withInputs,
		}),
		{
			name: "Bake release artifact",
			uses: "./.github/actions/dcs-package-artifact",
			with: {
				"tool-binary": "/usr/local/bin/artifact-packager",
				kernel: "/tmp/vmlinux",
				rootfs: "/tmp/rootfs.raw",
				output: "/tmp/snapshot",
				"memory-mib-max": "${{ inputs.max_machine_memory_mib }}",
				"max-vcpus": "${{ inputs.max_machine_burst_vcpus }}",
			},
		},
	);
});

test("uses derives a local workflow step from a Hollywood action path", () => {
	assert.deepEqual(
		uses(pathfulBakeSnapshot, {
			id: "bake",
			name: "Bake release artifact",
			with: {
				toolBinary: "/usr/local/bin/artifact-packager",
				kernel: "/tmp/vmlinux",
				rootfs: "/tmp/rootfs.raw",
				output: "/tmp/snapshot",
				memoryMibMax: "${{ inputs.max_machine_memory_mib }}",
				maxVcpus: "${{ inputs.max_machine_burst_vcpus }}",
			},
		}),
		{
			id: "bake",
			name: "Bake release artifact",
			uses: "./.github/actions/dcs/dm/package-artifact",
			with: {
				"tool-binary": "/usr/local/bin/artifact-packager",
				kernel: "/tmp/vmlinux",
				rootfs: "/tmp/rootfs.raw",
				output: "/tmp/snapshot",
				"memory-mib-max": "${{ inputs.max_machine_memory_mib }}",
				"max-vcpus": "${{ inputs.max_machine_burst_vcpus }}",
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
				tfDir: "apps/cloud/apps/github/arc-ci/tf",
				varFile: "${{ steps.aws.outputs.environment }}.tfvars",
				extraArgs:
					"-var=karpenter_experimental_controller_tag=${{ steps.karpenter_experimental_meta.outputs.image_tag }}",
				artifactName: "github-arc-ci-tfplan-${{ steps.aws.outputs.environment }}",
			},
		}),
		{
			id: "plan",
			name: "Terraform Plan",
			uses: "./.github/actions/terraform/plan",
			with: {
				"tf-dir": "apps/cloud/apps/github/arc-ci/tf",
				"var-file": "${{ steps.aws.outputs.environment }}.tfvars",
				"extra-args":
					"-var=karpenter_experimental_controller_tag=${{ steps.karpenter_experimental_meta.outputs.image_tag }}",
				"artifact-name": "github-arc-ci-tfplan-${{ steps.aws.outputs.environment }}",
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
			with: { tfDir: "apps/cloud/apps/github/arc-ci/tf" },
		});
	}
	assert.ok(true);
});

test("uses rejects actions without a local action path", () => {
	assert.throws(
		() =>
			uses(bakeSnapshot, {
				name: "Bake release artifact",
				with: {
					toolBinary: "/usr/local/bin/artifact-packager",
					kernel: "/tmp/vmlinux",
					rootfs: "/tmp/rootfs.raw",
					output: "/tmp/snapshot",
					memoryMibMax: "${{ inputs.max_machine_memory_mib }}",
					maxVcpus: "${{ inputs.max_machine_burst_vcpus }}",
				},
			}),
		/localActionPath is required/,
	);
});

test("uses keeps action inputs typed at workflow call sites", () => {
	if (process.env["HOLLYWOOD_TYPE_TESTS"] === "1") {
		uses(pathfulBakeSnapshot, {
			name: "Bake release artifact",
			// @ts-expect-error Missing required action inputs should fail at compile time.
			with: { toolBinary: "/usr/local/bin/artifact-packager" },
		});
	}
	assert.ok(true);
});

test("generateActionFile flattens nested script sources into .github actions", () => {
	const actionFile = generateActionFile(bakeSnapshot, {
		sourcePath: "ci/dcs/dm/package-artifact.ts",
		actionsDir: ".github/actions",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
	});

	assert.equal(actionFile.sourcePath, "ci/dcs/dm/package-artifact.ts");
	assert.equal(actionFile.path, ".github/actions/dcs-package-artifact/action.yml");
	assert.equal(
		actionFile.header,
		"# @generated by Hollywood at 2026-05-14T00:00:00.000Z. Do not edit by hand.",
	);
	assert.equal(actionFile.metadata.runs.main, "dist/index.js");
	assert.equal(actionFile.metadata.runs.using, "node24");
});

test("generateActionFile uses explicit local action paths", () => {
	const actionFile = generateActionFile(pathfulBakeSnapshot, {
		sourcePath: "ci/dcs/dm/package-artifact.ts",
		actionsDir: ".github/actions",
	});

	assert.equal(actionFile.path, ".github/actions/dcs/dm/package-artifact/action.yml");
});

test("generateActionFile uses stable generated headers by default", () => {
	const actionFile = generateActionFile(bakeSnapshot, {
		sourcePath: "ci/dcs/dm/package-artifact.ts",
		actionsDir: ".github/actions",
	});
	const entrypoint = generateActionEntrypointFile(bakeSnapshot, {
		sourcePath: "ci/dcs/dm/package-artifact.ts",
		actionsDir: ".github/actions",
		exportName: "bakeSnapshot",
	});

	assert.equal(actionFile.header, "# @generated by Hollywood. Do not edit by hand.");
	assert.equal(entrypoint.header, "// @generated by Hollywood. Do not edit by hand.");
});

test("generateActionFile preserves colocated action source directories", () => {
	const actionFile = generateActionFile(bakeSnapshot, {
		sourcePath: ".github/actions/dcs/dm/package-artifact/src/action.ts",
		actionsDir: ".github/actions",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
	});

	assert.equal(actionFile.path, ".github/actions/dcs/dm/package-artifact/action.yml");
	assert.equal(actionFile.metadata.name, "dcs-package-artifact");
});

test("generateActionEntrypointFile preserves colocated action source directories", () => {
	const entrypoint = generateActionEntrypointFile(bakeSnapshot, {
		sourcePath: ".github/actions/dcs/dm/package-artifact/src/action.ts",
		actionsDir: ".github/actions",
		exportName: "bakeSnapshot",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
	});

	assert.equal(entrypoint.path, ".github/actions/dcs/dm/package-artifact/src/index.ts");
	assert.match(entrypoint.content, /import \{ bakeSnapshot \} from "\.\/action\.ts";/);
});

test("generateActionFile rejects mismatched explicit and colocated action paths", () => {
	const movedBakeSnapshot = action({
		...bakeSnapshot,
		localActionPath: "dcs/moved-package-artifact",
	});

	assert.throws(
		() =>
			generateActionFile(movedBakeSnapshot, {
				sourcePath: ".github/actions/dcs/dm/package-artifact/src/action.ts",
				actionsDir: ".github/actions",
			}),
		/localActionPath dcs\/moved-package-artifact does not match colocated action directory dcs\/dm\/package-artifact/,
	);
});

test("generateActionFile rejects escaping explicit local action paths", () => {
	const escapingBakeSnapshot = action({
		...bakeSnapshot,
		localActionPath: "../package-artifact",
	});

	assert.throws(
		() =>
			generateActionFile(escapingBakeSnapshot, {
				sourcePath: "ci/dcs/dm/package-artifact.ts",
				actionsDir: ".github/actions",
			}),
		/invalid action directory: \.\.\/package-artifact/,
	);
});

test("generateActionFile rejects escaping generated action directories", () => {
	assert.throws(
		() =>
			generateActionFile(bakeSnapshot, {
				sourcePath: ".github/actions/../package-artifact/src/action.ts",
				actionsDir: ".github/actions",
			}),
		/invalid action directory: \.\.\/package-artifact/,
	);
});

test("generateActionEntrypointFile wires a typed script to GitHub actions", () => {
	const entrypoint = generateActionEntrypointFile(bakeSnapshot, {
		sourcePath: "ci/dcs/dm/package-artifact.ts",
		actionsDir: ".github/actions",
		exportName: "bakeSnapshot",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
	});

	assert.equal(entrypoint.sourcePath, "ci/dcs/dm/package-artifact.ts");
	assert.equal(entrypoint.path, ".github/actions/dcs-package-artifact/src/index.ts");
	assert.equal(
		entrypoint.header,
		"// @generated by Hollywood at 2026-05-14T00:00:00.000Z. Do not edit by hand.",
	);
	assert.equal(
		entrypoint.content,
		'// @generated by Hollywood at 2026-05-14T00:00:00.000Z. Do not edit by hand.\nimport { runGitHubAction } from "@dedalus-labs/hollywood/action-runtime";\nimport { bakeSnapshot } from "../../../../ci/dcs/dm/package-artifact.ts";\n\nvoid runGitHubAction(bakeSnapshot);\n',
	);
});

test("generateActionEntrypointFile supports default action exports", () => {
	const entrypoint = generateActionEntrypointFile(bakeSnapshot, {
		sourcePath: "ci/dcs/dm/package-artifact.ts",
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
			generateActionEntrypointFile(bakeSnapshot, {
				sourcePath: "ci/dcs/dm/package-artifact.ts",
				actionsDir: ".github/actions",
				exportName: "bake-snapshot",
			}),
		/invalid TypeScript export name: bake-snapshot/,
	);
});

test("renderActionFile validates action metadata before returning YAML", () => {
	const actionFile = generateActionFile(bakeSnapshot, {
		sourcePath: "ci/dcs/dm/package-artifact.ts",
		actionsDir: ".github/actions",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
	});

	const content = renderActionFile(actionFile);

	assert.match(content, /^# @generated by Hollywood at 2026-05-14T00:00:00.000Z/);
	assert.match(content, /using: node24/);
});

test("renderActionFile rejects invalid generated action metadata", () => {
	const actionFile = generateActionFile(bakeSnapshot, {
		sourcePath: "ci/dcs/dm/package-artifact.ts",
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
					action: bakeSnapshot,
					sourcePath: "ci/dcs/dm/package-artifact.ts",
					actionsDir: ".github/actions",
				},
				{
					action: bakeSnapshot,
					sourcePath: "ci/other/package-artifact.ts",
					actionsDir: ".github/actions",
				},
			]),
		/duplicate generated action path: .github\/actions\/dcs-package-artifact\/action.yml/,
	);
});

test("generateWorkflowFile flattens nested workflow sources into .github workflows", () => {
	const usesStep = generateUsesStep(bakeSnapshot, {
		name: "Bake release artifact",
		uses: "./.github/actions/dcs-package-artifact",
		with: {
			toolBinary: "/usr/local/bin/artifact-packager",
			kernel: "/tmp/vmlinux",
			rootfs: "/tmp/rootfs.raw",
			output: "/tmp/snapshot",
			memoryMibMax: "${{ inputs.max_machine_memory_mib }}",
			maxVcpus: "${{ inputs.max_machine_burst_vcpus }}",
		},
	});

	assert.deepEqual(
		generateWorkflowFile({
			sourcePath: "ci/dcs/guest-artifacts.ts",
			sourceRoot: "ci",
			workflowsDir: ".github/workflows",
			generatedAt: new Date("2026-05-14T00:00:00.000Z"),
			workflow: {
				name: "DCS Guest Artifacts",
				on: { workflow_dispatch: {} },
				jobs: {
					bake_snapshot: {
						"runs-on": "dedalus-kvm",
						steps: [usesStep],
					},
				},
			},
		}),
		{
			sourcePath: "ci/dcs/guest-artifacts.ts",
			path: ".github/workflows/dcs-guest-artifacts.yml",
			header: "# @generated by Hollywood at 2026-05-14T00:00:00.000Z. Do not edit by hand.",
			workflow: {
				name: "DCS Guest Artifacts",
				on: { workflow_dispatch: {} },
				jobs: {
					bake_snapshot: {
						"runs-on": "dedalus-kvm",
						steps: [usesStep],
					},
				},
			},
		},
	);
});

test("renderWorkflowFile validates workflow before returning YAML", () => {
	const usesStep = generateUsesStep(bakeSnapshot, {
		name: "Bake release artifact",
		uses: "./.github/actions/dcs-package-artifact",
		with: {
			toolBinary: "/usr/local/bin/artifact-packager",
			kernel: "/tmp/vmlinux",
			rootfs: "/tmp/rootfs.raw",
			output: "/tmp/snapshot",
			memoryMibMax: "${{ inputs.max_machine_memory_mib }}",
			maxVcpus: "${{ inputs.max_machine_burst_vcpus }}",
		},
	});

	const workflowFile = generateWorkflowFile({
		sourcePath: "ci/dcs/guest-artifacts.ts",
		sourceRoot: "ci",
		workflowsDir: ".github/workflows",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
		workflow: {
			name: "DCS Guest Artifacts",
			on: { workflow_dispatch: {} },
			jobs: {
				bake_snapshot: {
					"runs-on": "dedalus-kvm",
					steps: [usesStep],
				},
			},
		},
	});

	const content = renderWorkflowFile(workflowFile);

	assert.match(content, /^# @generated by Hollywood at 2026-05-14T00:00:00.000Z/);
	assert.match(content, /uses: \.\/\.github\/actions\/dcs-package-artifact/);
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
		sourcePath: "ci/dcs/controlplane-cd.ts",
		sourceRoot: "ci",
		workflowsDir: ".github/workflows",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
		workflow: workflow({
			name: "DCS Controlplane CD",
			on: { workflow_dispatch: {} },
			jobs: {
				deploy: {
					if: "${{ github.event_name != 'pull_request' }}",
					needs: ["detect"],
					uses: "./.github/workflows/dcs-terraform-flux-cd.yml",
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

	assert.match(content, /uses: \.\/\.github\/workflows\/dcs-terraform-flux-cd\.yml/);
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
		sourcePath: "ci/dcs/guest-artifacts.ts",
		sourceRoot: "ci",
		workflowsDir: ".github/workflows",
		workflow: {
			name: "DCS Guest Artifacts",
			on: { workflow_dispatch: {} },
			jobs: {
				bake_snapshot: {
					steps: [
						{ name: "Bake release artifact", uses: "./.github/actions/dcs-package-artifact", with: {} },
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
