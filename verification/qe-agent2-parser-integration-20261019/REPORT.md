# A4 parser/import integration checkpoint

The exact histories have been merged locally without conflicts and the planned
combined local checks have passed. Incoming head
`4a90f73695611bb42bb9fb50d40a16f9e01c3740` qualified before publication:
run `39201472963`, attempt 1, completed successfully at
`2026-10-19T05:19:43Z`, with 5,006/5,006 strict, 6,593/6,593 full,
12/12 dedicated browser tests, build, checker, production audit (zero
vulnerabilities) and synthetic Docker startup. Complete qualification metadata
and required passing-name checks are in `incoming-qualification.json`.
Final hosted results for the new merge are reported against that exact SHA in
the external handoff; this prepublication report does not claim those future
results or use a parent's passing run to qualify the merge.

## Ancestry and changes

Branch: `codex/qe-agent2-integration-checkpoint-20261019`.
Ordered parents:

1. Verified integration `e50c9f58459a4362537eb5da5dc1cf082fbc3ca8`.
2. Incoming A4 repair `4a90f73695611bb42bb9fb50d40a16f9e01c3740`.

Common ancestor: `c1817621f6eccb31822979bf994efc4902682d34`.
There are no overlapping changed paths. All 151 incoming paths and all 428
paths specific to the integration match their respective parent trees. The
complete preservation audit verifies 3,621 expected paths, including unchanged
shared files, genuine frozen receipts, previous tests and all historical evidence.
No manual production edits, assertion reconciliations or selector changes were
needed. No new normally selected test file or wrapper was added.

The original recovery merge `c58ca997e9cf63739d399939bcdade83e97874d2`, its ordered
parents `235eb5c978f847c2d47379ae3cf03b52c1f9104c` and
`4f6152413a650085a7fe6002dfd077a542f9c0c2`, and recovery
`9af52ddc13c78beec84e7f090506da8c9b5fd691` remain in the incoming ancestry.
All incoming failed attempts, setup corrections, source snapshots and prior
reports are retained; their historical incomplete statuses are not rewritten.

The only incoming production changes are
`server/src/voice/listedPriceCalculation.js` and
`server/src/websitePriceExtraction.js`. They preserve bounded price
qualifications through parsing/import and retain the existing verbatim review
response for qualified or ambiguous listings. Actual direct, draft, owner-save
and voice-dispatcher paths pass the unchanged A4 assertions. The established
unconditional product names, exact arithmetic, currencies, saved identity,
private-data boundaries and structural associations remain covered.

## Combined local verification

Expectations and the name manifest were written before the merge and execution.
All listed test runs have zero failures, cancellations, skips and TODOs.
Counts overlap and are not additive.

| Selection | Actual result |
| --- | --- |
| A4 parser/import and neighbors, 16 files | 874/874 |
| Geometry boundaries, saved delivery and genuine v11 history | 525/525 |
| A1 approval, original F16 dependency, A2 precision/metadata | 94/94 |
| Normally selected F16 dependency entry | 14/14 |
| Reviewed F18 regressions | 41/41 |
| Original unchanged F18 matrix | 91/91 |
| A3 presentation and A2 shared-editor Chromium controls | 5/5 |
| Compatibility and historical replay, 15 files | 491/491 |
| Owner app and widget build | Passed |

The parser selection includes all 577 incoming cases: 305 original parser,
120 original A4, 36 parenthesized and 116 punctuation cases. Each of the 874
expected names passed exactly once locally. The 525 geometry cases, 14 F16
cases, 41 F18 cases and five rendered controls also match their exact-name
manifests. Compatibility preserves the 135 zero-adjustment and three
separate-line rounding controls. The frozen nine-cent separate-line control
and all other existing dollar assertions remain unchanged.

Both production engine literals remain
`quote-engine-vnext-geometry-20261019-v12`. Engine calculations, configured
prices, taxes, F16/F18 behavior and owner approvals are unchanged by this
integration. Historical replay remains immutable and current-version approval
remains explicit. There is no automatic approval renewal.

Local execution used the existing locked dependencies, Node 22.23.0 and
Playwright 1.56.0/Chromium, with isolated synthetic temporary storage for each
selection. No new dependency install is claimed locally. Hosted CI performs
the cold lockfile install. The generated tracked client index was restored;
the tracked working tree then matched the staged merge.

## Selection, evidence and publication checks

Unchanged selectors yield 283 strict files and 353 full files. Each of the five
incoming voice files is selected once by full and excluded from strict. The
41 F18 cases retain the same exclusion from strict. The CI test timeout remains
45 minutes. There are no specification, workflow, dependency or policy edits.

`local-execution.json` records exact commands and actual counts. Raw local
outputs and synthetic F18 observations/database are retained as lossless gzip
archives with original and compressed SHA-256 hashes. `required-test-names.json`
and `additional-test-names.json` support the final hosted occurrence audit.
`changed-files.json` records every changed path relative to the first parent.

The hosted log masks one synthetic credential-URL test name as
`website rejects URL before DNS ***business.example`. Its unchanged source
registration and adjacent numbered passing records identify that case in each
suite. `hosted-log-name-mapping.json` records this one exact mapping; the first
literal-only audit result is preserved in `incoming-name-audit-initial.json`.
All 873 other parser/import names match literally, and all 577 incoming names
match literally once in full and remain absent from strict. No assertion or
source test name was changed for the audit.

The production/test/workflow/script diff check passes. The whole incoming diff
check reports pre-existing whitespace in historical verification evidence;
the complete diagnostics are retained in `incoming_all-diff-check.txt.gz` and
counted in `diff-check.json`. These incoming files are preserved byte-for-byte,
not normalized to satisfy a formatting check.

Publication must recheck the remote target, use an expected-head non-forced
update, fetch the resulting commit and verify its tree, parents and ancestry.
Complete required gates on the exact incoming SHA are a prerequisite, followed
by independent strict/full/browser/build/checker/audit/Docker qualification of
the exact new merge. No earlier passing SHA qualifies a newer head.

Work performed personally. F2 policy is unchanged and remains outstanding.
PI-00 is paused at inspection and is not included. No main merge, deployment,
tag, force push or write to another agent's branch is part of this checkpoint.
