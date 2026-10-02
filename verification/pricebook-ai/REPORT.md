# Price-book AI: final verification

Tested source: **1b70096e25a1310df556e2f8672f9741d025c04e** on `codex/pricebook-ai-20261001`.
Base: `380c9153ae0598293dc81ab42072498e04483d97` on `claude/integration-pr3-pr4-20261001`.
Run date: 2026-10-01 Halifax / 2026-10-02 UTC.

This evidence branch adds records and screenshots to the tested source. The implementation PR targets the integration branch and remains a draft. No merge, deployment or production-data change was performed.

## Changes and verified behavior

| Finding | Repair and evidence |
| --- | --- |
| Price-book generation inherited the voice model | Added `PRICEBOOK_GEMINI_MODEL`, default `gemini-3.5-flash-lite`. `GEMINI_MODEL` keeps its existing meaning. Google's live model listing advertised generateContent; all 8 final real generation calls returned HTTP 200 with the new text model while the separate voice setting was `gemini-3.8-live`. |
| Invalid starter output was silently partially accepted | The active adapter rejects the whole malformed result: non-JSON, extra properties, unknown services/fields, out-of-domain map keys, negative/unsafe numbers, numeric strings, duplicate JSON keys and decimal drift. It uses current metadata and existing exact-money limits. No new pricing caps were introduced. |
| The interview made no Gemini call | Added authenticated, tenant-scoped typed-answer assistance for one selected field. It stores only a validated unconfirmed value. The browser interview captured an owner-stated $0.005 rate through real Gemini and persisted it exactly. |
| Interview values disappeared on transfer to the editor | Review now returns the field structure the editor imports. Captured values survive transfer and saving as inactive AI_INTERVIEW drafts with empty confirmation maps. |
| AI or changed values could retain misleading confirmation state | AI capture clears that field's prior interview confirmation. Changed manual values also lose prior confirmation. Review into the price book always resets approval. Existing saved-value, per-field approval remains required for customer quoting. |
| AI failures did not reliably show a useful recovery message | Bounded attempts include response-body parsing: 15 seconds per attempt, one retry. Fixed credential-free errors appear beside the AI action and direct the owner to the usable manual editor. Simulated outage and timeout left stored records unchanged. |
| Widget summary exposed internal values | Measured area / Regularly maintained and readable enum labels replace raw values such as exact / maintained. Original submitted measurements are unchanged. Owner preview and the widget both returned $50 for the same complete mowing fixture. |
| Editor tests broke when new UI state was inserted | The diagnostic harness read React hooks by hard-coded positions. Its original 30-second timeout was reproduced and retained. The probe now identifies the named hooks in the actual component source; all 15 original decimal, persistence, approval and editor assertions pass. No application pricing behavior was changed for this test repair. |

Real starter responses covered **all 20 service types**, in five four-service batches, and were saved inactive and unconfirmed. This verifies supported draft values; it does not assert that AI can independently configure every offering or scope. Those choices still belong to the owner.

## Exact verification

| Command / workflow | Final result |
| --- | --- |
| Cold install from the existing lockfile, then `node --test test/*.spec.js test/*.spec.mjs` | **1,106 total: 1,095 pass, 9 known voice failures, 2 skipped. Zero new failures.** |
| `node .github/scripts/check-test-results.mjs test-results.tap` | Passed; exactly the existing 9/9 known failures. The known-failure list was not changed. |
| `node --test test/priceBookAI.spec.mjs` | **50/50 pass**. Model independence, strict validation, exact decimals, injection handling, timeout/body limits, key protection, summary labels, and all 20 service schemas. |
| `node --test test/priceBookEditor.browser.spec.mjs` | **15/15 pass**. All original business assertions retained. |
| `npm --prefix client run build` | Owner application **passed**; widget **passed**. |
| `verification/pricebook-ai/verify.mjs` in the dedicated Actions job | **14/14 pass**, real Express routes, SQLite records, built owner UI and cross-origin widget. |
| Existing CI production dependency audit | Passed, zero reported vulnerabilities. Dependencies and lockfile unchanged. |

[Final cold CI](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36954609186) · [Final Gemini/application run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36954609141)

CI used Node 22.23.3. The dedicated Gemini/browser job used Node 22.23.2 and isolated Playwright 1.56.0. Its workflow records the complete setup and commands.

The 14 application checks cover live model selection; starter browser import and persistence; interview browser capture and transfer; all-service starter persistence; real prompt injection; another-owner rejection; malformed interview output; malformed starter output; manual validation and confirmation revocation; outage; timeout; saved per-field approval; the mobile widget quote; and key exclusion.

Real-provider checks made **8 generation requests, all HTTP 200**, plus a successful model-list request. Complete provider inputs/outputs are in `final-1b70096/provider.ndjson`. Malformed-output, outage and timeout checks use a verification-only provider transport fixture against the real application; they are not presented as real Google outages.

The approval-positive control is a separate complete synthetic mowing configuration with an AI source marker and owner-entered fixture rates. It demonstrates rejection until all saved fields are confirmed, then a normal $50 quote. The real generated/captured services were separately verified as saved inactive and unconfirmed; this report does not claim they were automatically approved.

## Retained evidence and reproduction

The archive contains **58 original files**, with SHA-256 hashes of the compressed and decoded content. It retains the baseline failures, initial repair failures, complete final HTTP/browser responses, provider records, saved drafts, screenshots, test-probe failure, test output and CI logs.

- [Source and run binding](evidence/source-binding.json)
- [Evidence manifest](evidence/manifest.json)
- [Decoder](decode-evidence.mjs)
- [Widget summary, 375px](screenshots/widget-friendly-summary-375.png)
- [Visible timeout message, 1280px](screenshots/ai-timeout.png)
- [Per-field owner confirmation](screenshots/per-field-owner-confirmation.png)

After checking out this evidence branch, decode and verify every retained file with:

```sh
node verification/pricebook-ai/decode-evidence.mjs ./decoded-pricebook-ai
```

The implementation's `.github/workflows/pricebook-ai-verification.yml` supplies the exact live-run recipe using the repository's Actions secret. No key is committed or printed. The Actions artifact is `11205296663`, SHA-256 `97667019a659ad54259cf9b43d40d4381076a38cc64093f1fcf33f9a2a476b0f`; the committed archive persists beyond its 30-day retention.

Historical qualifications:
- Original Live-model generation returned HTTP 400. Original 2.5 Flash returned HTTP 404 for this API project despite appearing in the model list. Separate 3.8 Flash positive-control attempts returned HTTP 503. Full responses are retained; these do not establish permanent global model unavailability.
- The original widget-summary HTTP probe omitted `intakeFlow` and correctly received 422. That failed probe is retained and is not counted as a reproduced product defect. The raw wording was visible in source and the supplied review; the final browser and enum regression verify the corrected output.
- Candidates `476e24a` and `3eac194` produced 15 extra editor-probe timeouts. Their failed CI logs are retained. The final run has none.
- The first repair's widget assertion expected the wrong result label, QUOTE. The existing successful result is INSTANT_ESTIMATE_READY. Correcting the assertion did not alter the $50 amount.
- The first repair's real browser run exposed an unclear starter prompt shape and hidden safe error messages; both were repaired before final verification.

## Remaining limits

The nine listed voice failures and two skips remain. Voice, telephony, the demo, accounts and deployment were outside this work. No claim of total product or launch readiness follows from these results.

AI may misunderstand an otherwise valid value; owners must confirm their actual prices and units. Open-ended offering/scope configuration remains in the manual editor. Google availability and project/model access can change, so the manual recovery path remains necessary.

The arithmetic engines, voice runtime, demo code, dependencies and lockfile are unchanged from the base. The source/run binding records every changed blob. Quote outputs still depend exclusively on the owner's approved price book.
