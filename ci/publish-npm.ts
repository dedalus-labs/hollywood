import { job, workflow } from "../src/index";

export const publishNpm = workflow({
	name: "Publish NPM",
	on: {
		workflow_dispatch: {},
		release: { types: ["published"] },
	},
	permissions: { contents: "read" },
	jobs: {
		publish: job({
			name: "Publish",
			if: "github.repository == 'dedalus-labs/hollywood'",
			"runs-on": "ubuntu-latest",
			permissions: {
				contents: "read",
				"id-token": "write",
			},
			environment: {
				name: "npm",
				url: "https://www.npmjs.com/package/@dedalus-labs/hollywood",
			},
			steps: [
				{
					uses: "actions/checkout@v4",
					with: {
						ref: "${{ github.event.release.tag_name || github.ref }}",
						"persist-credentials": false,
					},
				},
				{
					uses: "actions/setup-node@v4",
					with: {
						"node-version": "24",
						"registry-url": "https://registry.npmjs.org",
						cache: "npm",
					},
				},
				{ name: "Install dependencies", run: "npm ci" },
				{ name: "Typecheck", run: "npm run typecheck" },
				{ name: "Test", run: "npm test" },
				{ name: "Build", run: "npm run build" },
				{ name: "Publish to npm", run: "npm publish --access public --tag alpha --provenance" },
			],
		}),
	},
});
