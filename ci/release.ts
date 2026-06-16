import { job, workflow } from "../src/index";
import { checkoutAction, releasePleaseAction } from "./actions";

export const release = workflow({
	name: "Release",
	on: {
		push: { branches: ["main"] },
		workflow_dispatch: {},
	},
	permissions: {
		contents: "write",
		"pull-requests": "write",
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
					id: "release",
					name: "Run release-please",
					uses: releasePleaseAction,
					with: {
						token: "${{ secrets.GITHUB_TOKEN }}",
						"config-file": "release-please-config.json",
						"manifest-file": ".release-please-manifest.json",
					},
				},
			],
		}),
	},
});
