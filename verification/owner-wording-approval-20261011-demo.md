# Owner-approved public demo facts — 2026-10-11

Source of approval: the owner's 2026-10-11 demo-facts/scanner fix request.
Applies to `server/src/demo/demoInstructions.js`, used by both Nova and Miles
through the production `/api/demo/session` token configuration. This approval
does not authorize edits to specifications or public website pages. All other
demo instructions remain unchanged.

## Approved facts as shipped

### Forwarding

Replace the dashboard-toggle explanation, including its on/off meanings and
the claim that carrier forwarding is separate from that toggle, with:

> To stop answering, the owner turns off call forwarding on their phone. There is no on/off switch in the dashboard.

### Starter

> - Starter plan, $69 per month, 150 included minutes: 24/7 answering, transcripts and lead capture, owner alerts in the dashboard and by email, owner-managed spam filtering, one number and one owner login. Starter does not include booking, live transfer, the Price Book, the website quote widget or quoting by phone.

### Operator

The existing line is retained, with the approved login replacement and the
approved Price Book/widget addition:

> - Operator plan, $119 per month, 300 included minutes: 24/7 answering and booking, calendar connection and customer records, transcripts and lead capture, owner alerts in the dashboard and by email, live transfer, owner-managed spam filtering, one number, an owner login plus one office-staff login, a quote-request counter, webhooks and CSV support, the Price Book and a quote widget for their website.

### QuoteDone

> - QuoteDone plan, $279 per month, 1,200 included minutes: everything in Operator, plus quoting by phone from the owner's own prices.

### Annual billing

> - Annual billing is available on all three plans and costs ten times the monthly price, which is two months free: Starter $690 per year, Operator $1,190 per year, QuoteDone $2,790 per year.

### Trial

Replace only `A trial is available.` in the extra-minutes line with:

> A 14-day trial with 60 included minutes is available.

The existing overage, cancellation, paid-period and no-money-back-guarantee
sentences are retained exactly.

## Availability check

No listed feature was omitted. Current gates and services support the listed
features: `planAccess.js`, `billingUsagePolicy.js`, `staffSeats.js`,
`voice/voicePlanAccess.js`, owner call/alert/customer routes, the dashboard quote
request counter, and `ownerIntegrationRoutes.js` for Operator webhooks and CSV.
The existing permitted `calculateListedPrice` capability remains unchanged;
phone Price Book quoting remains QuoteDone-only. The detailed source and test
evidence is recorded in `demo-facts-scanner-20261011/REPORT.md`.
