import { job, uses, workflow } from "@dedalus/hollywood";
import { defineMatrix, format, gh, hashFiles } from "@dedalus/hollywood/expr";

import { s3Cache } from "./s3-cache";

const build = defineMatrix({
	go: ["1.24", "1.25"],
} as const);

export const s3CacheWorkflow = workflow({
	name: "S3 Cache Example",
	on: { workflow_dispatch: {} },
	permissions: { contents: "read", "id-token": "write" },
	concurrency: {
		group: format("s3-cache-{0}", gh.github.ref),
		queue: "max",
	},
	jobs: {
		cache: job({
			"runs-on": "ubuntu-latest",
			concurrency: {
				group: format("s3-cache-{0}", gh.github.workflow),
				"cancel-in-progress": true,
			},
			strategy: { matrix: build, "max-parallel": 2 },
			services: {
				minio: {
					image: "minio/minio:latest",
					ports: ["9000:9000"],
				},
			},
			steps: [
				uses(s3Cache, {
					name: "Restore cache",
					with: {
						mode: "restore",
						bucket: "ci-cache",
						prefix: "go",
						key: format("{0}-{1}", build.go, hashFiles("go.sum")),
						archivePath: "/tmp/cache.tar.gz",
						contentsPath: "/tmp/go-cache",
					},
				}),
			],
		}),
	},
});
