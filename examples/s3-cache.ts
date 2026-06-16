import { action, choiceInput, pathInput, stringInput, stringOutput } from "@dedalus-labs/hollywood";

export const s3Cache = action({
	name: "s3-cache",
	description: "Restore or save an archive from S3-compatible object storage.",
	localActionPath: "s3-cache",
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
			const copy = await exec("aws", ["s3", "cp", s3Uri, input.archivePath, "--only-show-errors"], {
				exitPolicy: "any",
			});
			if (copy.exitCode !== 0) {
				log.info(`No cache found at ${s3Uri}`);
				return { cacheHit: "false" };
			}
			await exec("tar", ["-xzf", input.archivePath, "-C", input.contentsPath]);
			return { cacheHit: "true" };
		}

		await exec("tar", ["-czf", input.archivePath, "-C", input.contentsPath, "."]);
		await exec("aws", ["s3", "cp", input.archivePath, s3Uri, "--only-show-errors"]);
		return { cacheHit: "true" };
	},
});
