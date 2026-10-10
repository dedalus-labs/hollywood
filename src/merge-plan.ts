import { z } from "zod";
import { deploymentRequirement, verifyGitHubDeploymentReceipt } from "./deployment-receipt";

const sha = z.string().regex(/^[0-9a-f]{40}$/);
const number = z.number().int().positive();
const text = z.string().min(1);
const candidate = z.object({
	pull: number,
	head: sha,
	after: z.array(z.object({ pull: number, deployment: deploymentRequirement.optional() })),
});
const planSchema = z.object({
	repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
	base: text,
	candidates: z.array(candidate),
});
const pullSchema = z.object({
	number,
	state: text,
	draft: z.boolean(),
	merged: z.boolean(),
	merge_commit_sha: sha.nullable(),
	base: z.object({ ref: text, repo: z.object({ full_name: text }) }),
	head: z.object({ sha, repo: z.object({ full_name: text }).nullable() }),
	stack: z
		.object({ number, position: number, size: number, base: z.object({ ref: text }) })
		.nullish(),
});
/** A reviewed plan on the protected base branch records exact revision merge intent. */
export type GitHubMergePlan = z.infer<typeof planSchema>;
export type GitHubMergeDecision = Readonly<{
	pull: number;
	head: string;
	state: "ready" | "blocked" | "merged";
	reason: string;
}>;
export type GitHubMergeServices = Readonly<{ token: string; request?: typeof fetch }>;
export type GitHubMergeAdmissionServices = GitHubMergeServices &
	Readonly<{
		mergeToken: string;
		mergeActor: string;
	}>;

export class GitHubMergePlanError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GitHubMergePlanError";
	}
}

/** Validate the complete dependency graph before making any GitHub requests. */
export const parseGitHubMergePlan = (value: unknown): GitHubMergePlan => {
	const plan = planSchema.parse(value);
	const nodes = new Map(plan.candidates.map((entry) => [entry.pull, entry]));
	if (nodes.size !== plan.candidates.length) throw new GitHubMergePlanError("duplicate candidate");
	const active = new Set<number>();
	const visited = new Set<number>();
	const visit = (pull: number): void => {
		if (active.has(pull)) throw new GitHubMergePlanError(`dependency cycle at #${pull}`);
		if (visited.has(pull)) return;
		active.add(pull);
		for (const dependency of nodes.get(pull)?.after ?? []) visit(dependency.pull);
		active.delete(pull);
		visited.add(pull);
	};
	for (const entry of plan.candidates) visit(entry.pull);
	return plan;
};

/** Read current state. Missing or mismatched deployment evidence blocks admission. */
export const evaluateGitHubMergePlan = async (
	value: GitHubMergePlan,
	services: GitHubMergeServices,
): Promise<readonly GitHubMergeDecision[]> => {
	const plan = parseGitHubMergePlan(value);
	const api = githubMergeApi(plan.repository, services);
	const pulls = new Map<number, z.infer<typeof pullSchema>>();
	for (const entry of plan.candidates) {
		for (const pull of [entry.pull, ...entry.after.map((dependency) => dependency.pull)]) {
			if (!pulls.has(pull)) {
				const observed = pullSchema.parse(await api(`pulls/${pull}`));
				if (observed.number !== pull || observed.base.repo.full_name !== plan.repository) {
					throw new GitHubMergePlanError(`GitHub returned a different PR for #${pull}`);
				}
				pulls.set(pull, observed);
			}
		}
	}
	const stacks = new Set<number>();
	const decisions: GitHubMergeDecision[] = [];
	for (const entry of plan.candidates) {
		const pull = pulls.get(entry.pull)!;
		if (pull.stack != null) {
			if (stacks.has(pull.stack.number))
				throw new GitHubMergePlanError("plan candidates must belong to separate stacks");
			stacks.add(pull.stack.number);
			if (
				entry.after.some((dependency) => {
					const prerequisite = pulls.get(dependency.pull)!;
					return !prerequisite.merged && prerequisite.stack?.number === pull.stack?.number;
				})
			)
				throw new GitHubMergePlanError(
					"split a stack before declaring a deployment dependency within it",
				);
		}
		let reason = "";
		if (pull.head.sha !== entry.head) reason = "candidate head changed";
		else if ((pull.stack?.base.ref ?? pull.base.ref) !== plan.base)
			reason = "candidate base differs from plan";
		else if (pull.merged) {
			decisions.push({
				pull: entry.pull,
				head: entry.head,
				state: "merged",
				reason: "already merged",
			});
			continue;
		} else if (pull.state !== "open" || pull.draft || pull.head.repo?.full_name !== plan.repository)
			reason = "candidate is not an open same-repository PR";
		else if (pull.stack != null && pull.stack.position !== pull.stack.size)
			reason = "candidate must be the stack top";
		for (const dependency of entry.after) {
			if (reason !== "") break;
			const prerequisite = pulls.get(dependency.pull)!;
			if (
				!prerequisite.merged ||
				prerequisite.merge_commit_sha === null ||
				(prerequisite.stack?.base.ref ?? prerequisite.base.ref) !== plan.base
			) {
				reason = `waiting for #${dependency.pull} to merge into ${plan.base}`;
				break;
			}
			const expected = plan.candidates.find((node) => node.pull === dependency.pull);
			if (expected !== undefined && expected.head !== prerequisite.head.sha) {
				reason = `prerequisite #${dependency.pull} head changed`;
				break;
			}
			if (
				dependency.deployment !== undefined &&
				!(await verifyGitHubDeploymentReceipt(
					api,
					plan,
					dependency.deployment,
					prerequisite.merge_commit_sha,
				))
			) {
				reason = `waiting for verified ${dependency.deployment.task} in ${dependency.deployment.environment} at #${dependency.pull}`;
			}
		}
		decisions.push({
			pull: entry.pull,
			head: entry.head,
			state: reason === "" ? "ready" : "blocked",
			reason: reason || "dependencies satisfied",
		});
	}
	return decisions;
};

/** Submit only ready candidates. GitHub enforces reviews, CI, and merge-queue rules. */
export const admitGitHubMergePlan = async (
	plan: GitHubMergePlan,
	services: GitHubMergeAdmissionServices,
): Promise<readonly GitHubMergeDecision[]> => {
	const decisions = await evaluateGitHubMergePlan(plan, services);
	await submitGitHubMergeDecisions(plan.repository, services, decisions);
	return decisions;
};

export const submitGitHubMergeDecisions = async (
	repository: string,
	services: GitHubMergeAdmissionServices,
	decisions: readonly GitHubMergeDecision[],
): Promise<void> => {
	const api = githubMergeApi(repository, { ...services, token: services.mergeToken });
	if (decisions.some((decision) => decision.state === "ready")) {
		const actor = z.object({ login: text, type: z.literal("User") }).parse(await api("/user"));
		if (actor.login !== services.mergeActor)
			throw new GitHubMergePlanError("merge token belongs to another user");
	}
	for (const decision of decisions) {
		if (decision.state !== "ready") continue;
		const result = z
			.object({
				status: z.enum(["pending", "merged", "enqueued"]),
				details: z.object({ expected_head_sha: sha.optional(), merge_action: text.optional() }),
			})
			.parse(
				await api(`pulls/${decision.pull}/merge-async`, {
					sha: decision.head,
					merge_action: "merge_queue",
				}),
			);
		if (
			result.status === "pending" &&
			(result.details.expected_head_sha !== decision.head ||
				result.details.merge_action !== "merge_queue")
		) {
			throw new GitHubMergePlanError(
				`existing merge request for #${decision.pull} has different options`,
			);
		}
	}
};

export const githubMergeApi =
	(repository: string, services: GitHubMergeServices) =>
	async (
		path: string,
		body?: unknown,
		method = body === undefined ? "GET" : "PUT",
	): Promise<unknown> => {
		const endpoint = path.startsWith("/") ? path : `/repos/${repository}/${path}`;
		const response = await (services.request ?? fetch)(`https://api.github.com${endpoint}`, {
			method,
			redirect: "error",
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${services.token}`,
				"X-GitHub-Api-Version": "2026-03-10",
				"Content-Type": "application/json",
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		if (!response.ok && !(response.status === 409 && path.endsWith("/merge-async")))
			throw new GitHubMergePlanError(`GitHub ${method} ${path} failed: ${response.status}`);
		return response.json();
	};
