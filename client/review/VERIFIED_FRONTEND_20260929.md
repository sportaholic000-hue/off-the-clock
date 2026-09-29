# QuoteDone frontend handoff — September 29, 2026

The frontend implementation and its affected browser workflows are verified. Whole-product launch acceptance remains open. The broader regression run still has one price-book test failure assigned to the backend lane. This is not a claim of 100% interpretation accuracy or a working live phone/calendar integration.

## Exact source

- Final local commit: `75336c44da14473c329dc17adf4c238ddcb1a752`.
- Full Git tree: `5c79e1c225e84a8937c844173bc65f23cbd77a46`.
- Branch: `codex/quotedone-widget-20260929`; base: `d2b20520cdd056e0b3ffea6f46219df7e8af3f0d`.
- Exactly 20 changed files, all under `client/**`. The portable bundle contains both frontend commits.
- PR #3 remains open/draft at its published base. This lane did not update its remote head, merge or deploy; integration with the backend lane is next.
- All 19 accepted arithmetic files remain at tree `dcd481193b10c3cfc667cb23d22fb41b16322cff`.
- Original voice guide: blob `7329bde3db8e3b38916e1cd6fbe1ca3fffaffaa5`. Server code and dependency versions are unchanged.

## Implemented and repaired

| Finding | Verified result |
| --- | --- |
| Missing embeddable customer flow | One-script launcher, Shadow DOM, progressive measurement questions, callback capture, partial estimates and owner installation guides/checker are implemented. The production widget completes real submissions from a separate synthetic website. |
| Production module failed with `process is not defined` | Production environment definition corrected; module loads and completes quotes. Original failure retained. |
| Explicit booking rejection trapped customers in retry mode | `400 INVALID_REQUEST` restores editing and retains the draft. A corrected date succeeds with a new key. Uncertain outcomes still retry the original request. |
| Callback could not be corrected before booking | Email/phone are editable and remain corrected when returning to job details. |
| Prior scope answer leaked into a new quote | New quotes require a fresh scope/option decision; contact/site details are retained. Same-quote reload retains its draft. |
| Server-required re-quote left the old result onscreen | `REQUOTE_REQUIRED` and `QUOTE_NEEDS_DETAILS` return to retained job details and remove the current result. Ordinary contact/date errors preserve a valid estimate. |
| Scheduling-note label changed after reload | Stable accessible label added; note and preferred dates survive reload. |
| Booking recovery/readback | Held time can be released before editing. Conflicts/expiry refresh server times. Preferred-time requests and pending confirmations never claim a booked appointment. |

## Verification

Paths below are relative to `evidence/` inside the ZIP. Counts overlap.

| Check | Result | Evidence |
| --- | --- | --- |
| Main app and production widget builds | Both pass | `final2/build-result.json` |
| Transport/version/decimal/response tests | 10/10 | `final2/unit.log` |
| Widget/API harness | 21/21: 8 real API/persistence controls, 10 real application/browser workflows, 3 versioned-form fixtures | `final5/browser/result.json` |
| Confirmation interface | Conflict, hold, lost acknowledgement, 202/polling and confirmation pass; scripted responses only | `final5/browser/result.json`, `bookingInterface` |
| Focused booking recovery | 9/9; scripted responses only | `final3/booking/result.json` |
| Original full-page customer/owner workflows | 7/7 against the real isolated application | `final3/full-page/result.json` |
| Final broader regression | **465/466; one failure remains** | `final5/final-nonbrowser-regression.log` |
| Protected integration boundary | Pass | `final4/integration-boundary.log` |
| Final source binding | 175 captured files accounted for | `final5/final-commit-binding.json` |

Browser acceptance used installed Edge, including a 390×844 mobile viewport. Earlier Chrome startup/CDP failures are retained. Booking fixtures prove interface behavior, not actual calendar writes or backend booking persistence.

Build reuse is backed by byte comparison of every production build input. Later changes affect verification scripts only. Source binding records Windows newline normalization for two Git metadata files and three unused Python audit helpers; all other captured files match their committed Git blobs byte-for-byte.

Quote controls verify: complete measured work with a callback and **no name = $50**; separately declared work retains the **$50 selected-work estimate** without a whole-job total; configured edging produces **$70**; a **125.125** measurement produces **$0.63**. Missing main measurements remain unpriced. Missing callback is rejected without a quote record, and correction succeeds. Lost-response retry recovers the identical stored response without duplication. Complete requests/responses, receipts, synthetic databases, price books and screenshots are retained.

## Disproved test concerns

- Edge automatically retried an idempotent hold-release request with the same key and correctly restored editing. The initial test wrongly assumed one network attempt. The final test checks every attempt and explicit retry; no backend release defect was inferred.
- Cross-site preparation was blocked by the local test proxy dropping browser preflight headers. Forwarding those headers restored the real submission. No application CORS workaround was added.
- The callback test expected rejection at final save; the application correctly rejected it earlier during preparation. The corrected test checks editable recovery and retained measurements.
- No older independent-review scope finding is declared disproved by this frontend work.

## Remaining blockers

1. `test/priceBookIntegrity.spec.js:650` still fails. The test expects a newly added Mowing service without `active:false` and `source:MANUAL`; the helper returns those fields. This path was not changed here. The backend agent owns reproduction/triage. This report does not turn that failure green.
2. The original location-text cases reporting an unmeasured main area are not closed by this lane. Moving fields after pricing or asking for an unchanged-scope answer alone does not prove that issue repaired. The combined backend must reproduce and verify those cases.
3. Actual versioned-backend integration, booking persistence/provider behavior, voice parity, account/billing enforcement and production operation need combined acceptance. No live call, message, calendar write, payment, live-data change, deployment, dependency installation or permission expansion occurred here.

## Reproduce and integrate

The ZIP includes final `source/`, earlier `source-history/`, tested production `build/`, full `evidence/`, and the Git bundle/patch. Apply both frontend commits on the backend branch while preserving later work. Verify the resulting combined commit before updating draft PR #3.

Use Node 22 and compatible existing dependencies. Set `PRICEBOOK_BROWSER_MODULE`, `PRICEBOOK_BROWSER_EXECUTABLE`, and locally required `ESBUILD_BINARY_PATH` / `QUOTEDONE_GIT`. Every run requires a fresh evidence directory.

```text
npm --prefix client run build
node --test client/test/widget-transport.test.mjs
node client/test/widget-browser.mjs <source-root> <fresh-evidence-dir>
node client/test/widget-booking-browser.mjs <source-root> <fresh-evidence-dir> final
node client/test/widget-full-page-browser.mjs <source-root> <fresh-evidence-dir>
node client/test/widget-integration-boundary.mjs <git-checkout-root>
```

The runner files contain the final 11-file regression command. Original failures remain in the earlier evidence folders. The seven full-page expectations are unchanged; only harness paths, startup allowances and evidence capture were adapted.
