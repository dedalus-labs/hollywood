import type { RunnerContext, ScriptExec } from "./script";

export type LimaContainerRuntime = "nerdctl";

export type LimaEnvironmentProbe = Readonly<{
	name: string;
	exec: ScriptExec;
	requireContainerd?: boolean;
	requireKvm?: boolean;
	start?: boolean;
}>;

export type LimaExecOptions = Readonly<{
	name: string;
	exec: ScriptExec;
	start?: boolean;
}>;

export type LimaEnvironmentResult =
	| Readonly<{
			status: "ready";
			name: string;
			runtime?: LimaContainerRuntime;
	  }>
	| Readonly<{
			status: "rejected";
			name: string;
			reason: string;
	  }>;

type LimaListEntry = Readonly<{
	name: string;
	status: string;
}>;

export const probeLimaEnvironment = async (
	probe: LimaEnvironmentProbe,
): Promise<LimaEnvironmentResult> => {
	try {
		const vm = await findLimaVm(probe);
		if (vm.status !== "Running") {
			if (probe.start !== true) {
				return reject(probe.name, `lima vm is stopped: ${probe.name}`);
			}
			await probe.exec("limactl", ["start", probe.name]);
		}
		await requireShell(probe, ["uname", "-s"], "Linux");
		if (probe.requireContainerd === true) {
			await requireShell(probe, ["systemctl", "--user", "is-active", "containerd"], "active");
			await probe.exec("limactl", ["shell", probe.name, "--", "nerdctl", "--version"]);
		}
		if (probe.requireKvm === true) {
			await probe.exec("limactl", [
				"shell",
				probe.name,
				"--",
				"test",
				"-r",
				"/dev/kvm",
				"-a",
				"-w",
				"/dev/kvm",
			]);
		}
		if (probe.requireContainerd === true) {
			return { status: "ready", name: probe.name, runtime: "nerdctl" };
		}
		return { status: "ready", name: probe.name };
	} catch (error) {
		return reject(probe.name, error instanceof Error ? error.message : String(error));
	}
};

export const limaExec =
	(options: LimaExecOptions): ScriptExec =>
	(file, args, commandOptions = {}) => {
		const command = ["shell", "--tty=false"];
		if (options.start === true) {
			command.push("--start");
		}
		if (commandOptions.cwd !== undefined) {
			command.push("--workdir", commandOptions.cwd);
		}
		command.push(options.name, "--");
		if (commandOptions.env !== undefined) {
			command.push(
				"env",
				...Object.entries(commandOptions.env).map(([name, value]) => `${name}=${value}`),
			);
		}
		return options.exec(
			"limactl",
			[...command, file, ...args],
			commandOptions.exitPolicy === undefined
				? undefined
				: { exitPolicy: commandOptions.exitPolicy },
		);
	};

export const limaRunner = async (options: LimaExecOptions): Promise<RunnerContext> => {
	const exec = limaExec(options);
	const [uid, gid] = await Promise.all([exec("id", ["-u"]), exec("id", ["-g"])]);
	return { uidGid: `${uid.stdout.trim()}:${gid.stdout.trim()}` };
};

const findLimaVm = async (probe: LimaEnvironmentProbe): Promise<LimaListEntry> => {
	const result = await probe.exec("limactl", ["list", "--json"]);
	const vm = parseLimaList(result.stdout).find((entry) => entry.name === probe.name);
	if (vm === undefined) {
		throw new Error(`lima vm not found: ${probe.name}`);
	}
	return vm;
};

const parseLimaList = (stdout: string): readonly LimaListEntry[] =>
	stdout
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as LimaListEntry);

const requireShell = async (
	probe: LimaEnvironmentProbe,
	args: readonly string[],
	expected: string,
): Promise<void> => {
	const result = await probe.exec("limactl", ["shell", probe.name, "--", ...args]);
	if (result.stdout.trim() !== expected) {
		throw new Error(`lima ${args.join(" ")} returned ${result.stdout.trim()}`);
	}
};

const reject = (name: string, reason: string): LimaEnvironmentResult => ({
	status: "rejected",
	name,
	reason,
});
