import assert from "node:assert/strict";
import { test } from "vitest";

import {
	compareRunnerProbes,
	defineRunnerContract,
	parseRunnerContract,
	parseRunnerProbe,
	verifyRunner,
	type RunnerContract,
	type RunnerProbe,
} from "./runner-contract";

const contract: RunnerContract = {
	schemaVersion: 1,
	environment: { CI: "true", RUNNER_OS: "Linux" },
	os: { id: "ubuntu", versionId: "24.04" },
	paths: ["GITHUB_WORKSPACE"],
	tools: [{ name: "node", versionPrefix: "v24." }],
};

const probe: RunnerProbe = {
	schemaVersion: 1,
	environment: { CI: "true", RUNNER_OS: "Linux" },
	identity: { gid: 1001, groups: ["runner"], uid: 1001 },
	packages: { manager: "dpkg", packages: [{ name: "bash", version: "5.2" }] },
	paths: [{
		absolute: true,
		exists: true,
		name: "GITHUB_WORKSPACE",
		status: "ready",
		value: "/github/workspace",
		writable: true,
	}],
	platform: {
		architecture: "arm64",
		capabilities: "000001ffffffffff",
		cgroup: "v2",
		kernelRelease: "6.16.9",
		kernelVersion: "Linux",
		os: { id: "ubuntu", prettyName: "Ubuntu 24.04 LTS", versionId: "24.04" },
	},
	tools: [{ name: "node", path: "/usr/bin/node", status: "ready", version: "v24.11.0" }],
	toolCache: { node: ["24.11.0"] },
};

test("runner contract verifies semantic requirements", () => {
	assert.deepEqual(verifyRunner(defineRunnerContract(contract), probe), []);
	assert.deepEqual(
		verifyRunner(contract, { ...probe, tools: [{ name: "node", status: "absent" }] }),
		[{
			category: "contract",
			actual: "absent",
			expected: "ready",
			path: "tools.node.status",
		}],
	);
});

test("runner comparison classifies drift by ownership", () => {
	const actual = {
		...probe,
		environment: { ...probe.environment, CI: "false" },
		packages: { manager: "dpkg", packages: [{ name: "bash", version: "5.3" }] },
		platform: { ...probe.platform, kernelRelease: "different" },
	} satisfies RunnerProbe;

	assert.deepEqual(
		compareRunnerProbes(probe, actual).map(({ category, path }) => ({ category, path })),
		[
			{ category: "contract", path: "environment.CI" },
			{ category: "inventory", path: "packages.packages.bash.version" },
			{ category: "provider", path: "platform.kernelRelease" },
		],
	);
});

test("runner schemas reject malformed and undeclared state", () => {
	assert.deepEqual(parseRunnerContract(JSON.stringify(contract)), contract);
	assert.deepEqual(parseRunnerProbe(JSON.stringify(probe)), probe);
	assert.throws(
		() => parseRunnerContract(JSON.stringify({ ...contract, secret: "nope" })),
		/runner contract is invalid: Unrecognized key/,
	);
	assert.throws(
		() => parseRunnerProbe(JSON.stringify({ ...probe, identity: { ...probe.identity, secret: "nope" } })),
		/runner probe is invalid at identity: Unrecognized key/,
	);
	assert.throws(
		() => parseRunnerProbe(JSON.stringify({ ...probe, tools: [probe.tools[0], probe.tools[0]] })),
		/runner probe tools names must be unique/,
	);
});
