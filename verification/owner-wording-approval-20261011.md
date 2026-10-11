# Owner wording approval — 2026-10-11

Approved verbatim for release candidate h:

| Surface / plan | Approved exact string |
| --- | --- |
| Billing trial | `Trial ends` |
| Billing trial | `Days left` |
| Billing date style (example) | `Oct 25, 2026` |
| Price Book preview, all plans | `What your customer gets` |
| Price Book preview, all plans | `This is the estimate your customer will get. Changes here aren't saved until you press Save & validate.` |
| Price Book preview, all plans | `RANGE YOUR CUSTOMER GETS` |
| Existing save button, all plans | `Save & validate` |
| Dashboard fallback Operator ready-service caption | `THESE CAN QUOTE ON YOUR WIDGET` |
| Dashboard fallback QuoteDone / legacy Scale caption, unchanged | `THESE CAN QUOTE ON A CALL` |
| Setup first sentence, every plan, unchanged | `Ready when your account has access, your number is set, and the About and Hours sections have content.` |
| Setup Starter continuation | `Price Book quoting is included with Operator and QuoteDone.` |
| Setup Operator continuation | `Website widget quoting turns on per service later. Answering never waits on your price book.` |
| Setup QuoteDone / legacy Scale continuation, unchanged | `Quoting turns on per service later. Answering never waits on your price book.` |

Starter's fallback READY TO QUOTE and NEEDS PRICING cards are hidden; its other
fallback cards stay. Trial status does not change the selected plan's wording.
Days left remains a whole number. Dates use the business timezone and UTC
fallback already used by owner-screen date handling.

server/src/previewMode.js local-only demo lines and
client/src/planDescriptions.js:5 are explicitly unchanged by this approval.
Starter quote counters outside the two specified fallback cards are report-only.
