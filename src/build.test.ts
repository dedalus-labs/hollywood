import * as assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { test } from "vitest";

import tsdownConfig from "../tsdown.config";

type BuildConfig = Readonly<{
	define?: Readonly<Record<string, string>>;
	entry?: unknown;
}>;

const buildConfigs = (Array.isArray(tsdownConfig) ? tsdownConfig : [tsdownConfig]) as
	readonly BuildConfig[];

test("build entries only target production source files", () => {
	for (const config of buildConfigs) {
		for (const entry of entryPaths(config.entry)) {
			assert.match(entry, /^src\/.+\.ts$/);
			assert.doesNotMatch(entry, /\.(?:test|spec)\.ts$/);
		}
	}
});

test("build strips in-source Vitest blocks", () => {
	for (const config of buildConfigs) {
		assert.equal(config.define?.["import.meta.vitest"], "undefined");
	}
});

test("published package only includes built artifacts", async () => {
	const packageJson = JSON.parse(
		await readFile(new URL("../package.json", import.meta.url), "utf8"),
	) as { readonly files?: unknown };

	assert.deepEqual(packageJson.files, ["dist", "README.md", "package.json"]);
});

const entryPaths = (entry: unknown): readonly string[] => {
	if (typeof entry === "string") {
		return [entry];
	}
	if (Array.isArray(entry)) {
		for (const value of entry) {
			assert.equal(typeof value, "string");
		}
		return entry;
	}
	if (entry !== null && typeof entry === "object") {
		return Object.values(entry).map((value) => {
			assert.equal(typeof value, "string");
			return value;
		});
	}
	assert.fail("build config is missing entry");
};
