# S3 Cache

The Amazon Simple Storage Service (S3) cache recipe restores or saves an
archive in object storage. It is the best first example because it can run
locally against MinIO, an S3-compatible object store, and in GitHub against AWS
S3 with the same script.

The maintained example lives at `examples/s3-cache.ts`.

## Script shape

```typescript
export const s3Cache = action({
	name: "s3-cache",
	description: "Restore or save an archive from S3-compatible object storage.",
	inputs: {
		mode: choiceInput({
			description: "Cache mode.",
			options: ["restore", "save"] as const,
		}),
		bucket: stringInput({ description: "S3 bucket name." }),
		prefix: stringInput({ description: "S3 key prefix." }),
		key: stringInput({ description: "Cache key." }),
		archivePath: pathInput({ description: "Temporary cache archive path." }),
		contentsPath: pathInput({ description: "Directory to restore or save." }),
	},
	outputs: {
		cacheHit: stringOutput({ description: "Whether restore found an archive." }),
	},
	run: async ({ exec, input, log }) => {
		const s3Uri = `s3://${input.bucket}/${input.prefix}/${input.key}.tar.gz`;

		if (input.mode === "restore") {
			const copy = await exec("aws", ["s3", "cp", s3Uri, input.archivePath], { exitPolicy: "any" });

			if (copy.exitCode !== 0) {
				log.info(`No Go cache found at ${s3Uri}`);
				return { cacheHit: "false" };
			}

			await exec("tar", ["-xzf", input.archivePath, "-C", input.contentsPath]);
			return { cacheHit: "true" };
		}

		await exec("tar", ["-czf", input.archivePath, "-C", input.contentsPath, "."]);
		await exec("aws", ["s3", "cp", input.archivePath, s3Uri]);
		return { cacheHit: "true" };
	},
});
```

The restore miss is modeled explicitly with `exitPolicy: "any"`. Upload
failure can be fatal or nonfatal depending on the cache contract. Pick one and
encode it in the script.

## Local MinIO test

```bash
HOLLYWOOD_RUN_MINIO=1 \
  npm test -- src/examples.test.ts \
  -t "s3-cache example saves and restores through real local MinIO"
```

This starts a local MinIO process, creates a bucket with the AWS command line
interface (CLI), saves an archive through the Hollywood action, restores it
through the same action, and checks the restored file contents.

## GitHub workflow step

```yaml
- name: Restore Go cache
  uses: ./.github/actions/s3-cache
  with:
    mode: restore
    bucket: dcs-ci-artifacts
    prefix: go
    key: ${{ runner.os }}-${{ hashFiles('go.sum') }}
    archive-path: /tmp/go-cache.tar.gz
    contents-path: /tmp/go-cache
```

There is no shell in the workflow. The workflow passes values. The action owns
the program.
