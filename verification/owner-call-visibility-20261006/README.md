# Owner call visibility

Read-only starting point: `fix/voice-quote-path-v2-20261006` at
`d176fa4f828eddf2c47bfc46792125eb36b6eee2`.

Source evidence: `client/src/dashboard.jsx` selects `dashboard.previewActivity`
for all activity; `server/src/server.js` returns only that preview feed from
`/api/dashboard`. `server/src/previewMode.js` returns null outside local preview.
The owner router has no Calls view and the server has no `/api/calls` handler.

A real server process with temporary SQLite storage, a synthetic owner/session,
and a synthetic call, transcript, quote, lead and appointment returned:

```json
{"GET /api/dashboard":{"status":200,"previewActivity":null,"callActivity":"absent"},"GET /api/calls":{"status":404}}
```

The original dashboard consequently rendered its empty feed despite the saved
call. No live tenant data or providers were used.

The feature branch reads existing receipts without calling the quote engine.
Calls list/detail, dashboard feed/counters, owner Quotes and Leads use stored
records. Both voice `applicationOutcome` and ordinary `customerResult` receipt
formats are supported. Call links navigate between existing owner views.
Bookings resolve through a quote or through a lead/quote booking intent; requested
times remain visibly separate from confirmed appointments. Queries and every
source join constrain ownerId using the authenticated tenant. Staff cannot read
owner calculation evidence. Existing components and CSS are reused.

`test/ownerCallVisibility*.spec.mjs`: 18 tests initially passed, zero failures
or skips, including the actual server/authenticated HTTP routes and React HTML
rendering. Tests include two synthetic owners, parent-scoped staff, deliberately
cross-tenant foreign keys, quote drivers, exact stored fractional prices, review
reasons, leads, bookings, fallback calls and pagination.

Reproduce after `npm ci` and `npm run build`:

```sh
node --test test/ownerCallVisibility*.spec.mjs
npm test
npm run test:quote
```

The complete hosted workflow is the completion gate; initial focused results do
not assert that the full suite is green.
