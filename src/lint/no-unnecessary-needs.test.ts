import { describe, it, expect } from "vitest";
import { checkUnnecessaryNeeds } from "./no-unnecessary-needs";

describe("no-unnecessary-needs lint rule", () => {
	const mockUpstreamJob = {
		"runs-on": "ubuntu-latest",
		steps: [{ uses: "actions/upload-artifact@v4", with: { name: "build-output" } }],
	};

	it("should not warn when outputs are explicitly referenced", () => {
		const job = {
			"runs-on": "ubuntu-latest",
			needs: ["build"],
			steps: [{ run: { command: "echo ${{ needs.build.outputs.image }}" } }],
		};

		// Casting as any is used here to bypass strict typing for partial test mocks
		const warnings = checkUnnecessaryNeeds("deploy", job as any, { build: mockUpstreamJob as any });
		expect(warnings).toHaveLength(0);
	});

	it("should not warn when results are explicitly referenced", () => {
		const job = {
			"runs-on": "ubuntu-latest",
			needs: ["test"],
			if: "${{ needs.test.result == 'success' }}",
			steps: [{ run: { command: "echo 'Tests passed!'" } }],
		};

		const warnings = checkUnnecessaryNeeds("deploy", job as any, { test: { "runs-on": "ubuntu-latest" } as any });
		expect(warnings).toHaveLength(0);
	});

	it("should warn when needs are declared but no outputs or artifacts are used", () => {
		const job = {
			"runs-on": "ubuntu-latest",
			needs: ["lint"],
			steps: [{ run: { command: "echo 'Deploying...'" } }],
		};

		const warnings = checkUnnecessaryNeeds("deploy", job as any, { lint: { "runs-on": "ubuntu-latest" } as any });
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.message).toContain("declares needs 'lint' but does not reference any outputs from it");
		expect(warnings[0]?.ruleId).toBe("no-unnecessary-needs");
		expect(warnings[0]?.jobId).toBe("deploy");
	});

	it("should not warn when an artifact is uploaded by upstream and downloaded by downstream", () => {
		const job = {
			"runs-on": "ubuntu-latest",
			needs: ["build"],
			steps: [{ uses: "actions/download-artifact@v4", with: { name: "build-output" } }],
		};

		const warnings = checkUnnecessaryNeeds("deploy", job as any, { build: mockUpstreamJob as any });
		expect(warnings).toHaveLength(0);
	});
});