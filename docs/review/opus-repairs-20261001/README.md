# QuoteDone — Opus audit repairs, October 1, 2026

The eight listed defects and the reproduced booking crash are repaired. The final cold suite has **937 passes, 9 failures, and no new failures** across 946 tests. The nine failures are the same unfinished voice failures present in the integrated baseline. This is not a public-launch approval or a claim that every possible quote is proven correct.

Tested source: **6ea52eb10683536206ef91dde35ac88e4cdfa2bc**  
Base: **4df8b23dab66beba557a018d6e351a4b13febd5c**, claude/integration-pr3-pr4-20261001  
Repair branch: **codex/opus-quote-repairs-20261001**  
[Draft PR #5](https://github.com/sportaholic000-hue/off-the-clock/pull/5) targets the integrated branch containing PR #3 and PR #4. No merge or deployment.

## Repaired findings

| Finding | Verified change |
|---|---|
| 1. Decking rate exposed to customers | Customer explanations retain per-sheet/on-site confirmation wording and omit the owner rate for cost and sell-price bases. Confirmed quantities still contribute the correct amount internally. |
| 2. Minimum under materials-only tax | The minimum is a pre-tax floor in every mode. The $450 minimum control produces $450.00 with no tax, $457.67 with materials-only tax, and $517.50 with all-item tax. |
| 3. Fence offering heights | Finite positive offered heights are accepted. Exact offered heights quote; an unoffered height goes to review. There is no interpolation. Installed and itemized 5.5-ft offerings are covered. |
| 4. Recurring price unit | Mowing customer ranges and option amounts say **per visit**. The shared customer result carries the unit and disclaimer wording. Spoken delivery remains outside this task’s verified scope. |
| 5. Tax disclosure | Ready quotes and options carry the owner tax treatment: **No tax added.** or **Includes applicable tax.** The public page, widget and owner preview render it. |
| 6. Additional-scope readiness | The editor identifies, per service, requests that arrive as leads until their scope and prices are configured, before the enable control. Siding removal, concrete demolition, commercial-roof insulation/coverboard and flooring stairs retain fail-closed behavior. Configured positive controls quote. |
| 7. Concrete finish labor | Access applies to base and finish-extra labor, retaining separate cent rounding. The difficult-access stamped control is $4,438.89; difficult smooth is $3,563.89; easy stamped remains $3,988.89. |
| 8. Price-book layout | Core prices precede optional setup, optional sections start collapsed, and the mobile navigation picker fits. With the same approved flooring fixture: 375px height falls from 10,168 to 5,356; 1280px height falls from 7,290 to 3,827. Neither viewport has horizontal overflow. |
| Booking crash | Reproduced a crash after the provider-write marker. A successful “event absent” lookup can recover the pending provider write using its persisted event ID, after checking policy, service area, timing and availability. Failed lookups, tentative/cancelled responses and wrong-time events never become confirmed bookings. |

The owner rulings are recorded in **specs/quote_engine_v2.md**. [Hand calculations](HAND_CALCULATIONS.md) were written before the new arithmetic regressions ran. The later legacy moderate-access rounding expectation is separately documented: 112¢ base + 6¢ finish = 118¢.

No listed functional finding was disproved. The approximate 16,000px figure was not independently reproduced with this fixture; the ordering, excessive length and truncated picker were reproduced and repaired.

## Verification

Counts overlap; do not sum these rows into one coverage total.

| Run | Result |
|---|---|
| New audit regressions against 4df8b23 | 35 tests: 31 fail, 4 positive controls pass |
| Final focused audit regressions | 36/36 pass; included in final cold suite |
| Final cold suite, all test/*.spec.js and test/*.spec.mjs, concurrency 1 | **946 total; 937 pass; 9 unchanged baseline failures; 0 skipped/cancelled** |
| Independent arithmetic matrix | 480/480 pass |
| Independent measured-scope arithmetic matrix | 480/480 pass |
| Real submissions, authenticated calculation and owner preview | 19/19 cases pass; original requests, full pricing responses, persistence and exact retry checked |
| Real widget quote-to-booking | 24/24 checks pass, including callback rejection, response loss/retry, separate work and provider-confirmation controls |
| Owner editor → fencing/painting → public page/widget | 26/26 pass on final source; eight owner offerings, sixteen public-page/widget submissions, and 5.5-ft fences |
| Booking provider-marker crash | Baseline 16/17 pass, crash case fails; final 17/17 pass |
| Instrumented quote replay | 35/35 controls; 4,008 captures and 1,839 configured quote executions |
| Rendered owner editor | Baseline 3/12 pass; final 12/12 pass at 375px and 1280px |
| Production builds | Site and widget both pass |
| Final integration boundary | Pass |

[Exact commands and every run outcome](TEST_RUNS.json), [final source hashes](SOURCE_BINDING.json), [source equivalence](RUN_SOURCE_EQUIVALENCE.json), and [scope comparison](SCOPE_BOUNDARY.json) are included. All **266 captured files** for the final cold run match the tested GitHub source. Some earlier orchestration labels retained an older SHA in a helper closure; original records remain unchanged. [The source attestation](FINAL_COLD_SOURCE_ATTESTATION.json) documents the independent hash check.

The first baseline cold run had 19 extra browser-environment failures because the existing browser runtime paths were missing. All 19 passed after supplying those paths on the unchanged baseline. The nine actual baseline failures are three missing voice modules, two voice persistence/booking-sequence tests, and four voice schema/recap/privacy/idempotency tests. Exact names are in the archived baseline comparison.

Intermediate failures are retained and distinguished from product findings. These include an incorrect public-only assertion applied to owner preview in the first application harness, a stale replay selection count, the widget fixture’s missing allowed test origin, an interrupted layout capture, a local connection reset and the legacy concrete expectation. Malformed-tier and divergent-tier-disclaimer regressions found during implementation were corrected before final verification.

Old goldens changed where the requested behavior superseded them: pre-tax minima, offered heights, decking rate privacy, all-labor access and the new public unit/tax fields. Exact arithmetic, privacy, positive quote controls and fail-closed checks remain.

## Screenshots

- [375px before](screenshots/before-375.png) → [375px after](screenshots/after-375.png)
- [1280px before](screenshots/before-1280.png) → [1280px after](screenshots/after-1280.png)
- [5.5-ft fence customer quote](screenshots/fence-5-5-customer.png)
- [Exterior painting customer quote](screenshots/exterior-painting-customer.png)

## Reproduce

Use Node **22.23.2 / ABI 127** and the existing lockfile dependencies. The application harness expects the repository’s existing **.portable-runtime/node-v22.23.2-win-x64/node.exe** location. Point **PRICEBOOK_BROWSER_MODULE**, **PRICEBOOK_BROWSER_EXECUTABLE** and **ESBUILD_BINARY_PATH** to the existing Playwright, Edge and native esbuild installations. No dependencies were installed or changed.

Run from the repository root. Use a fresh evidence directory for each application/browser run. The wrapper strips inherited provider credentials and uses isolated synthetic stores.

~~~powershell
$node = '.\.portable-runtime\node-v22.23.2-win-x64\node.exe'
$env:QUOTEDONE_TESTED_SOURCE_SHA = '6ea52eb10683536206ef91dde35ac88e4cdfa2bc'

& $node verification/opus-review/run-check.cjs . ../review-evidence focused --test test/opusQuoteRepairs.spec.mjs
& $node verification/opus-review/run-check.cjs . ../review-evidence cold full
& $node verification/opus-review/run-check.cjs . ../review-evidence build verification/quotedone/build-resume-client.mjs
& $node verification/opus-review/run-check.cjs . ../review-evidence application verification/opus-review/application.mjs . ../review-evidence/application
& $node verification/opus-review/run-check.cjs . ../review-evidence widget client/test/widget-real-booking-browser.mjs . ../review-evidence/widget
& $node verification/opus-review/run-check.cjs . ../review-evidence offerings client/test/configured-offerings-browser.mjs . ../review-evidence/offerings --fence-height=5.5
& $node verification/opus-review/run-check.cjs . ../review-evidence layout verification/opus-review/browser-layout.mjs . ../review-evidence/layout
& $node verification/opus-review/run-check.cjs . ../review-evidence booking verification/inspection/quote-booking-review.mjs . ../review-evidence/booking --after-write-claim
& $node verification/opus-review/run-check.cjs . ../review-evidence boundary verification/quotedone/offerings-integration-boundary.mjs .
& $node verification/opus-review/run-check.cjs . ../review-evidence replay --experimental-vm-modules test/quoteEngineVNextReplay.mjs ../review-evidence/replay
~~~

Matrix commands and output paths are in TEST_RUNS.json. To repeat original failures, pass the 4df8b23 checkout as the wrapper source root and the current audit regression file as its test argument. That sets OPUS_SOURCE_ROOT to the baseline. Build each checkout’s own client before comparing layouts.

## Evidence and remaining limits

The evidence directory contains complete arithmetic results, pre-execution expectations, replay captures, original failed runs and before/after application responses and stored quote/lead records. Large gzip files use 512KiB parts to fit connector limits. Indexes contain original and compressed hashes.

~~~powershell
& $node docs/review/opus-repairs-20261001/restore-evidence.cjs --verify-only
& $node docs/review/opus-repairs-20261001/restore-evidence.cjs ../restored-opus-evidence
~~~

Application archives omit ephemeral synthetic credentials. Pricing inputs, responses and calculation records remain. Original unredacted file hashes are included. Raw isolated SQLite stores and unredacted wire files remain in the local evidence directory; fixtures and saved records let reviewers recreate them.

Only ten production files changed. Voice/telephony, ON/OFF, onboarding phone step, auth, billing, dependencies, CI and the original voice guide are unchanged. No live-data writes, permission expansion, merge or deployment occurred.

Live Google Calendar traffic, telephone/spoken delivery, production deployment and real-owner activation were not verified. The calendar boundary was simulated; application routes, browser UI, persistence and booking reconciliation were real. The nine baseline voice failures remain unresolved and outside this task. Passing finite tests does not establish universal “100% accuracy.”
