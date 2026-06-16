import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: [
			{
				find: "@dedalus-labs/hollywood/action-runtime",
				replacement: fileURLToPath(new URL("./src/action-runtime.ts", import.meta.url)),
			},
			{
				find: "@dedalus-labs/hollywood/expr",
				replacement: fileURLToPath(new URL("./src/expr.ts", import.meta.url)),
			},
			{
				find: "@dedalus-labs/hollywood",
				replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
			},
		],
	},
	test: {
		environment: "node",
		include: ["src/**/*.test.ts", "examples/**/*.test.ts"],
	},
});
