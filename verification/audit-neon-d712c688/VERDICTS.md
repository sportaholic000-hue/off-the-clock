# Neon audit of `d712c688` — verdicts (November 26, 2026)

The owner supplied Neon's launch-readiness audit of `quote-engine` at `d712c688` (engine v59 with `claude/launch` merged through `98b9235c`). Each finding was read against the code and reproduced on the build before anything was changed. No sub-agents. `/specs/` is unchanged.

| # | Finding | Reproduced | Result |
|---|---|---|---|
| 1 | A withheld caller's callback number is missing from the owner's "New lead" email, the `lead.created` webhook and the Leads export | Yes | Fixed |
| 2 | "Confirm your business-wide settings" is offered, and records a confirmation, while those settings fail their own check | Yes | Fixed |
| 3 | Planting still requires the mulch ordering overage, which it never reads and the price book no longer shows | Yes | Fixed (engine v60) |

## 1. Withheld caller's callback number

**Reproduced.** A caller with a withheld number gave `+14165550199` and got a partial estimate. The quote request held the number. The lead written for the owner held only the caller ID: the email said `Phone: anonymous`, the webhook sent `"phone":"anonymous"` and the Leads export printed `anonymous`. A lead captured with `captureLead` had the number in the email and the webhook but not in the Leads export.

**Cause.** The phone quote path wrote the lead with the caller ID and saved the callback number only on the quote request. The three channels read the lead.

**Changed.**
- `server/src/voice/voiceToolRuntime.js`: the phone quote path saves the contact number on the records it writes (the lead, and the saved quote). The lead's `callerNumber` stays the caller ID, which ties the lead to the call.
- `server/src/outboundWebhookSchema.js`: `lead.created` sends the contact number saved on the lead, else the stored number.
- `server/src/integrationData.js`: the Leads export prints the same number. For a call lead written before this fix it reads the saved quote request.
- `server/src/ownerAlertService.js`: the "New lead" email has the same fallback.

**Where this differs from the audit's proposed fix, and why.**
- The audit's webhook SQL preferred the number as typed on the website form over the stored number. A website lead's stored number is already its contact number in the form the Leads page uses (`+15065550123` for a typed `(506) 555-0123`, since the audit of v50). The audit's order would have changed what website leads send to integrations. Not done; test 5 guards it. The export's quote-request lookup applies to call leads only, for the same reason.
- The contact is saved on the saved quote as well as the lead. A withheld caller whose quote prices instantly gets no lead, so without this the cancellation export of quotes would not carry that caller's number.

**Not changed.** The cancellation export still writes the stored records as they are; the lead and quote records now carry the number. The "Call ended" and urgent emails still label the caller ID as "Caller". A withheld caller who gives no number is still shown as given (`anonymous`).

**Also corrected by the same change.** When the same call later logged a quote request for that service, the lead was reused and its contact number was overwritten with `anonymous`. It now keeps the callback number (test 9; confirmed to fail without the fix).

Test: `test/withheldCallerLeadContact20261126.spec.mjs` (9), expectations written before the fix.

## 2. Business-wide settings confirmation

**Reproduced.** With "tax the whole job" saved and no tax rate, an approved service read `NEEDS PRICING` ("taxPercent is required."), was marked as waiting only for the business-wide settings, and the confirmation succeeded. The service was still `NEEDS PRICING` afterwards. Quoting never went live with a missing rate; the message and the recorded confirmation were wrong.

**Changed** (`server/src/quoteDoneBridge.js`). A service is waiting only for the business-wide settings when confirming them is the one thing left before it quotes again. The editor's offer and the confirmation use that one rule. Not offered and not renewed:
- settings that fail their own check;
- a service that also lacks a price of its own (found while testing; the audit named only invalid settings);
- a service that is turned off. Under v59 it was renewed with the others. It is now offered the confirmation when it is turned on again.

With nothing waiting, the confirmation is refused (409) and no receipt changes. No wording changed.

Tests: `test/qeAuditFixesV60_20261126.spec.mjs` 2a–2d, expectations written before the fix.

## 3. Planting and the mulch ordering overage

**Reproduced.** A planting quote with an overage of 5 saved on the service was held for review, and the service read `NEEDS PRICING`. The price book has not shown that field for planting since v59, so the owner had no field to correct.

**Changed** (`server/quote-engine-vnext/contracts.js`, `priceBook.js`). The setting is marked unused for planting: not required, not range-checked, not offered. A saved value is ignored. Mulching still requires and checks it.

**Where this differs from the audit's proposed fix, and why.** The audit said to remove the setting from planting's definitions. That would have made the value saved on every existing planting service either an unsupported field or a retained legacy setting to confirm, and would have changed the content that existing approvals cover. Marking it unused changes neither.

**Release steps.** `ENGINE_VERSION` `quote-engine-vnext-accuracy-20261126-v60`. A planting quote that was held for an out-of-range overage now prices, which is a change in why a quote is held. No earlier frozen result changed: the 1,365 earlier jobs keep the v59 fingerprint. Five new frozen jobs, for 1,370. Approval versions unchanged, because no approved, quoting service changes price.

**Noted, not changed.** A planting service drafted by the AI still lists "Mulch ordering overage" among the fields to confirm. Confirmation covers every saved field, and taking one out of that list would mark existing confirmations as unsupported.

Tests: `test/qeAuditFixesV60_20261126.spec.mjs` (finding 3: four tests), hand-worked 220.00 for planting and 238.50 for mulching. An older test, "repairs 48 and 73" in `test/quoteEngineVNextRepairs.spec.js`, expected every saved setting to be checked; it now states that the one unused setting is ignored and every other setting is still checked.

## The audit's other statements

- Its operational gates (launch branch not brought up to this build, nothing deployed on Railway, Google sign-in not verified, live checks not run) match the "Not done" list in `verification/merge-launch-20261126/REPORT.md`. None is closed by this change.
- Its owner wording sign-off covers the same three merged strings listed there. This change adds no owner-facing or caller-facing wording.
- Its statement that no pricing, tax or scope defect was found is the audit's own; it was not re-checked here.
