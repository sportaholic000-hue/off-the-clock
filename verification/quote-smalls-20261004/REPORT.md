# Four scoped quote-engine / price-book repairs — October 4, 2026

The four authorized small findings are repaired. **F01 remains a launch blocker.** This checkpoint does not accept public launch, merge or deployment.

Audited base: `a96a608868332bcd969d04d88af3d5d7af60508c`, branch `claude/audit-fixes-20261003`. Implementation and tests: `353947fe6ef29af1e4d173bc5eb49103efef0106`, branch `codex/quote-smalls-20261004`. The repair was based on that updated branch, not the older default `main`. The active agent performed the work directly without sub-agents.

## Completed changes

| Finding | Result | Production change |
|---|---|---|
| F05 — currency projection | Customer currency must match the currency reproduced from retained calculation evidence. A CAD quote relabelled USD, or an altered/deleted currency, becomes review without an amount or the supplied currency. Valid CAD and USD amounts are preserved. | One additional comparison in `configuredCalculationMatches`, `server/quote-engine-vnext/engine.js` |
| F06 — ambiguous AI answer | A well-formed `{"value":null}` produces HTTP 422 / `PRICEBOOK_AI_CLARIFICATION_REQUIRED`, with `retryable:false`, after one generation. It asks for a clear value or manual entry and does not mutate the draft. Invalid/privileged output and provider failures retain their bounded retry and safe outage response. | A dedicated clarification error in `server/src/priceBookAI.js` |
| F03 — manual interview save race | A late confirmation response retains the saved answer but preserves any newer numeric or structured edit on its current question. Duplicate confirmations, AI capture and editor review are blocked while the confirmation save is pending. Unchanged successful saves advance normally; failed saves retain the confirmed value for retry. | Pending-save state, an immediate request guard and target comparison within `PriceBookStep`, `client/src/onboarding.jsx` |
| G01 — ordinary CI gate | CI now runs `npm run test:quote` after building and before the general suite. Quote architecture and quote/price-book tests must pass with zero failures. | One explicit step in `.github/workflows/ci.yml` |

Exactly those four existing functional/workflow files were changed. Three regression files were added. Reports and the build-status entry are documentation. Dependency manifests, lockfile, arithmetic formulas, rounding policy and engine approval version are unchanged.

The currency comparison preserves the older engine-only case where both retained defaults and projection omit currency. The application already requires configured CAD/USD; this repair does not make old arithmetic fixtures acquire guessed currency or change their amounts. There is no currency conversion or automatic owner-rate adjustment.

## Verification

The 17 new currency/AI checks were written against the unchanged source: **six passing controls and 11 failures**. After repair, all 17 pass. Checks include both currencies, deleted/null/object/unsupported/other-currency projections, exact $125.00 / 12,500-cent preservation, quote immutability, one-call clarification, valid scalar and structured AI responses, and rejection of extra privileged fields.

The five real Chromium/React interview checks use the actual onboarding component, controls and API client with explicitly delayed HTTP responses. They verify numeric edit preservation followed by a second confirmation, resumed structured-map edit preservation, blocked duplicate save/review, ordinary advancement, and retry after a failed save. The transport is controlled to reproduce response ordering; these are not claims of a live-provider acceptance run.

The HTTP regression uses the actual server, auth/access guards, interview routes and SQLite. It seeds an explicitly synthetic entitled owner and substitutes only the AI provider boundary. A null AI value produces clarification after one provider response; a subsequent GET returns an exactly unchanged saved draft. A valid $25.50 answer remains unconfirmed until manual confirmation saves it. No real provider calls or live business data are used.

Hosted [CI run 37180560713](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37180560713) passed on the implementation commit:

| Check | Actual result |
|---|---|
| Strict architecture and quote/price-book gate | 44 files; 1,023 tests passed; zero failed, cancelled or skipped |
| New regressions within that gate | All 23 passed: 17 currency/AI, five actual browser, one actual HTTP/SQLite |
| Full existing suite | 1,415 records: 1,404 passed, nine unchanged known failures, two skipped, zero cancelled |
| Existing full-suite failure checker | Passed; the same nine failures remain, no new failure |
| Owner and widget production builds | Passed |
| Existing production dependency audit step | Passed; zero reported vulnerabilities |

Exact named outcomes and checker output are saved in [CI evidence](CI_EVIDENCE.txt). Quote-gate and full-suite counts overlap. The general suite's nine pre-existing voice failures were neither audited nor repaired in this scoped work. The known-failure list and checker were not changed.

Local evidence: 998 quote/price-book checks passed with zero failures; focused runs of 67, 77 and 72 tests also passed. Counts overlap and must not be added. Owner and widget production builds passed. See [local evidence](LOCAL_EVIDENCE.txt) and [exact file bindings](source-binding.json).

The first hosted attempt stopped at an output-path omission in the new browser bundler. The next stopped at two test-setup errors: starting a blank structured interview instead of resuming its populated draft, and an owner seed without required entitlement evidence. Those fixtures were corrected; no additional application changes were made. The strict gate correctly rejected both attempts.

## Historical precision check and local limitations

The original 22-case precision assets retain their original hashes. Their standalone runner produces **21 passes / one failure on both the audited base and this repair**. `ordinary-20001-minimum-ten-percent` expects 22,001 cents but gets 20,001 cents. The October 3 owner amendment explicitly requires a minimum-bound job to display the exact minimum plus applicable tax as one price. The old buffered-minimum expectation predates that rule; the current T09 regression verifies the amended behavior and passes. The old expectation was not edited to manufacture a green result. Historical-oracle maintenance remains separate from these four repairs.

Chromium exits with SIGTRAP before UI execution in this local workspace. The locally rebuilt SQLite addon also aborts during migrations in this workspace's Node 24 runtime. Neither is counted as a successful browser/HTTP verification. Hosted Node 22 with Chromium and the installed native addon supplies those passing results. Local non-browser results are recorded separately.

Passing regressions establish the checked behavior at the bound source. They do not prove absence of every future defect, production timing or live-provider behavior.

## Still open from the audit

| Finding | Remaining risk | Next required acceptance |
|---|---|---|
| **F01 — failed durable approval (high; launch blocker)** | A directory flush can fail after rename, reporting a failed approval while the new approval remains readable and quoting live. | Fail quoting closed after that uncertain save; verify recovery and restart after an injected post-rename failure. Throwing an error alone does not undo the rename. |
| **F02 — simultaneous writers (medium; conditional)** | Two processes sharing price-book files can both report success while one silently overwrites the other's accepted edit. One ordinary synchronous Node process does not reproduce that interleaving. Deployment topology was not audited. | Cross-process atomic revision/check/write, or an enforced single-writer model; two same-revision saves must not silently discard an accepted edit. |
| **F04 — catalog readiness work (medium; scaling)** | Cold/draft readiness for larger product maps blocks the request thread. The audit measured 40 × 40 product combinations at 6.85 seconds; the existing saved-revision cache mitigates repeat calculations. This is an audit-runtime measurement, not a production SLA. | Reuse shared validations and bound execution while preserving product-pair coverage; verify realistic catalogs and concurrent request responsiveness. |

These three were outside the authorized four small repairs and remain unaddressed. **The durable-approval failure should be resolved before relying on this revision for launch.**

## Source and delivery

All initial repair source files were checked against their Git blob hashes from the audited commit. Modified source/test blobs were uploaded on an isolated branch and read back from GitHub; their hashes matched the local bytes. GitHub's compare API confirmed only the four functional/workflow changes and three new tests before adding this evidence and build-status documentation.

The report's implementation commit is the tested code checkpoint. A later report-only commit does not alter those bound source/test bytes. No merge, deployment, production-data modification or pricing-policy decision is part of this delivery.
