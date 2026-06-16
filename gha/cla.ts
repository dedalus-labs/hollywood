import { job, workflow } from "../src/index";
import { checkoutAction } from "./actions";

const checkVouchedContributor = String.raw`set -euo pipefail

node <<'NODE'
const fs = require("node:fs");

const author = process.env.PR_AUTHOR;
if (!author) {
	console.error("PR_AUTHOR is required");
	process.exit(1);
}

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const authorKey = "github:" + author.toLowerCase();
const lines = fs.readFileSync("VOUCHED.td", "utf8").split("\n");

let vouched = false;
let denounced = null;

for (const rawLine of lines) {
	const line = rawLine.replace(/\r$/, "").trim();
	if (line === "" || line.startsWith("#")) {
		continue;
	}

	const [token, ...reasonParts] = line.split(/\s+/);
	const isDenounced = token.startsWith("-");
	const rawHandle = (isDenounced ? token.slice(1) : token).replace(/^@/, "");
	const handle = rawHandle.includes(":")
		? rawHandle.toLowerCase()
		: "github:" + rawHandle.toLowerCase();

	if (handle !== authorKey) {
		continue;
	}

	if (isDenounced) {
		denounced = reasonParts.join(" ") || "no reason recorded";
		break;
	}

	vouched = true;
}

const appendSummary = (body) => {
	if (summaryPath) {
		fs.appendFileSync(summaryPath, body + "\n");
	}
};

if (denounced !== null) {
	appendSummary("## CLA blocked\n\n@" + author + " is denounced in VOUCHED.td: " + denounced);
	console.error("@" + author + " is denounced in VOUCHED.td: " + denounced);
	process.exit(1);
}

if (vouched) {
	appendSummary("## CLA passed\n\n@" + author + " is listed in VOUCHED.td.");
	console.log("@" + author + " is listed in VOUCHED.td");
	process.exit(0);
}

appendSummary([
	"## CLA required",
	"",
	"@" + author + " is not listed in VOUCHED.td.",
	"",
	"Hollywood only accepts external contributions from vouched contributors. Being listed in VOUCHED.td records that a maintainer verified the contributor and their CLA acceptance.",
	"",
	"To get vouched:",
	"",
	"1. Open a \"Vouch request\" issue.",
	"2. Confirm that you have read and accept CLA.md.",
	"3. Link public work or ask an existing vouched contributor to sponsor you.",
	"4. Wait for a maintainer to add your handle to VOUCHED.td.",
].join("\n"));

console.error("@" + author + " is not listed in VOUCHED.td");
process.exit(1);
NODE`;

export const cla = workflow({
	name: "CLA",
	on: {
		pull_request: {
			branches: ["main"],
			types: ["opened", "reopened", "synchronize", "ready_for_review"],
		},
	},
	permissions: { contents: "read" },
	jobs: {
		cla: job({
			name: "Vouch and CLA",
			"runs-on": "ubuntu-latest",
			steps: [
				{
					name: "Checkout trusted base",
					uses: checkoutAction,
					with: {
						ref: "${{ github.event.pull_request.base.sha }}",
						"persist-credentials": false,
					},
				},
				{
					name: "Check contributor",
					env: {
						PR_AUTHOR: "${{ github.event.pull_request.user.login }}",
					},
					run: checkVouchedContributor,
				},
			],
		}),
	},
});
