# Scripts

A Hollywood script is a `ScriptAction`: a typed object with a name,
description, inputs, outputs, and one `run` function.

## Inputs

Use the narrowest input type that describes the contract:

```typescript
const mode = choiceInput({
	description: "Cache operation.",
	options: ["restore", "save"] as const,
});

const bucket = stringInput({ description: "S3 bucket name." });
const archivePath = pathInput({ description: "Temporary archive path." });
const buildAttempt = integerInput({ description: "CI build attempt number." });
const dryRun = booleanInput({ description: "Skip mutating commands.", default: "false" });
```

The runtime parses GitHub string inputs into typed script values. Invalid input
fails before `run` starts.

## Runtime Validation

Hollywood gives your script typed inputs. Use Zod, Effect Schema, or the schema
library your repository already trusts when you also need domain policy that
TypeScript cannot prove:

```typescript
import { action, choiceInput, pathInput, stringInput } from "@dedalus-labs/hollywood";
import { z } from "zod";

const promotionPolicy = z.object({
	environment: z.enum(["staging", "production"]),
	imageRef: z.string().regex(/^ghcr\.io\/[a-z0-9-]+\/[a-z0-9._/-]+:[A-Za-z0-9_.-]+$/),
	manifestPath: z.string().refine((path) => path.startsWith("deploy/")),
});

export const promoteManifest = action({
	name: "promote-manifest",
	description: "Promote a generated manifest after policy validation.",
	inputs: {
		environment: choiceInput({
			description: "Deployment environment.",
			options: ["staging", "production"] as const,
		}),
		imageRef: stringInput({ description: "Published image reference." }),
		manifestPath: pathInput({ description: "Manifest path under deploy/." }),
	},
	outputs: {},
	run: async ({ exec, input }) => {
		promotionPolicy.parse(input);
		await exec("git", ["add", input.manifestPath]);
		return {};
	},
});
```

## Commands

Use `exec(file, args)` for process execution:

```typescript
await exec("aws", ["s3", "cp", archivePath, `s3://${bucket}/${key}`, "--only-show-errors"]);
```

Each array item is one argument. Hollywood does not ask a shell to split a
string.

## Expected nonzero exits

Some commands use exit codes as data. For example, S3 restore misses are not
always fatal. Say that explicitly:

```typescript
const copy = await exec("aws", ["s3", "cp", s3Uri, input.archivePath], { exitPolicy: "any" });

if (copy.exitCode !== 0) {
	log.info(`No cache found at ${s3Uri}`);
	return { cacheHit: "false" };
}
```

The default exit policy is `zero`, which throws on any nonzero exit. Hollywood
does not silently degrade.

## Captured output

GitHub Actions streams child output by default. When a command returns a large
machine-readable document that the action parses, capture it without writing it
to the job log:

```typescript
const listing = await exec("aws", ["s3api", "list-object-versions", "--bucket", bucket], {
	output: "capture",
});
const response = JSON.parse(listing.stdout);
```

Both `stdout` and `stderr` remain available in the command result. Command
metadata, elapsed status, and failure annotations remain visible.

## Parallel commands

`exec` is asynchronous because local execution uses `child_process.spawn` and
GitHub execution uses `@actions/exec`. Use normal TypeScript promises when two
commands are independent:

```typescript
const [lint, test] = await Promise.all([exec("pnpm", ["lint"]), exec("pnpm", ["test"])]);
```

Keep scheduler policy in workflow YAML. Script-level `Promise.all` is for work
inside one action process; workflow `strategy.max-parallel`, `needs`, and
`concurrency` decide how GitHub schedules jobs.

## Logs

Scripts receive a small logger:

```typescript
await log.group("Publish container image", async () => {
	await exec("docker", ["buildx", "build", "--tag", input.imageRef, "--push", input.context]);
});

log.warning("Cache upload failed");
```

Local runs can write to stdout and stderr. GitHub runs route the same calls
through `@actions/core`.

## Compare committed inputs

Use `gitTreeMatch` to compare selected files and directories at two full commit
object IDs. Both commits must exist in the local repository. Paths are literal,
repository-relative names, including when the command runs from a subdirectory.

```typescript
import { gitTreeMatch } from "@dedalus-labs/hollywood/action-runtime";

// Inside an action's run function:
const comparison = await gitTreeMatch({
	candidateCommit: input.candidateCommit,
	referenceCommit: input.referenceCommit,
	paths: ["src", "package-lock.json", ".github/workflows/ci.yml"],
	exec,
});
log.info(JSON.stringify(comparison));
```

The result records both commits and each path's Git entry identity: file mode,
object type, and full object ID. `matches` is true only when every declared entry
is equal. Directories include their committed descendants. Submodules record
only their commit pointers. Uncommitted files are outside the comparison.
Missing paths, invalid revisions, and Git failures throw `GitTreeMatchError`.

The caller owns the complete input list. Include workflow definitions, lockfiles,
build configuration, and other tracked dependencies that affect the result.
A matching comparison proves equality of those inputs. Reusing CI results also
requires trusted evidence of a successful run and matching external inputs,
such as the toolchain, environment, and execution options. Deployment readiness
requires its own checks of the target environment.

The comparison uses Git's [tree entry format](https://git-scm.com/docs/git-ls-tree#_output_format).
