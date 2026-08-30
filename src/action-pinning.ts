import { isMap, isScalar, isSeq, parseDocument } from "yaml";

import type { GitHubYamlFile, GitHubYamlValidation, GitHubYamlValidationError } from "./validation";

export type ActionReference =
	| Readonly<{ kind: "local"; path: string }>
	| Readonly<{ kind: "repository"; owner: string; repo: string; path?: string; ref?: string }>
	| Readonly<{ kind: "docker"; image: string; digest?: string }>
	| Readonly<{ kind: "expression"; value: string }>
	| Readonly<{ kind: "unknown"; value: string }>;

export type ActionPinningReason =
	| "expression"
	| "missing-ref"
	| "mutable-image"
	| "mutable-ref"
	| "unparsable";

export type ActionPinningOptions = Readonly<{
	allowUnpinned?: readonly string[];
}>;

export type ActionPinningFinding = Readonly<{
	line: number;
	message: string;
	reason: ActionPinningReason;
	uses: string;
}>;

const commitSha = /^[0-9a-f]{40}$/i;
const objectSha = /^[0-9a-f]{64}$/i;
const imageDigest = /^sha256:[0-9a-f]{64}$/i;
const dockerPrefix = "docker://";
const localPrefix = "./";

export const parseActionReference = (uses: string): ActionReference => {
	const value = uses.trim();
	if (value.length === 0) {
		return { kind: "unknown", value };
	}
	if (value.includes("${{")) {
		return { kind: "expression", value };
	}
	if (value.startsWith(localPrefix)) {
		return { kind: "local", path: value };
	}
	if (value.startsWith(dockerPrefix)) {
		return parseDockerReference(value.slice(dockerPrefix.length), value);
	}
	return parseRepositoryReference(value);
};

export const isPinnedActionReference = (reference: ActionReference): boolean => {
	switch (reference.kind) {
		case "local":
			return true;
		case "repository":
			return reference.ref !== undefined && isCommitSha(reference.ref);
		case "docker":
			return reference.digest !== undefined && imageDigest.test(reference.digest);
		default:
			return false;
	}
};

export const findUnpinnedActions = (
	file: GitHubYamlFile,
	options: ActionPinningOptions = {},
): readonly ActionPinningFinding[] => {
	const allowed = options.allowUnpinned ?? [];
	const findings: ActionPinningFinding[] = [];
	for (const candidate of collectUsesValues(file)) {
		const reference = parseActionReference(candidate.uses);
		if (isPinnedActionReference(reference) || isAllowed(reference, allowed)) {
			continue;
		}
		const reason = unpinnedReason(reference);
		findings.push({
			line: candidate.line,
			message: `${describeReason(reason)}: ${candidate.uses}`,
			reason,
			uses: candidate.uses,
		});
	}
	return findings;
};

export const validateActionPinning = (
	file: GitHubYamlFile,
	options: ActionPinningOptions = {},
): GitHubYamlValidation => {
	const errors: readonly GitHubYamlValidationError[] = findUnpinnedActions(file, options).map(
		(finding) => ({ message: `${file.name}:${finding.line}: ${finding.message}` }),
	);
	if (errors.length === 0) {
		return { status: "valid", errors: [] };
	}
	return {
		status: "invalid",
		errors: errors as readonly [GitHubYamlValidationError, ...GitHubYamlValidationError[]],
	};
};

export const assertPinnedActions = (
	file: GitHubYamlFile,
	options: ActionPinningOptions = {},
): void => {
	const validation = validateActionPinning(file, options);
	if (validation.status === "valid") {
		return;
	}
	throw new Error(
		`GitHub action references are not pinned:\n${validation.errors
			.map((error) => `- ${error.message}`)
			.join("\n")}`,
	);
};

type UsesCandidate = Readonly<{ line: number; uses: string }>;

const parseDockerReference = (image: string, value: string): ActionReference => {
	if (image.length === 0) {
		return { kind: "unknown", value };
	}
	const separator = image.lastIndexOf("@");
	if (separator === -1) {
		return { kind: "docker", image };
	}
	return {
		kind: "docker",
		image: image.slice(0, separator),
		digest: image.slice(separator + 1),
	};
};

const parseRepositoryReference = (value: string): ActionReference => {
	const separator = value.lastIndexOf("@");
	const target = separator === -1 ? value : value.slice(0, separator);
	const segments = target.split("/");
	const owner = segments[0];
	const repo = segments[1];
	if (owner === undefined || repo === undefined || owner.length === 0 || repo.length === 0) {
		return { kind: "unknown", value };
	}
	const path = segments.slice(2).join("/");
	return {
		kind: "repository",
		owner,
		repo,
		...(path.length === 0 ? {} : { path }),
		...(separator === -1 ? {} : { ref: value.slice(separator + 1) }),
	};
};

const isCommitSha = (ref: string): boolean => commitSha.test(ref) || objectSha.test(ref);

const isAllowed = (reference: ActionReference, allowed: readonly string[]): boolean => {
	if (allowed.length === 0) {
		return false;
	}
	const name = allowlistName(reference);
	return allowed.some((pattern) => matchesAllowlist(name, pattern));
};

const allowlistName = (reference: ActionReference): string => {
	switch (reference.kind) {
		case "repository":
			return `${reference.owner}/${reference.repo}`;
		case "docker":
			return `${dockerPrefix}${dockerImageName(reference.image)}`;
		case "local":
			return reference.path;
		default:
			return reference.value;
	}
};

// Allow patterns name an action, not a version, so the mutable part is dropped
// first: a repository ref, or an image tag after the final path segment.
const dockerImageName = (image: string): string => {
	const tag = image.indexOf(":", image.lastIndexOf("/") + 1);
	return tag === -1 ? image : image.slice(0, tag);
};

const matchesAllowlist = (name: string, pattern: string): boolean =>
	pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern;

const unpinnedReason = (reference: ActionReference): ActionPinningReason => {
	switch (reference.kind) {
		case "repository":
			return reference.ref === undefined ? "missing-ref" : "mutable-ref";
		case "docker":
			return "mutable-image";
		case "expression":
			return "expression";
		default:
			return "unparsable";
	}
};

const describeReason = (reason: ActionPinningReason): string => {
	switch (reason) {
		case "missing-ref":
			return "action reference has no commit SHA";
		case "mutable-ref":
			return "action reference is not pinned to a commit SHA";
		case "mutable-image":
			return "container action is not pinned to an image digest";
		case "expression":
			return "action reference is an expression and cannot be pinned";
		default:
			return "action reference cannot be parsed";
	}
};

const collectUsesValues = (file: GitHubYamlFile): readonly UsesCandidate[] =>
	isYamlFile(file.name)
		? collectYamlUsesValues(file.content)
		: collectSourceUsesValues(file.content);

const isYamlFile = (name: string): boolean => name.endsWith(".yml") || name.endsWith(".yaml");

// `with:` and `env:` values are action inputs, not action references. A step input
// named `uses` must not be mistaken for one.
const inputKeys = new Set(["env", "with"]);

const collectYamlUsesValues = (content: string): readonly UsesCandidate[] => {
	const candidates: UsesCandidate[] = [];
	try {
		visitYamlNode(parseDocument(content).contents, content, candidates);
	} catch {
		// Malformed YAML is reported by validateWorkflowContent, not by this rule.
		return [];
	}
	return candidates;
};

const visitYamlNode = (node: unknown, content: string, candidates: UsesCandidate[]): void => {
	if (isSeq(node)) {
		for (const item of node.items) {
			visitYamlNode(item, content, candidates);
		}
		return;
	}
	if (!isMap(node)) {
		return;
	}
	for (const item of node.items) {
		const key = isScalar(item.key) ? item.key.value : undefined;
		if (typeof key === "string" && inputKeys.has(key)) {
			continue;
		}
		if (key === "uses" && isScalar(item.value) && typeof item.value.value === "string") {
			candidates.push({
				line: lineAt(content, item.value.range?.[0] ?? 0),
				uses: item.value.value,
			});
			continue;
		}
		visitYamlNode(item.value, content, candidates);
	}
};

const sourceUsesPattern = /\buses\s*:\s*(["'`])([^"'`\n]*)\1/g;

const collectSourceUsesValues = (content: string): readonly UsesCandidate[] => {
	const candidates: UsesCandidate[] = [];
	for (const match of content.matchAll(sourceUsesPattern)) {
		const uses = match[2];
		if (match.index === undefined || uses === undefined || isCommented(content, match.index)) {
			continue;
		}
		candidates.push({ line: lineAt(content, match.index), uses });
	}
	return candidates;
};

const isCommented = (content: string, index: number): boolean => {
	const prefix = content.slice(content.lastIndexOf("\n", index) + 1, index);
	return prefix.includes("//") || prefix.trimStart().startsWith("*");
};

const lineAt = (content: string, offset: number): number =>
	content.slice(0, offset).split("\n").length;
