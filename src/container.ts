import { randomUUID } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { posix, relative, resolve, sep } from "node:path";

import { nodeExec } from "./local";
import type { RunnerContext, ScriptExec, ScriptFs } from "./script";

export type ContainerProvider = "container" | "docker" | "podman";

export class ContainerProviderUnavailableError extends Error {
	readonly binary: string;
	readonly provider: ContainerProvider;

	constructor(provider: ContainerProvider, binary: string, cause: unknown) {
		const requirement =
			provider === "container" ? " Apple container requires Apple silicon and macOS 26 or later." : "";
		super(
			`Container provider '${provider}' is unavailable. Expected executable '${binary}' on PATH.${requirement}`,
			{ cause },
		);
		this.name = "ContainerProviderUnavailableError";
		this.binary = binary;
		this.provider = provider;
	}
}

export const githubActionsRunnerImage =
	"ghcr.io/actions/actions-runner@sha256:0cfdcc701ce933c6d243c6b0b2da767366dc9f2e99961d4c3754b0b78084cdda";
export const githubActionsRunnerVersion = "2.336.0";

export type ContainerOptions = Readonly<{
	actionBundle?: string;
	hostExec?: ScriptExec;
	image: string;
	provider: ContainerProvider;
	workspace: string;
}>;

export type ContainerServices = Readonly<{
	exec: ScriptExec;
	fs: ScriptFs;
	runner: RunnerContext;
}>;

export type ContainerRuntime = Readonly<{
	binary: string;
	createOptions: readonly string[];
	remove: string;
}>;

const githubWorkspace = "/github/workspace";
const githubEnvironment = {
	CI: "true",
	GITHUB_ACTIONS: "true",
	GITHUB_ENV: "/github/file_commands/env",
	GITHUB_EVENT_PATH: "/github/workflow/event.json",
	GITHUB_OUTPUT: "/github/file_commands/output",
	GITHUB_PATH: "/github/file_commands/path",
	GITHUB_STATE: "/github/file_commands/state",
	GITHUB_STEP_SUMMARY: "/github/file_commands/step_summary",
	GITHUB_WORKSPACE: githubWorkspace,
	HOME: "/github/home",
	PATH: "/home/runner/externals/node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
	RUNNER_OS: "Linux",
	RUNNER_TEMP: "/github/temp",
} as const;

export const withContainer = async <Value>(
	options: ContainerOptions,
	run: (services: ContainerServices) => Promise<Value>,
): Promise<Value> => {
	assertImmutableImage(options.image);
	return withContainerSession(options, run);
};

export const withLocalContainer = async <Value>(
	options: ContainerOptions,
	run: (services: ContainerServices) => Promise<Value>,
): Promise<Value> => withContainerSession(options, run);

const withContainerSession = async <Value>(
	options: ContainerOptions,
	run: (services: ContainerServices) => Promise<Value>,
): Promise<Value> => {
	const workspace = resolve(options.workspace);
	const root = await prepareGitHubRoot(options.actionBundle);
	const runtime = containerRuntime(options.provider);
	const hostExec = options.hostExec ?? nodeExec;
	const name = `hollywood-${randomUUID()}`;
	let created = false;
	let result: Value | undefined;
	let failure: unknown;

	try {
		await hostExec(
			runtime.binary,
			createArgs({ image: options.image, name, root, runtime, workspace }),
		);
		created = true;
		await hostExec(runtime.binary, ["start", name]);
		result = await run(await containerServices({ hostExec, name, runtime, workspace }));
	} catch (error: unknown) {
		failure = isMissingExecutable(error)
			? new ContainerProviderUnavailableError(options.provider, runtime.binary, error)
			: error;
	}

	const cleanupFailures = await cleanup({ created, hostExec, name, root, runtime });
	if (failure !== undefined && cleanupFailures.length > 0) {
		throw new AggregateError([failure, ...cleanupFailures], "Container action and cleanup failed.");
	}
	if (failure !== undefined) {
		throw failure;
	}
	if (cleanupFailures.length > 0) {
		throw new AggregateError(cleanupFailures, "Container cleanup failed.");
	}
	return result as Value;
};

const containerServices = async (
	options: Readonly<{
		hostExec: ScriptExec;
		name: string;
		runtime: ContainerRuntime;
		workspace: string;
	}>,
): Promise<ContainerServices> => {
	const exec = containerExec(options);
	const [uid, gid] = await Promise.all([exec("id", ["-u"]), exec("id", ["-g"])]);
	return {
		exec,
		fs: {
			readText: async (path) => (await exec("cat", [containerPath(options.workspace, path)])).stdout,
		},
		runner: { uidGid: `${uid.stdout.trim()}:${gid.stdout.trim()}` },
	};
};

const containerExec =
	(options: Readonly<{ hostExec: ScriptExec; name: string; runtime: ContainerRuntime; workspace: string }>): ScriptExec =>
	(file, args, commandOptions = {}) => {
		const command = [
			"exec",
			"--workdir",
			containerPath(options.workspace, commandOptions.cwd ?? options.workspace),
			options.name,
		];
		const environment = Object.entries(commandOptions.env ?? {})
			.sort()
			.map(([name, value]) => `${name}=${value}`);
		if (environment.length > 0) {
			command.push("env", ...environment);
		}
		command.push(file, ...args);
		return options.hostExec(
			options.runtime.binary,
			command,
			commandOptions.exitPolicy === undefined
				? undefined
				: { exitPolicy: commandOptions.exitPolicy },
		);
	};

const createArgs = (
	options: Readonly<{
		image: string;
		name: string;
		root: string;
		runtime: ContainerRuntime;
		workspace: string;
	}>,
): readonly string[] => {
	const args = ["create", "--name", options.name, "--workdir", githubWorkspace];
	for (const [name, value] of Object.entries(githubEnvironment)) {
		args.push("--env", `${name}=${value}`);
	}
	args.push(...options.runtime.createOptions);
	args.push(
		"--volume",
		`${options.root}:/github`,
		"--volume",
		`${options.workspace}:${githubWorkspace}`,
		"--entrypoint",
		"sleep",
		options.image,
		"infinity",
	);
	return args;
};

const prepareGitHubRoot = async (actionBundle?: string): Promise<string> => {
	const root = await mkdtemp(`${tmpdir()}/hollywood-github-`);
	await Promise.all(
		["file_commands", "home", "temp", "workflow"].map((directory) =>
			mkdir(`${root}/${directory}`, { recursive: true }),
		),
	);
	await Promise.all(
		["env", "output", "path", "state", "step_summary"].map((file) =>
			writeFile(`${root}/file_commands/${file}`, ""),
		),
	);
	await writeFile(`${root}/workflow/event.json`, "{}\n");
	if (actionBundle !== undefined) {
		await copyFile(actionBundle, `${root}/workflow/action.mjs`);
	}
	await Promise.all([
		chmod(root, 0o777),
		...["file_commands", "home", "temp", "workflow"].map((directory) =>
			chmod(`${root}/${directory}`, 0o777),
		),
		...["env", "output", "path", "state", "step_summary"].map((file) =>
			chmod(`${root}/file_commands/${file}`, 0o666),
		),
	]);
	return root;
};

const cleanup = async (
	options: Readonly<{
		created: boolean;
		hostExec: ScriptExec;
		name: string;
		root: string;
		runtime: ContainerRuntime;
	}>,
): Promise<readonly unknown[]> => {
	const operations: (() => Promise<unknown>)[] = [];
	if (options.created) {
		operations.push(() =>
			options.hostExec(options.runtime.binary, [options.runtime.remove, "--force", options.name]),
		);
	}
	operations.push(() => rm(options.root, { force: true, recursive: true }));
	const failures: unknown[] = [];
	for (const operation of operations) {
		try {
			await operation();
		} catch (error: unknown) {
			failures.push(error);
		}
	}
	return failures;
};

const containerPath = (workspace: string, path: string): string => {
	if (path === githubWorkspace || path.startsWith(`${githubWorkspace}/`)) {
		const normalized = posix.normalize(path);
		if (normalized === githubWorkspace || normalized.startsWith(`${githubWorkspace}/`)) {
			return normalized;
		}
		throw new Error(`Path is outside the container workspace: ${path}.`);
	}
	const absolute = resolve(workspace, path);
	const child = relative(workspace, absolute);
	if (child === ".." || child.startsWith(`..${sep}`) || child.startsWith(sep)) {
		throw new Error(`Path is outside the container workspace: ${path}.`);
	}
	return child === "" ? githubWorkspace : posix.join(githubWorkspace, ...child.split(sep));
};

export const containerRuntime = (provider: ContainerProvider): ContainerRuntime => {
	switch (provider) {
		case "container":
			return { binary: "container", createOptions: [], remove: "delete" };
		case "docker":
			return { binary: "docker", createOptions: [], remove: "rm" };
		case "podman":
			return { binary: "podman", createOptions: ["--userns=keep-id"], remove: "rm" };
		default:
			throw new Error(`Unsupported container provider: ${String(provider)}.`);
	}
};

export const assertImmutableImage = (image: string): void => {
	if (!/(?:@sha256:|^sha256:)[0-9a-f]{64}$/.test(image)) {
		throw new Error("Container image must use a SHA-256 digest or image ID.");
	}
};

export const parseContainerProvider = (value: string): ContainerProvider => {
	switch (value) {
		case "container":
		case "docker":
		case "podman":
			return value;
		default:
			throw new Error(`Unsupported container provider: ${value}.`);
	}
};

const isMissingExecutable = (error: unknown): boolean =>
	typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
