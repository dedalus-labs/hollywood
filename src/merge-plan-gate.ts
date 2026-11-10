import { z } from "zod";
import { nextCursor, pageInfoSchema, queryGitHub, readGitHubMergeQueue } from "./merge-queue";
import {
	submitGitHubMergeDecisions,
	evaluateGitHubMergePlan,
	githubMergeApi,
	GitHubMergePlanError,
	parseGitHubMergePlan,
	type GitHubMergeDecision,
	type GitHubMergePlan,
	type GitHubMergeServices,
	type GitHubMergeAdmissionServices,
} from "./merge-plan";

export const githubMergePlanContext = "Hollywood deployment dependencies";
const sha = z.string().regex(/^[0-9a-f]{40}$/);
const stackSchema = z.object({ number: z.number().int().positive() }).nullish();
const pullSchema = z.object({
	number: z.number().int().positive(),
	head: z.object({ sha }),
	stack: stackSchema,
});
type GateState = "success" | "failure" | "pending" | "error";
export type GitHubMergeGateOptions = Readonly<{
	repository: string;
	base: string;
	statusPublisher: string;
	runUrl: string;
	initialize?: boolean;
}>;

/** Read only trusted plan source. Invalid source invalidates queued revisions too. */
export const reconcileGitHubMergePlan = async (
	readPlan: () => Promise<unknown>,
	services: GitHubMergeAdmissionServices,
	options: GitHubMergeGateOptions,
): Promise<readonly GitHubMergeDecision[]> => {
	const routing = parseGitHubMergePlan({
		repository: options.repository,
		base: options.base,
		candidates: [],
	});
	const api = githubMergeApi(routing.repository, services);
	const knownHeads = new Set<string>();

	try {
		const queue = await readGitHubMergeQueue(routing, services);
		for (const entry of queue) {
			knownHeads.add(entry.pullRequest.headRefOid);
			if (entry.headCommit !== null) knownHeads.add(entry.headCommit.oid);
		}
		const source = await readPlan();
		const plan = parseGitHubMergePlan(typeof source === "string" ? JSON.parse(source) : source);
		if (plan.repository !== routing.repository || plan.base !== routing.base) {
			throw new GitHubMergePlanError("plan must target the trusted repository and base");
		}
		const pulls: z.infer<typeof pullSchema>[] = [];
		for (const candidate of plan.candidates) {
			const pull = pullSchema.parse(await api(`pulls/${candidate.pull}`));
			if (pull.number !== candidate.pull)
				throw new GitHubMergePlanError("candidate identity changed");
			pulls.push(pull);
			if (pull.stack != null) {
				const stack = z
					.object({ pull_requests: z.array(pullSchema) })
					.parse(await api(`stacks/${pull.stack.number}`));
				pulls.push(...stack.pull_requests.map((member) => ({ ...member, stack: pull.stack })));
			}
		}
		for (const pull of pulls) knownHeads.add(pull.head.sha);

		const decisions = await evaluateGitHubMergePlan(plan, services);
		const decisionFor = (pull: {
			number: number;
			stack?: z.infer<typeof stackSchema>;
		}): GitHubMergeDecision | undefined => {
			const candidate = pulls.find(
				(top) =>
					decisions.some((decision) => decision.pull === top.number) &&
					(top.number === pull.number ||
						(top.stack != null && top.stack.number === pull.stack?.number)),
			);
			return decisions.find((decision) => decision.pull === (candidate?.number ?? pull.number));
		};
		const states = new Map<string, GateState>();
		for (const pull of pulls) {
			const decision = decisionFor(pull);
			states.set(
				pull.head.sha,
				decision?.state === "blocked" || states.get(pull.head.sha) === "failure"
					? "failure"
					: "success",
			);
		}
		let blocked = false;
		for (const entry of queue.sort((left, right) => left.position - right.position)) {
			const decision = decisionFor(entry.pullRequest);
			blocked ||=
				decision?.state === "blocked" || states.get(entry.pullRequest.headRefOid) === "failure";
			if (
				decision?.pull === entry.pullRequest.number &&
				decision.head !== entry.pullRequest.headRefOid
			)
				blocked = true;
			if (entry.headCommit !== null) {
				const head = entry.headCommit.oid;
				states.set(head, blocked || states.get(head) === "failure" ? "failure" : "success");
			}
		}
		for (const [head, state] of states) await writeStatus(api, head, state, options);
		if (options.initialize)
			await initializeOrdinaryPulls(
				routing,
				services,
				knownHeads,
				new Set(pulls.map((pull) => pull.number)),
				options,
			);
		await submitGitHubMergeDecisions(plan.repository, services, decisions);
		return decisions;
	} catch (error) {
		const invalidations = await Promise.allSettled(
			[...knownHeads].map((head) => writeStatus(api, head, "error", options)),
		);
		throw new AggregateError(
			[
				error,
				...invalidations
					.filter((result) => result.status === "rejected")
					.map((result) => result.reason),
			],
			`merge-plan reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
};

const statusSchema = z.object({
	context: z.string(),
	state: z.string(),
	creator: z.object({ login: z.string() }).nullable(),
});
const writeStatus = async (
	api: ReturnType<typeof githubMergeApi>,
	head: string,
	state: GateState,
	options: GitHubMergeGateOptions,
): Promise<void> => {
	const previous = z
		.object({ statuses: z.array(statusSchema) })
		.parse(await api(`commits/${head}/status?per_page=100`));
	if (
		previous.statuses.some(
			(status) =>
				status.context === githubMergePlanContext &&
				status.state === state &&
				status.creator?.login === options.statusPublisher,
		)
	)
		return;
	await publishStatus(api, head, state, options);
};

const publishStatus = async (
	api: ReturnType<typeof githubMergeApi>,
	head: string,
	state: GateState,
	options: GitHubMergeGateOptions,
): Promise<void> => {
	const receipt = statusSchema.parse(
		await api(
			`statuses/${head}`,
			{
				context: githubMergePlanContext,
				state,
				target_url: options.runUrl,
				description: `Deployment dependency gate: ${state}. See details for prerequisite status.`,
			},
			"POST",
		),
	);
	if (
		receipt.context !== githubMergePlanContext ||
		receipt.state !== state ||
		receipt.creator?.login !== options.statusPublisher
	) {
		throw new GitHubMergePlanError("GitHub status receipt has the wrong publisher or state");
	}
};

const initializeOrdinaryPulls = async (
	plan: GitHubMergePlan,
	services: GitHubMergeServices,
	knownHeads: ReadonlySet<string>,
	plannedPulls: ReadonlySet<number>,
	options: GitHubMergeGateOptions,
): Promise<void> => {
	const api = githubMergeApi(plan.repository, services);
	const schema = z.object({
		data: z.object({
			repository: z.object({
				pullRequests: z.object({
					pageInfo: pageInfoSchema,
					nodes: z.array(
						z.object({
							number: z.number(),
							headRefOid: sha,
							commits: z.object({
								nodes: z
									.array(
										z.object({
											commit: z.object({
												oid: sha,
												status: z
													.object({
														context: z
															.object({
																state: z.string(),
																creator: z.object({ login: z.string() }).nullable(),
															})
															.nullable(),
													})
													.nullable(),
											}),
										}),
									)
									.length(1),
							}),
						}),
					),
				}),
			}),
		}),
		errors: z.never().optional(),
	});
	let after: string | null = null;
	do {
		const data = await queryGitHub(
			plan,
			services,
			`query($owner:String!,$name:String!,$after:String){
		  repository(owner:$owner,name:$name){pullRequests(first:100,after:$after,states:OPEN){
		    nodes{number headRefOid commits(last:1){nodes{commit{oid status{context(name:"${githubMergePlanContext}"){state creator{login}}}}}}}
		    pageInfo{hasNextPage endCursor}
		  }}
		}`,
			after,
		);
		const page = schema.parse(data).data.repository.pullRequests;
		for (const pull of page.nodes) {
			const commit = pull.commits.nodes[0]!.commit;
			if (commit.oid !== pull.headRefOid)
				throw new GitHubMergePlanError("PR head changed during initialization");
			if (
				!plannedPulls.has(pull.number) &&
				!knownHeads.has(pull.headRefOid) &&
				(commit.status?.context?.creator?.login !== options.statusPublisher ||
					commit.status?.context?.state !== "SUCCESS")
			) {
				await publishStatus(api, pull.headRefOid, "success", options);
			}
		}
		after = nextCursor(page.pageInfo, after);
	} while (after !== null);
};
