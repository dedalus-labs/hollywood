import { job, workflow } from "../src/index";

const setupNode = {
	uses: "actions/setup-node@v4",
	with: {
		"node-version": "24",
		cache: "npm",
	},
} as const;

export const ci = workflow({
	name: "CI",
	on: {
		push: { branches: ["main"] },
		pull_request: { branches: ["main"] },
	},
	permissions: { contents: "read" },
	jobs: {
		test: job({
			name: "Test",
			"runs-on": "ubuntu-latest",
			steps: [
				{ uses: "actions/checkout@v4", with: { "persist-credentials": false } },
				setupNode,
				{ name: "Install dependencies", run: "npm ci" },
				{ name: "Typecheck", run: "npm run typecheck" },
				{ name: "Test", run: "npm test" },
				{ name: "Build", run: "npm run build" },
				{ name: "Check package contents", run: "npm run pack:check" },
				{ name: "Check generated workflows", run: "npm run check:generated" },
			],
		}),
		actionlint: job({
			name: "Actionlint",
			"runs-on": "ubuntu-latest",
			steps: [
				{ uses: "actions/checkout@v4", with: { "persist-credentials": false } },
				{ uses: "rhysd/actionlint@v1.7.9" },
			],
		}),
	},
});
