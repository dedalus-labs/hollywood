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
const memoryMibMax = integerInput({ description: "Maximum guest memory in MiB." });
const dryRun = booleanInput({ description: "Skip mutating commands.", default: "false" });
```

The runtime parses GitHub string inputs into typed script values. Invalid input
fails before `run` starts.

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
await log.group("Bake VM snapshot", async () => {
	await exec("sudo", ["dm-bake", "--output", input.output]);
});

log.warning("Cache upload failed");
```

Local runs can write to stdout and stderr. GitHub runs route the same calls
through `@actions/core`.
