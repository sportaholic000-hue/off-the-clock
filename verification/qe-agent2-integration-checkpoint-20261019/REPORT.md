# Agent 2 integration checkpoint — October 19, 2026

Branch: `codex/qe-agent2-integration-checkpoint-20261019`.

The requested combined F16, reviewed F18, and A3 rendered-tier checks pass locally.
This report records the source and local evidence prepared before publication.
Complete hosted qualification must name the exact final published SHA; its actual
run, totals, and individual passing-name checks are reported in the final handoff.
The separate unpublished parser recovery and F2 policy remain outstanding.

## Exact ancestry and merge result

The checkpoint is prepared as one merge with these four ordered direct parents:

1. A3: `eaca39b875fd11274ca00bb56a9d67fa8b48142f` — starting head.
2. A1: `abc2becff9cd252a63ff30258e9950a07af2c020` — approval/adoption guard.
3. A2: `b06583ec119500762f37d437b434debb11246f29` — precision and metadata.
4. Reviewed F18: `17d224c421b82f39cb2c6eb786db45e118e13ac3`.

The F18 parent's sole parent is the requested
`03b29925437e73acb24b916ba6e69e5a002dfff1`. Git merged all three incoming heads
into A3 automatically with **zero conflicts**. No conflict resolution or manual
production edit was required. Each incoming history remains in the ancestry.

A3, A2, and the F18 repair already contain the identical authorized
`jobs.test.timeout-minutes: 45` workflow. The integrated workflow is byte-identical
to A3, as are all selectors, runners, dependency files, and specifications.

## Changes relative to the exact A3 starting head

Five production paths are inherited from their reviewed owners, without edits:

| Incoming owner | Production path |
| --- | --- |
| A1 | `server/src/quoteDoneBridge.js` |
| A2 | `server/priceBookMoney.js` |
| A2 | `server/pricePrecision.js` |
| F18 | `server/src/quoteScopeDisclosure.js` |
| F18 | `server/src/voice/voiceQuotePresentation.js` |

Six incoming test files are preserved: A1's approval regression, A2's three
precision/metadata/editor regressions, and the two F18 voice regression files.
All incoming assertions, captured historical receipts, and verification evidence
remain byte-identical to their source commits. A3's tier UI, material-copy module,
and rendered regression also remain byte-identical to its starting head.

The only new normal test source is
`test/qeAgent2IntegrationF16PricePrecision20261019.spec.mjs`. It imports the existing
`verification/qe-agent1-core-accuracy-20261018/f16-with-agent2.spec.mjs` unchanged.
It adds no replacement cases, assertion changes, classifications, or formulas.
Other new files are confined to this checkpoint's verification directory.
The complete path inventory is in `changed-files.json`.

## F16 combined verification

The explicit requested command runs A1 approval, the original pipe-jack dependency
suite, and A2 precision/metadata together: **94/94 passed**. The normal entry point
independently runs the same **14/14 pipe-jack cases**.

Those existing cases cover base/tier prices, MANUAL/AI_SUGGESTED sources, ordinary
approval and starting-value adoption. Invalid 100.5-cent each-prices are rejected
without modifying the durable book bytes, original approval/adoption receipts,
revision, unconfirmed marker, or creation record. Unapproved invalid books cannot
gain receipts. Valid controls accept 100 cents per item while preserving 100.5
cents per linear foot and legitimate adoption. A2's existing editor and extension
arithmetic assertions remain unchanged.

The selectors include the normal entry point exactly once in both strict and full.
`required-test-names.json` lists the 14 exact existing names. Qualification requires
each name to pass exactly once in both hosted logs, without failures or skips.

## A3 rendered tier wording and confirmation labels

All four unchanged A3 Chromium tests passed against the combined code, alongside
A2's Chromium editor regression: **5/5 passed**.

The F14 test renders the actual owner controls. Inherited material pricing uses
its base receipt; an explicit same-price override requires its independent tier
receipt. Before that confirmation the quote retains Inherited **$581** and Premium
**$881**. After independent confirmation it adds Same price **$581**, preserving
the other amounts and receipt assertions.

Rendered pending controls identify `CONFIRM ON SAVE — Asphalt shingle — Base price`
and `CONFIRM ON SAVE — Asphalt shingle — Same price`. The actionable
`I re-entered and confirm Asphalt shingle — Same price` control dispatches the
existing Same price tier ID. Mode-specific, product-specific, inherited, and
independently confirmed tier material wording all pass unchanged.

## F18 verification and evidence preservation

The two incoming files contain **41/41 passing regressions**: projection controls
and real saved-retry/history/live-dispatcher paths. Their `voice` filenames retain
the existing strict quote exclusion. No selector or extra normal F18 entry point
was added. Each of the 41 names must occur exactly once in hosted full and zero
times in hosted strict.

The original review matrix also passes **91/91**. The matrix writes observations
and a SQLite fixture beside its module, so its source was copied byte-for-byte to
`f18-original-matrix.spec.mjs` in this new evidence directory before execution.
Its SHA-256 is
`ecdb946d6a543ae1c3d92aedd8e01744d826769db9cc16d6102941203b1fe42c`.
All original review and repair evidence directories remain unchanged. The copied
script's embedded commit label still identifies its original reviewed base; the
four parents and protected source blobs in this checkpoint identify this run's
combined implementation.

The matrix and regressions preserve exact ranges, per-option exclusions, genuine
additional work, historical receipts, and privacy constraints. Malformed ranges
and unsupported options containers retain the incoming safe review behavior.
No price, customer total, tax rule, historical receipt, or policy was changed to
obtain a passing result.

## Completed local checks

Node **v22.23.0**, locked dependencies, Playwright **1.56.0**, installed Chromium,
and writable temporary synthetic price-book storage were used.

| Check | Actual result |
| --- | --- |
| `npm ci`, pinned Playwright and Chromium installation | Passed |
| Owner app and widget production build | Passed |
| Explicit combined A1/F16/A2 command | 94/94 passed |
| Normally selected F16 entry point | 14/14 passed |
| Original unchanged F18 matrix | 91/91 passed |
| Incoming F18 regressions | 41/41 passed |
| A3 rendered components and A2 shared editor | 5/5 passed |
| A1 core/delivery/historical, exact roofing, starting values and adoption neighbors | 129/129 passed |

Every test run reports zero failures, skips, cancellations, and TODOs. Counts
overlap and are not presented as a count of unique tests. Exact commands and
durations are in `local-execution.json`; logs are retained losslessly as gzip
archives, with original-content hashes in `evidence-archives.json`.

The local name-verification manifest initially used `AI` as shorthand in six
names; it was corrected to A1's existing `AI_SUGGESTED` enum. The initial manifest
and correction note are retained. No test assertion or receipt changed.

Source/test/workflow diff checks pass. The whole merged diff reports historical
trailing whitespace in 12 incoming raw evidence paths; those records are retained
without reformatting as instructed. `diff-check.json` records the distinction.
The build-generated tracked HTML file was restored to its incoming blob after
the successful local checks; generated build output is not part of the commit.

## Exact-head hosted requirements

- Successful cold install, owner/widget build, dedicated browser gate, strict
  quote gate, full suite, failure checker, dependency audit, and required Docker job.
- All 14 existing F16 names pass exactly once in strict and once in full.
- All 41 existing F18 names pass exactly once in full, with their strict exclusion
  preserved. All four A3 rendered regression names also pass in both gates.
- The final remote branch ref, fetched Git tree, ordered parents, protected source
  identities, and hosted `head_sha` must agree. Earlier-head results do not qualify.

This checkpoint does not include the unpublished
`9af52ddc13c78beec84e7f090506da8c9b5fd691` parser recovery or settle F2 policy.
No main merge, deployment, tag, force push, or other agent's branch write is part
of this work.
