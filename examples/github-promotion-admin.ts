export type AdminActor = Readonly<{
	canPromoteProduction: boolean;
	email: string;
	id: string;
}>;

export type PreviewToMainPromotionInput = Readonly<{
	allowUncertified?: boolean;
	createAuditTag?: boolean;
	reason: string;
	repo?: string;
	sha?: string;
}>;

export type PreviewToMainPromotionRequest = Readonly<{
	allowUncertified: boolean;
	createAuditTag: boolean;
	reason: string;
	repo: RepositoryName;
	sha: "" | CommitSha;
}>;

export type GitHubWorkflowDispatch = Readonly<{
	inputs: Readonly<{
		allow_uncertified: boolean;
		create_audit_tag: boolean;
		reason: string;
		sha: string;
	}>;
	owner: string;
	ref: "preview";
	repo: string;
	workflowId: "promote-preview-to-main.yml";
}>;

export type GitHubWorkflowDispatcher = Readonly<{
	dispatchWorkflow: (request: GitHubWorkflowDispatch) => Promise<unknown>;
}>;

export type PromotionAuditEvent = Readonly<{
	action: "promotion.completed" | "promotion.failed" | "promotion.requested";
	actorEmail: string;
	actorId: string;
	error?: string;
	request: PreviewToMainPromotionRequest;
}>;

export type PromotionAuditStore = Readonly<{
	insert: (events: readonly PromotionAuditEvent[]) => Promise<void>;
}>;

export type PreviewToMainPromotionResult = Readonly<{
	repo: RepositoryName;
	response: unknown;
	workflowId: "promote-preview-to-main.yml";
	workflowRef: "preview";
}>;

type RepositoryName = string & { readonly __brand: "RepositoryName" };
type CommitSha = string & { readonly __brand: "CommitSha" };

export const requestPreviewToMainPromotion = async (
	actor: AdminActor,
	input: PreviewToMainPromotionInput,
	deps: Readonly<{
		audit: PromotionAuditStore;
		github: GitHubWorkflowDispatcher;
	}>,
): Promise<PreviewToMainPromotionResult> => {
	if (!actor.canPromoteProduction) {
		throw new Error(`actor is not allowed to promote preview to main: ${actor.email}`);
	}
	const request = previewToMainPromotionRequest(input);
	const requested = {
		action: "promotion.requested",
		actorEmail: actor.email,
		actorId: actor.id,
		request,
	} satisfies PromotionAuditEvent;
	await deps.audit.insert([requested]);

	const dispatch = workflowDispatch(request);
	try {
		const response = await deps.github.dispatchWorkflow(dispatch);
		await deps.audit.insert([
			{
				...requested,
				action: "promotion.completed",
			},
		]);
		return {
			repo: request.repo,
			response: response ?? null,
			workflowId: dispatch.workflowId,
			workflowRef: dispatch.ref,
		};
	} catch (error) {
		await deps.audit.insert([
			{
				...requested,
				action: "promotion.failed",
				error: errorMessage(error),
			},
		]);
		throw error;
	}
};

export const previewToMainPromotionRequest = (
	input: PreviewToMainPromotionInput,
): PreviewToMainPromotionRequest => ({
	allowUncertified: input.allowUncertified ?? false,
	createAuditTag: input.createAuditTag ?? true,
	reason: nonempty("reason", input.reason),
	repo: repositoryName(input.repo ?? "dedalus-labs/dedalus"),
	sha: promotionSha(input.sha ?? ""),
});

export const workflowDispatch = (
	request: PreviewToMainPromotionRequest,
): GitHubWorkflowDispatch => {
	const { owner, repo } = splitRepository(request.repo);
	return {
		inputs: {
			allow_uncertified: request.allowUncertified,
			create_audit_tag: request.createAuditTag,
			reason: request.reason,
			sha: request.sha,
		},
		owner,
		ref: "preview",
		repo,
		workflowId: "promote-preview-to-main.yml",
	};
};

const repositoryName = (value: string): RepositoryName => {
	const trimmed = value.trim();
	if (!/^[^/\s]+\/[^/\s]+$/.test(trimmed)) {
		throw new Error(`repo must be owner/name: ${value}`);
	}
	return trimmed as RepositoryName;
};

const splitRepository = (repo: RepositoryName): Readonly<{ owner: string; repo: string }> => {
	const [owner, name, extra] = repo.split("/");
	if (owner === undefined || name === undefined || extra !== undefined) {
		throw new Error(`repo must be owner/name: ${repo}`);
	}
	return { owner, repo: name };
};

const promotionSha = (value: string): "" | CommitSha => {
	const trimmed = value.trim();
	if (trimmed === "") {
		return "";
	}
	if (!/^[0-9a-f]{40}$/i.test(trimmed)) {
		throw new Error("sha must be empty or a 40-character commit SHA");
	}
	return trimmed as CommitSha;
};

const nonempty = (name: string, value: string): string => {
	const trimmed = value.trim();
	if (trimmed === "") {
		throw new Error(`${name} is required`);
	}
	return trimmed;
};

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);
