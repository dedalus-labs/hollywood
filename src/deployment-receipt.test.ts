import { strict as assert } from "node:assert";
import { test } from "vitest";
import { verifyGitHubDeploymentReceipt } from "./deployment-receipt";
import {
	deploymentFixture,
	head,
	merged,
	repository,
	requirement,
} from "./deployment-receipt.fixture";

const plan = { repository, base: "main" };
test("a workflow artifact binds deployment identity and verified image", async () => {
	const f = deploymentFixture();
	assert.equal(await verifyGitHubDeploymentReceipt(f.api, plan, requirement, merged), true);
});
const mismatches: Record<string, (f: ReturnType<typeof deploymentFixture>) => void> = {
	"missing deployment": (f) => {
		f.responses["deployments?environment=production&task=api&per_page=1"] = [];
	},
	"other revision": (f) => {
		f.deployment.sha = head;
	},
	"other environment": (f) => {
		f.deployment.environment = "staging";
	},
	"other component": (f) => {
		f.deployment.task = "web";
	},
	"other publisher": (f) => {
		f.deployment.creator.login = "attacker";
	},
	"different verified image": (f) => {
		f.artifact.name = `deployment-5-${"d".repeat(64)}`;
	},
	"expired verification": (f) => {
		f.artifact.expired = true;
	},
	"other deployment receipt": (f) => {
		f.artifact.name = `deployment-6-${"c".repeat(64)}`;
	},
	"other verification run": (f) => {
		f.artifact.workflow_run.id = 9;
	},
	"bad digest": (f) => {
		f.deployment.payload.artifact_digest = "latest";
	},
	"failed deployment": (f) => {
		f.status.state = "failure";
	},
	rollback: (f) => {
		f.status.state = "inactive";
	},
	"status environment": (f) => {
		f.status.environment = "staging";
	},
	"status publisher": (f) => {
		f.status.creator.login = "attacker";
	},
	"unhealthy verification": (f) => {
		f.run.conclusion = "failure";
	},
	"untrusted branch": (f) => {
		f.run.head_branch = "feature";
	},
	"untrusted event": (f) => {
		f.run.event = "pull_request";
	},
	"untrusted workflow": (f) => {
		f.run.path = ".github/workflows/ci.yml";
	},
	"untrusted repository": (f) => {
		f.run.repository.full_name = "other/project";
	},
	"stale verification": (f) => {
		f.run.head_sha = head;
	},
};
for (const [name, mutate] of Object.entries(mismatches)) {
	test(`${name} cannot satisfy a deployment requirement`, async () => {
		const f = deploymentFixture();
		mutate(f);
		assert.equal(await verifyGitHubDeploymentReceipt(f.api, plan, requirement, merged), false);
	});
}

test("verification artifact pagination preserves the exact receipt match", async () => {
	const f = deploymentFixture();
	f.responses["actions/runs/8/artifacts?per_page=100&page=1"] = {
		artifacts: Array.from({ length: 100 }, () => ({ ...f.artifact, name: "unrelated" })),
	};
	f.responses["actions/runs/8/artifacts?per_page=100&page=2"] = { artifacts: [f.artifact] };
	assert.equal(await verifyGitHubDeploymentReceipt(f.api, plan, requirement, merged), true);
});

test("a batched deployment contains the prerequisite merge revision", async () => {
	const f = deploymentFixture();
	f.deployment.sha = head;
	f.run.head_sha = head;
	f.artifact.workflow_run.head_sha = head;
	f.responses[`compare/${merged}...${head}?per_page=1`] = {
		status: "ahead",
		base_commit: { sha: merged },
		merge_base_commit: { sha: merged },
	};
	assert.equal(await verifyGitHubDeploymentReceipt(f.api, plan, requirement, merged), true);
	f.responses[`compare/${merged}...${head}?per_page=1`] = {
		status: "behind",
		base_commit: { sha: merged },
		merge_base_commit: { sha: head },
	};
	assert.equal(await verifyGitHubDeploymentReceipt(f.api, plan, requirement, merged), false);
});
