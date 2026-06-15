import * as assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

import { bakeSnapshot } from "../examples/bake-vm-snapshot";
import {
	requestPreviewToMainPromotion,
	type GitHubWorkflowDispatch,
	type PromotionAuditEvent,
} from "../examples/github-promotion-admin";
import {
	previewPromotionGate,
	promotionGateRequest,
	verifyPreviewCi,
	type WorkflowRun,
} from "../examples/github-promotion-gate";
import { githubPromotionWorkflow } from "../examples/github-promotion-workflow";
import { s3Cache } from "../examples/s3-cache";
import { s3CacheWorkflow } from "../examples/s3-cache-workflow";
import { writeGeneratedFiles } from "./files";
import {
	generateActionEntrypointFile,
	generateActionFile,
	generateUsesStep,
	generateWorkflowFile,
	renderActionFile,
} from "./generate";
import { nodeExec, nodeFs } from "./local";
import { runAction, type Command, type ScriptLog } from "./script";

test("bake-vm-snapshot example generates action files and runs locally", async () => {
	const outputDir = await mkdtemp(join(tmpdir(), "hollywood-examples-"));
	const commands: Command[] = [];
	const events: string[] = [];

	await writeGeneratedFiles(
		[
			generateActionFile(bakeSnapshot, {
				sourcePath: "examples/bake-vm-snapshot.ts",
				actionsDir: ".github/actions",
				generatedAt: new Date("2026-05-14T00:00:00.000Z"),
			}),
			generateActionEntrypointFile(bakeSnapshot, {
				sourcePath: "examples/bake-vm-snapshot.ts",
				actionsDir: ".github/actions",
				exportName: "bakeSnapshot",
				generatedAt: new Date("2026-05-14T00:00:00.000Z"),
			}),
		],
		{ outputDir },
	);

	assert.match(
		await readFile(join(outputDir, ".github/actions/dcs-bake-vm-snapshot/action.yml"), "utf8"),
		/runs:\n  using: node24\n  main: dist\/index\.js/,
	);
	assert.deepEqual(
		generateUsesStep(bakeSnapshot, {
			name: "Bake VM snapshot",
			uses: "./.github/actions/dcs-bake-vm-snapshot",
			with: {
				dhvBinary: "/usr/local/bin/dedalus-hypervisor",
				kernel: "/tmp/vmlinux",
				rootfs: "/tmp/rootfs.raw",
				output: "/tmp/snapshot",
				memoryMibMax: "${{ inputs.max_machine_memory_mib }}",
				maxVcpus: "${{ inputs.max_machine_burst_vcpus }}",
				imageVersion: "noble@2026.05.14",
			},
		}).with,
		{
			"dhv-binary": "/usr/local/bin/dedalus-hypervisor",
			kernel: "/tmp/vmlinux",
			rootfs: "/tmp/rootfs.raw",
			output: "/tmp/snapshot",
			"memory-mib-max": "${{ inputs.max_machine_memory_mib }}",
			"max-vcpus": "${{ inputs.max_machine_burst_vcpus }}",
			"image-version": "noble@2026.05.14",
		},
	);

	const outputs = await runAction(bakeSnapshot, {
		with: {
			dhvBinary: "/usr/local/bin/dedalus-hypervisor",
			kernel: "/tmp/vmlinux",
			rootfs: "/tmp/rootfs.raw",
			output: "/tmp/snapshot",
			memoryMibMax: "32768",
			maxVcpus: "16",
			imageVersion: "noble@2026.05.14",
		},
		exec: async (file, args, options) => {
			commands.push({ file, args, ...options });
			return { exitCode: 0, stdout: "", stderr: "" };
		},
		fs: { readText: async () => "" },
		log: memoryLog(events),
		runner: { uidGid: "1001:1001" },
	});

	assert.deepEqual(outputs, {
		snapshotDir: "/tmp/snapshot",
		templatesDir: "/tmp/templates",
		epoch0Dir: "/tmp/epoch0",
	});
	assert.equal(commands[0]?.args[0], "dm-bake");
	assert.deepEqual(events, [
		"group:Bake VM snapshot",
		"group:Return bake artifacts to runner user",
	]);
});

test("s3-cache example treats restore miss as expected nonzero command", async () => {
	const commands: Command[] = [];
	const events: string[] = [];
	const actionFile = generateActionFile(s3Cache, {
		sourcePath: "examples/s3-cache.ts",
		actionsDir: ".github/actions",
		generatedAt: new Date("2026-05-14T00:00:00.000Z"),
	});

	assert.match(renderActionFile(actionFile), /name: s3-cache/);
	assert.deepEqual(
		await runAction(s3Cache, {
			with: {
				mode: "restore",
				bucket: "ci-cache",
				prefix: "go",
				key: "linux-arm64",
				archivePath: "/tmp/cache.tar.gz",
				contentsPath: "/tmp/go-cache",
			},
			exec: async (file, args, options) => {
				commands.push({ file, args, ...options });
				return { exitCode: 1, stdout: "", stderr: "NoSuchKey" };
			},
			fs: { readText: async () => "" },
			log: memoryLog(events),
			runner: { uidGid: "1001:1001" },
		}),
		{ cacheHit: "false" },
	);
	assert.equal(commands[0]?.exitPolicy, "any");
	assert.deepEqual(events, ["info:No cache found at s3://ci-cache/go/linux-arm64.tar.gz"]);
});

test("s3-cache workflow example generates flat workflow YAML", async () => {
	const outputDir = await mkdtemp(join(tmpdir(), "hollywood-examples-"));

	await writeGeneratedFiles(
		[
			generateWorkflowFile({
				sourcePath: "examples/s3-cache-workflow.ts",
				sourceRoot: "examples",
				workflowsDir: ".github/workflows",
				generatedAt: new Date("2026-05-14T00:00:00.000Z"),
				workflow: s3CacheWorkflow,
			}),
		],
		{ outputDir },
	);

	const workflow = await readFile(
		join(outputDir, ".github/workflows/s3-cache-workflow.yml"),
		"utf8",
	);
	assert.match(workflow, /uses: \.\/\.github\/actions\/s3-cache/);
	assert.match(workflow, /archive-path: \/tmp\/cache\.tar\.gz/);
});

test("github promotion admin example audits before workflow dispatch", async () => {
	const auditEvents: PromotionAuditEvent[][] = [];
	const dispatches: GitHubWorkflowDispatch[] = [];

	const result = await requestPreviewToMainPromotion(
		{
			canPromoteProduction: true,
			email: "win@dedaluslabs.ai",
			id: "00000000-0000-4000-8000-000000000001",
		},
		{
			allowUncertified: true,
			reason: "promote vetted preview artifacts",
			sha: "a".repeat(40),
		},
		{
			audit: {
				insert: async (events) => {
					auditEvents.push([...events]);
				},
			},
			github: {
				dispatchWorkflow: async (dispatch) => {
					dispatches.push(dispatch);
					return { ok: true };
				},
			},
		},
	);

	assert.equal(result.workflowId, "promote-preview-to-main.yml");
	assert.equal(dispatches[0]?.workflowId, "promote-preview-to-main.yml");
	assert.deepEqual(dispatches[0]?.inputs, {
		allow_uncertified: true,
		create_audit_tag: true,
		reason: "promote vetted preview artifacts",
		sha: "a".repeat(40),
	});
	assert.equal(auditEvents[0]?.[0]?.action, "promotion.requested");
	assert.equal(auditEvents[1]?.[0]?.action, "promotion.completed");
});

test("github promotion admin example rejects unauthorized callers before dispatch", async () => {
	const dispatches: GitHubWorkflowDispatch[] = [];

	await assert.rejects(
		() =>
			requestPreviewToMainPromotion(
				{
					canPromoteProduction: false,
					email: "dev@dedaluslabs.ai",
					id: "00000000-0000-4000-8000-000000000002",
				},
				{ reason: "ship it" },
				{
					audit: { insert: async () => undefined },
					github: {
						dispatchWorkflow: async (dispatch) => {
							dispatches.push(dispatch);
						},
					},
				},
			),
		/not allowed to promote/,
	);
	assert.deepEqual(dispatches, []);
});

test("github promotion gate example verifies a successful workflow run", async () => {
	const targetSha = "f".repeat(40);
	const url = await verifyPreviewCi(
		promotionGateRequest({
			repository: "dedalus-labs/dedalus",
			targetSha,
			workflowName: "CI",
		}),
		{
			workflowRunsForCommit: async () => [
				workflowRun({ conclusion: "failure", createdAt: "2026-05-14T00:00:00Z" }),
				workflowRun({
					createdAt: "2026-05-14T01:00:00Z",
					headSha: targetSha,
					htmlUrl: "https://github.test/actions/runs/123",
				}),
			],
		},
	);

	assert.equal(url, "https://github.test/actions/runs/123");
});

test("github promotion workflow example generates a local action step", async () => {
	const outputDir = await mkdtemp(join(tmpdir(), "hollywood-examples-"));

	await writeGeneratedFiles(
		[
			generateActionFile(previewPromotionGate, {
				sourcePath: "examples/github-promotion-gate.ts",
				actionsDir: ".github/actions",
			}),
			generateWorkflowFile({
				sourcePath: "examples/github-promotion-workflow.ts",
				sourceRoot: "examples",
				workflowsDir: ".github/workflows",
				workflow: githubPromotionWorkflow,
			}),
		],
		{ outputDir },
	);

	const workflow = await readFile(
		join(outputDir, ".github/workflows/github-promotion-workflow.yml"),
		"utf8",
	);
	assert.match(workflow, /uses: \.\/\.github\/actions\/preview-promotion-gate/);
	assert.match(workflow, /github-token: \$\{\{ github\.token \}\}/);
});

test.runIf(process.env["HOLLYWOOD_RUN_MINIO"] === "1")(
	"s3-cache example saves and restores through real local MinIO",
	async () => {
		const dir = await mkdtemp(join(tmpdir(), "hollywood-s3-cache-"));
		const dataDir = join(dir, "minio");
		const cacheDir = join(dir, "cache");
		const restoreDir = join(dir, "restore");
		await mkdir(dataDir);
		await mkdir(cacheDir);
		await mkdir(restoreDir);
		await writeFile(join(cacheDir, "artifact.txt"), "cached by hollywood\n");

		const apiPort = await freePort();
		const consolePort = await freePort();
		const minio = await startMinio(dataDir, apiPort, consolePort);
		try {
			await withMinioEnv(`http://127.0.0.1:${apiPort}`, async () => {
				await nodeExec("aws", ["s3api", "create-bucket", "--bucket", "ci-cache"]);
				await runAction(s3Cache, {
					with: {
						mode: "save",
						bucket: "ci-cache",
						prefix: "go",
						key: "linux-arm64",
						archivePath: join(dir, "save.tar.gz"),
						contentsPath: cacheDir,
					},
					exec: nodeExec,
					fs: nodeFs,
					log: memoryLog([]),
					runner: { uidGid: "1001:1001" },
				});

				const outputs = await runAction(s3Cache, {
					with: {
						mode: "restore",
						bucket: "ci-cache",
						prefix: "go",
						key: "linux-arm64",
						archivePath: join(dir, "restore.tar.gz"),
						contentsPath: restoreDir,
					},
					exec: nodeExec,
					fs: nodeFs,
					log: memoryLog([]),
					runner: { uidGid: "1001:1001" },
				});

				assert.deepEqual(outputs, { cacheHit: "true" });
				assert.equal(
					await readFile(join(restoreDir, "artifact.txt"), "utf8"),
					"cached by hollywood\n",
				);
			});
		} finally {
			minio.kill("SIGTERM");
		}
	},
	30_000,
);

const memoryLog = (events: string[]): ScriptLog => ({
	info: (message) => {
		events.push(`info:${message}`);
	},
	warning: (message) => {
		events.push(`warning:${message}`);
	},
	group: async (name, run) => {
		events.push(`group:${name}`);
		return run();
	},
});

const workflowRun = (overrides: Partial<WorkflowRun>): WorkflowRun => ({
	conclusion: "success",
	createdAt: "2026-05-14T00:00:00Z",
	headSha: "f".repeat(40),
	htmlUrl: "https://github.test/actions/runs/1",
	name: "CI",
	status: "completed",
	...overrides,
});

const withMinioEnv = async <Value>(
	endpointUrl: string,
	run: () => Promise<Value>,
): Promise<Value> => {
	const previous = {
		accessKeyId: process.env["AWS_ACCESS_KEY_ID"],
		endpointUrl: process.env["AWS_ENDPOINT_URL"],
		region: process.env["AWS_DEFAULT_REGION"],
		secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"],
	};
	process.env["AWS_ACCESS_KEY_ID"] = "hollywood";
	process.env["AWS_ENDPOINT_URL"] = endpointUrl;
	process.env["AWS_DEFAULT_REGION"] = "us-east-1";
	process.env["AWS_SECRET_ACCESS_KEY"] = "hollywood-secret";
	try {
		return await run();
	} finally {
		restoreEnv("AWS_ACCESS_KEY_ID", previous.accessKeyId);
		restoreEnv("AWS_ENDPOINT_URL", previous.endpointUrl);
		restoreEnv("AWS_DEFAULT_REGION", previous.region);
		restoreEnv("AWS_SECRET_ACCESS_KEY", previous.secretAccessKey);
	}
};

const restoreEnv = (name: string, value: string | undefined): void => {
	if (value === undefined) {
		delete process.env[name];
		return;
	}
	process.env[name] = value;
};

const freePort = async (): Promise<number> =>
	new Promise((resolve, reject) => {
		const server = createTcpServer();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address === null || typeof address === "string") {
				reject(new Error("test TCP server did not bind a port"));
				return;
			}
			server.close(() => resolve(address.port));
		});
	});

const startMinio = async (
	dataDir: string,
	apiPort: number,
	consolePort: number,
): Promise<ChildProcess> => {
	const minio = spawn(
		"minio",
		[
			"server",
			"--address",
			`127.0.0.1:${apiPort}`,
			"--console-address",
			`127.0.0.1:${consolePort}`,
			dataDir,
		],
		{
			env: {
				...process.env,
				MINIO_ROOT_PASSWORD: "hollywood-secret",
				MINIO_ROOT_USER: "hollywood",
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let logs = "";
	minio.stdout.on("data", (chunk: Buffer) => {
		logs += chunk.toString();
	});
	minio.stderr.on("data", (chunk: Buffer) => {
		logs += chunk.toString();
	});
	await waitForMinio(`http://127.0.0.1:${apiPort}/minio/health/live`, () => logs);
	return minio;
};

const waitForMinio = async (url: string, logs: () => string): Promise<void> => {
	const startedAt = Date.now();
	while (Date.now() - startedAt < 10_000) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				return;
			}
		} catch {
			// MinIO has not opened the health endpoint yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`MinIO did not become healthy: ${logs()}`);
};
