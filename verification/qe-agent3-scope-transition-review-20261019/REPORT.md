# Agent 3 customer scope-transition audit

## Outcome

No new product defect was reproduced in the selected scope-transition matrix at base `eaca39b875fd11274ca00bb56a9d67fa8b48142f`.

Eight new end-to-end backend sequences passed: every selected transition ran through both the saved widget application boundary and the real voice tool dispatcher. Corrected requests did not inherit stale widget intake proofs, voice recap state, amounts, optional scope, gate identity, roof measurement/scope facts, mowing first-visit charges or pre-revision pricing. Exact retries returned the original historical receipt and left stored rows unchanged.

This is a read-only production audit. The branch changes only this verification directory; it does not change production, shared tests, selectors, dependencies, workflows, engine version, pricing or specifications.

## Results

| Transition | Widget application path | Voice dispatcher path | Verified customer result |
| --- | --- | --- | --- |
| Optional work added and removed | Pass | Pass | Mowing moved $50 recurring / $75 first → $110 / $140 with priced bagging and 100 LF edging → $50 / $75 without either extra |
| Named priced option changed | Pass | Pass | Two four-foot walk gates stayed $4,500; one twelve-foot drive gate was $4,400 and did not retain the walk-gate identity |
| Measurement method changed | Pass | Pass | 50% of a 1,500-sq-ft 12/12 footprint was $3,155.75; a measured 1,500-sq-ft roof at 50% was $2,213.25 |
| Partial scope changed to full | Pass | Pass | Full measured roof was $4,426.50, with no stale `partialPercent` or footprint-rise input |
| Recurring changed to one-time | Pass | Pass | Historical weekly quote retained $50 recurring / $75 first; one-time overgrown was $75 and contained no first-visit object |
| Saved-book revision changed | Pass | Pass | After rate 0.5 → 0.75 cents/sq ft, current weekly was $75 recurring / $112.50 first and current one-time was $112.50; old receipts retained old amounts |

All amounts match the independent arithmetic in `EXPECTED.md`, which was written before execution.

## Receipt and confirmation observations

- The widget's signed intake confirmation is bound to the complete editable request and saved-book revision. Reusing it after every tested scope correction failed before persistence. Reusing an existing widget request ID with changed details also failed as an idempotency conflict.
- Voice rejects `customerConfirmed:false` before quote execution. Fresh confirmed corrected inputs produce a distinct deterministic request fingerprint and receipt.
- A voice service handle cannot authorize a new request after the saved-book revision changes. Matching again produces a new handle and current prices.
- Exact voice retries are resolved from the stored request before the current-revision check, so historical requests remain replayable by design. Returning from added mowing extras to the byte-equivalent original base scope therefore replays the original base receipt instead of duplicating it.
- The roof underlayment presentation did not change when only measurement method or partial/full scope changed. Its existing scope token remained applicable, as intended: that token confirms the selected underlayment presentation, not every measurement. The corrected request still required a newly affirmative recap invocation and received its own receipt.
- Every rejected correction left quote/submission counts unchanged. Every accepted receipt retained its own original inputs, customer response and book revision. Retrying earlier receipts after later corrections or a price-book revision left the stored rows byte-for-byte equal.
- Customer outputs were checked for private calculation/rate keys. No line items, calculation records, owner/book identity or raw rates appeared in the dispatcher or saved customer response.

## F18 classification

A4's approved repair `17d224c421b82f39cb2c6eb786db45e118e13ac3` was inspected. It changes `server/src/quoteScopeDisclosure.js` and `server/src/voice/voiceQuotePresentation.js` to preserve qualified valid options, reject malformed ranges/containers and keep option exclusions truthful without rewriting stored receipts.

That commit is **not integrated into this branch**: the requested audit base contains blobs `9563c25b...` and `4ed600ee...`; A4's approved blobs are `5ab9d848...` and `29bcbe0e...`. The new cases deliberately use valid, fully priced optional work and do not relabel the already-known F18 behavior as a new finding. Malformed historical option/range behavior remains owned by A4's separate repair and evidence.

## Explicit coverage gaps

- The matrix samples three registered services selected for distinct transition semantics: mowing, installed fencing and roof replacement. It does not claim the full transition cross-product across all registered services.
- The named priced-option transition uses complete gate offerings. Customer tier choice is not a quote-request input in this flow—the quote returns all valid tiers—so this audit does not invent a tier-selection transition.
- The harness executes the real application preparation/submission functions, database transactions, price-book publication/approval, voice runtime and dispatcher. It does not exercise browser rendering, public HTTP middleware, a live model, ASR, telephony or external providers.
- Voice recap consent is represented by the required `customerConfirmed` boolean on each invocation, not a signed transcript-turn receipt. The audit proves false rejection, request-fingerprint separation, relevant scope-token binding and immutable persistence; it cannot prove that a human spoke a fresh confirmation or that ASR/model interpretation was correct.
- The audit does not merge or execute A4's separate production repair at this branch head. It only accounts for the approved commit while avoiding its known F18 cases.
- No adversarial concurrency, crash recovery, booking, email/public-page delivery or long-term retention transition was added; neighboring tests cover portions of those systems but not this entire new matrix.

## Reproduction and evidence

Runtime: Node `22.23.0`. A writable `TMPDIR` is required in environments without `/tmp`.

Focused audit:

```sh
node --test verification/qe-agent3-scope-transition-review-20261019/review.spec.mjs
```

Result: 8 tests passed; 0 failed, skipped, cancelled or TODO. See `review.tap`.

Neighboring correction/scope regression selection:

```sh
node --test \
  test/voiceCorrectionSequences20261018.spec.mjs \
  test/quoteOptionalScopeIsolation.spec.mjs \
  test/quoteOfferingScopeIsolation.spec.mjs \
  test/landscapePricingLaneB20261016.spec.mjs \
  test/landscapeDeliveryLaneB20261016.spec.mjs \
  test/qeAccuracyIntegration20261018.spec.mjs \
  test/quoteDeliveryBatch20261015Evidence.spec.mjs
```

Result: 106 tests passed; 0 failed, skipped, cancelled or TODO. See `neighbors.tap`.

Production client build:

```sh
npm run build
```

Result: passed for the owner app and widget. Vite emitted the existing large-chunk advisory. Generated tracked output was restored to the exact base afterward. See `build.log`.

The first attempted invocation did not run an audit case because the environment had no `/tmp`; the second did not run a case because default Node 24 could not load the repository's Node 22 native SQLite module. The first Node 22 case run exposed one audit-matcher wording error (`Roof measured` vs the actual customer label `Measured roof area`); only that verification assertion changed. The pre-execution monetary and scope expectations did not change. The final TAP files above are fresh passing executions.

`execution.json` pins the base, A4 reference, production blob IDs, commands, counts and evidence hashes. Hosted branch status is intentionally not claimed inside this pre-publication report; it must be tied to the eventual exact published head.
