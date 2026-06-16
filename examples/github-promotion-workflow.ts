import { job, uses, workflow } from "@dedalus-labs/hollywood";

import { previewPromotionGate } from "./github-promotion-gate";

export const githubPromotionWorkflow = workflow({
	name: "Preview Promotion Example",
	on: { workflow_dispatch: {} },
	permissions: {
		actions: "read",
		contents: "read",
		statuses: "read",
	},
	jobs: {
		verify: job({
			"runs-on": "ubuntu-24.04",
			steps: [
				uses(previewPromotionGate, {
					name: "Verify preview promotion",
					with: {
						githubToken: "${{ github.token }}",
						repository: "${{ github.repository }}",
						targetSha: "${{ inputs.sha }}",
					},
				}),
			],
		}),
	},
});
