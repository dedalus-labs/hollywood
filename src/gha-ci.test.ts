import assert from "node:assert/strict";
import { test } from "vitest";

import { assertSha256 } from "../gha/ci";

test("artifact checksum verification accepts only matching contents", () => {
	const contents = Buffer.from("Hollywood");
	const digest = "2805150bc18835691f42ef2169ccb5820c392d931145085bcd7e794600f1c7e2";

	assert.doesNotThrow(() => assertSha256(contents, digest));
	assert.throws(() => assertSha256(Buffer.from("tampered"), digest), /checksum mismatch/);
});
