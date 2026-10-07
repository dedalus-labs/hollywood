# Parallel join checks

Following work may start only after every required parallel task succeeds.
`ParallelJoin.tla` models task completion, the join that collects results, and
the following step as separate actions. Tasks finish in any order with success,
failure, or cancellation. A failed or cancelled task blocks continuation.

The model starts after tasks launch. It checks two and three tasks with no
fairness, symmetry, or state constraints. Terminal states stutter explicitly,
so deadlock checking stays enabled. It checks safety, not eventual completion.
It excludes optional tasks, conditional steps, shared writes, and retries.

The [GitHub parallel-step contract](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsparallel)
supplies the intended join boundary. These bounded results do not verify the
GitHub runner or prove the contract for arbitrary group sizes. Generated YAML
tests and hosted execution must establish the implementation connection.

Use Java 21 or newer and the official
[TLC v1.7.4 release](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4).
Use the stable release because prerelease assets are rebuilt in place.
The checker requires SHA-256
`936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`.

```sh
node models/check.mjs --jar /path/to/tla2tools.jar --output /path/to/new-run
```

`--java` selects the Java executable. Paths resolve from the invocation
directory before case execution changes directories. A bare name such as
`java` uses `PATH`. Each configuration gets one worker,
256 MiB heap, and a 30-second deadline. The checker uses Node 20 builtins only.
It preserves input snapshots, hashes, exit status, complete logs, and JSON
counterexamples under the new output directory. The checker reads complete state
frames from TLC's `-tool` output and writes them to `counterexample.json`. Each
case owns a Java temporary directory so concurrent runs cannot share partially
extracted standard modules. Do not commit run outputs.

Two mutants remove the wait and failure guards. Each must violate its named
safety invariant. Three witnesses require traces reaching successful
continuation, a failed join, and a cancelled join. Syntax errors, timeouts,
wrong violations, and missing traces fail the checker, including negative runs.
