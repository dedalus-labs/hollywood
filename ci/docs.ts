import { job, workflow } from "../src/index";
import {
	checkoutAction,
	deployPagesAction,
	setupPythonAction,
	uploadPagesArtifactAction,
} from "./actions";
import { trustedCiRun } from "./guards";

const docsPaths = ["docs/**", "mkdocs.yml", "README.md"] as const;

export const docs = workflow({
	name: "Docs",
	on: {
		push: { branches: ["main"], paths: docsPaths },
		pull_request: { branches: ["main"], paths: docsPaths },
		workflow_dispatch: {},
	},
	concurrency: {
		group: "pages",
		"cancel-in-progress": false,
	},
	permissions: { contents: "read" },
	jobs: {
		build: job({
			name: "Build",
			if: trustedCiRun,
			"runs-on": "ubuntu-latest",
			steps: [
				{ uses: checkoutAction, with: { "persist-credentials": false } },
				{ uses: setupPythonAction, with: { "python-version": "3.13" } },
				{
					name: "Install docs dependencies",
					run: "python -m pip install -r docs/requirements.txt",
				},
				{ name: "Build docs", run: "python -m mkdocs build --strict -f mkdocs.yml" },
				{ name: "Upload pages artifact", uses: uploadPagesArtifactAction, with: { path: "site" } },
			],
		}),
		deploy: job({
			name: "Deploy",
			needs: "build",
			if: "github.event_name == 'push' && github.ref == 'refs/heads/main'",
			"runs-on": "ubuntu-latest",
			permissions: {
				pages: "write",
				"id-token": "write",
			},
			environment: {
				name: "github-pages",
				url: "${{ steps.deployment.outputs.page_url }}",
			},
			steps: [{ id: "deployment", name: "Deploy to GitHub Pages", uses: deployPagesAction }],
		}),
	},
});
