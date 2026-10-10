# Widget Leads and owner service area

Base: `00142cee28e4cadbeb373c20de94233c702ffb2f` on
`claude/release-candidate-20261010e`.

## Handwritten expectations

The synthetic HTTP regression in `test/widgetLeadsServiceArea20261010.spec.mjs`
declares these expectations before execution:

| Submission | Expected inbox result |
| --- | --- |
| one@example.invalid, +15065550123 | One lead linked to its instant quote; customer A |
| two@example.invalid, +1 (506) 555-0123 | One lead linked to its instant quote; same customer A |
| three@example.invalid, +15065550124 | One lead linked to its instant quote; different customer B |
| No contact | Existing HTTP 422 refusal; no lead |
| partial@example.invalid, email only | One partial lead linked to its quote; no inferred phone identity |
| Confirmed booking of the third quote | One appointment on that existing lead; total remains four leads |

All instant quotes retain the hand-calculated price: $100 fixed charge + $0 tax
+ $0 fees + $0 markup = $100.00. The partial retains the same priced $100 scope.
Retries and restarts must retain the same record IDs. Staff see the same inbox;
another business sees none. Equal names alone never merge customers.

Saving Moncton/NB/CA allows a Moncton address and refuses a Halifax/NS/CA address
in both the widget booking endpoint and the receptionist tool. Saving all areas
allows both. Invalid, duplicate and excessive city lists cannot replace the
saved policy. Operator and QuoteDone keep widget and booking access; Starter
keeps neither.

## Explicit route-matrix review

The `quoteDoneRoutes.js` diff changes the existing submission transaction so
instant results insert a lead, as partial results already did. Both inserts use
the existing owner-bound query, record ID and transaction. No route registration,
middleware, owner resolution, plan gate, public-key policy, request digest,
replay handling, or quote arithmetic changes.

The route-source fingerprint is updated only for that reviewed file. The route
inventory and middleware inventory are unchanged. Synthetic owner/staff/foreign
tenant checks in the new HTTP test supplement the existing full route matrix.
The two migration inventory queries are explicitly registered as cross-tenant
migration reads; their writes and the booking helper use ownerQuery.

The isolated booking fixture now includes production Leads/Quotes/Customers
schemas because confirmation reads its source record. Its existing assertions
are retained, with an additional explicit zero-lead expectation for a booking
without a widget source. Backup/restore expects two leads (instant and review)
and one booking instead of omitting the instant request.

The runtime-layout smoke test's teardown now stops and awaits its synthetic
server before deleting the data directory. The prior independent cleanup hooks
could delete that directory while startup backup work was still writing it,
causing ENOTEMPTY. This changes test cleanup only, retaining the health/startup
assertions and leaving runtime behavior unchanged.

## Proposed labels and help text — pending owner approval

Service-area control:

- “Service area”
- “Choose all areas or list 1–100 cities. Your receptionist and website booking check this saved area. About & area does not set booking coverage.”
- “Where do you work?”
- “Choose service area”
- “All areas”
- “Specific cities”
- “Enter the city, province or state, and a two-letter country code, such as CA or US. Each city must be unique.”
- “City {n}”
- “Province/state {n}”
- “Country code {n}”
- “Remove city”, with accessible label “Remove city {n}”
- “Add city”

Calendar:

- “Booking requirements”
- “Set your service area in Onboarding → Knowledge base. A connected calendar and an enabled service with a duration are also required.”
- “Set your service area in Onboarding → Knowledge base.”
- “Set service area”
- Accessible list label: “{service name} missing booking requirements”

Existing labels reused in the added lead links: “Quotes”, “Bookings”, “Calendar”.
Booking status and date/time are displayed as `{status} · {local date/time} ({time zone})`.
Existing readiness messages and normalizeServiceArea validation messages are
reused without rewriting. These copy proposals are for review on this branch;
no deployment is included.
