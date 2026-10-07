# Owner dashboard repair — hosted gates passed

Branch `fix/owner-dashboard` starts at verified base `4db13a2945193762bbc4b85f9ab616a00e1dd067`.
Implements confirmed-booking owner alerts, call billing/transport/search/transcripts,
owner review and follow-up progression, and period/value/service-funnel reports.
Current owner ruling disables caller texts, confirmations, invites and reminders.
See `specs/OWNER_DASHBOARD_20261007.md` and `verification/owner-dashboard-20261007/REPORT.md`.
Synthetic source/service/HTTP/render reproductions failed before fixes. The expanded
regressions and explicit tenant route matrix passed 292/292; the final direct-page
and route checks passed 248/248. Source/test/CI commit
`ed9d52937cb7a4e7e54d22620ff7191e76347092` passed
[hosted run 37687674965](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37687674965):
cold `npm ci`, owner/widget build, **6/6** dashboard browser checks,
**2,663/2,663** strict quote tests and **3,690/3,690** full-suite tests.
All summaries have zero failures, skips, cancellations and TODOs; production
dependency audit found zero vulnerabilities. Local Chromium SIGTRAP prevents a
passing local browser-gate claim; complete cold browser evidence is hosted.
This checkpoint changes documentation only. Final pushed-head CI is checked
independently before task delivery; no release or deployment approval is implied.
No merge, deployment, real calendar or real email operation was performed.

# October 7 audit repairs — hosted gates passed

Branch `codex/audit-small-repairs-20261007`; verified source/test commit
`2879f2560e3ae2ee2d4a38c41c401c1da49487f3`.
[Hosted run 37596037228](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37596037228)
passed cold installation, owner/widget builds, **2,597/2,597** strict quote checks,
**3,624/3,624** full-suite tests and zero production dependency vulnerabilities.
Both test summaries contain zero failures/skips/cancellations/TODOs.

The [first five repairs](../verification/audit-small-repairs-20261007/REPORT.md)
cover qualified quote SMS, bare-floor voice selection, included zero roof
underlayment allocation, password hashing configuration and minimum-price spec
wording. The [three follow-up repairs](../verification/audit-followup-20261007/REPORT.md)
protect interview revisions, clarify mulch units and retain bounded adjacent
website price conditions. The larger open findings remain listed in those reports.
Price formulas are unchanged. No main merge, deployment or live-data changes.
The active agent made all source changes; further subagent use was prohibited
and stopped. This checkpoint records results only; application, test and CI
source match the verified commit above.

## Previous checkpoint

# October 7 release integration — hosted gates passed

Target `codex/quote-release-candidate-20261006`, starting at `5c1050dce191e9b97f20234b2747554bbbf3a20c`. Billing lifecycle `852caa9`, off-site backups `0062c43`, then tenant isolation `1189372` are preserved as ordered merge parents. [Complete integration and conflict report](../verification/release-three-branches-20261007/REPORT.md).

The route matrix now covers all **115** merged registrations. Additional integration regressions repair day-90 callback/alert/SMS erasure, service-end fallback callbacks and saved-quote replay during corrupt-book recovery; anonymous callers retain strict saved bindings. Existing tests and the empty known-failures list remain. No quote arithmetic change; engine stays v7.

[Hosted run 37577802231](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37577802231) passed at source/test/CI SHA **`424184eb65036eb986dc153ae8cd3f6a4d1fe9b3`**: cold `npm ci`, owner/widget builds, **2,576/2,576** strict quote tests, **3,603/3,603** full-suite tests, empty-failure checker and **zero production dependency vulnerabilities**. Both suites report **zero failures/skips/cancellations/TODOs**. All three pinned ancestry checks returned exit 0 after fetching back the identical published tree.

Local focused verification passed **349/349**, with zero failures/skips/cancellations/TODOs. Local Chromium startup crashes (SIGTRAP) prevent a passing local browser-gate claim; hosted cold execution supplies complete browser evidence. Application/test/CI code is unchanged in this result-recording checkpoint; the exact final pushed-head run is independently checked before task delivery. No subagents, main merge, deployment or live data.

## Previous checkpoint

# October 7 tenant isolation — hosted gates passed

Branch: `fix/tenant-isolation-20261007`, starting at `73c0062` on the approved release-candidate branch. Tested source/test/CI SHA: **`552585bcc964e9d4bdf4f35f9a1080c300217f48`**.
[Complete route inventory, source/execution reproductions and matrix](../verification/tenant-isolation-20261007/REPORT.md).

Three disclosures fixed: signed CallSid collision returned another tenant's forwarding number; phone-test errors disclosed foreign CallSid existence; signup disclosed existing account emails. Contradictory selectors and foreign saved quote-service IDs now fail uniformly. Signup requires email verification before owner login.

[Hosted CI run 37566309857](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37566309857) passed cold `npm ci`, owner/widget build, **2,267/2,267** strict quote tests and **2,649/2,649** full-suite tests, with **zero failures/cancellations/skips/TODOs** and zero production dependency vulnerabilities. Both gates include the **199-test** actual-server isolation matrix over a union of **98 registrations**. New routes, anonymous router mounts, changed middleware and new route declarations hidden behind unconfigured flags require explicit coverage review.

Local evidence: focused **287/287** and refined matrix/integration **238/238**, zero failures/skips (counts overlap). Local cold install/build passed; both local full/strict attempts failed with **37 Chromium SIGTRAP startup failures**, zero skips. No complete local browser gate is claimed; hosted cold execution provides the complete suite evidence.

The final matrix tightens public recovery so only `authTokens` receipts can change; every password/session/business/billing row still has to match its snapshot. Application and CI code are unchanged after the tested source SHA. Final pushed-source CI is checked independently before delivery. No subagents, main merge, deployment, provider writes or live data.

## Previous checkpoint


---

# October 7 billing lifecycle — hosted gates passed

Branch `feat/billing-lifecycle-20261007` begins at requested, verified base
`130db2148de05cb8b62f5a2595b98b635ce863cb`.
Verified source/test SHA: `0862c78bafd6b96bf5f62edca524d75a1d9907f8`.
[Hosted run 37563765418](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37563765418)
passed cold `npm ci`, owner/widget build, strict quote **2,081/2,081** (101 files),
full suite **3,024/3,024** (153 files), and dependency audit (zero vulnerabilities).
Both suites have zero failures, cancellations, skips and TODOs. **50 new tests**;
local focused 120/120 and final lifecycle 45/45 overlap these hosted counts.

Durable owner email/dashboard notices now cover trial ending, annual renewal,
subscription/overage receipts and failed payments. Owners cancel through Billing;
verified paid service continues until term end with no partial refund. AI,
forwarding fallback, quoting/widget and new overage charges stop at service end;
pending overage collection is disabled. Phone release is due at day 30; leads,
quotes and calls CSV remains available until day 90, when retained customer
records/copies are erased. Reactivation restores resources within their own
retention windows, including recovery after a delayed worker.

See [the explicit owner-rule amendment](BILLING_LIFECYCLE_20261007.md) and
[implementation and verification evidence](../verification/billing-lifecycle-20261007/REPORT.md).
Local Node 24/native cleanup and Chromium SIGTRAP prevent a local broad-suite
claim. Hosted Node 22 verified all gates cold, including browser and production
HTTP/signed-voice tests. No subagents, main merge, deployment, live data, real
charges, refunds, email or SMS. Exact uploaded source was fetched back and checked.

---

# October 6 synthetic production backup/restore rehearsal — hosted gates passed

Branch: `verify/backup-restore-rehearsal-20261006`. Starting revision verified:
`73c00622d6f2df31f57773b32e41355a7421f1a3` from the quote release candidate.
Verified source/test/CI SHA: **`878154d526d4e30061c22db9b97596bbca5a60c7`**.
No subagents, merge, real deployment, provider operation or live-data change.

All six requested rehearsal steps pass in production mode on temporary storage:
real synthetic owner signup, book save/approval, $100.00 quote, review lead,
confirmed booking through HTTP with a local calendar stub; graceful restart;
actual backup CLI with both owners' books; entire-volume wipe and actual restore
CLI; exact book/approval/receipt/lead/appointment retention and idempotent replay;
missing, invalid-JSON and invalid-structure books pause new quotes without a crash.

Three confirmed defects repaired: incomplete backup inventories were accepted;
unconfirmed-save pause markers were omitted; corrupt saved pricing returned only
an internal error to owners. Backups now check the copied creation ledger, reject
uncertain/changed source books, and preserve the last accepted bundle on failure.
Authenticated owners get fixed recovery instructions. No arithmetic, approval,
booking or billing policy changed.

[Complete report and raw evidence](../verification/backup-restore-20261006/REPORT.md).
Expected $100.00 was handwritten before execution. Corrected baseline: 21 results,
13 pass / 8 fail (seven reproduced assertions plus parent). Repaired focused run:
**56/56**, zero skips. **14 new test results** in the normal gates.

[Cold hosted CI 37536385130](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37536385130):
`npm ci`, both builds, **2,077/2,077** strict tests (95 files), **2,460/2,460**
full tests (137 files), zero failures/cancellations/skips/TODOs; dependency audit
zero vulnerabilities. Remote commit parent/tree and report readback verified.
This final report checkpoint changes only documentation and evidence.

Local install/build pass. Local full suite: 2,423 pass / 37 Chromium startup
`SIGTRAP` failures, zero skips and no other failures. Local strict runner exited
without a complete summary after browser startup failures; no local all-green
claim. Hosted cold gates ran successfully with their installed Chromium.

**Launch limit remains:** continuous off-site replication in platform §12.19 is
not implemented. A separate temporary archive exercises recovery logic only;
it does not supply a real off-site backup destination or protect a real lost
volume. No real Railway mount/power-loss/provider acceptance is claimed.

---


# October 6 booking/calendar repair — hosted gates passed

Branch `fix/booking-calendar-20261006`; verified base
`73c00622d6f2df31f57773b32e41355a7421f1a3`.
Tested source **`ba1e0c3e4131b4f940367845f6c11bcfd58fafd8`**.
[Complete source/execution evidence and limits](../verification/booking-calendar-20261006/REPORT.md).

Fixed DST working-window arithmetic, stale provider completion races, confirming
past/insufficient-notice slots and owner-setting changes during provider reads.
27 new synthetic regressions include independent SQLite contention, exact hold
expiry, retry/restart recovery, provider/storage failures, tenant isolation,
Moncton DST and a real Los Angeles-browser booking through the actual server.
Owner dashboard, calendar, call detail and fake provider events agree.

[Hosted run37537016739](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37537016739):
cold install/build passed; strict **2,095/2,095**; full **2,473/2,473**;
zero failures/skips/cancellations/TODOs; empty known-failures list;
production dependency audit zero vulnerabilities.
Local cold install/build passed; strict2,057/2,095 and full2,435/2,473,
with38 Chromium-startup failures in each and zero skips. Hosted browser
acceptance passed. No gate weakened. No subagents, main merge, deployment,
real calendar account or live data. No full platform/launch gate is asserted.

## Previous release checkpoint

---

# October 6 caller history and follow-up — assigned hosted gates passed

Branch: `fix/caller-history-followup-20261006`, pinned parent
`eaadeca0856f1bd7fcade8685711a19aefd786d0`. Tested source/test/CI:
**`e9590d46e95d6ad44e16201d720c43e3d7fc2505`**.

D14/D15/D16/D21/D24 are repaired: caller filtering precedes history limits;
returning-caller context retains safe identity/address/request history; exact
normalized international phone identity survives web/voice and credential rotation;
unresolved preferred times remain visible; completed calls store attributed
transcript excerpts and separate semantic/transport outcomes. Tenant joins remain
bound to the owner. The additive transportOutcome migration preserves prior rows.
No name/email guessing, historical destructive merge, quote recalculation or
production backfill is performed.

[Hosted run 37541872461](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37541872461)
passed cold install/build, strict quote **2,168/2,168** and full **2,551/2,551**,
zero failures, cancellations, skips or TODOs; production audit zero vulnerabilities.
There are 24 new regression tests; focused local checks pass 61/61 (overlapping).
Local Chromium launch failures and the incomplete final local strict summary are
preserved in the [complete repair report](../verification/caller-history-followup-20261006/REPORT.md).
No subagents, main merge, deployment, live data or provider writes. This scoped gate
does not establish broader platform/voice lifecycle or launch readiness.

## Previous checkpoint


---

# Voice lifecycle repairs — 2026-10-06

Branch `fix/voice-lifecycle-20261006` starts at verified `eaadeca0856f1bd7fcade8685711a19aefd786d0`. D04/D06/D07/D08/D25–D28/D31/D32 and P01 are implemented or independently verified with synthetic fake providers. Final tested source: **`e49ea59118fc1c442b8ee44a807b15149405136c`**. Cold hosted [run 37545433595](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37545433595) passed install, build, **2,144 strict quote tests / 2,570 full tests**, and the production dependency audit. Targeted gate: **325/325**, including **43 lifecycle scenarios**. All these test gates have zero failures, cancellations, skips or TODOs. Local install/build passed; local test runs have 39 Chromium-startup failures each, disclosed separately in `verification/voice-lifecycle-20261006/REPORT.md`. No application work remains unfinished; no subagents, merge, deployment, real calls/texts or live data were used.


---

# October 6 named review contact — hosted gates passed; review delivery still incomplete

Branch: `codex/named-review-contact-implementation-20261006`.
Tested source: **`4838ed2f3a12e962acfe58e542cd6f00bca31e3d`**.
Base `4e4b5ebaab12ef42e56149a7be35ccf1da90fbe9` was verified before work;
the audited `73c00622d6f2df31f57773b32e41355a7421f1a3` is an ancestor.

The owner can confirm an Owner/Manager name in business knowledge, preview natural
caller wording, save and reopen it. AI/website drafts preserve the contact.
The signed production voice composition receives that tenant's confirmed public
name/role, with no private inbox ID, invented identity or implied sent/read status.
The contact is tied to the existing business review inbox; no new staff account
or notification destination is created. Legacy missing contacts remain unnamed
until confirmed. The immutable voice guide and pricing logic are unchanged.

[Cold hosted CI 37516810842](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37516810842)
passed `npm ci`, both builds, **2,099/2,099** quote-gate tests (97 files),
**2,480/2,480** full-suite tests (140 files), the failure-list check and a production
dependency audit with zero vulnerabilities. Zero failures, cancellations, skips or
TODOs. **34 new regressions** cover editor/API/storage/AI preservation/voice paths.
The focused local checks passed **242/242**. Final cold local install/build passed;
39 missing-Chromium setup failures affected each local full gate and are separately
documented. Those same browser tests passed on GitHub.

**Project remains NOT CLEAN.** A separate signed-session diagnostic confirms D03
still stores callback notes as null. The lead agent owns that repair. Owner-alert
delivery D02, the broader P01 deadline policy conflict and other audited issues
are not closed by this contact feature. The separate quote, billing and lead repair
branches are not combined here. The preview is a wording example, not a full agent
chat; fake-provider tests do not prove actual model speech or human receipt.
See the [report, reproduction, proposed UI copy and evidence](../verification/named-review-contact-20261006/REPORT.md).
No subagents, merge, deployment or live-provider/data changes.

## Previous checkpoint

---

# October 6–7 overage and minute alerts — hosted gates passed

Branch: `feat/overage-and-minute-alerts-20261006`, based exactly on
`dce04c53c336de63eaa0d0c7cdc696b9a669c634`.
Verified source/test SHA: `a6de092bc876fcc8c007f7ac8ecae558088750aa`.
[Hosted run 37558263595](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37558263595)
passed cold install, owner/widget build, strict quote gate **2,076/2,076**
(99 files), full suite **2,974/2,974** (150 files), and production dependency
audit. Both suites have zero failures, cancellations, skips and TODOs; audit
found zero vulnerabilities. **66 new tests**, with **63/63** focused tests
also passing locally; counts overlap the full suites.

Operator/QuoteDone now have durable monthly overage invoices, reconciled F10
durations, 60/30/0 minute warnings through the dashboard and owner email,
always-visible usage, and the approved Operator savings comparison. First
monthly/annual payments occur at trial end. Annual allowances and overage reset
monthly from that date; prepaid annual cancellation retains service through
the paid year. No partial refund operation, bulk packs or discounts were added.

See [the rules](OVERAGE_MINUTE_RULES_20261006.md) and
[complete implementation evidence](../verification/overage-and-minute-alerts-20261006/REPORT.md).
Local browser runs remain environment-blocked by Chromium SIGTRAP; a follow-up
local session also ended without a summary. These are not passing local gates.
The exact hosted source revision above is the complete cold validation.
No subagents, main merge, deployment, live data or real provider writes.

---

# October 6 quote display defects — hosted gates passed

Branch: `fix/quote-display-defects-20261006`, based on verified
`6e6cd5b10e0558477cfe32d255a6ad58907988c2` from
`codex/quote-reaudit-fixes-20261006`.
Tested source/test SHA: **`4ac36b44bf27c3e2a67d39fde86c24f0a6c44021`**.

All three requested display fixes are complete: human product choices with the
phone path's exact name binding and explicit confirmation, production missing-price
labels shared with the editor, and one shared money formatter for widget, owner
records, preview and phone. Exact previews show one total; phone punctuation is
correct. The engine and all pricing formulas remain unchanged.

**24 new regressions** cover all 15 registered-product fields, typed-name edits,
production labels, all four money surfaces and display boundaries. Expected
amounts were written before reproduction: roofing $2,520.00 (display $2,520),
minimum-bound taxed mowing $172.50.

**Hosted cold verification:** [CI run 37525141520](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37525141520)
passed `npm ci`, both production builds, strict quote **2,120/2,120** (98 files),
full suite **2,498/2,498** (140 files), with **zero failures, skips, cancellations
or TODOs**; production audit found zero vulnerabilities. The full count includes
the quote tests. Separate focused phone regressions: 27/27.

[Report and evidence](../verification/quote-display-defects-20261006/REPORT.md).
[Prewritten expected amounts](QUOTE_DISPLAY_DEFECTS_20261006.md).
Local Chromium cannot launch in this environment; incomplete local suite attempts
are documented separately from the successful hosted cold gates. No subagents,
main merge, deployment or live data. No application work remains in this scope.

---

# October 6 re-audit repairs — hosted gates passed

Branch: `codex/quote-reaudit-fixes-20261006`, based on
`73c00622d6f2df31f57773b32e41355a7421f1a3`.
Tested source/test SHA: **`e558dfa8d991155cf57da191fc860a2da327a400`**.

The five reproduced defects are repaired: flooring optional-price isolation,
zero-included vinyl material allocations, effective tier units in approval,
coherent gate removal, and invalid supplied service-ID rejection. Sod disposal
evidence now accurately describes the existing fee rule; amounts are unchanged.
The engine remains v7. No main merge, deployment, subagents or live data.

[Prewritten amounts, scope and policy](QUOTE_REAUDIT_REPAIRS_20261006.md).
**28 new regression tests**, including the actual gate-removal browser action.
The old repair-48/73 readiness expectation now treats unselected flooring removal
and subfloor allowances like other optional work; its selected-scope review,
malformed-data and dollar assertions remain intact.

**Hosted verification:** [CI run 37502475231](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37502475231)
passed at the exact source/test SHA above: cold `npm ci`, both production builds,
strict `npm run test:quote` **2,096/2,096 across 96 files**, full `npm test`
**2,474/2,474**, and production dependency audit **zero vulnerabilities**.
Both suites have **zero failures, cancellations, skips or TODOs**. The known
failure allowance is empty (0/0); no workflow or test allowance was changed.

**Local evidence and limits:** cold install and production builds passed.
All **2,058 tests in 86 non-browser quote/price-book files** passed in isolated
processes, with complete summaries and zero failures/skips. All 27 new
non-browser checks passed. Both combined local gate attempts failed to produce
complete summaries and hit Chromium startup SIGTRAP failures; they are not
counted as passing gates. The full attempt also exposed the old flooring
readiness assertion, which was corrected and then passed in the isolated
matrix, complete file-by-file run and hosted suites. The completed hosted run
supplies the full-suite/browser evidence.

The repair-catalog all-or-nothing rule remains unchanged pending the owner's
coverage decision; it was an observed limitation, not one of the five defects.
The policy clarification offered complete-product isolation, but no selection
was received. No new repair-catalog policy was inferred.

## Previous verified checkpoint

# October 6 approved-branch integration — hosted gates passed

Branch: `codex/quote-release-candidate-20261006`; verified starting revision
`f049499999fd24c3e0c4ca04924a1065e2a97775`.
Tested source/test/CI SHA: **`4ff371650d2d08f50b42aa6ab8dae222ce6301cb`**.
All four approved pins are merged with both parent histories retained:
`efea107`, `2b6e5c5`, `83f666c`, `68a48d1`. Each passes the actual local
`git merge-base --is-ancestor <pin> HEAD` check.

See [every conflict resolution and prewritten expectations](RELEASE_BRANCH_INTEGRATION_20261006.md).
The strict storage validator, durable missing-file guard, common money converter,
draft preview, interview concurrency protection, editor allocations, telephony
purchase/coverage state, tenant-scoped owner calls and approved demo annual copy
are retained. No parent test was deleted. Production startup pins v7; profile-only
time-zone changes refresh catalog/status; stale approvals show the owner's exact
re-approval message. Owner time-zone help now describes the actual fail-closed rule.

**Hosted verification:** [CI run 37439464336](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37439464336)
completed successfully at that exact SHA. Cold `npm ci`, the owner/widget build,
`npm run test:quote` (**2,068/2,068**, 94 files) and `npm test`
(**2,446/2,446**, 136 files) passed. Both suites report **zero failures,
cancellations, skips or TODOs**. `npm audit --omit=dev --audit-level=high`
found **zero vulnerabilities**. The known-failures file is empty. All three
production startup cases and the real profile-zone/catalog/stale-approval cases
appear as passing tests in the hosted log.

**Local evidence and limits:** cold install, owner/widget build and production
dependency audit passed. Incoming integration checks: 134/134. New release guards:
7/7. Architecture controls: 7/7. Updated stale-message and route checks: 12/12.
All focused runs have zero failures/skips; counts overlap. Both Chromium
executables crashed at startup with SIGTRAP. The full local suite attempts ended
without complete summaries and are not counted as passing gates; hosted CI
provides the complete browser and full-suite evidence. The initial strict attempt
also caught the old stale-message assertion, subsequently aligned with the
explicitly approved new copy and verified locally and in CI.
No subagents, main merge, deployment, provider writes or live data.

## Previous consolidated checkpoint

# October 6 consolidated quote release candidate — hosted gates passed

Branch: `codex/quote-release-candidate-20261006`.
Tested source/test/CI SHA: **`46af683a358fd0a7dadf100d32ef9650fe87d6b9`**.
Pinned inputs: website `0e687907cca8b186d8b85eb285bb82c1deda6a6d`, engine core
`509891e39318bee344951278dd2667e4ab1f700a`, voice verification
`20f1cd3b9ef73c418bb5b6828da8031f2ba3bb59`.

Use the [single audit entry point](../docs/QUOTE_ENGINE_AUDIT.md) and
[release decisions and expectations](QUOTE_RELEASE_CANDIDATE_20261006.md).
The candidate combines v7 with the voice and website work. Validated IDs and
storage containers prevent corrupted saves; malformed persisted structures
pause quoting cleanly; date diagnostics identify their actual field. Voice
catalog/status/intake/calculation use explicit trusted profile and clock context.
No arithmetic policy changes beyond the already approved v7 input are added.

**Hosted verification:** cold `npm ci` and both production builds passed.
`npm run test:quote` passed **1,968/1,968** across 84 selected files.
`npm test` passed **2,339/2,339** across 124 selected files. Both completed with **zero failures,
cancellations, skips or TODOs**. The production dependency audit found zero
vulnerabilities. [CI run 37419693928](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37419693928)
completed successfully at the tested SHA above.

**Timing follow-up:** the earlier documentation-only run at
`4ae4acee4c74c94a8223e7ee2e570620fb8d6428` passed the strict gate but failed
one full-suite catalog timing check (2,337/2,338). Concurrent test files competed
for CPU. The full runner now uses sequential files, matching the strict gate;
a synthetic execution test reproduced the overlap and passes with the fix.
The unchanged 320-product check now measures 614 ms in the full suite, below
its unchanged 1,500 ms limit. A first follow-up exposed a source assertion about
adjacent reporter flags; moving the scheduling flag preserved that assertion,
and all 29 affected local runner/audit controls passed. The hosted result above
includes the completed scheduling repair. No timing limit or financial
expectation was changed.

Local checks: 112 core baseline checks; 75 storage/date/persistence
checks; 39 voice integration/persistence checks; 28 prior audit controls, all
passed with zero skips. Counts overlap. All 42 existing before/after quote
fixtures retain their outcome, line items and scenario amounts exactly. The
46 new release tests comprise 41 storage/date cases, four voice date cases and
one full-runner scheduling case.
Cold installation and owner/widget builds passed.

**Local verification limits:** the local strict run completed with 1,931 passes
and 37 browser-startup failures because Chromium was unavailable, with zero
skips. The local full-suite attempt ended without a final summary and is not
counted as a pass. The completed hosted run supplies the full-suite and browser
evidence. An earlier website-only baseline run also hit two existing catalog
timing assertions. The candidate timing failure and completed scheduling repair
are disclosed above. No timing threshold was relaxed.

The full runner now enables Node 22 module mocks: the existing previously
skipped tests passed 10/10 locally with that flag. No failure allowances were
added. Historical engine code remains solely in `test/legacy/`; the production
architecture gate remains mandatory. Main and deployment are untouched.

## Previous website-only checkpoint

# October 6 website price import — hosted gates passed

Branch: `feat/website-price-import-20261006`.
Verified parent: `d176fa4f828eddf2c47bfc46792125eb36b6eee2`.
Tested source/test/CI SHA: **`8ef7eb620b7ff66a9f8bfaf00a32ca9d6d130bc9`**.

The owner's website draft now fetches bounded public pages on the same host,
validates and pins public DNS addresses at every connection and redirect, and
copies literal price excerpts with their item names, conditions and sources.
Website text never enters a generative prompt. Drafting does not persist any
knowledge; only **Review and save** updates the facts used by calls. Existing
persisted drafts are withheld from voice facts, and calls never fetch websites.

Seventy-six new tests cover the synthetic HTTP importer, address/redirect/DNS
blocking, size/time/page limits, instruction text, owner-only routes, saved-price
isolation, and the owner browser flow. Existing route/CI source assertions follow
the actual registrations and `npm test` entry point; price expectations and
failure allowances are unchanged. The CI trigger includes this exact branch.
The browser fixture bundles the screen's imported CSS. CI runs `npm test`
without masking its exit status, and its summary publisher accepts a clean
report with no failure rows while still rejecting a missing report.

**Hosted verification:** cold `npm ci` and both production builds passed.
`npm run test:quote` passed **1,730/1,730**, zero failures, cancellations,
skips or TODOs, across 70 selected files. `npm test` completed **2,165 tests:
2,163 passed, zero failures, two pre-existing module-mock skips**, zero
cancellations or TODOs. All 76 new website-import tests passed, including both
owner-screen browser tests. The production dependency audit found zero
vulnerabilities. [CI run 37413051308](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37413051308)
completed successfully at the tested SHA.

**Local verification limits:** 187/187 focused tests passed, zero failures or
skips. Cold `npm ci` installed 262 packages; both production builds passed.
Chromium could not be downloaded in this workspace: the local strict run
completed with 1,693 passes and 37 browser-startup failures. The two local full
suite attempts ended without a final summary, so neither is counted as a pass.
The completed hosted runs above supply the full-suite and browser evidence.

[Owner ruling, limits and handwritten expectations](WEBSITE_PRICE_IMPORT_20261006.md).
No subagents, merge, deployment or live data.

## Prior quote-engine checkpoint

# October 5 included-price catalog repair — strict gate passed

Branch: `codex/engine-launch-fixes-20261005`.
Verified parent: `97696354a860f06e8834f44e9c1607f0b1c3bdd0`.
Tested source/test SHA: **`a7986c864f37c6a80472bf157f96f61e71a2d94b`**.

The reported remaining incomplete-catalog stall is reproduced and repaired for
included-price declarations. Proven covering-product dependencies reduce the pair
search; same-product allocation failures are reused without rejecting valid
siblings. Shared missing accessory prices are checked before pair search.
Immutable readiness snapshots reuse policy diagnostics and scope definitions;
mutable inputs and new revisions are still revalidated. Actual quote validation,
arithmetic and the v6 approval boundary are unchanged.

Same 80-product public-catalog probes: cross-product inclusion **4,244 -> 106 ms**;
same-product material-in-labor inclusion **8,800 -> 92 ms**. Both remain NEEDS
PRICING with allocation diagnostics. New checks also cover 320 products per
selector, differing price bases, first/last covering products, complete siblings,
tier repairs, valid included prices, shared accessories and cache isolation.

**26 new regression cases.** The focused suite passed 179/179 before the last
three controls; the full local quote gate then passed **1,580 non-browser tests**,
including all 26 new cases. Its only 35 failures were Chromium startup failures.
Local cold owner-app/widget builds passed.

**Hosted strict quote/price-book gate: 1,649/1,649 passed, zero failures or skips,
across 66 files**, including all 26 new cases. Hosted fresh installation and both
builds passed. [CI run 37350086324](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37350086324)
completed successfully at the tested SHA. The automatically run broader suite
retained its nine existing allowed failures; no gate allowances were changed.

[Handwritten expectations and reproduction](CATALOG_STALL_REPAIR_20261005.md).
[Source-bound verification and limitations](../verification/catalog-stall-20261005/CI_EVIDENCE.md).

No subagents, merge, deployment or live-data changes.

## Previous verified repair checkpoint

# October 5 follow-up repairs — strict gate passed

Branch: `codex/engine-launch-fixes-20261005`.
Verified parent: `a809f567dbcfbfed105fce3aefefb4b249df6279`.
Tested source/test SHA: **`baf24c3696357dab7eff25c02ead1e465dd7b747`**.

Two gaps in the earlier checkpoint are repaired: interview product-name
normalization now includes ordinary and nested price maps, and saving/returning
drafts uses normalized values. The basic-painting limitation notice now follows
effective tier pricing and identifies only affected basic options in mixed setups.
Saved and approved itemized-only fair-wall pricing retains its **$2,250** quote
without the incorrect warning. Arithmetic and the v6 approval version are unchanged.

Twenty new regression cases cover real AI parsing, SQLite draft save/readback,
collision rollback, confirmation behavior, tier combinations, owner rendering
and a saved/approved application quote. Expected amounts were written before
execution in [the launch decisions](QUOTE_LAUNCH_DECISIONS_20261005.md).
Focused checks: **105/105 passed**. Local cold production builds passed.
**Hosted strict quote/price-book gate: 1,623/1,623 passed, zero failures or skips,
across 65 files**, including all 20 new cases. Fresh hosted lockfile installation
and both builds passed. [CI run 37334504982](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37334504982)
completed successfully at the tested SHA. No test skips, failure allowances or
workflow changes were introduced.

Local `npm run test:quote`: **1,554 non-browser tests passed**; all 35 remaining
failures were Chromium startup failures before page creation. Those browser checks
passed in the complete hosted gate. The automatically run broader suite retained
its nine existing allowed failures; no additional failures were allowed.

[Source-bound results and limitations](../verification/engine-launch-fixes-20261005/CI_EVIDENCE.md).

No merge, deployment, live-data changes or subagents.

## Historical checkpoint — its name/notice coverage gaps are repaired above

# October 5 engine launch fixes — prior strict gate passed

Branch: `codex/engine-launch-fixes-20261005`.
Verified starting SHA: `e830ca88ec7f2cd630c497d31b0e32322ed2feef`.
Tested source/test SHA: **`1066f5fe28feab678c55bc2d0ac94ff04fe3ec3d`**.

All eight requested fixes are implemented: basic-painting limitation notice and
preparation-product visibility, optional flat-roof building type, shared product
name normalization with collision rejection, clearer optional peak controls and
month names, never-approved-service messaging, independent demolition access
validation, capitalized layer disclosures, and removal of legacy calculators/status
APIs from production. Historical calculators remain only as regression fixtures;
production retains the price-book metadata it still uses.

The owner-decided arithmetic is implemented: peak surcharge rounds once on the
combined eligible labor, with whole cents allocated to larger portions first and
regular labor winning ties. Room thresholds are inclusive maxima (<=150 small,
<=300 medium under the defaults). Engine version is
`quote-engine-vnext-launch-fixes-20261005-v6`; earlier approvals require fresh
confirmation. Approved labels and hand calculations are recorded in
[the launch decisions](QUOTE_LAUNCH_DECISIONS_20261005.md).

**Hosted strict quote/price-book gate: 1,603/1,603 passed, zero failures or skips**,
including all 35 new regression cases. Fresh lockfile installation and both
production builds passed. [CI run 37318343541](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37318343541)
completed successfully at the tested SHA.

Local cold `npm run build` passed. All **1,534 non-browser tests** passed during
`npm run test:quote`; 35 local browser checks could not start because Chromium
crashed before launching. The complete hosted gate, including browser checks,
passed without excluding or weakening those tests.

[Source binding and verification evidence](../verification/engine-launch-fixes-20261005/CI_EVIDENCE.md).
No merge, deployment, live-data changes or subagents.

## Historical checkpoint below — superseded rounding decision

# October 5 follow-up defects fixed — rounding decision open

The four confirmed quote-engine / price-book defects at `217ce1009cbc371c2f7fe1da1ef19dce4950ed22`
are repaired in source/test checkpoint `b01b7ddde3546bf2aed2c5f8a7b27c9d0ad56e67`,
on `codex/quote-audit-repairs-20261005` ([draft PR #25](https://github.com/sportaholic000-hue/off-the-clock/pull/25)).
The repairs cover named floor overlays, tier-only owner-preview questions,
large incomplete catalog readiness, and approval invalidation after the
October 5 stair-removal surcharge change. Production code was saved at
`9361844b`; subsequent source/test commits only improve the two new test fixtures.

Local verification: 1,499 non-browser checks passed against the same production
source. The final 70-test financial-pipeline parity file also passed. All 65
baseline internal results and 65 customer results remain identical apart from
quote IDs and the intentional engine-version update. The reported public
320-by-320 incomplete catalog improves from 6.17 seconds to 0.14 seconds cold.
The hosted strict quote/price-book gate and both production builds passed on
the final source/test revision. Exact hosted counts and broader-suite comparison
are recorded in the [source-bound evidence](../verification/audit-repairs-20261005/CI_EVIDENCE.md).

**Peak-surcharge rounding is still unresolved.** The existing separate-bucket
convention is unchanged pending an explicit owner decision. This is not launch
signoff or a claim that no further defects exist. New quotes require fresh v5
owner approval; historical receipts retain their original amounts. No merge,
deployment, live-data change, or subagent work is included.

[Changes, acceptance checks, limitations, and source binding](../verification/audit-repairs-20261005/README.md).

# October 5 audit decisions — scoped verification passed

The nine October 4 follow-up decisions are implemented at
`bd14bfb5ac38754abd1a054d5bdc6a6ffcec67dd` on
`codex/quote-audit-ready-20261004` (draft PR #24).
The earlier unpublished scope draft was discarded before these agreed rules
were implemented. See [the approved decisions](QUOTE_AUDIT_DECISIONS_20261004.md).

Final local verification: **1,392/1,392** tests across 44 non-browser quote and
price-book files. All 156 existing price-book files retained identical content
hashes. All 190 materialized source/test/dependency/workflow files match GitHub.

Hosted verification: **1,459/1,459** strict quote/price-book tests across 56
files, including real browser interactions; both production builds passed.
The broader suite has 1,837 passes, the same nine existing failures and two
skips, with no new failures. The known-failure allowance was not expanded.
[Decisions, changes and source-bound evidence](../verification/audit-decisions-20261004/README.md).

This is a scoped repair checkpoint, not a whole-product launch approval.
The engine version changed; affected price books need fresh owner approval.
No merge, deployment or live customer-data change is included. No sub-agents
were used. Historical checkpoints below retain their original source bindings.

# Prior quote-engine / price-book checkpoint — October 4, 2026

**The earlier five-finding completion statement was too broad.** Further checks
found catalog stalls, unselected measured-scope blockers, incomplete paint-group
conflicts, and optional offering readiness/coverage defects at `4b6deeca`.
These reproduced defects are repaired at `42812a71ef31604d34140ea32ecc12b0bda53552`
on `codex/quote-audit-ready-20261004` (PR #24).

Local verification: **1,056/1,056** scoped tests, including **128 new tests**;
65 fixtures retain identical internal and customer quotes (130 comparisons).
All 65 status comparisons are explained by optional coverage changes. The cold
80-by-80 public readiness failures improved from 2.8–9.1 seconds to 0.15–0.38
seconds locally. All 187 materialized source/test JSON and JavaScript-family
files match the uploaded code checkpoint.

Hosted verification: **1,234/1,234** strict quote/price-book tests and both
builds passed. The broader suite retains the existing nine allowed failures and
two skips, with no new failures. Detailed reproductions, outcomes and source binding are in the
[readiness and scope follow-up](../verification/readiness-scope-followup-20261004/README.md).

The PR, `main`, and a deployment remain distinct. No whole-product launch gate
has passed, and passing the recorded regressions is not proof of zero remaining
defects. Historical reports below retain their original scope and source.

## Prior October 4 checkpoint — superseded by the follow-up above

**The five original audit findings have passing acceptance checks on
`codex/quote-audit-ready-20261004` (PR #24).** Tested code:
`5e2ea7647d46241fc365bb2184422ae4c905cb06`, based on PR #23's `6eb6622`.
The independent recheck found QP-05 still open in PR #23; the new checkpoint
repairs the original missing-minimum catalog stall and gates its reproduction.

Local verification: **928/928** scoped regression tests, including **35/35**
audit acceptance cases; **195** differential comparisons without changes.
Hosted verification: **1,106/1,106** strict quote tests and both app/widget builds
pass; the broader suite matches its existing nine-failure baseline. Exact source
bindings and results are in the
[independent follow-up](../verification/independent-followup-20261004/README.md).
Source locations are indexed in the [repository map](../README.md#repository-map).

`main`, the repair branch and any deployment are distinct checkpoints. These
scoped checks do not pass a new whole-product launch gate. Historical phase
checkboxes and reports below are preserved for their original source versions;
they do not supersede this current quote/price-book summary.

## Preserved checkpoint history

---

> **October 2 quote-engine/price-book re-audit repairs:** All nine reproduced groups R01–R09 are repaired on the combined PR #16/#17 source `33605e99c834f2fa7c189626d6d6cbfc8b1d5f61`. Verified: 35 new regression tests, 409 independent arithmetic checks, 11 authenticated browser/HTTP checks, and both builds. Final full suite: 1,233 passed, the nine existing voice failures, two skipped, zero unexpected failures. [Source-bound repair report and evidence](../verification/quote-reaudit-repairs/REPORT.md). Customer rounding is unchanged. Independent Opus review remains next; no full phase or public-launch gate is marked passed.

> **October 1 Opus audit repairs:** The eight quote/editor defects and reproduced provider-marker booking crash are repaired on tested source `6ea52eb10683536206ef91dde35ac88e4cdfa2bc`. Final cold regression: 937/946 pass, with the same nine pre-existing voice failures and no new failures. Independent arithmetic: 960 cases; real application: 19 cases; widget booking: 24 checks; final fencing/painting browser: 26 checks; rendered editor: 12 checks; builds and integration boundary pass. [Source-bound report, screenshots and original evidence](../docs/review/opus-repairs-20261001/README.md). Voice, live providers and public launch remain unaccepted. No full phase or launch gate is marked passed.

> **September 30 CI reliability and lane correction:** A report-only repeat failed the session browser fixture's same-second token comparison. The corrected verification passes the controlled reproduction without changing application auth; the normal browser and exact-head CI checks remain pending at this checkpoint. [Correction record](../docs/review/session-ci-reliability-20260930/PROGRESS.md). Voice and ON/OFF belong to Claude by the owner's latest direction. Earlier source-bound passing records below remain historical; no full launch gate passed.

> **September 30 session response-order repair:** The independent audit's delayed refresh/logout cookie races are repaired at `3e406d2107522319038c6cdd982cfcf08c91e657`. Exact-commit hosted checks passed: both builds, 388 application, 357 engine and 25 transport tests, plus 9 + 10 + 7 browser checks. The new real-response acceptance test fails against the original source and passes against the repair. [Permanent source-bound report](../docs/review/session-response-fix-20260930/FINAL_REPORT.md). Independent peer recheck remains pending alongside its active engine audit. Voice stays incomplete; no full launch gate passed.

> **September 30 account/session slice:** Draft PR #4 implements account email/recovery, revocable server sessions, browser refresh/confirmed logout and durable auth limits. Hosted verification at `67000e668a0da81fa1a85152256705c843429ca8`: 382 application, 357 engine, 25 transport tests, 9 session and 10 account browser checks, and both production bundles passed. Counts overlap. A 184-file source binding and permanent named outcomes are saved in [the security report](../docs/review/session-security-20260930/FINAL_REPORT.md). Peer engine/booking runtime and the original voice guide are preserved. Voice remains incomplete; no full phase or public-launch gate passed.

> **September 30 quote-flow repairs:** Configured CUSTOM fixed/unit/range prices now quote; fractional custom unit prices save and preview faithfully. Optional mowing bagging/edging and flat-roof ponding extras preserve the main quote with explicit per-option exclusions. Exact flooring room thresholds use their specified bands. Verified source `bf6db336f6bf05c641bf6d02a02acf509b4edacb`: 369 engine tests, 318 application tests, real owner/customer/widget workflows and the final integration boundary passed. [Exact source and verification checkpoint](../docs/review/quote-flow-repairs-20260930/README.md). Full engine completion and the public-launch gate remain open. No voice implementation or live-data changes.

> **September 30 fencing, painting and booking repairs:** Owner-approved installed and itemized offerings now quote for both fencing and both painting services. Verified: 357 engine tests, 318 application tests, 26 offering browser checks, 24 real booking/widget workflows, 53 whole-request checks and the final integration boundary. [Source-bound report and remaining limits](../docs/review/engine-completion-20260929/FINAL_REPORT.md). This authorized work changes five original engine files and adds one module; fourteen original files and the original voice guide remain identical. Older freeze and review-only statements below describe historical checkpoints. Email verification/password recovery belongs to the separate owner-designated chat. No full phase or public-launch gate has passed.
> **September 29 owner Calendar slice:** [Verified workflow and remaining boundaries](../docs/review/owner-calendar-20260929/FINAL_REPORT.md). Owner controls, saved booking/request views and existing Google/Calendly connection controls are verified with synthetic provider boundaries. 633 application/engine tests and 12 Calendar browser workflows pass. No full phase or public-launch gate has passed.

> **September 29 combined application verification:** [Repair report and remaining launch blockers](../docs/review/resume-20260929/FINAL_REPORT.md). Application/engine regression: 623 passed; real widget, owner and booking workflows verified with synthetic provider boundaries. The unchanged voice implementation remains incomplete. No public-launch or full phase gate has passed.

> **Current owner-approved behavior:** [Price supported work and preserve separate work for an on-site estimate](../docs/quotedone-completion/R6_SEPARATE_WORK_20260928.md). The selected job still requires usable inputs and approved pricing. The arithmetic engine and original voice guide are unchanged. See the source-bound delivery for completed checks; no public-launch gate has passed. Older checkpoints below retain their original policies and tested sources.

> **Historical R5 checkpoint:** [Customer clarification and recovery repairs](../docs/quotedone-completion/R5_QUOTE_FLOW_PROGRESS_20260928.md). Normal customer details, explicit corrections and original-request retention are being verified. The name/address scope finding remains open; no public-launch gate has passed. Earlier checkpoints below retain their original source scope.

> **Historical restoration checkpoint, before the R5/R6 application updates:** The owner did not authorize replacing the detailed voice guide or making ordinary names, addresses and timing information prevent a quote. The original 459-line voice guide and original engine-specification text are restored exactly. The earlier blanket refusals and the test changes that accepted them are not product requirements. At that restoration checkpoint, the published application was still the 808d723 implementation and its ordinary-customer regression was open. The then-unpublished local candidate at `6da69f6c2b4cd50d600fc937e201b8870228cf95` restores normal customer controls but still fails additional-work/uncertainty cases inside name/address text. A checked summary alone does not resolve that gap. No whole-flow acceptance or launch gate has passed. The 19-file arithmetic engine and verified precision, callback, retry, privacy, approval and persistence repairs remain unchanged. Restoring the original documents does not implement voice, booking, messaging or change the engine. The reports below are historical evidence for their stated commits, not new owner decisions.

> September 28: the independent PR #3 review reopened complete-request scope (C02/B16). Scoped R1 follow-up gate passed locally: 9 application workflows, 6 browser workflows and the final regressions/integration boundary. The September 27 pass below is a historical checkpoint, not proof that the later-discovered bypass was absent. See the [final follow-up report](../docs/quotedone-completion/R1_REPAIR_REPORT_20260928.md) for exact source bindings and remaining launch gates. See [the historical R1 input rules](../docs/quotedone-completion/REQUEST_CONTRACT_20260928.md).

# Build Status — Off The Clock AI

## Phases
- [x] Phase 0 — Skeleton (repo, DB, auth, admin shell)
- [x] Phase 1 — Quote engine + test suite
- [ ] Phase 2 — Price book + onboarding
- [ ] Phase 3 — Voice runtime (Twilio + Gemini)
- [ ] Phase 4 — CRM, quote pages, SMS automations
- [ ] Phase 5 — Public site + demo agents
- [ ] Phase 6 — Widget, Stripe billing, production hardening

## Gate status
Update this file when each gate passes. Format:
Phase N gate passed — [date] — [what was tested]

Phase 0 gate passed — 2026-07-19 — Live run in audit sandbox:
register + login return JWTs; all 8 CREATE TABLE statements
executed in SQLite; JWT middleware attaches ownerId; role
gating verified (owner 200 on /dashboard, 403 on /admin, 401
with no token); rate limit blocks after 5 failed attempts
(successful logins exempt); admin login rate-limited;
duplicate-email registration returns 409 without crashing the
server; malformed reset-password returns 400; /api/schema
hidden when NODE_ENV=production; client builds clean via Vite
with flat-color design system (no gradients).

Phase 1 gate passed — 2026-07-19 — Audited externally across
1990e5d, 087ea0e, 5bed399, a24fc08, 76e48c1, 580bbb8: 34/34
hand-calculated tests reproduced cold; build guide Tests 1 & 2
verified to the cent against independent spec arithmetic
(concrete waste bug found and fixed en route); minimum-fields
zero ruling implemented in engine + pricebook validation; ADDON
skip-plus-disclosure verified on owner and customer paths
(disclaimer survives sanitizeForCustomer; no false disclosure
when priced); users.ownerId CHECK constraint rejects staff
without owner and owner with owner at the DB; legacy users
table rebuild migration preserves rows and installs the
constraint; staff tenantOwnerId derivation verified at unit
level only.

Phase 1.1 (tenant + ADDON hardening) gate passed — 2026-07-19 —
Branch agent/phase-1-1-tenant-addon-hardening (9e464b8) merged
after external audit in a real Node environment: 45/45 tests
cold. Auth is DB-authoritative — independently attacked with
forged JWTs: deleted-staff, deleted-owner, role-flip
(owner->admin), forged-tenant, garbage, and expired tokens all
return 401; the pre-fix 200 on a deleted-staff token is closed.
Parent-role invariant enforced by 3 SQLite triggers, attacked
directly: staff under staff/admin parent rejected, owner
demotion blocked while staff reference it, staff repoint to
non-owner rejected. Migration runs integrity_check +
foreign_key_check + tenant-invariant validation: a seeded
legacy staff-under-admin row aborts the migration, a valid
legacy set migrates with all 3 triggers installed. ADDON
disclosure is per-option (STEP 2b/3/11/12): divergent tiers
verified — top-level disclaimer never claims an exclusion a
priced option includes; shared exclusions disclosed at top
level; single unnamed option uses unprefixed wording; no
"null tier" in output; customer sanitization preserves
per-option disclaimers and hides line items.


## QuoteDone audit repair candidate — September 27, 2026

Scoped QuoteDone audit repair gate passed — 2026-09-27 — candidate `codex/quotedone-audit-repairs-20260927`, based on preserved completion `9670fdb`. Runtime/application/regression ran at `f96c14a`; the complete browser group passed at `d218c85` after a test-selector-only correction. Application and engine bytes are identical between those commits. Real runtime, 8 application workflows, 5 browser workflows, 430 ordinary tests, 311 VNext tests, 46 Phase 1 tests, 22 original precision cases, 30 focused tests, 35 replay controls and the client build passed. Counts overlap. The current integration boundary passes; the historical no-import gate remains expected exit 1 for the authorized bridge. The accepted 19-file engine is unchanged. See [the repair report](../docs/quotedone-completion/REPAIR_REPORT_20260927.md), [current status](../docs/quotedone-completion/REPAIR_STATUS_20260927.json) and [verified evidence index](../docs/quotedone-completion/REPAIR_EVIDENCE_INDEX_20260927.json). This is not a pass for the whole unfinished Phase 2–6 scope.

The owner now requires a callback contact for every estimate request. Supported measured inputs may quote; untriaged additional scope/unknowns and unsupported contracts require review. Both fencing services, exterior painting and CUSTOM remain wholly review-only. Operator CRM access is separate from QuoteDone pricing permission.

The running production build, live data, provider integrations, published public pages/demo, backup restoration and multi-instance operation have not been accepted by these local tests. See `../docs/quotedone-completion/REPAIR_CONTRACT_20260927.md` and `OWNER_DECISIONS.md` for governing rules and capability limits.


## 2026-10-02 — roof minimum and service readiness repairs

Implementation follows the reported B1/B2 and M1–M7 audit, reproduced on PR #12 head `1b70096e25a1310df556e2f8672f9741d025c04e`. Original saved requests, responses and records are on `verification/quote-readiness-20261002`; final verification is run by `.github/workflows/quote-readiness-verification.yml` and the existing cold CI.

- Roof replacement minimum uses the exact fixed-money dollar/cent boundary, including root, nested and tier prices. Older nonzero roof minima need an explicit owner recheck; no historical value is multiplied by assumption.
- Standard concrete, measured interior walls, clean-bed mulch, cleanup, sod and planting do not require prices for unrequested extras. Selected unpriced scope still returns review without a customer subtotal. Owner coverage lists those lead-only requests.
- Customer/staff calculation uses the same saved readiness decision as the service catalog. Owner draft preview remains a diagnostic preview under the existing engine preview behavior; it cannot authorize a customer quote.
- Fence/exterior setup presents installed or itemized offerings, with explicit inclusions. Earlier standard prices are retained, never converted into assumed offerings. AI setup uses the same usable field list and the interview starts on its current measured field.
- Paint-material diagnostics identify the actual missing product. Shared flat-roof help no longer asks for unused Average rates. The interior-painting specification now states the measured wall-area basis.

No arithmetic formulas, voice runtime, live records, dependencies or deployment settings are changed by this repair. The known voice failures remain outside this task. This is not a declaration that launch or the entire engine has passed; see the source-bound verification report for exact results and remaining limits.

## 2026-10-02 — agreed audit follow-up (m1–m6)

Scoped follow-up on PR #14 base `25fca4812bbc0eb905b1d91124c2aa53aced791a`, preserving that Codex repair. Standard siding labor now rejects unsupported fractional cents in the editor and save boundary without rounding. AI starter requests use the saved tenant country/region and explicit CAD/USD; missing country requires correction before generation. Scope sentence separators, two removal labels, unsupported percentage advice and the engine integration README are corrected. No pricing-policy decisions or findings unique to the independent audit are implemented.

Local verification: 126 focused tests passed; the exact full CI command produced 1,135 passed, 9 existing voice failures and 2 skipped (1,146 records), with no new failure reported by the existing checker. Owner/widget builds passed. Real synthetic HTTP save/reload/quote checks and the actual editor browser check passed. Source hashes, runnable harnesses, logs, scope mapping and limitations are in [the agreed audit follow-up report](../verification/agreed-audit-followup/REPORT.md). No whole-phase, deployment or public-launch gate is claimed.

## 2026-10-03 — owner trade decisions and labor-only surcharge

Scoped implementation on `c714b6e`, candidate `codex/quote-trade-decisions-20261003`. The owner's [trade-decision amendment](QUOTE_TRADE_DECISIONS_20261003.md) governs local quote-date peak pricing, private installed-price labor/material allocation, product-specific readiness, derived posts, condition-based prep, listed material waste, labor factors, concrete area/perimeter, direct mulch yards and minimum-price display. Customer cost breakdowns remain private.

Verification: 1,259 passed / nine unchanged baseline voice failures / two skipped; 26 new acceptance cases; four real application/browser workflows; both builds passed. All 153 application source-binding entries matched final source. Existing money values are retained; changed arithmetic requires fresh approval and necessary installed-price shares. Draft checkpoint only, no merge/deployment. Exact evidence and limits: [implementation report](../verification/quote-trade-decisions/REPORT.md). Voice wording handoff is included there; live calls remain unverified.

## 2026-10-03 — dependency security repair

Removed unused Tailwind and its exclusive dependency chain after the CI audit flagged the braces advisory GHSA-vfj7-8cjw-p6xm. Removed the old tracked `node_modules` directory; the existing ignore rule and clean-install workflows remain. Retained package versions and application source are unchanged. Clean install passed; production and full dependency audits each report zero known vulnerabilities; both builds passed and all five output files are byte-identical. Full suite: 1,259 passed, nine unchanged known voice failures, two skipped; existing failure checker passes. Local gate only; GitHub checks are verified after publication. No merge/deployment. Evidence: [security repair report](../verification/dependency-security-20261003/REPORT.md).

## 2026-10-03 — three quote-decision gaps

Follow-up on `535a16f` preserves the security repair. Missing installed labor allocations contribute zero to peak pricing and no longer block readiness or quotes. Offering price fields/notes state the flat-ground, standard-height or one-story baseline; retained non-baseline offerings require explicit owner confirmation before quoting, without changing saved money. Peak configuration prompts for an explicit quote time zone while profile/UTC fallback quoting continues. No other arithmetic changes. The governing trade-decision amendment is updated.

Local gate: 28/28 new regressions pass; the same file detects 25 failures and three passing controls on pre-edit source. Full suite: 1,287 passed, the same nine known voice failures, two skipped (1,298 records); existing checker passes. Both builds and four actual built-editor/application workflows pass; all 153 application source hashes match. No merge/deployment. Evidence: [follow-up report](../verification/quote-decision-followup/REPORT.md).

## 2026-10-03 — owner status messages

Scoped presentation repair on `0c8c774`: itemized-painting status requirements now exclude optional unpriced surface-condition rates. Condition coverage identifies requests that still go to review; a service with no priced condition still requires at least one. Activation results, quote arithmetic, approvals and customer output are unchanged.

Verification: eight new regressions pass (all eight detect the old presentation); 48 complete quote/status snapshots match byte for byte; full suite 1,295 passed, the same nine known voice failures, two skipped (1,306 records), with the existing failure checker passing. Both builds and the real editor/save/approve/public-quote workflow pass; all 153 application source-binding entries match. No dependency changes, merge or deployment. Evidence: [owner status report](../verification/owner-status-messages/REPORT.md).

## October 3 component-pricing and price-book follow-up

Implemented the owner's latest confirmed quote-engine/price-book repairs: scope-specific siding removal; trim-height exclusion; access/story factors on separately priced roof layers/siding trim; cost-compatible included underlayment and a plain inclusion mode; conditional labor-allocation coverage; owner-controlled permits; named arbitrary-height fence offerings with feet/inches input; readable approval and inclusion controls; registry/field/customer wording and retired-field presentation. Existing default percentages are explicitly acknowledged, not changed.

Verification: 39 new regression cases (10 passed/29 failed on the unchanged base; 39 pass after), 267 focused passes, final full suite 1,334 passes / same nine voice failures / two skipped, expected-failure checker passes; both builds pass. Seven real-browser save/approve/public-quote workflows pass with zero page errors. No dependencies, merge, deployment, or voice implementation changes. See [component repair report](../verification/component-pricing-repairs/REPORT.md).

## October 3 review follow-up (Claude)

On `claude/quote-review-fixes-20261003` (base `88e5040`): one shared product-name conversion for every owner name-entry control with visible refusal reasons; customer review wording chosen from the engine's field metadata (fence length, slab thickness and scope sizes now read as measurements); retained values shown only as retained, formatted like prices; engine version moved to `-v2` so the changed component-pricing arithmetic receives fresh owner approval. No prices or formulas change. Verification: 8 new tests (1 pass / 7 fail on the base; 8 pass after); full suite 1,353 tests, 1,342 pass, same nine voice failures, two skips, checker passes; client build passes; real-browser check of names, save and approval. [Report and evidence](../verification/claude-review-fixes-20261003/REPORT.md). Not merged or deployed.

## October 3 owner ruling — any fence height quotes (Claude)

On `claude/quote-review-fixes-20261003`: fence quotes work at any positive height. Prices entered for one height scale by requested height / priced height (fence per foot, posts, footings, installed per foot, gates); old-fence removal is not scaled; the quote states the scaling. The fixed 4/6/8 ft list is removed. A line re-priced by waste, terrain or an installed labor share now reuses its exact factors (fixes a one-cent rounding error found at 2 ft). Verification: new `fenceAnyHeight` tests plus three updated tests; real HTTP previews at 2, 6, 9 and 13 ft match exact fractions; full suite 1,356 tests, 1,345 pass, same nine voice failures, two skips. [Evidence](../verification/claude-review-fixes-20261003/REPORT.md). Not merged or deployed.

## October 3 Astra follow-up (Claude)

Feet-and-inches fence heights are priced exactly as entered (5 ft 3.65 in = 63.65/12 ft; previously a binary approximation could round a half cent down, $3,978.12 instead of $3,978.13), and heights read as entered for customers ("5 ft 3.65 in"). The height control no longer says the quote must match the offered height. Proportional scaling of posts, footings and gates is unchanged pending the owner's decision. Full suite 1,358 tests, 1,347 pass, same nine voice failures, two skips. [Evidence](../verification/claude-review-fixes-20261003/REPORT.md). Not merged or deployed.

## October 3 engine audit repairs (Claude)

Branch `claude/audit-fixes-20261003` (base `4cbbc87`): D01, D03, D04, D05, D06, D08, D09, D10, D11, D12 and M04 repaired, plus price-book save durability, half-cent and combination/boundary tests. `npm test`: 1,386 tests, 1,375 pass, the nine known voice failures, two skips, checker passes. `npm run test:quote`: 855 tests, zero failures. New audit tests: 1 pass / 8 fail on `4cbbc87`, 9 pass after. Not merged or deployed.

## October 3 audit follow-up 2 (Claude)

Large-repair area limit, CAD/USD currency, fence-height and post-count rules recorded. `npm test`: 1,388 tests, 1,377 pass, nine known voice failures, two skips, checker passes. `npm run test:quote`: 857 tests, zero failures. Onboarding over HTTP: CA-NB sets CAD, US-OR sets USD. Not merged or deployed.

## October 3 audit follow-up 3 (Claude)

Second audit's six findings repaired: AI answer overwrite, readiness repeated per quote, currency shown as legacy and optional, Node 24 runner format, quote-gate selection. Inches limited to two decimals. `npm test`: 1,392 tests, 1,381 pass, nine known voice failures, two skips, checker passes. `npm run test:quote`: 1,000 tests (41 files), zero failures. Node 24: default reporter fails the checker; with --test-reporter=tap it passes. Real browser: fence-type picker, refused names, two-decimal inch message and currency select verified. Not merged or deployed.

## October 4 audit follow-up (Claude)

F01-F06 and G01 from the October 4 audit repaired. `npm test`: 1,399 tests, 1,388 pass, nine known voice failures, two skips, checker passes. `npm run test:quote`: 1,007 tests, zero failures. Readiness for a flat-roof catalog: 15 x 15 products about 0.7 s (was about 1.2 s); 40 x 40 still about 4.5 s. Not merged or deployed.


## October 4 — four authorized quote / price-book repairs

On audited base `a96a608868332bcd969d04d88af3d5d7af60508c`, branch `codex/quote-smalls-20261004`: customer currency is bound to retained calculation evidence; ambiguous AI answers return clarification without a second generation or draft mutation; manual interview saves preserve newer numeric/structured edits and prevent duplicate saves or premature review; ordinary CI runs the strict quote architecture and zero-failure regression gate. Quote arithmetic, dependency lockfile and engine approval version are unchanged.

Hosted CI passed on code commit `353947fe6ef29af1e4d173bc5eb49103efef0106`: strict quote gate 1,023/1,023 across 44 files, including five actual browser checks and the actual HTTP/SQLite clarification check; full suite 1,404 passed, the same nine known voice failures, two skipped, zero cancelled; existing failure checker and both builds passed. Local non-browser quote regressions: 998 passed, zero failures. Counts overlap. The complete CI result and evidence are recorded in [the scoped repair report](../verification/quote-smalls-20261004/REPORT.md).

Remaining audited findings: failed durable approval may still leave quoting live (F01, launch blocker); shared-file simultaneous writers can lose updates (F02, conditional); larger-catalog cold readiness can block the server thread (F04). These are not repaired by this checkpoint. No merge, deployment, full-phase or public-launch acceptance.

## October 4 remaining-defect repairs (Claude, branch `claude/audit-fixes-2-20261004`)

Combines `claude/audit-fixes-20261003` (853b23f) with Codex's `codex/quote-smalls-20261004` (1075dd1) and repairs the nine remaining defects: a failed recovery save no longer clears an earlier pause; a failed flush after clearing the pause no longer reports a pause; the save lock is never taken from a living holder, is released only by its owner, is re-checked immediately before the book is replaced, and every wait or filesystem error is bounded; overlapping interview confirmations and review during a pending confirmation are blocked; pair readiness (roof and flat-roof replacement) is derived from row/column probes plus the largest-subtotal pair and matches checking every pair (40 x 40 in about 0.6 s locally); per-pair price pruning is removed. `npm run test:quote`: 1,034 tests, 0 failures. `npm test`: 1,426 tests; all pass except the nine known voice failures (plus one test fixed after that run and re-verified in the gate). Not merged or deployed.

## October 4 — authorized follow-up on `3e71b1b`

The owner authorized fixing the remaining N03/N05/N06/N07 findings. Scoped implementation uses separate per-owner SQLite OS locks without a post-save auxiliary commit, finds live interior catalog pairs before falling back to exhaustive owner checks, and retains both partners in checked coverage messages. Monetary formulas, saved prices, customer quote wording, dependency lockfile and engine approval version are unchanged. Hosted CI at code commit `3da2104435320867db3af3814f0010f8d228ec7b`: strict quote gate 1,046/1,046 across 45 files; full regression 1,427 passes / the same nine known failures / two skips / zero cancellations; existing-failure checker and both builds passed. All ten new regressions passed with ordinary hosted commands. Local affected cases: 28/28; durability: 8/8; 65 existing internal/customer/status fixtures unchanged except generated quote IDs. Local native suites use a documented handle-retention workaround for this workspace runtime. The uploaded code checkpoint is source-bound across 311 selected files with zero mismatches; the evidence-only follow-up preserves all four production/test blobs. Draft PR #22. No merge, deployment or full launch acceptance. [Repair report](../verification/quote-final-repairs-20261004/REPORT.md).

## October 4 — authorized Astra five-finding repair candidate

Scoped follow-up on `eda1452`: fixed gate-width consistency across options, tier-required customer questions, confirmed baseline readiness, selected-product confirmation wording, and shared readiness blockers in cold catalogs. Stored prices, arithmetic formulas, dependency lockfile and engine approval version are unchanged. Hosted CI at code commit `58769d7c09990647f37bd0c8f3c143ab0567b98c`: strict quote gate 1,071/1,071 across 47 files, including all 22 new non-browser regressions and three new browser cases; full suite 1,452 passes / nine unchanged known failures / two skipped / zero cancellations, with the existing failure checker and both builds passing. Local focused checks: 124/124; the new non-browser file detects 19 failures and three passing controls on the unchanged base; all 65 existing quote/customer/status fixtures match except generated quote IDs. The two cold 80-product blocked/disabled readiness cases each measured 3 ms in hosted CI. All 318 selected files match the immutable tested GitHub tree; final evidence-only changes preserve the nine production and two test blobs. Local broad/native/browser limitations are documented, not counted as successful gates. Draft PR #23, candidate `codex/astra-five-repairs-20261004`, awaits Claude's independent audit; no merge, deployment or launch sign-off. [Scoped report](../verification/astra-five-repairs-20261004/REPORT.md).
