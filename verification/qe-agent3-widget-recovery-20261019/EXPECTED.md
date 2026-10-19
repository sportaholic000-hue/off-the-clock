# A3 widget request races and recovery — pre-execution expectations

Base: `04df35cd8e9ced136ef611cfc2b25f2de64c21bf`.
Written before executing the new scenarios; synthetic owner-entered prices only.
No amounts below are obtained from an engine execution.

Existing coverage inspected: `qeAgent3WidgetDependencies20261019.browser.spec.mjs`
checks dependent-field correction, one exact HTTP replay, and changed-scope stale
confirmation. `quoteApplicationBoundary.spec.mjs` checks status classification and
signed confirmation binding. The representative A3 audit covers 8 services, not
request ordering, lost responses, or same-key component persistence isolation.

## Independent arithmetic

Use the catalog's explicit mowing/cleanup fixtures, no markup, overhead, travel,
permit, peak surcharge or tax. Range buffer is explicitly 10%; no tiers.

| Scope | Hand calculation in cents | Midpoint | Displayed range |
|---|---|---:|---|
| Weekly, 5,000 measured sq ft, maintained; bagging; 100 measured ft edging | 5,000 × 2 = 10,000 labor; 10% bagging = 1,000; 100 × 50 = 5,000 edging; total 16,000 | $160 | $144–$176 per visit |
| Corrected mowing, 10,000 sq ft, same other facts | 20,000 + 2,000 + 5,000 = 27,000 | $270 | $243–$297 per visit |
| Revised owner mowing rate, 3 cents/sq ft, 5,000 sq ft | 15,000 + 1,500 + 5,000 = 21,500 | $215 | $193.50–$236.50 per visit |
| Cleanup, 1,000 measured sq ft, heavy debris, flat slope, haul-away | 1,000 × 10 × 2 = 20,000 labor; 15,000 disposal; 5,000 haul-away; total 40,000 | $400 | $360–$440 |

All estimates retain “No tax added.” Preparation creates zero receipts. An
accepted instant request adds exactly one row each to quoteSubmissions, quotes,
leads, and quoteRequests. Exact replay adds zero and returns the original quoteId,
customer response and immutable stored submission/book/result. Changed payload
with the same identifier rejects with 409 and changes no historical rows.

## Controlled scenarios

- Same-turn double preparation and double confirmation: one request per stage,
  one saved quote, $160 midpoint.
- Let the real handler commit, then abort only the browser response. Retry in
  place and after reload must send byte-identical payloads and recover the same
  persisted receipt. Include the progressive widget.
- Hold actual preparation responses behind explicit promises while changing
  area or service. Old success/error/finally handlers must not replace current
  fields, newer preparation, or the active-request lock. Corrected mowing is
  $270; replacement cleanup is $400.
- Change and reapprove the owner rate through authenticated HTTP after preparing
  but before confirming. Stale confirmation rejects with 409 and saves nothing;
  freshly checked scope uses $215. Earlier $160 receipts replay unchanged.
- Two CustomerQuote instances using the same public key: independent input,
  in-flight, prepared, pending and completed recovery state, including reload.
- Switch a component's public key while responses are blocked: old completions
  cannot populate the replacement instance or overwrite its recovery data.

The harness uses real Chromium, the real CustomerQuote/transport, public HTTP
handlers, owner save/approve HTTP, and a temporary persisted SQLite database.
Only the harness document is synthetic. Request barriers forward requests to
the real handler and explicitly release, abort, or reverse response delivery;
no sleeps select the race order.

## Display correction recorded before the repaired run

The original table above is retained as pre-execution evidence. Its revised-rate
display cell confused the internal cent range with customer display. Engine
specification STEP 9, CUSTOMER DISPLAY, requires a standard buffered quote's
lower endpoint rounded down to a whole dollar and upper endpoint up unless its
minimum/zero exception applies. Neither exception applies here:

- Internal range: 21,500 × 0.9 = 19,350 cents; 21,500 × 1.1 = 23,650 cents.
- Customer range: floor(193.50) = **$193**, ceil(236.50) = **$237**.
- Midpoint remains **$215**. No pricing/specification change is required.

The corrected test asserts both the independent internal cents and the specified
customer display. Baseline `6ef93587` passed the stale-confirmation 409 and the
21,500-cent calculation before failing this mistaken display expectation; that
last assertion is a harness expectation error, not a server defect.
