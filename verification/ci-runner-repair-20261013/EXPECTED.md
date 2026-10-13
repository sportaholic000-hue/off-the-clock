# Expectations before baseline execution

Base: rc-20261012l, tag object a8fd712734f334f4edc2aab24cc5797d90e9ea40,
peeled commit d38781b35d126f21fed6074844e07d4e9de7c944.

Four synthetic subprocess controls exercise unchanged entry points, never the
repository's full suite:

| Input | Required result | Reported baseline defect |
|---|---|---|
| Complete one-test passing TAP | checker 0 | none |
| Same TAP ending after positive tests count | checker 1 | incorrectly 0 |
| No summary | checker 1 | none |
| Real Node child emits passing TAP, exits 7 | wrapper nonzero | incorrectly 0 |

The initial regression should expose two failures and two passing controls.
Save those outputs before editing either entry point. The original candidate's
hosted CI contained complete passing summaries; this reproduction does not show
that its hosted run falsely passed.
