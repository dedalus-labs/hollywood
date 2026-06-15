import * as assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

import { nodeExec, nodeFs } from "./local";
import { action, pathInput, runAction, stringInput, stringOutput } from "./script";

test("nodeExec runs commands with explicit cwd and env", async () => {
	const dir = await mkdtemp(join(tmpdir(), "hollywood-node-exec-"));
	const realDir = await realpath(dir);
	const envName = "HOLLYWOOD_NODE_EXEC_TEST";
	const previous = process.env[envName];
	try {
		const result = await nodeExec(
			process.execPath,
			[
				"-e",
				"process.stdout.write(`${process.cwd()}\\n${process.env.HOLLYWOOD_NODE_EXEC_TEST ?? ''}`)",
			],
			{ cwd: dir, env: { [envName]: "set" } },
		);

		assert.equal(result.stdout, `${realDir}\nset`);
		assert.equal(process.env[envName], previous);
	} finally {
		restoreEnv(envName, previous);
	}
});

const s3Upload = action({
	name: "s3-upload",
	description: "Upload a file to an S3-compatible endpoint.",
	inputs: {
		endpointUrl: stringInput({ description: "S3-compatible endpoint URL." }),
		bucket: stringInput({ description: "Bucket name." }),
		key: stringInput({ description: "Object key." }),
		body: pathInput({ description: "File to upload." }),
	},
	outputs: {
		uploadedKey: stringOutput({ description: "Uploaded object key." }),
	},
	run: async ({ exec, input }) => {
		await exec("aws", [
			"--endpoint-url",
			input.endpointUrl,
			"s3api",
			"put-object",
			"--bucket",
			input.bucket,
			"--key",
			input.key,
			"--body",
			input.body,
		]);
		return { uploadedKey: input.key };
	},
});

test.runIf(process.env["HOLLYWOOD_RUN_LOCAL_S3"] === "1")(
	"runAction can hit a local S3-compatible endpoint through real exec",
	async () => {
		const requests: string[] = [];
		const bodies: Buffer[] = [];
		const server = createServer((request, response) => {
			handlePutObject(request, response, requests, bodies);
		});
		server.on("checkContinue", (request, response) => {
			response.writeContinue();
			handlePutObject(request, response, requests, bodies);
		});

		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		try {
			const address = server.address();
			if (address === null || typeof address === "string") {
				throw new Error("local S3 server did not bind a TCP port");
			}
			const dir = await mkdtemp(join(tmpdir(), "hollywood-s3-"));
			const body = join(dir, "payload.txt");
			await writeFile(body, "hello from hollywood\n");

			const outputs = await withAwsEnv(async () =>
				runAction(s3Upload, {
					with: {
						endpointUrl: `http://127.0.0.1:${address.port}`,
						bucket: "ci-cache",
						key: "fixtures/payload.txt",
						body,
					},
					fs: nodeFs,
					exec: nodeExec,
					runner: { uidGid: "1001:1001" },
				}),
			);

			assert.deepEqual(outputs, { uploadedKey: "fixtures/payload.txt" });
			assert.deepEqual(requests, ["PUT /ci-cache/fixtures/payload.txt"]);
			assert.equal(Buffer.concat(bodies).toString(), "hello from hollywood\n");
		} finally {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	},
);

test.runIf(process.env["HOLLYWOOD_RUN_MINIO"] === "1")(
	"runAction uploads to a real local MinIO process",
	async () => {
		const dir = await mkdtemp(join(tmpdir(), "hollywood-minio-"));
		const dataDir = join(dir, "data");
		await mkdir(dataDir);
		const apiPort = await freePort();
		const consolePort = await freePort();
		const minio = await startMinio(dataDir, apiPort, consolePort);
		try {
			await withAwsEnv(async () => {
				await nodeExec("aws", [
					"--endpoint-url",
					`http://127.0.0.1:${apiPort}`,
					"s3api",
					"create-bucket",
					"--bucket",
					"ci-cache",
				]);

				const body = join(dir, "payload.txt");
				await writeFile(body, "hello from real minio\n");

				const outputs = await runAction(s3Upload, {
					with: {
						endpointUrl: `http://127.0.0.1:${apiPort}`,
						bucket: "ci-cache",
						key: "fixtures/payload.txt",
						body,
					},
					fs: nodeFs,
					exec: nodeExec,
					runner: { uidGid: "1001:1001" },
				});

				assert.deepEqual(outputs, { uploadedKey: "fixtures/payload.txt" });
				const object = await nodeExec("aws", [
					"--endpoint-url",
					`http://127.0.0.1:${apiPort}`,
					"s3api",
					"get-object",
					"--bucket",
					"ci-cache",
					"--key",
					"fixtures/payload.txt",
					join(dir, "downloaded.txt"),
				]);
				assert.equal(object.exitCode, 0);
			});
		} finally {
			minio.kill("SIGTERM");
		}
	},
	30_000,
);

const handlePutObject = (
	request: IncomingMessage,
	response: ServerResponse,
	requests: string[],
	bodies: Buffer[],
): void => {
	requests.push(`${request.method ?? ""} ${request.url ?? ""}`);
	request.on("data", (chunk: Buffer) => bodies.push(chunk));
	request.on("end", () => {
		response.setHeader("ETag", '"local-etag"');
		response.writeHead(200);
		response.end("");
	});
};

const withAwsEnv = async <Value>(run: () => Promise<Value>): Promise<Value> => {
	const previous = {
		accessKeyId: process.env["AWS_ACCESS_KEY_ID"],
		secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"],
		region: process.env["AWS_DEFAULT_REGION"],
	};
	process.env["AWS_ACCESS_KEY_ID"] = "hollywood";
	process.env["AWS_SECRET_ACCESS_KEY"] = "hollywood-secret";
	process.env["AWS_DEFAULT_REGION"] = "us-east-1";
	try {
		return await run();
	} finally {
		restoreEnv("AWS_ACCESS_KEY_ID", previous.accessKeyId);
		restoreEnv("AWS_SECRET_ACCESS_KEY", previous.secretAccessKey);
		restoreEnv("AWS_DEFAULT_REGION", previous.region);
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
				MINIO_ROOT_USER: "hollywood",
				MINIO_ROOT_PASSWORD: "hollywood-secret",
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
