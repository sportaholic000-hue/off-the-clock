# Price-book editor/interview repairs — F04, F05, F07, F08, F11, F13

Scope: client price-book setup and draft lifecycle only. F14 remains a server integration dependency; this work does not establish complete quote-engine accuracy.

## Source and boundaries

- Exact starting source: `c2e9efcdcc4aaca4a7b8f610e4cdf792cb135010` (PR #15).
- Repair branch: `codex/pricebook-editor-repairs-20261002`.
- PR target: `codex/agreed-quote-followup-20261002`, the existing PR #15 branch. A separate head preserves that branch and PRs #12, #14 and #15.
- Application and verification source covered by the archived evidence: `1b8cac5c6aad522867e08f3bdd5de66edafa2258`.
- Report/evidence-only commits do not change application source. Evidence includes hashes of the tested server and client files.
- No server, arithmetic engine, bridge, AI validator, tax, voice, booking, CRM, account behavior, general website, deployment or dependency changes. The small API-module addition clears only price-book transfer state when the existing session changes.
- A separate verification workflow runs isolated synthetic stores and browser tests. Existing CI and its known-failure list are unchanged. No subagents, merge, deployment or live-data writes.

## Reproduction and repair

| Finding | Original failure at the exact starting source | Repair and verification |
| --- | --- | --- |
| F04 | Changing travel from owner-selected to not-applicable retained `travel:false` after hiding its control. A previously stored stale answer had no correction control. | Rule transitions remove only the incompatible owner answer; staying owner-selected preserves explicit No. Existing mismatches remain visible until the owner removes the outdated answer or restores the owner-selected rule. The browser corrects and saves a stale stored record. No fee applicability or rates are inferred. |
| F05 | A customer-selected travel rule had no preview answer control or request selection. | Preview-only Yes/No/Unanswered controls send `customerFeeSelections`; unanswered is distinct from false. A service change clears answers; a rule change removes incompatible answers and retains compatible No answers. Answers never enter the saved price book. Real previews return $300 for No, $310 for Yes and review for unanswered. |
| F07 | Approving unchanged B replaced unsaved A; confirming A after editing while its review was open also erased those edits. | Approval reconciles only the exact reviewed saved service and saved revision, preserving other draft services and tiers. Changing the reviewed service/defaults disables confirmation until saved and reviewed again. Concurrent revision changes keep the draft, retire the stale review and invalidate its preview. Browser coverage includes unsaved rates, tiers, switching and the existing in-flight edit lock. |
| F08 | Owner A's actual interview transfer, plus an unbound legacy draft, could be imported by B in the same tab. | New interview/suggestion transfers carry the owner ID from an authenticated response. Import verifies that binding; unbound, malformed and wrong-owner transfers are rejected with a visible recovery message. Only these transfer keys are cleared by logout/account changes. Same-owner recovery, suggestions and actual logout are exercised. |
| F11 | The repair interview rendered a two-level numeric map despite current three-level metadata; the underlayment-basis question rendered a numeric input instead of choices. | The interview reuses the existing metadata-driven PricingTree for depth, enum and boolean leaves. Exact keys, zero, false and blank states are preserved. Enum persistence succeeds. Three-level repair requests have the correct payload and retained values but are still rejected by the unchanged F14 server validator; see dependency below. |
| F13 | Scalar and map text `1.0000000000000001` became 1 before readback validation. | Scalar and map controls use ExactNumericInput and exact validation before readback. Rejected text stays editable with feedback. $0.0051 unit rates retain precision and save through the real interview API. No global two-decimal restriction or rounding was added. |

The original failures and positive controls are preserved, including complete requests/responses, actual stored books and interview records, DOM/input captures, screenshots and source hashes. The normal wall-only quote remains $300: 100 measured wall sq ft × 2 coats × ($1 labor + $0.50 material), with zero markup/tax. The preview fee control adds the owner's explicit $10 travel charge only for Yes.

## Verification

- **16/16 application browser workflows passed** on the repair source; the same checks produced **15 expected failures and one passing normal-quote control** on the exact starting source. The F11 tree check verifies the correct UI/payload and retained server rejection, not successful persistence through the outstanding F14 defect.
- **159/159 focused and existing editor/interview tests passed**, zero skipped.
- **Cold full suite: 1,163 tests; 1,152 pass; nine unchanged known voice failures; two skipped. No new failures.**
- **Owner build and widget build both passed.**
- **110 server files matched before/after hashes**, including the engine, bridge, AI validator and tax code. All 13 changed source/verification files were fetched back from GitHub and compared with the prepared content.
- [Dedicated browser/build/focused run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37044967783), [cold full-suite run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37044967782).
- [Permanent evidence manifest](https://github.com/sportaholic000-hue/off-the-clock/blob/f93cf785ab4e5abc0f4bb6c1f54a591b30cd7cf0/verification/pricebook-editor-repairs/evidence/MANIFEST.json), [before results](https://github.com/sportaholic000-hue/off-the-clock/blob/f93cf785ab4e5abc0f4bb6c1f54a591b30cd7cf0/verification/pricebook-editor-repairs/evidence/before/public/result.json), [after results](https://github.com/sportaholic000-hue/off-the-clock/blob/f93cf785ab4e5abc0f4bb6c1f54a591b30cd7cf0/verification/pricebook-editor-repairs/evidence/after/public/result.json), [focused TAP](https://github.com/sportaholic000-hue/off-the-clock/blob/f93cf785ab4e5abc0f4bb6c1f54a591b30cd7cf0/verification/pricebook-editor-repairs/evidence/existing.tap), [full-suite summary](https://github.com/sportaholic000-hue/off-the-clock/blob/f93cf785ab4e5abc0f4bb6c1f54a591b30cd7cf0/verification/pricebook-editor-repairs/evidence/full-suite-summary.txt).
- [Complete before browser responses](https://github.com/sportaholic000-hue/off-the-clock/blob/f93cf785ab4e5abc0f4bb6c1f54a591b30cd7cf0/verification/pricebook-editor-repairs/evidence/before/public/browser-wire.json), [complete after browser responses](https://github.com/sportaholic000-hue/off-the-clock/blob/f93cf785ab4e5abc0f4bb6c1f54a591b30cd7cf0/verification/pricebook-editor-repairs/evidence/after/public/browser-wire.json), [stored books/interviews](https://github.com/sportaholic000-hue/off-the-clock/blob/f93cf785ab4e5abc0f4bb6c1f54a591b30cd7cf0/verification/pricebook-editor-repairs/evidence/after/public/stored-records.json). Synthetic authentication secrets are redacted.
- [Verification history, including failed development probes](https://github.com/sportaholic000-hue/off-the-clock/blob/f93cf785ab4e5abc0f4bb6c1f54a591b30cd7cf0/verification/pricebook-editor-repairs/evidence/verification-history.json).
- Screenshots (1280 × 900): [fee correction](https://github.com/sportaholic000-hue/off-the-clock/blob/f93cf785ab4e5abc0f4bb6c1f54a591b30cd7cf0/verification/pricebook-editor-repairs/evidence/after/public/F04-existing-stale.png), [preview fees](https://github.com/sportaholic000-hue/off-the-clock/blob/f93cf785ab4e5abc0f4bb6c1f54a591b30cd7cf0/verification/pricebook-editor-repairs/evidence/after/public/F05-preview-answers.png), [retained unsaved price](https://github.com/sportaholic000-hue/off-the-clock/blob/f93cf785ab4e5abc0f4bb6c1f54a591b30cd7cf0/verification/pricebook-editor-repairs/evidence/after/public/F07-other-unsaved-service.png), [rejected unbound transfer](https://github.com/sportaholic000-hue/off-the-clock/blob/f93cf785ab4e5abc0f4bb6c1f54a591b30cd7cf0/verification/pricebook-editor-repairs/evidence/after/public/F08-legacy-cross-owner.png), [three-level repair input](https://github.com/sportaholic000-hue/off-the-clock/blob/f93cf785ab4e5abc0f4bb6c1f54a591b30cd7cf0/verification/pricebook-editor-repairs/evidence/after/public/F11-three-level-repair.png), [retained rejected decimal](https://github.com/sportaholic000-hue/off-the-clock/blob/f93cf785ab4e5abc0f4bb6c1f54a591b30cd7cf0/verification/pricebook-editor-repairs/evidence/after/public/F13-map-exactness.png). All 32 before/after screenshots are preserved in the evidence branch.

Commands:

```text
npm ci --no-audit --no-fund
npm --prefix client run build
node --test test/pricebookEditorRepairs.spec.mjs test/interviewControls.browser.spec.mjs test/phase2Terminology.spec.js test/phase2.spec.js test/priceBookAI.spec.mjs test/priceBookEditor.browser.spec.mjs test/pricebookPreviewFreshness.browser.spec.mjs
node --test test/*.spec.js test/*.spec.mjs
```

The dedicated workflow checks out the exact starting SHA, copies only the verification script, builds that source and runs the same browser checks before and after. It uses Node 22.23.2 and Playwright 1.56.0 with Chromium, authenticated HTTP, a real isolated application/SQLite store and synthetic owners/prices. For the suggestion-transfer lifecycle case only, the AI response is a clearly marked deterministic browser fixture; this task does not claim a new live Gemini verification. Boolean/legacy-map component tests render the actual React controls with synthetic props.

A test setup correction was necessary: the first probe used the wrong preview disclosure label and an unapproved positive-control service. Those were corrected before accepting the baseline. An initial after-repair assertion also read a switched numeric input before React finished rendering; preserved state/DOM evidence proved the draft was retained, and the final assertion waits for the displayed value. No application failure or unrelated test was hidden or removed.

## Remaining dependency and limits

All six supplied editor findings were reproduced; none was disproved.

F14: on the unchanged PR #15 server, the real interview PUT for `ROOFING_REPAIR.repairHours` sends:

```json
{"asphalt_shingle":{"leak_patch":{"small":0,"medium":1.2345,"large":3}}}
```

The server returns HTTP 422, `The price map contains an out-of-domain key.` The editor retains the answer and displays that rejection. The other assistant must fix current-depth validation in `server/src/priceBookAI.js`; this branch deliberately does not duplicate that work. Repeat the recorded browser case after integrating F14 and require a successful save/reload before calling that interview path complete end to end.

Approvals still apply only to saved values. An external revision conflict requires reviewing the newer saved version before continuing; no unsaved work is silently replaced or approved. Legacy transfers without a verified owner are not imported; saved interviews remain recoverable from their authenticated owner's account.

The nine known voice failures are reported separately and unchanged. This report makes no claims about voice, booking, CRM, deployment, general website readiness or total engine accuracy.
