import { job, workflow } from "../src/index";
import { checkoutAction, createGitHubAppTokenAction, releasePleaseAction } from "./actions";

export const release = workflow({
	name: "Release",
	on: {
		push: { branches: ["main"] },
		workflow_dispatch: {},
	},
	permissions: {
		contents: "read",
	},
	jobs: {
		"release-please": job({
			name: "Release Please",
			"runs-on": "ubuntu-latest",
			outputs: {
				release_created: "${{ steps.release.outputs.release_created }}",
				tag_name: "${{ steps.release.outputs.tag_name }}",
				version: "${{ steps.release.outputs.version }}",
			},
			steps: [
				{ uses: checkoutAction, with: { "persist-credentials": false } },
				{
					id: "cind-token",
					name: "Create Cind app token",
					uses: createGitHubAppTokenAction,
					with: {
						"app-id": "${{ secrets.CIND_BOT_APP_ID }}",
						"private-key": "${{ secrets.CIND_BOT_APP_PRIVATE_KEY }}",
						owner: "${{ github.repository_owner }}",
						repositories: "hollywood",
						"permission-contents": "write",
						"permission-issues": "write",
						"permission-metadata": "read",
						"permission-pull-requests": "write",
					},
				},
				{
					id: "release",
					name: "Run release-please",
					uses: releasePleaseAction,
					with: {
						token: "${{ steps.cind-token.outputs.token }}",
						"config-file": "release-please-config.json",
						"manifest-file": ".release-please-manifest.json",
					},
				},
			],
		}),
	},
});
