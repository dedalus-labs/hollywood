import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	assertImmutableImage,
	ContainerProviderUnavailableError,
	containerRuntime,
	type ContainerProvider,
} from "./container";
import type { Command } from "./script";

declare const encodedGitHubJitConfigBrand: unique symbol;

export type EncodedGitHubJitConfig = string & {
	readonly [encodedGitHubJitConfigBrand]: true;
};

export type GitHubRunnerContainerEngine = Readonly<{
	kind: "docker-socket";
	path: string;
}>;

export type GitHubRunnerHooks = Readonly<{
	container?: string;
	jobCompleted?: string;
	jobStarted?: string;
	requireJobContainer?: boolean;
}>;

export type GitHubRunnerOptions = Readonly<{
	containerEngine?: GitHubRunnerContainerEngine;
	diagnostics?: string;
	encodedJitConfig: EncodedGitHubJitConfig;
	hooks?: GitHubRunnerHooks;
	image: string;
	provider: ContainerProvider;
}>;

export type GitHubRunnerProcess = (command: Command) => Promise<void>;

export type GitHubRunnerServices = Readonly<{
	process: GitHubRunnerProcess;
	runnerLauncher: URL;
}>;

type ContainerMount = Readonly<{
	readonly: boolean;
	source: string;
	target: string;
}>;

const launcherTarget = "/opt/hollywood/runner-launch.js";
const dockerSocketTarget = "/var/run/docker.sock";
const hookTargets = {
	container: "/opt/hollywood/hooks/container.js",
	jobCompleted: "/opt/hollywood/hooks/job-completed",
	jobStarted: "/opt/hollywood/hooks/job-started",
} as const;

export const parseEncodedGitHubJitConfig = (value: string): EncodedGitHubJitConfig => {
	const decoded = decodeCanonicalBase64(value, "GitHub JIT configuration");
	let configuration: unknown;
	try {
		configuration = JSON.parse(decoded.toString("utf8")) as unknown;
	} catch (error: unknown) {
		throw new Error("GitHub JIT configuration must decode to JSON.", { cause: error });
	}
	if (
		configuration === null ||
		typeof configuration !== "object" ||
		Array.isArray(configuration) ||
		Object.keys(configuration).length === 0
	) {
		throw new Error("GitHub JIT configuration must decode to a nonempty object.");
	}
	for (const [name, contents] of Object.entries(configuration)) {
		if (!/^\.[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
			throw new Error(`GitHub JIT configuration entry name '${name}' is not a safe file name.`);
		}
		if (typeof contents !== "string") {
			throw new Error(`GitHub JIT configuration entry '${name}' must be base64 text.`);
		}
		decodeCanonicalBase64(contents, `GitHub JIT configuration entry '${name}'`);
	}
	return value as EncodedGitHubJitConfig;
};

export const readEncodedGitHubJitConfig = async (path: string): Promise<EncodedGitHubJitConfig> =>
	parseEncodedGitHubJitConfig((await readFile(path, "utf8")).trim());

export const runGitHubRunner = async (
	options: GitHubRunnerOptions,
	services: GitHubRunnerServices = {
		process: runForeground,
		runnerLauncher: new URL("./runner-launch.js", import.meta.url),
	},
): Promise<void> => {
	assertImmutableImage(options.image);
	const root = await mkdtemp(`${tmpdir()}/hollywood-runner-`);
	const environmentPath = `${root}/runner.env`;
	let failure: unknown;
	try {
		const launch = await prepareLaunch(options, services.runnerLauncher, environmentPath);
		await services.process(launch);
	} catch (error: unknown) {
		failure = isMissingExecutable(error)
			? new ContainerProviderUnavailableError(
					options.provider,
					containerRuntime(options.provider).binary,
					error,
				)
			: error;
	}
	try {
		await rm(root, { force: true, recursive: true });
	} catch (cleanupError: unknown) {
		if (failure !== undefined) {
			throw new AggregateError(
				[failure, cleanupError],
				"GitHub runner execution and secret cleanup failed.",
			);
		}
		throw cleanupError;
	}
	if (failure !== undefined) {
		throw failure;
	}
};

const prepareLaunch = async (
	options: GitHubRunnerOptions,
	runnerLauncher: URL,
	environmentPath: string,
): Promise<Command> => {
	const runtime = containerRuntime(options.provider);
	const environment: Record<string, string> = {
		HOLLYWOOD_RUNNER_JIT_CONFIG: options.encodedJitConfig,
	};
	const mounts: ContainerMount[] = [
		{
			source: fileURLToPath(runnerLauncher),
			target: launcherTarget,
			readonly: true,
		},
	];
	if (options.diagnostics !== undefined) {
		const diagnostics = resolve(options.diagnostics);
		await mkdir(diagnostics, { recursive: true });
		mounts.push({ source: diagnostics, target: "/home/runner/_diag", readonly: false });
	}
	if (options.hooks?.jobStarted !== undefined) {
		await assertHook(options.hooks.jobStarted, true);
		mounts.push({
			source: resolve(options.hooks.jobStarted),
			target: hookTargets.jobStarted,
			readonly: true,
		});
		environment["ACTIONS_RUNNER_HOOK_JOB_STARTED"] = hookTargets.jobStarted;
	}
	if (options.hooks?.jobCompleted !== undefined) {
		await assertHook(options.hooks.jobCompleted, true);
		mounts.push({
			source: resolve(options.hooks.jobCompleted),
			target: hookTargets.jobCompleted,
			readonly: true,
		});
		environment["ACTIONS_RUNNER_HOOK_JOB_COMPLETED"] = hookTargets.jobCompleted;
	}
	if (options.hooks?.container !== undefined) {
		await assertHook(options.hooks.container, false);
		mounts.push({
			source: resolve(options.hooks.container),
			target: hookTargets.container,
			readonly: true,
		});
		environment["ACTIONS_RUNNER_CONTAINER_HOOKS"] = hookTargets.container;
	}
	if (options.hooks?.requireJobContainer === true) {
		environment["ACTIONS_RUNNER_REQUIRE_JOB_CONTAINER"] = "true";
	}
	await writeFile(
		environmentPath,
		`${Object.entries(environment)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([name, value]) => `${name}=${value}`)
			.join("\n")}\n`,
		{ mode: 0o600 },
	);
	await chmod(environmentPath, 0o600);

	const args = [
		"run",
		"--rm",
		"--init",
		"--name",
		`hollywood-runner-${randomUUID()}`,
		"--workdir",
		"/home/runner",
		"--env-file",
		environmentPath,
	];
	for (const mount of mounts) {
		args.push("--mount", mountArgument(mount));
	}
	if (options.containerEngine !== undefined) {
		const socket = resolve(options.containerEngine.path);
		if (!(await stat(socket)).isSocket()) {
			throw new Error(`Container engine path must be a Unix socket: ${socket}.`);
		}
		if (options.provider === "container") {
			args.push("--publish-socket", `${socket}:${dockerSocketTarget}`);
		} else {
			args.push(
				"--mount",
				mountArgument({ source: socket, target: dockerSocketTarget, readonly: false }),
			);
		}
	}
	args.push(
		"--entrypoint",
		"/home/runner/externals/node24/bin/node",
		options.image,
		launcherTarget,
	);
	return { file: runtime.binary, args };
};

const assertHook = async (path: string, executable: boolean): Promise<void> => {
	const resolved = resolve(path);
	const metadata = await stat(resolved);
	if (!metadata.isFile()) {
		throw new Error(`GitHub runner hook must be a regular file: ${resolved}.`);
	}
	if (executable && (metadata.mode & 0o111) === 0) {
		throw new Error(`GitHub runner job hook must be executable: ${resolved}.`);
	}
};

const mountArgument = (mount: ContainerMount): string => {
	if (mount.source.includes(",") || mount.target.includes(",")) {
		throw new Error(`Container mount paths must not contain commas: ${mount.source}.`);
	}
	return `type=bind,source=${mount.source},target=${mount.target}${mount.readonly ? ",readonly" : ""}`;
};

const decodeCanonicalBase64 = (value: string, name: string): Buffer => {
	if (
		value.length === 0 ||
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
	) {
		throw new Error(`${name} must be canonical base64.`);
	}
	const decoded = Buffer.from(value, "base64");
	if (decoded.toString("base64") !== value) {
		throw new Error(`${name} must be canonical base64.`);
	}
	return decoded;
};

const runForeground: GitHubRunnerProcess = ({ file, args }) =>
	new Promise((resolveProcess, rejectProcess) => {
		const child = spawn(file, [...args], { stdio: "inherit" });
		const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
		const handlers = signals.map((signal) => [signal, () => child.kill(signal)] as const);
		for (const [signal, handler] of handlers) {
			process.once(signal, handler);
		}
		const removeSignalHandlers = (): void => {
			for (const [signal, handler] of handlers) {
				process.off(signal, handler);
			}
		};
		child.once("error", (error) => {
			removeSignalHandlers();
			rejectProcess(error);
		});
		child.once("close", (code, signal) => {
			removeSignalHandlers();
			if (code === 0) {
				resolveProcess();
				return;
			}
			rejectProcess(
				new Error(
					signal === null
						? `${file} exited with code ${String(code ?? 1)}.`
						: `${file} exited after signal ${signal}.`,
				),
			);
		});
	});

const isMissingExecutable = (error: unknown): boolean =>
	typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
