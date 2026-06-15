import * as assert from "node:assert/strict";
import { test } from "vitest";

import { defineEnvironmentRegistry, resolveEnvironment, selectEnvironmentName } from "./environments";

const environments = defineEnvironmentRegistry({
	accounts: {
		dev: { id: "089042446622" },
		prod: { id: "558999820298" },
	},
	environments: {
		dev: { account: "dev", branches: ["dev"], githubEnvironment: "Development" },
		preview: { account: "dev", artifactSource: "dev", branches: ["preview"] },
		prod: { account: "prod", artifactSource: "preview", branches: ["main"] },
	},
} as const);

test("resolveEnvironment returns account and artifact source policy", () => {
	const preview = resolveEnvironment(environments, "preview");

	assert.equal(preview.name, "preview");
	assert.equal(preview.account, "dev");
	assert.equal(preview.accountId, "089042446622");
	assert.equal(preview.artifactSource, "dev");
});

test("resolveEnvironment rejects unknown names and sources", () => {
	assert.throws(() => resolveEnvironment(environments, "staging"), /unknown environment: staging/);

	const broken = defineEnvironmentRegistry({
		accounts: { dev: { id: "089042446622" } },
		environments: {
			dev: { account: "dev", artifactSource: "missing" },
		},
	} as const);
	assert.throws(
		() => resolveEnvironment(broken, "dev"),
		/environment dev references unknown artifact source: missing/,
	);
});

test("defineEnvironmentRegistry rejects malformed account ids", () => {
	assert.throws(
		() =>
			defineEnvironmentRegistry({
				accounts: { prod: { id: "558" } },
				environments: { prod: { account: "prod" } },
			} as const),
		/environment account prod must use a 12-digit id/,
	);
});

test("selectEnvironmentName resolves explicit environment or branch mapping", () => {
	assert.equal(selectEnvironmentName(environments, { environment: "prod", refName: "dev" }), "prod");
	assert.equal(selectEnvironmentName(environments, { refName: "main" }), "prod");
	assert.throws(
		() => selectEnvironmentName(environments, { refName: "feature/nope" }),
		/no environment branch mapping for ref: feature\/nope/,
	);
});
