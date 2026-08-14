import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

import {
	defineGitHubRunnerJitRegistration,
	generateGitHubRepositoryRunnerJitConfig,
	GitHubRunnerApiError,
	parseGitHubApiToken,
	parseGitHubRepository,
	type GitHubApiToken,
	type GitHubRepository,
	type GitHubRunnerJitRegistration,
	writeEncodedGitHubJitConfig,
} from "./github-runner-api";

const encodedJitConfig = Buffer.from(
	JSON.stringify({ ".runner": Buffer.from("runner").toString("base64") }),
).toString("base64");

test("GitHub JIT generation sends the OpenAPI operation shape", async () => {
	let requestUrl: URL | undefined;
	let requestInit: RequestInit | undefined;
	const config = await generateGitHubRepositoryRunnerJitConfig(
		{
			apiUrl: new URL("https://github.example/api/v3/"),
			repository: parseGitHubRepository("octo-org/hello-world"),
			registration: defineGitHubRunnerJitRegistration({
				labels: ["self-hosted", "hollywood-local"],
				name: "hollywood-local",
				runnerGroupId: 7,
				workFolder: "_work",
			}),
			token: parseGitHubApiToken("github-token"),
		},
		{
			request: async (url, init) => {
				requestUrl = url;
				requestInit = init;
				return response(201, { encoded_jit_config: encodedJitConfig });
			},
		},
	);

	assert.equal(
		requestUrl?.href,
		"https://github.example/api/v3/repos/octo-org/hello-world/actions/runners/generate-jitconfig",
	);
	assert.deepEqual(requestInit, {
		body: JSON.stringify({
			labels: ["self-hosted", "hollywood-local"],
			name: "hollywood-local",
			runner_group_id: 7,
			work_folder: "_work",
		}),
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: "Bearer github-token",
			"Content-Type": "application/json",
			"X-GitHub-Api-Version": "2026-03-10",
		},
		method: "POST",
	});
	assert.equal(config, encodedJitConfig);
});

test("GitHub JIT generation rejects invalid typed inputs before the request", () => {
	assert.throws(() => parseGitHubRepository("missing-repository"), /OWNER\/REPOSITORY/);
	assert.throws(() => parseGitHubApiToken("  "), /must be nonempty text/);
	assert.throws(() => parseGitHubApiToken("token\n"), /must be nonempty text/);
	assert.throws(
		() =>
			defineGitHubRunnerJitRegistration({
				labels: [],
				name: "runner",
				runnerGroupId: 1,
			}),
		/GitHub runner labels must contain between 1 and 100 unique labels/,
	);
	assert.throws(
		() =>
			defineGitHubRunnerJitRegistration({
				labels: ["self-hosted"],
				name: "runner",
				runnerGroupId: 0,
			}),
		/GitHub runner group ID must be a positive integer/,
	);
	assert.throws(
		() =>
			defineGitHubRunnerJitRegistration({
				labels: ["self-hosted"],
				name: "runner",
				runnerGroupId: 1,
				workFolder: "../work",
			}),
		/GitHub runner work folder must be a relative path without traversal/,
	);
});

test("GitHub JIT generation accepts validated branded inputs only", () => {
	if (process.env["HOLLYWOOD_TYPE_TESTS"] === "1") {
		// @ts-expect-error Repository names must pass parseGitHubRepository.
		const repository: GitHubRepository = { name: "hello-world", owner: "octo-org" };
		// @ts-expect-error Registrations must pass defineGitHubRunnerJitRegistration.
		const registration: GitHubRunnerJitRegistration = {
			labels: ["hollywood-local"],
			name: "runner",
			runnerGroupId: 1,
		};
		// @ts-expect-error Tokens must pass parseGitHubApiToken.
		const token: GitHubApiToken = "token";
		void repository;
		void registration;
		void token;
	}
	assert.ok(true);
});

test("GitHub JIT generation rejects unsafe API base URLs before the request", async () => {
	await assert.rejects(
		() =>
			generate(
				{ request: async () => assert.fail("request must not run") },
				new URL("http://github.example/api/v3/"),
			),
		/GitHub API URL must use HTTPS/,
	);
	await assert.rejects(
		() =>
			generate(
				{ request: async () => assert.fail("request must not run") },
				new URL("https://github.example/api/v3/?token=secret"),
			),
		/GitHub API URL must not contain credentials, a query, or a fragment/,
	);
});

test("GitHub JIT generation validates the response at runtime", async () => {
	await assert.rejects(
		() => generate({ request: async () => response(201, { encoded_jit_config: "invalid" }) }),
		/GitHub JIT configuration must be canonical base64/,
	);
	await assert.rejects(
		() => generate({ request: async () => response(201, { runner: {} }) }),
		/GitHub JIT response must contain encoded_jit_config/,
	);
});

test("GitHub JIT generation reports typed HTTP failures without the token", async () => {
	const token = "secret-token-value";
	await assert.rejects(
		() =>
			generateGitHubRepositoryRunnerJitConfig(
				requestOptions(token),
				{ request: async () => response(403, { message: "forbidden" }, "Forbidden") },
			),
		(error) =>
			error instanceof GitHubRunnerApiError &&
			error.status === 403 &&
			error.message === "GitHub JIT configuration request failed with 403 Forbidden." &&
			!error.message.includes(token),
	);
});

test("JIT configuration files use exclusive mode 0600 creation", async () => {
	const directory = await mkdtemp(join(tmpdir(), "hollywood-jit-config-"));
	const path = join(directory, "config");
	try {
		const config = await generate({
			request: async () => response(201, { encoded_jit_config: encodedJitConfig }),
		});
		await writeEncodedGitHubJitConfig(path, config);
		assert.equal((await stat(path)).mode & 0o777, 0o600);
		assert.equal(await readFile(path, "utf8"), `${encodedJitConfig}\n`);
		await assert.rejects(
			writeEncodedGitHubJitConfig(path, config),
			/Failed to create GitHub JIT configuration file/,
		);
		assert.equal(await readFile(path, "utf8"), `${encodedJitConfig}\n`);
	} finally {
		await rm(directory, { force: true, recursive: true });
	}
});

const generate = (
	services: Parameters<typeof generateGitHubRepositoryRunnerJitConfig>[1],
	apiUrl?: URL,
) =>
	generateGitHubRepositoryRunnerJitConfig(
		{ ...requestOptions("token"), ...(apiUrl === undefined ? {} : { apiUrl }) },
		services,
	);

const requestOptions = (token: string) => ({
	repository: parseGitHubRepository("octo-org/hello-world"),
	registration: defineGitHubRunnerJitRegistration({
		labels: ["self-hosted", "hollywood-local"],
		name: "hollywood-local",
		runnerGroupId: 1,
	}),
	token: parseGitHubApiToken(token),
});

const response = (
	status: number,
	body: unknown,
	statusText = status === 201 ? "Created" : "",
) => ({
	json: async (): Promise<unknown> => body,
	status,
	statusText,
});
