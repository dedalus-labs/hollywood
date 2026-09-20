-------------------------- MODULE ParallelJoin --------------------------
CONSTANTS Tasks, SkipWait, IgnoreFailure
VARIABLES status, joined, continued
vars == <<status, joined, continued>>
Outcomes == {"success", "failure", "cancelled"}
AllFinished == \A task \in Tasks : status[task] \in Outcomes
AllSucceeded == \A task \in Tasks : status[task] = "success"

Init == /\ status = [task \in Tasks |-> "running"]
        /\ joined = "waiting"
        /\ continued = FALSE
Finish(task, outcome) ==
    /\ status[task] = "running"
    /\ status' = [status EXCEPT ![task] = outcome]
    /\ UNCHANGED <<joined, continued>>
Join == /\ joined = "waiting"
        /\ (SkipWait \/ AllFinished)
        /\ joined' = IF IgnoreFailure \/ AllSucceeded THEN "passed" ELSE "blocked"
        /\ UNCHANGED <<status, continued>>
Continue == /\ joined = "passed"
            /\ ~continued
            /\ continued' = TRUE
            /\ UNCHANGED <<status, joined>>
Done == /\ AllFinished /\ (joined = "blocked" \/ continued)
        /\ UNCHANGED vars
Next == (\E task \in Tasks, outcome \in Outcomes : Finish(task, outcome))
        \/ Join \/ Continue \/ Done

TypeOK == /\ status \in [Tasks -> (Outcomes \cup {"running"})]
          /\ joined \in {"waiting", "passed", "blocked"}
          /\ continued \in BOOLEAN
JoinWaits == joined # "waiting" => AllFinished
ContinuationSafe == continued => AllSucceeded
NoSuccess == ~continued
NoFailureJoin == ~(joined = "blocked" /\ \E task \in Tasks : status[task] = "failure")
NoCancelledJoin == ~(joined = "blocked" /\ \E task \in Tasks : status[task] = "cancelled")
=============================================================================
