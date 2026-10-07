# Repairs from the four October 7 audits

The application is not certified clean or ready to launch. This checkpoint repairs five bounded issues from the attached reports against release revision `109f68722dc399ba2e8ffa8bae7ad7fbda951e0a`.

## Changes

| Finding | Repair | Evidence |
|---|---|---|
| Quote report D04–D06; Off-the-Clock 17, qualification portion | Quote SMS uses the shared customer projection and money formatter, retains frozen scope, exclusions, option disclosures, separate work, currency and units, and collapses equal endpoints. Oversized qualified receipts refuse sending instead of being truncated. | Real SMS handler and durable delivery service with fake provider; CAD partial quote, USD tiers, oversized disclosure, unchanged stored receipt. |
| Markdown audit D1 | Voice offers the existing `none` choice for a bare floor and shares the engine's exemption from product identity. It creates no fictitious product receipt. | Saved approved service, engine and real phone quote return $668. Real products still need confirmation; contradictory removal remains rejected. |
| Quote report D01 | Exactly zero installed roof underlayment is excluded from allocation requirements, matching the existing flooring treatment. Positive effective tier prices still require allocation. | $1,800 materials-tax quote and live readiness, including server-issued included-price approval. Positive tier requires allocation, then gives $1,910. Unclassified zero is rejected. |
| Off-the-Clock 25 | Production startup, registration and password reset share the supported bcrypt generation cost of 12–16. | Startup boundaries and existing registration/reset tests; invalid configuration cannot create an account or consume a reset token. |
| Word audit Part 2, finding 3 | STEP 9 now states the already approved exact minimum-price rule and corrects its three examples. | Existing minimum/display regression; no range arithmetic was changed. |

## Verification

Hosted verification subsequently passed at source SHA
`9720aaef7677b7d864363a417cd823c816477dde` in
[run 37592728250](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37592728250):
2,585/2,585 strict quote tests and 3,612/3,612 full-suite tests, with zero failures,
skips, cancellations or TODOs; both builds and the production dependency audit pass.

Node 22.23.3; fresh `npm ci`: 288 packages installed. Owner and widget production builds pass.

The final new regression file was run against a separate unchanged worktree at the audited SHA: **9 tests, 1 pass, 8 expected failures**, zero skips/cancellations/TODOs. The failures cover the reproduced defects; the passing case preserves ordinary product confirmation. The first fixture draft used an unsupported roof waste field and a missing test signing key; those fixture errors were corrected before the retained baseline execution. A save-path fixture was corrected to obtain its inclusion receipt from the actual approval operation.

After repairs, the focused run is **160 tests, 160 pass, 0 failures/skips/cancellations/TODOs**. These include the nine new regressions, existing re-audit, display, voice path/date, tool projection, SMS delivery, deployment, account recovery and architecture tests. The earlier focused attempt overlapped the build and hit a missing temporary bundle plus the inclusion-fixture error; it is not claimed as passing. Build completed before the retained final run.

Command (with Node 22 on PATH and a workspace temporary directory):

```sh
node --test --test-concurrency=1 test/quoteAuditSmallRepairs20261007.spec.mjs test/quoteReauditRepairs20261006.spec.mjs test/quoteDisplay20261006.spec.mjs test/voiceQuotePathRegression20261005.spec.mjs test/voiceQuoteDateIntegration.spec.mjs test/voicePromptCompiler.spec.mjs test/ownerAlertsDelivery20261006.spec.mjs test/ownerAlertsDelivery20261006Provider.spec.mjs test/deploymentConfig.spec.mjs test/accountEmail.spec.mjs test/quoteArchitectureGuard.spec.mjs
```

Compressed logs preserve the baseline, focused run, install and build. This local report makes no full-suite or live-provider claim; GitHub CI provides any subsequent cold full-gate result for the published commit. No pricing rates, approval receipts, money formulas, main branch, deployment or live customer data were changed. All code changes and verification were performed by the active agent; a research-only agent compared two supplied reports before repository instructions were available.

## Findings that remain open

The subsequent [three-repair checkpoint](../audit-followup-20261007/REPORT.md)
fixes stale manual interview saves, mulch display units and the bounded adjacent
website-condition cases, with passing hosted checks. The list below describes
what remained open at this first checkpoint; stylesheet visibility and phone
scope confirmation still remain open after the follow-up.

The quote-page link portion of Off-the-Clock 17 remains unfinished. Sending a long receipt currently fails safely at the existing 1,600-character SMS limit; a complete saved-quote delivery/link workflow needs separate implementation.

This checkpoint does not repair selection-dependent phone scope confirmation, ambiguous mulch units, stale interview saves, website condition/visibility extraction, listed-price model arithmetic, or the remaining platform workflow defects. The website condition finding overlaps across two audits; SMS scope loss overlaps across another two. Counts should be consolidated by root cause rather than added together.

The listed-price arithmetic report demonstrates an uncontrolled calculation path, but explicitly does not reproduce a wrong live spoken amount. The mulch case demonstrates ambiguous units, not incorrect arithmetic for a correctly understood number of cubic yards. Missing Chromium/native-runtime test failures are verification gaps rather than evidence of dozens of additional product bugs.

The broader booking, reminders, text-back, spam controls, concurrency, provider resilience and backup findings need end-to-end repairs. Passing the existing suite alone cannot close them: their reported reproductions expose paths the suite did not previously assert.
