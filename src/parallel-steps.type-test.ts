import { generateUsesStep, localAction, uses, type GitHubWorkflowStep, type GitHubParallelChildStep } from "./generate";
import { command } from "./workflow-command";

const rejectInvalidStepKinds = (): void => {
	// @ts-expect-error Synchronization steps always run and cannot have a condition.
	const conditionalWait: GitHubWorkflowStep = { wait: "build", if: "success()" };
	// @ts-expect-error A step cannot both run a command and wait.
	const mixedKinds: GitHubWorkflowStep = { run: command({ file: "true", args: [] }), wait: "build" };
	// @ts-expect-error wait-all is a bare key or true.
	const falseWaitAll: GitHubWorkflowStep = { "wait-all": false };
	// @ts-expect-error cancel targets one step.
	const cancelMany: GitHubWorkflowStep = { cancel: ["first", "second"] };
	// @ts-expect-error Parallel groups contain only run or uses steps.
	const nestedParallel: GitHubParallelChildStep = { parallel: [] };
	// @ts-expect-error A parallel child cannot declare its own background mode.
	const backgroundChild: GitHubParallelChildStep = { uses: "./.github/actions/build", background: true };
	// @ts-expect-error Synchronization steps cannot run inside a parallel group.
	const parallelWait: GitHubParallelChildStep = { wait: "build" };
	// @ts-expect-error Parallel wrappers accept only the parallel property.
	const namedParallel: GitHubWorkflowStep = { parallel: [], name: "Build" };
	void [conditionalWait, mixedKinds, falseWaitAll, cancelMany, nestedParallel, backgroundChild, parallelWait, namedParallel];
};

void rejectInvalidStepKinds;

const build = localAction({ name: "Build", localActionPath: "build", inputs: {} });
const parallelActions: GitHubWorkflowStep = {
	parallel: [
		uses(build, {}),
		generateUsesStep(build, { name: "Build", uses: "./.github/actions/build" }),
	],
};
// @ts-expect-error Explicit background mode is not accepted inside parallel.
const backgroundAction: GitHubParallelChildStep = uses(build, { background: true });
void [parallelActions, backgroundAction];
