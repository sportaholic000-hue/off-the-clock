# Saved listed-price conditions — 2026-10-18

Base: `c1817621f6eccb31822979bf994efc4902682d34`.
Review branch: `codex/qe-listed-price-conditions-20261018`.
One agent; synthetic saved knowledge and in-memory tenant databases; no external calls.

## Reproduction before the production edit

`baseline-reproduction.json` records all five owner-reported listings returning
`calculated`, `extendedAmount: "30.00"`, and a multiplied voice summary for
quantity `"3"`. Expected: `needs_review`, no extended amount, and the existing
verbatim-listing fallback. The new test file was then run with production still
at the base: **88 tests, 27 passed, 61 failed**, zero cancelled/skipped/TODO.
`baseline-tests.tap` preserves the original failures, including real dispatcher
reproductions. All 21 positive arithmetic/product controls passed on the base.

The optional item-name part of the price grammar accepted conditional phrases.
Its existing qualifier check covered words such as `minimum` and `starting`,
but did not cover the reported conditional clauses or other payment, timing,
eligibility and scope qualifiers. Caller confirmation did not evaluate them.

## Repair and acceptance

Only `server/src/voice/listedPriceCalculation.js` changes in production. The
prefix guard rejects conditional clause markers and unclassified qualifiers
wherever they occur before the saved unit price. Checks run on the original
item text so supported product-number handling cannot remove a condition.
Unrecognized trailing sentences remain refused by the existing grammar.

The existing conservative policy also applies when qualifier words could be
part of a genuine product name: repeat the listing and arrange review instead
of assuming a flat rate. This is a deterministic English grammar, not a proof
that arbitrary natural-language eligibility conditions have been understood.
No condition is evaluated or considered satisfied by quantity confirmation.

The refusal message remains exactly:

> The saved listing or quantity cannot be multiplied safely. Repeat only the saved listing word for word with its conditions, or ask the business to review it. No multiplied amount is available.

The 88 new tests cover the five originals directly and through the dispatcher;
53 further qualifier strings (case, punctuation, whitespace, middle-of-name,
parenthesized and numeric-product variations, suffixes and extra sentences);
21 unconditional controls; saved/draft/foreign/duplicate/edited listing identity;
confirmation and numeric-domain rejection; compiled verbatim fallback; and the
existing suite selectors. All qualifying refusals assert the complete response,
which has neither an amount nor a calculated voice summary.

Independent monetary controls include $2 × 500 = $1,000.00;
$0.035 × 1,000 = $35.00; $0.005 × 3 = $0.02 with rounding disclosed;
$1.25 × 2.5 = $3.13 with rounding disclosed; CAD 19.99 × 3 = CAD 59.97;
US$1,234.50 × 2 = US$2,469.00; €2.50 × 3.333 = €8.33 with rounding disclosed.
Product-number controls retain 2x4/2×4, Grade 2, 3/4 inch and #2 names.
Existing tests, assertions, selectors and monetary expectations are unchanged.

## Verification before publication

Node `v22.23.3`, clean `npm ci`, unchanged lockfile/dependencies.

| Check | Actual result |
| --- | --- |
| New file before repair | 27 passed / 61 failed / 88 total |
| Identical new file after repair | 88/88 passed |
| Focused and neighboring selection | 532/532 passed |
| Owner/widget build | Passed; 1,669 / 1,624 modules |
| New test file selection | Included once in full; excluded from strict quote |
| Existing assertions/selectors/specs/workflows/engine versions | Unchanged |

All passing runs have zero failures, cancellations, skips or TODOs. Build output
changes in tracked `client/dist/index.html` were restored. Raw logs are adjacent.

Commands (Node 22 on PATH; TMPDIR set to an isolated writable directory):

```sh
npm ci
npm run build
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/voiceListedPriceConditions20261018.spec.mjs
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test-concurrency=1 --test --test-reporter=tap test/claudeContactLines20261008.spec.mjs test/claudeContactLines20261009.spec.mjs test/claudeListedUnits20261008.spec.mjs test/engineAuditListedPrices20261008.spec.mjs test/fixedPricesKnowledge20261005.spec.mjs test/knowledgeFinancialConditions20261008.spec.mjs test/quoteEngineLeftovers20261007.spec.mjs test/receptionist20261008.spec.mjs test/receptionistAudit20261009.spec.mjs test/receptionistSystem20261008.spec.mjs test/voiceLimits20261007.spec.mjs test/voiceListedPriceConditions20261018.spec.mjs test/voicePersistence.spec.mjs test/voicePromptCompiler.spec.mjs test/websitePriceConditionsAudit20261008.spec.mjs test/voiceQuotePathRegression20261005.spec.mjs
```

Hosted strict/full/browser/Docker results are pending at this commit's creation.
The coordinator reply must report the actual final pushed SHA and inspect that
SHA's completed logs, including execution of all 88 new tests exactly once in
the full suite and zero times in strict quote. This document does not claim a
pending hosted result as a pass. No production/model speech behavior is inferred
from synthetic deterministic tests.
