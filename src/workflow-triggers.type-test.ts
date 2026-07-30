import { workflow } from "./generate";

const rejectInvalidGitHubTriggers = (): void => {
	workflow({
		name: "Misspelled event",
		on: {
			workflow_dispatch: {},
			// @ts-expect-error GitHub has no workflow_dispach event.
			workflow_dispach: {},
		},
		jobs: {},
	});

	workflow({
		name: "Scalar merge-group type",
		on: {
			merge_group: {
				// @ts-expect-error GitHub documents merge-group types as an array.
				types: "checks_requested",
			},
		},
		jobs: {},
	});

	workflow({
		name: "Unknown merge-group type",
		on: {
			merge_group: {
				// @ts-expect-error checks_requested is the only supported activity.
				types: ["destroyed"],
			},
		},
		jobs: {},
	});

	workflow({
		name: "Invalid dispatch default",
		on: {
			workflow_dispatch: {
				inputs: {
					// @ts-expect-error Boolean inputs require boolean defaults.
					force: {
						type: "boolean",
						default: "yes",
					},
				},
			},
		},
		jobs: {},
	});
};

void rejectInvalidGitHubTriggers;
