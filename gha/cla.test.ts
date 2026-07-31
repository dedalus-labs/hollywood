import * as assert from "node:assert/strict";
import { test } from "vitest";

import { checkVouch } from "./cla";

test("denouncement overrides an earlier vouch", async () => {
	await assert.rejects(
		() =>
			checkVouch.run({
				input: {
					author: "octocat",
					bootstrapMaintainers: "windsornguyen",
					trustedAutomationAuthors: "",
				},
				fs: {
					readText: async () => "github:octocat\n-github:octocat compromised account\n",
				},
				log: {
					group: async (_name, run) => run(),
					info: () => {},
					warning: () => {},
				},
				call: async () => {
					throw new Error("unexpected child action call");
				},
				exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
				runner: { uidGid: "1001:1001" },
				summary: { table: async () => {} },
			}),
		/@octocat is denounced in VOUCHED\.td: compromised account/,
	);
});
