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
[TLC v1.8.0 release](https://github.com/tlaplus/tlaplus/releases/tag/v1.8.0).
The checker requires SHA-256
`7beec0f04818732a62fa193731711a99aa4f11279499b2360a7d156c519ea78d`.

```sh
node models/check.mjs --jar /path/to/tla2tools.jar --output /path/to/new-run
```

`--java` selects the Java executable. Each configuration gets one worker,
256 MiB heap, and a 30-second deadline. The checker uses Node 20 builtins only.
It preserves input snapshots, hashes, exit status, complete logs, and JSON
counterexamples under the new output directory. Do not commit run outputs.

Two mutants remove the wait and failure guards. Each must violate its named
safety invariant. Three witnesses require traces reaching successful
continuation, a failed join, and a cancelled join. Syntax errors, timeouts,
wrong violations, and missing traces fail the checker, including negative runs.
