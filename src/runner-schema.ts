import { z } from "zod";

export const runnerProbeSchemaVersion = 1 as const;

export const runnerArchitectures = ["arm64", "x64"] as const;

export const runnerEnvironmentNames = [
	"CI",
	"GITHUB_ACTIONS",
	"ImageOS",
	"ImageVersion",
	"RUNNER_ARCH",
	"RUNNER_OS",
] as const;

export const runnerPathEnvironmentNames = [
	"GITHUB_ENV",
	"GITHUB_EVENT_PATH",
	"GITHUB_OUTPUT",
	"GITHUB_PATH",
	"GITHUB_STATE",
	"GITHUB_STEP_SUMMARY",
	"GITHUB_WORKSPACE",
	"HOME",
	"RUNNER_TEMP",
	"RUNNER_TOOL_CACHE",
] as const;

export const runnerToolNames = [
	"bash",
	"cargo",
	"clang",
	"cmake",
	"curl",
	"docker",
	"gcc",
	"gh",
	"git",
	"go",
	"java",
	"jq",
	"make",
	"node",
	"npm",
	"podman",
	"python3",
	"ruby",
	"rustc",
	"tar",
	"zstd",
] as const;

const text = z.string().min(1);
const environment = z.partialRecord(z.enum(runnerEnvironmentNames), z.string());
const pathName = z.enum(runnerPathEnvironmentNames);
const toolName = z.enum(runnerToolNames);

const pathProbe = z.discriminatedUnion("status", [
	z.strictObject({ name: pathName, status: z.literal("absent") }),
	z.strictObject({
		absolute: z.boolean(),
		exists: z.boolean(),
		name: pathName,
		status: z.literal("ready"),
		value: text,
		writable: z.boolean(),
	}),
]);

const toolProbe = z.discriminatedUnion("status", [
	z.strictObject({ name: toolName, status: z.literal("absent") }),
	z.strictObject({
		name: toolName,
		path: text,
		status: z.literal("ready"),
		version: text,
	}),
]);

const packageRecord = z.strictObject({ name: text, version: text });
const packageProbe = z.discriminatedUnion("manager", [
	z.strictObject({ manager: z.literal("none"), packages: z.tuple([]) }),
	z.strictObject({ manager: z.literal("dpkg"), packages: z.array(packageRecord) }),
]);

export const runnerProbeSchema = z.strictObject({
	schemaVersion: z.literal(runnerProbeSchemaVersion),
	environment,
	identity: z.strictObject({
		gid: z.number().int().nonnegative(),
		groups: z.array(text),
		uid: z.number().int().nonnegative(),
	}),
	packages: packageProbe,
	paths: z.array(pathProbe),
	platform: z.strictObject({
		architecture: text,
		capabilities: text,
		cgroup: z.enum(["v1", "v2"]),
		kernelRelease: text,
		kernelVersion: text,
		os: z.strictObject({ id: text, prettyName: text, versionId: text }),
	}),
	tools: z.array(toolProbe),
	toolCache: z.record(z.string(), z.array(text)),
});

export const runnerContractSchema = z.strictObject({
	schemaVersion: z.literal(runnerProbeSchemaVersion),
	architectures: z.array(z.enum(runnerArchitectures)).min(1),
	environment,
	os: z.strictObject({ id: text, versionId: text }),
	paths: z.array(pathName),
	tools: z.array(
		z.strictObject({
			name: toolName,
			versionPrefix: z.string().min(1).optional(),
		}),
	),
});

type DeepReadonly<Value> = Value extends readonly unknown[]
	? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
	: Value extends object
		? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
		: Value;

export type RunnerArchitecture = (typeof runnerArchitectures)[number];
export type RunnerEnvironmentName = (typeof runnerEnvironmentNames)[number];
export type RunnerPathEnvironmentName = (typeof runnerPathEnvironmentNames)[number];
export type RunnerToolName = (typeof runnerToolNames)[number];
export type RunnerContract = DeepReadonly<z.infer<typeof runnerContractSchema>>;
export type RunnerProbe = DeepReadonly<z.infer<typeof runnerProbeSchema>>;
export type RunnerPackageProbe = RunnerProbe["packages"];
export type RunnerPathProbe = RunnerProbe["paths"][number];
export type RunnerToolProbe = RunnerProbe["tools"][number];

export type RunnerDifference = Readonly<{
	category: "contract" | "inventory" | "provider";
	actual?: unknown;
	expected?: unknown;
	path: string;
}>;
