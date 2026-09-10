import { z } from "zod";

const sha = z.string().regex(/^[0-9a-f]{40}$/);
const number = z.number().int().positive();
const text = z.string().min(1);
export const deploymentRequirement = z.object({
	environment: text,
	task: text,
	publisher: text,
	workflow: text,
});
const deploymentSchema = z.object({
	id: number,
	sha,
	environment: text,
	task: text,
	creator: z.object({ login: text }).nullable(),
	payload: z.unknown(),
});
const receiptSchema = z.object({
	artifact_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
	verification_run_id: number,
});
const statusSchema = z.object({
	state: text,
	environment: text,
	creator: z.object({ login: text }).nullable(),
});
const runSchema = z.object({
	head_sha: sha,
	head_branch: text,
	event: text,
	path: text,
	status: text,
	conclusion: z.string().nullable(),
	repository: z.object({ full_name: text }),
});

export const verifyGitHubDeploymentReceipt = async (
	api: (path: string) => Promise<unknown>,
	plan: Readonly<{ repository: string; base: string }>,
	required: z.infer<typeof deploymentRequirement>,
	revision: string,
): Promise<boolean> => {
	const query = new URLSearchParams({
		environment: required.environment,
		task: required.task,
		per_page: "1",
	});
	const deployment = z.array(deploymentSchema).parse(await api(`deployments?${query}`))[0];
	if (
		deployment === undefined ||
		deployment.environment !== required.environment ||
		deployment.task !== required.task ||
		deployment.creator?.login !== required.publisher
	)
		return false;
	const ancestry = z
		.object({
			status: z.string(),
			base_commit: z.object({ sha }),
			merge_base_commit: z.object({ sha }),
		})
		.parse(await api(`compare/${revision}...${deployment.sha}?per_page=1`));
	if (
		ancestry.base_commit.sha !== revision ||
		ancestry.merge_base_commit.sha !== revision ||
		(ancestry.status !== "identical" && ancestry.status !== "ahead")
	)
		return false;
	const receipt = receiptSchema.safeParse(deployment.payload);
	if (!receipt.success) return false;
	const status = z
		.array(statusSchema)
		.parse(await api(`deployments/${deployment.id}/statuses?per_page=1`))[0];
	if (
		status?.state !== "success" ||
		status.environment !== required.environment ||
		status.creator?.login !== required.publisher
	)
		return false;
	const run = runSchema.parse(await api(`actions/runs/${receipt.data.verification_run_id}`));
	if (
		run.repository.full_name !== plan.repository ||
		run.head_sha !== deployment.sha ||
		run.head_branch !== plan.base ||
		run.event !== "push" ||
		run.path !== required.workflow ||
		run.status !== "completed" ||
		run.conclusion !== "success"
	)
		return false;
	const artifactName = `deployment-${deployment.id}-${receipt.data.artifact_digest.slice(7)}`;
	const artifactSchema = z.object({
		name: text,
		expired: z.boolean(),
		digest: z.string().nullable(),
		workflow_run: z.object({ id: number, head_sha: sha }),
	});
	for (let page = 1; ; page += 1) {
		const { artifacts } = z
			.object({ artifacts: z.array(artifactSchema) })
			.parse(
				await api(
					`actions/runs/${receipt.data.verification_run_id}/artifacts?per_page=100&page=${page}`,
				),
			);
		if (
			artifacts.some(
				(artifact) =>
					artifact.name === artifactName &&
					!artifact.expired &&
					artifact.digest?.match(/^sha256:[0-9a-f]{64}$/) &&
					artifact.workflow_run.id === receipt.data.verification_run_id &&
					artifact.workflow_run.head_sha === deployment.sha,
			)
		)
			return true;
		if (artifacts.length < 100) return false;
	}
};
