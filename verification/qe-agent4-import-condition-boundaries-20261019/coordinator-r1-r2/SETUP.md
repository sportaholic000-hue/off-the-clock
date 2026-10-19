# Baseline setup

The first launch failed before application/test execution because this restored execution environment has no `/tmp` directory. The exact log and command are retained as `environment-attempt-1-*`. No test assertion or production file was changed to correct that environment issue. Subsequent commands set `TMPDIR` to an owned workspace directory.

The official unchanged-base baseline completed all 82 checks: 16 pass / 66 fail, with zero skips/cancellations/TODOs. `baseline-new.spec.mjs.txt`, `baseline-command.json`, `baseline-exit.json`, `baseline-new.tap` and `baseline-examples.json` preserve that execution. Failures include identity assertions as well as unsafe calculation reproductions; do not describe every failing assertion as a separate money-calculation defect. The actual route probes collect draft, saved/provider facts and dispatcher results before applying the safety assertions.

No retained test or evidence file was changed. Dependencies were installed from the unchanged lockfile using Node 22.23.1. The exact published branch was restored through ordinary Git into a separate checkout because the prior import checkout was not present in this execution snapshot; the F18 checkout was not modified.

The extra global-tax combination reproduced retention of a conflicting paragraph missing the membership wording, but did not reproduce a multiplied amount: its scoped tax note already caused review. It is a condition-identity regression, not an additional demonstrated arithmetic bypass. The unqualified coordinator cases did reproduce calculated/30.00 through both parser and actual dispatcher.
