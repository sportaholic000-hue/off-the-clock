# Owner-facing phone-quote wording inventory — 2026-10-11

Searched all client/src owner screens and server-provided owner messages. Other wording is intentionally unchanged as requested. Active and trial accounts follow the same selected-plan gates.

| File:line | Plans that can see it | Current text | Proposed wording |
|---|---|---|---|
| client/src/pricebook.jsx:450 | Operator, QuoteDone, legacy Scale; Starter sees the locked screen | What your customer hears | What your customer sees |
| client/src/pricebook.jsx:455 | Operator, QuoteDone, legacy Scale | This is what the estimate will sound like on a call. Nothing saves until you save. | This is how the estimate will appear to your customer. Nothing saves until you save. |
| client/src/pricebook.jsx:499 | Operator, QuoteDone, legacy Scale, when preview is ready | RANGE YOUR CUSTOMER HEARS | RANGE YOUR CUSTOMER SEES |
| client/src/dashboard.jsx:255 | No explicit plan gate: Starter (with retained approved services), Operator, QuoteDone and legacy Scale; only the fallback counter branch when neither storedActivity nor previewActivity is available. The current dashboard route normally supplies storedActivity, so this is dormant fallback wording. | THESE CAN QUOTE ON A CALL | Operator: THESE CAN QUOTE ON YOUR WIDGET; Starter: SAVED SERVICES · UPGRADE TO QUOTE; QuoteDone/Scale: retain existing wording |
| client/src/pricebook.jsx:549 | Operator, QuoteDone, legacy Scale; active and trial | This service can issue quotes on a live call. | IMPLEMENTED owner-approved Operator wording: This service can issue quotes on your website widget. QuoteDone/Scale retain the live-call wording. |
| client/src/onboarding.jsx:105 | Starter, Operator, QuoteDone, legacy Scale; shown beneath ANSWERING STATUS | Quoting turns on per service later. Answering never waits on your price book. | Starter: Price-book quoting requires an upgraded plan. Operator: Website quoting turns on per service later. Answering never waits on your price book. QuoteDone/Scale: retain existing wording. This is contextual ambiguity, not an explicit phone promise. |
| server/src/previewMode.js:93 | All plans in local simulated preview only; never production | Incoming from (506) 555-0164 · quoting a 140 ft cedar fence | Incoming from (506) 555-0164 · capturing a fence request |
| server/src/previewMode.js:96 | All plans in local simulated call feed only | Gate repair quote · $285 delivered · booked Thursday 9am | Gate repair request · details captured for review |
| server/src/previewMode.js:98 | All plans in local simulated call feed only | Chain link, 80 ft · quoted from your rates | Chain link request · details captured for review |
| client/src/planDescriptions.js:5 | Starter and Operator can read the QuoteDone comparison in onboarding/Billing; it explicitly describes QuoteDone only | $279/month or $2,790/year. 1,200 included minutes each billing month. Everything in Operator, plus price-book quoting on the phone. | Keep as written: the named higher-plan comparison is accurate. |

Other phone mentions describe forwarding, listed prices, existing call records or the explicit absence of phone price-book quoting. They do not promise that Starter or Operator includes that feature. Public marketing pages were not edited.
