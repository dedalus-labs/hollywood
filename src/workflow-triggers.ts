type GitHubActivityTrigger = Readonly<{
	types?: readonly string[];
}>;

type GitHubBranchFilter = Readonly<{
	branches?: readonly string[];
	"branches-ignore"?: readonly string[];
}>;

type GitHubPathFilter = Readonly<{
	paths?: readonly string[];
	"paths-ignore"?: readonly string[];
}>;

type GitHubTagFilter = Readonly<{
	tags?: readonly string[];
	"tags-ignore"?: readonly string[];
}>;

type GitHubPullRequestTrigger = GitHubActivityTrigger & GitHubBranchFilter & GitHubPathFilter;
type GitHubPushTrigger = GitHubBranchFilter & GitHubPathFilter & GitHubTagFilter;

export type GitHubMergeGroupTrigger = GitHubBranchFilter &
	Readonly<{
		types?: readonly ["checks_requested"];
	}>;

type GitHubWorkflowDispatchInputBase = Readonly<{
	description?: string;
	required?: boolean;
}>;

export type GitHubWorkflowDispatchInput =
	| (GitHubWorkflowDispatchInputBase &
			Readonly<{ type: "boolean"; default?: boolean; options?: never }>)
	| (GitHubWorkflowDispatchInputBase &
			Readonly<{ type: "choice"; default?: string; options: readonly string[] }>)
	| (GitHubWorkflowDispatchInputBase &
			Readonly<{ type: "environment"; default?: string; options?: never }>)
	| (GitHubWorkflowDispatchInputBase &
			Readonly<{ type: "number"; default?: number; options?: never }>)
	| (GitHubWorkflowDispatchInputBase &
			Readonly<{ type?: "string"; default?: string; options?: never }>);

export type GitHubWorkflowDispatchTrigger = Readonly<{
	inputs?: Readonly<Record<string, GitHubWorkflowDispatchInput>>;
}>;

type GitHubWorkflowCallInput =
	| Readonly<{
			type: "boolean";
			description?: string;
			required?: boolean;
			default?: boolean;
	  }>
	| Readonly<{
			type: "number";
			description?: string;
			required?: boolean;
			default?: number;
	  }>
	| Readonly<{
			type: "string";
			description?: string;
			required?: boolean;
			default?: string;
	  }>;

type GitHubWorkflowCallTrigger = Readonly<{
	inputs?: Readonly<Record<string, GitHubWorkflowCallInput>>;
	outputs?: Readonly<Record<string, Readonly<{ description?: string; value: string }>>>;
	secrets?: Readonly<
		Record<string, Readonly<{ description?: string; required?: boolean }>>
	>;
}>;

type GitHubScheduleTrigger = readonly Readonly<{
	cron: string;
	timezone?: string;
}>[];

type GitHubWorkflowRunTrigger = GitHubActivityTrigger &
	GitHubBranchFilter &
	Readonly<{
		workflows?: readonly string[];
	}>;

type GitHubImageVersionTrigger = GitHubActivityTrigger &
	Readonly<{
		names?: readonly string[];
		versions?: readonly string[];
	}>;

export type GitHubWorkflowTriggers = Readonly<{
	branch_protection_rule?: GitHubActivityTrigger | null;
	check_run?: GitHubActivityTrigger | null;
	check_suite?: GitHubActivityTrigger | null;
	create?: null;
	delete?: null;
	deployment?: null;
	deployment_status?: null;
	discussion?: GitHubActivityTrigger | null;
	discussion_comment?: GitHubActivityTrigger | null;
	fork?: null;
	gollum?: null;
	image_version?: GitHubImageVersionTrigger | null;
	issue_comment?: GitHubActivityTrigger | null;
	issues?: GitHubActivityTrigger | null;
	label?: GitHubActivityTrigger | null;
	merge_group?: GitHubMergeGroupTrigger | null;
	milestone?: GitHubActivityTrigger | null;
	page_build?: null;
	public?: null;
	pull_request?: GitHubPullRequestTrigger | null;
	pull_request_comment?: GitHubActivityTrigger | null;
	pull_request_review?: GitHubActivityTrigger | null;
	pull_request_review_comment?: GitHubActivityTrigger | null;
	pull_request_target?: GitHubPullRequestTrigger | null;
	push?: GitHubPushTrigger | null;
	registry_package?: GitHubActivityTrigger | null;
	release?: GitHubActivityTrigger | null;
	repository_dispatch?: GitHubActivityTrigger | null;
	schedule?: GitHubScheduleTrigger;
	status?: null;
	watch?: GitHubActivityTrigger | null;
	workflow_call?: GitHubWorkflowCallTrigger | null;
	workflow_dispatch?: GitHubWorkflowDispatchTrigger | null;
	workflow_run?: GitHubWorkflowRunTrigger | null;
}>;
