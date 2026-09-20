import assert from "node:assert/strict";
import { test } from "vitest";

import { runnerImageWorkflow } from "./runner-image";

const publishJob = () => {
	const publish = runnerImageWorkflow.jobs.publish;
	assert.ok(publish !== undefined && "steps" in publish);
	return publish;
};

test("runner image publication is isolated from pull request permissions", () => {
	assert.deepEqual(runnerImageWorkflow.permissions, { contents: "read" });
	assert.deepEqual(publishJob().permissions, {
		attestations: "write",
		contents: "read",
		"id-token": "write",
		packages: "write",
	});
	assert.equal(
		publishJob().if,
		"${{ github.repository == 'dedalus-labs/hollywood' && github.event_name == 'release' && startsWith(github.ref, 'refs/tags/runner-v') }}",
	);
});

test("runner image publication pins every third-party action", () => {
	for (const step of publishJob().steps) {
		if ("uses" in step && !step.uses.startsWith("./")) {
			assert.match(step.uses, /@[0-9a-f]{40}$/);
		}
	}
});

test("runner image publication emits SBOM and signed provenance", () => {
	const build = publishJob().steps.find((step) => "id" in step && step.id === "build");
	assert.ok(build !== undefined && "uses" in build && "with" in build);
	assert.ok("sbom" in build.with && "provenance" in build.with);
	assert.equal(build.with.sbom, true);
	assert.equal(build.with.provenance, "mode=max");

	const attest = publishJob().steps.find(
		(step) => "uses" in step && step.uses.includes("attest-build-provenance"),
	);
	assert.ok(attest !== undefined && "uses" in attest && "with" in attest);
	assert.ok("push-to-registry" in attest.with);
	assert.equal(attest.with["push-to-registry"], true);
});

test("runner image publication proves signed and anonymous access", () => {
	const verification = publishJob().steps.at(-1);
	assert.ok(verification !== undefined && "uses" in verification);
	assert.equal(verification.uses, "./.github/actions/verify-published-runner-image");
	assert.deepEqual(verification.with, {
		digest: "${{ steps.build.outputs.digest }}",
		image: "ghcr.io/dedalus-labs/hollywood/runner",
		repository: "dedalus-labs/hollywood",
		"source-digest": "${{ github.sha }}",
		"source-ref": "${{ steps.release.outputs.source-ref }}",
	});
});

test("runner image verification covers Docker and Podman natively on amd64 and arm64", () => {
	const verify = runnerImageWorkflow.jobs.verify;
	assert.ok(verify !== undefined && "steps" in verify);
	assert.deepEqual(Object.getOwnPropertyDescriptor(verify.strategy?.matrix, "values")?.value, {
		architecture: ["amd64", "arm64"],
		provider: ["docker", "podman"],
	});
});

test("runner image publication accepts only runner GitHub releases", () => {
	assert.deepEqual(runnerImageWorkflow.on.release, { types: ["published"] });
	assert.equal(
		publishJob().if,
		"${{ github.repository == 'dedalus-labs/hollywood' && github.event_name == 'release' && startsWith(github.ref, 'refs/tags/runner-v') }}",
	);

	const release = publishJob().steps.find((step) => "id" in step && step.id === "release");
	assert.ok(release !== undefined && "uses" in release);
	assert.equal(release.uses, "./.github/actions/prepare-runner-image-release");

	const build = publishJob().steps.find((step) => "id" in step && step.id === "build");
	assert.ok(build !== undefined && "with" in build);
	assert.ok("tags" in build.with && "labels" in build.with);
	assert.equal(build.with.tags, "${{ steps.release.outputs.tags }}");
	assert.equal(
		build.with.labels,
		"${{ format('org.opencontainers.image.base.name={0}\norg.opencontainers.image.version={1}\nio.dedalus.hollywood.github-actions-runner.version={2}', 'ghcr.io/actions/actions-runner@sha256:0cfdcc701ce933c6d243c6b0b2da767366dc9f2e99961d4c3754b0b78084cdda', steps.release.outputs.version, '2.336.0') }}",
	);
});

test("root package releases skip runner image work", () => {
	for (const name of ["observe", "verify"] as const) {
		assert.equal(
			runnerImageWorkflow.jobs[name].if,
			"${{ github.repository == 'dedalus-labs/hollywood' && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository) && (github.event_name != 'release' || github.event_name == 'release' && startsWith(github.ref, 'refs/tags/runner-v')) }}",
		);
	}
});

test("runner image workflow contains no unstructured publication commands", () => {
	const built = publishJob().steps.findIndex(
		(step) => "name" in step && step.name === "Build local actions",
	);
	assert.notEqual(built, -1);
	for (const step of publishJob().steps.slice(built + 1)) {
		const name = "name" in step ? step.name : "unnamed";
		assert.ok(!("run" in step), `publish step must use an action: ${name}`);
	}
});
