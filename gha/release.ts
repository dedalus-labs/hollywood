import { job, workflow } from "../src/index";
import { createGitHubAppTokenAction, releasePleaseAction } from "./actions";

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
			steps: [
				{
					id: "cind-token",
					name: "Create Cind app token",
					uses: createGitHubAppTokenAction,
					with: {
						"client-id": "${{ secrets.CIND_BOT_CLIENT_ID }}",
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
						"skip-github-release": "true",
					},
				},
			],
		}),
	},
});
