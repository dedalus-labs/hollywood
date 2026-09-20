import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { arch, platform, release, version } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";

import { nodeExec } from "./local";
import {
	parseRunnerContract,
	parseRunnerProbe,
	type RunnerContract,
	type RunnerPackageProbe,
	type RunnerPathProbe,
	type RunnerProbe,
	type RunnerToolProbe,
} from "./runner-contract";
import {
	runnerEnvironmentNames,
	runnerPathEnvironmentNames,
	runnerProbeSchemaVersion,
	runnerToolNames,
	type RunnerToolName,
} from "./runner-schema";
import type { ScriptExec } from "./script";

const toolVersionArguments: Readonly<Record<RunnerToolName, readonly string[]>> = {
	bash: ["--version"],
	cargo: ["--version"],
	clang: ["--version"],
	cmake: ["--version"],
	curl: ["--version"],
	docker: ["--version"],
	gcc: ["--version"],
	gh: ["--version"],
	git: ["--version"],
	go: ["version"],
	java: ["--version"],
	jq: ["--version"],
	make: ["--version"],
	node: ["--version"],
	npm: ["--version"],
	podman: ["--version"],
	python3: ["--version"],
	ruby: ["--version"],
	rustc: ["--version"],
	tar: ["--version"],
	zstd: ["--version"],
};

export type RunnerProbeSource = Readonly<{
	architecture: string;
	env: Readonly<Record<string, string | undefined>>;
	exec: ScriptExec;
	gid: number;
	kernelRelease: string;
	kernelVersion: string;
	operatingSystem: string;
	pathDelimiter: string;
	readDirectory: (path: string) => Promise<readonly string[]>;
	readText: (path: string) => Promise<string>;
	testAccess: (path: string, mode?: number) => Promise<boolean>;
	uid: number;
}>;

export const probeRunner = async (
	source: RunnerProbeSource = localProbeSource(),
): Promise<RunnerProbe> => {
	if (source.operatingSystem !== "linux") {
		throw new Error(`Runner probe requires Linux. Received ${source.operatingSystem}.`);
	}
	const pathEntries = requiredEnvironment(source.env, "PATH").split(source.pathDelimiter);
	const [groups, osRelease, capabilities, cgroup, paths, tools, packages, toolCache] =
		await Promise.all([
			probeGroups(source.exec),
			probeOsRelease(source.readText),
			probeCapabilities(source.readText),
			probeCgroup(source.testAccess),
			probePaths(source),
			probeTools(source, pathEntries),
			probePackages(source, pathEntries),
			probeToolCache(source),
		]);
	return {
		schemaVersion: runnerProbeSchemaVersion,
		environment: selectedEnvironment(source.env),
		identity: { gid: source.gid, groups, uid: source.uid },
		packages,
		paths,
		platform: {
			architecture: source.architecture,
			capabilities,
			cgroup,
			kernelRelease: source.kernelRelease,
			kernelVersion: source.kernelVersion,
			os: osRelease,
		},
		tools,
		toolCache,
	};
};

export const readRunnerContract = async (path: string): Promise<RunnerContract> =>
	parseRunnerContract(await readFile(path, "utf8"));

export const readRunnerProbe = async (path: string): Promise<RunnerProbe> =>
	parseRunnerProbe(await readFile(path, "utf8"));

export const writeRunnerProbe = async (path: string, probe: RunnerProbe): Promise<void> => {
	await writeFile(path, `${JSON.stringify(probe, undefined, 2)}\n`);
};

const localProbeSource = (): RunnerProbeSource => {
	const uid = process.getuid?.();
	const gid = process.getgid?.();
	if (uid === undefined || gid === undefined) {
		throw new Error("Runner probe requires a POSIX user ID and group ID.");
	}
	return {
		architecture: arch(),
		env: process.env,
		exec: nodeExec,
		gid,
		kernelRelease: release(),
		kernelVersion: version(),
		operatingSystem: platform(),
		pathDelimiter: delimiter,
		readDirectory: async (path) => readdir(path),
		readText: (path) => readFile(path, "utf8"),
		testAccess: async (path, mode) => {
			try {
				await access(path, mode);
				return true;
			} catch (error: unknown) {
				if (isMissing(error)) {
					return false;
				}
				throw error;
			}
		},
		uid,
	};
};

const probeGroups = async (exec: ScriptExec): Promise<readonly string[]> => {
	const result = await exec("id", ["-Gn"]);
	return result.stdout.trim().split(/\s+/).filter(Boolean).sort();
};

const probeOsRelease = async (
	readText: RunnerProbeSource["readText"],
): Promise<RunnerProbe["platform"]["os"]> => {
	const values = Object.fromEntries(
		(await readText("/etc/os-release"))
			.split("\n")
			.filter((line) => line.includes("="))
			.map((line) => {
				const separator = line.indexOf("=");
				return [line.slice(0, separator), line.slice(separator + 1).replace(/^"|"$/g, "")];
			}),
	);
	return {
		id: requiredEnvironment(values, "ID"),
		prettyName: requiredEnvironment(values, "PRETTY_NAME"),
		versionId: requiredEnvironment(values, "VERSION_ID"),
	};
};

const probeCapabilities = async (readText: RunnerProbeSource["readText"]): Promise<string> => {
	const match = /(?:^|\n)CapEff:\s*([0-9a-fA-F]+)/.exec(await readText("/proc/self/status"));
	if (match?.[1] === undefined) {
		throw new Error("Runner probe could not read CapEff from /proc/self/status.");
	}
	return match[1].toLowerCase();
};

const probeCgroup = async (
	testAccess: RunnerProbeSource["testAccess"],
): Promise<RunnerProbe["platform"]["cgroup"]> =>
	(await testAccess("/sys/fs/cgroup/cgroup.controllers")) ? "v2" : "v1";

const probePaths = async (source: RunnerProbeSource): Promise<readonly RunnerPathProbe[]> =>
	Promise.all(
		runnerPathEnvironmentNames.map(async (name): Promise<RunnerPathProbe> => {
			const value = source.env[name];
			if (value === undefined || value === "") {
				return { name, status: "absent" };
			}
			return {
				absolute: isAbsolute(value),
				exists: await source.testAccess(value),
				name,
				status: "ready",
				value,
				writable: await source.testAccess(value, 2),
			};
		}),
	);

const probeTools = async (
	source: RunnerProbeSource,
	pathEntries: readonly string[],
): Promise<readonly RunnerToolProbe[]> =>
	Promise.all(
		runnerToolNames.map(async (name): Promise<RunnerToolProbe> => {
			const path = await resolveExecutable(source, name, pathEntries);
			if (path === undefined) {
				return { name, status: "absent" };
			}
			const result = await source.exec(path, toolVersionArguments[name]);
			const version = firstLine(`${result.stdout}\n${result.stderr}`);
			if (version === "") {
				throw new Error(`Runner tool '${name}' returned no version.`);
			}
			return { name, path, status: "ready", version };
		}),
	);

const probePackages = async (
	source: RunnerProbeSource,
	pathEntries: readonly string[],
): Promise<RunnerPackageProbe> => {
	const dpkgQuery = await resolveExecutable(source, "dpkg-query", pathEntries);
	if (dpkgQuery === undefined) {
		return { manager: "none", packages: [] };
	}
	const result = await source.exec(dpkgQuery, [
		"-W",
		"-f=${binary:Package}\\t${Version}\\n",
	]);
	const packages = result.stdout
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [name, packageVersion, ...extra] = line.split("\t");
			if (name === undefined || packageVersion === undefined || extra.length > 0) {
				throw new Error(`Runner package inventory contains an invalid line: ${line}.`);
			}
			return { name, version: packageVersion };
		})
		.sort((left, right) => left.name.localeCompare(right.name));
	return { manager: "dpkg", packages };
};

const probeToolCache = async (
	source: RunnerProbeSource,
): Promise<Readonly<Record<string, readonly string[]>>> => {
	const root = source.env["RUNNER_TOOL_CACHE"];
	if (root === undefined || root === "") {
		return {};
	}
	const entries = [...(await source.readDirectory(root))].sort();
	const cache = await Promise.all(
		entries.map(
			async (name) =>
				[name, [...(await source.readDirectory(join(root, name)))].sort()] as const,
		),
	);
	return Object.fromEntries(cache);
};

const resolveExecutable = async (
	source: RunnerProbeSource,
	name: string,
	pathEntries: readonly string[],
): Promise<string | undefined> => {
	for (const directory of pathEntries) {
		const candidate = join(directory, name);
		if (await source.testAccess(candidate, 1)) {
			return candidate;
		}
	}
	return undefined;
};

const selectedEnvironment = (
	environment: RunnerProbeSource["env"],
): RunnerProbe["environment"] =>
	Object.fromEntries(
		runnerEnvironmentNames.flatMap((name) => {
			const value = environment[name];
			return value === undefined ? [] : [[name, value]];
		}),
	);

const requiredEnvironment = (
	environment: Readonly<Record<string, string | undefined>>,
	name: string,
): string => {
	const value = environment[name];
	if (value === undefined || value === "") {
		throw new Error(`Runner probe requires ${name}.`);
	}
	return value;
};

const firstLine = (value: string): string =>
	value
		.split("\n")
		.map((line) => line.trim())
		.find(Boolean) ?? "";

const isMissing = (error: unknown): boolean =>
	error instanceof Error && "code" in error && error.code === "ENOENT";
