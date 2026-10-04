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

## October 4 — four authorized quote / price-book repairs

On audited base `a96a608868332bcd969d04d88af3d5d7af60508c`, branch `codex/quote-smalls-20261004`: customer currency is bound to retained calculation evidence; ambiguous AI answers return clarification without a second generation or draft mutation; manual interview saves preserve newer numeric/structured edits and prevent duplicate saves or premature review; ordinary CI runs the strict quote architecture and zero-failure regression gate. Quote arithmetic, dependency lockfile and engine approval version are unchanged.

Hosted CI passed on code commit `353947fe6ef29af1e4d173bc5eb49103efef0106`: strict quote gate 1,023/1,023 across 44 files, including five actual browser checks and the actual HTTP/SQLite clarification check; full suite 1,404 passed, the same nine known voice failures, two skipped, zero cancelled; existing failure checker and both builds passed. Local non-browser quote regressions: 998 passed, zero failures. Counts overlap. The complete CI result and evidence are recorded in [the scoped repair report](../verification/quote-smalls-20261004/REPORT.md).

Remaining audited findings: failed durable approval may still leave quoting live (F01, launch blocker); shared-file simultaneous writers can lose updates (F02, conditional); larger-catalog cold readiness can block the server thread (F04). These are not repaired by this checkpoint. No merge, deployment, full-phase or public-launch acceptance.
