import { z } from "zod";
import {
	githubMergeApi,
	GitHubMergePlanError,
	type GitHubMergePlan,
	type GitHubMergeServices,
} from "./merge-plan";
const sha = z.string().regex(/^[0-9a-f]{40}$/);
const stackSchema = z.object({ number: z.number().int().positive() }).nullish();
export const pageInfoSchema = z.object({
	hasNextPage: z.boolean(),
	endCursor: z.string().nullable(),
});
const queueEntrySchema = z.object({
	position: z.number().int().positive(),
	headCommit: z.object({ oid: sha }).nullable(),
	pullRequest: z.object({
		number: z.number().int().positive(),
		headRefOid: sha,
		stack: stackSchema,
	}),
});
const queueSchema = z.object({
	data: z.object({
		repository: z.object({
			mergeQueue: z.object({
				entries: z.object({
					nodes: z.array(queueEntrySchema),
					pageInfo: pageInfoSchema,
				}),
			}),
		}),
	}),
	errors: z.never().optional(),
});
export const queryGitHub = async (
	plan: GitHubMergePlan,
	services: GitHubMergeServices,
	query: string,
	after: string | null,
): Promise<unknown> => {
	const [owner, name] = plan.repository.split("/");
	return githubMergeApi(plan.repository, services)(
		"/graphql",
		{
			query,
			variables: { owner, name, branch: plan.base, after },
		},
		"POST",
	);
};

export const nextCursor = (
	page: z.infer<typeof pageInfoSchema>,
	previous: string | null,
): string | null => {
	if (!page.hasNextPage) return null;
	if (page.endCursor === null || page.endCursor === previous)
		throw new GitHubMergePlanError("GitHub returned an invalid cursor");
	return page.endCursor;
};

export const readGitHubMergeQueue = async (
	plan: GitHubMergePlan,
	services: GitHubMergeServices,
): Promise<z.infer<typeof queueEntrySchema>[]> => {
	const entries: z.infer<typeof queueEntrySchema>[] = [];
	let after: string | null = null;
	do {
		const data = await queryGitHub(
			plan,
			services,
			`query($owner:String!,$name:String!,$branch:String!,$after:String){
		  repository(owner:$owner,name:$name){mergeQueue(branch:$branch){entries(first:100,after:$after){
		    nodes{position headCommit{oid} pullRequest{number headRefOid stack{number}}}
		    pageInfo{hasNextPage endCursor}
		  }}}
		}`,
			after,
		);
		const page = queueSchema.parse(data).data.repository.mergeQueue.entries;
		entries.push(...page.nodes);
		after = nextCursor(page.pageInfo, after);
	} while (after !== null);
	return entries;
};
