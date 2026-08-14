import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { isAbsolute, normalize } from "node:path/posix";

import type { operations } from "@octokit/openapi-types";
import { z } from "zod";

import {
	parseEncodedGitHubJitConfig,
	type EncodedGitHubJitConfig,
} from "./github-runner";

type GenerateRepositoryJitConfigOperation =
	operations["actions/generate-runner-jitconfig-for-repo"];
type GenerateRepositoryJitConfigRequest =
	GenerateRepositoryJitConfigOperation["requestBody"]["content"]["application/json"];

declare const githubApiTokenBrand: unique symbol;
declare const githubRepositoryBrand: unique symbol;
declare const githubRunnerJitRegistrationBrand: unique symbol;

export type GitHubApiToken = string & { readonly [githubApiTokenBrand]: true };

export type GitHubRepository = Readonly<{
	name: string;
	owner: string;
}> & { readonly [githubRepositoryBrand]: true };

export type GitHubRunnerJitRegistrationOptions = Readonly<{
	labels: readonly string[];
	name: string;
	runnerGroupId: number;
	workFolder?: string;
}>;

export type GitHubRunnerJitRegistration = Readonly<{
	labels: readonly [string, ...string[]];
	name: string;
	runnerGroupId: number;
	workFolder?: string;
}> & { readonly [githubRunnerJitRegistrationBrand]: true };

export type GenerateGitHubRepositoryRunnerJitConfigOptions = Readonly<{
	apiUrl?: URL;
	repository: GitHubRepository;
	registration: GitHubRunnerJitRegistration;
	token: GitHubApiToken;
}>;

export type GitHubRunnerApiResponse = Readonly<{
	json: () => Promise<unknown>;
	status: number;
	statusText: string;
}>;

export type GitHubRunnerApiRequest = (
	url: URL,
	init: RequestInit,
) => Promise<GitHubRunnerApiResponse>;

export type GitHubRunnerApiServices = Readonly<{
	request: GitHubRunnerApiRequest;
}>;

export class GitHubRunnerApiError extends Error {
	readonly status: number;

	constructor(status: number, statusText: string) {
		super(
			`GitHub JIT configuration request failed with ${String(status)}${statusText.length === 0 ? "" : ` ${statusText}`}.`,
		);
		this.name = "GitHubRunnerApiError";
		this.status = status;
	}
}

const githubApiVersion = "2026-03-10";
const defaultGitHubApiUrl = new URL("https://api.github.com/");
const jitResponseSchema = z.object({ encoded_jit_config: z.string() });

export const parseGitHubApiToken = (value: string): GitHubApiToken => {
	if (value.trim().length === 0 || value.trim() !== value || hasControlCharacter(value)) {
		throw new Error("GitHub API token must be nonempty text without whitespace or control characters.");
	}
	return value as GitHubApiToken;
};

export const parseGitHubRepository = (value: string): GitHubRepository => {
	const match = /^([^/\s]+)\/([^/\s]+)$/.exec(value);
	if (match === null) {
		throw new Error(`GitHub repository must use OWNER/REPOSITORY format. Received '${value}'.`);
	}
	return { name: required(match[2]), owner: required(match[1]) } as GitHubRepository;
};

export const defineGitHubRunnerJitRegistration = (
	options: GitHubRunnerJitRegistrationOptions,
): GitHubRunnerJitRegistration => {
	assertNonemptyText(options.name, "GitHub runner name");
	if (!Number.isSafeInteger(options.runnerGroupId) || options.runnerGroupId <= 0) {
		throw new Error("GitHub runner group ID must be a positive integer.");
	}
	if (
		options.labels.length < 1 ||
		options.labels.length > 100 ||
		new Set(options.labels).size !== options.labels.length ||
		options.labels.some((label) => label.trim().length === 0 || label.trim() !== label)
	) {
		throw new Error("GitHub runner labels must contain between 1 and 100 unique labels.");
	}
	if (options.workFolder !== undefined) {
		assertWorkFolder(options.workFolder);
	}
	return {
		labels: Object.freeze([...options.labels]) as [string, ...string[]],
		name: options.name,
		runnerGroupId: options.runnerGroupId,
		...(options.workFolder === undefined ? {} : { workFolder: options.workFolder }),
	} as unknown as GitHubRunnerJitRegistration;
};

export const generateGitHubRepositoryRunnerJitConfig = async (
	options: GenerateGitHubRepositoryRunnerJitConfigOptions,
	services: GitHubRunnerApiServices = { request: requestGitHub },
): Promise<EncodedGitHubJitConfig> => {
	const apiUrl = options.apiUrl ?? defaultGitHubApiUrl;
	assertGitHubApiUrl(apiUrl);
	const requestBody = {
		labels: [...options.registration.labels],
		name: options.registration.name,
		runner_group_id: options.registration.runnerGroupId,
		...(options.registration.workFolder === undefined
			? {}
			: { work_folder: options.registration.workFolder }),
	} satisfies GenerateRepositoryJitConfigRequest;
	const endpoint = new URL(
		`repos/${encodeURIComponent(options.repository.owner)}/${encodeURIComponent(options.repository.name)}/actions/runners/generate-jitconfig`,
		withTrailingSlash(apiUrl),
	);
	const response = await services.request(endpoint, {
		body: JSON.stringify(requestBody),
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${options.token}`,
			"Content-Type": "application/json",
			"X-GitHub-Api-Version": githubApiVersion,
		},
		method: "POST",
	});
	if (response.status !== 201) {
		throw new GitHubRunnerApiError(response.status, response.statusText);
	}
	const parsed = jitResponseSchema.safeParse(await response.json());
	if (!parsed.success) {
		throw new Error("GitHub JIT response must contain encoded_jit_config text.");
	}
	return parseEncodedGitHubJitConfig(parsed.data.encoded_jit_config);
};

export const writeEncodedGitHubJitConfig = async (
	path: string,
	config: EncodedGitHubJitConfig,
): Promise<void> => {
	await mkdir(dirname(path), { recursive: true });
	let file;
	try {
		file = await open(path, "wx", 0o600);
	} catch (error: unknown) {
		throw new Error(`Failed to create GitHub JIT configuration file '${path}'.`, {
			cause: error,
		});
	}
	try {
		await file.writeFile(`${config}\n`, "utf8");
		await file.chmod(0o600);
	} finally {
		await file.close();
	}
};

const requestGitHub: GitHubRunnerApiRequest = async (url, init) => fetch(url, init);

const hasControlCharacter = (value: string): boolean =>
	[...value].some((character) => {
		const codePoint = character.codePointAt(0);
		return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
	});

const assertNonemptyText = (value: string, name: string): void => {
	if (value.trim().length === 0 || value.trim() !== value) {
		throw new Error(`${name} must be nonempty text without surrounding whitespace.`);
	}
};

const assertWorkFolder = (value: string): void => {
	const segments = value.split("/");
	if (
		value.length === 0 ||
		isAbsolute(value) ||
		value.includes("\\") ||
		normalize(value) !== value ||
		segments.some((segment) => segment === "." || segment === ".." || segment.length === 0)
	) {
		throw new Error("GitHub runner work folder must be a relative path without traversal.");
	}
};

const assertGitHubApiUrl = (url: URL): void => {
	if (url.protocol !== "https:") {
		throw new Error(`GitHub API URL must use HTTPS. Received '${url.href}'.`);
	}
	if (
		url.username.length > 0 ||
		url.password.length > 0 ||
		url.search.length > 0 ||
		url.hash.length > 0
	) {
		throw new Error("GitHub API URL must not contain credentials, a query, or a fragment.");
	}
};

const withTrailingSlash = (url: URL): URL =>
	new URL(url.href.endsWith("/") ? url.href : `${url.href}/`);

const required = (value: string | undefined): string => {
	if (value === undefined) {
		throw new Error("GitHub repository parser invariant failed.");
	}
	return value;
};
