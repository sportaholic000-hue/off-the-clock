# Widget and customer-flow handoff

Base: `d2b20520cdd056e0b3ffea6f46219df7e8af3f0d`.
Branch: `codex/quotedone-widget-20260929`.
This lane changes `client/**`. Integration with the backend lane remains a separate acceptance step. PR #3 remains draft.

## Customer behavior

- One script tag opens a mobile-friendly form in a modal. Shadow DOM isolates its styles.
- Measurements use the existing exact-decimal controls. The browser requests prices from the existing server flow and does no pricing arithmetic.
- Configured work can quote while separate additional work remains visible for an on-site estimate. Unresolved facts about the selected job continue through clarification or review.
- Callback email or phone is collected before pricing. With the versioned API, name and job site are collected when arranging the visit.
- Original saved submissions remain intact. An uncertain save retries the exact body and request ID. An explicit rejection restores editing.
- Saved results, booking drafts and uncertain booking requests survive a tab reload.
- Changing the job returns to the retained measurements. A held appointment can be released before changing contact, site or time.
- A preferred-time request is clearly labeled as a request. Only a confirmed calendar response displays a booked appointment.

## Backend interface

Use the backend lane's `docs/SHARED_API_CONTRACT_20260929.md`, version `2026-09-29.1`. It supersedes the early development proposals.

The catalog advertises `pricing-only-v2`, `booking-v1`, post-quote identity and server-only pricing. It supplies business branding and the public click-to-call number. The verified `job-details-v1` prepare, confirmation, clarification and signed edit-history protocol remains in use. Exact historical submission retries must resolve before newer shape validation.

A persisted quote or review may supply a flat, opaque `bookingToken`. Booking routes are scoped under `/api/public/bookings/:bookingToken`:

- POST `availability`: server-provided slots or an explicit external / preferred-time / unavailable outcome.
- POST `holds`: selected opaque slot ID; validate the returned held slot and expiry.
- DELETE `holds/:holdId`: wait for `RELEASED` before editing the held appointment.
- POST `confirm`: explicit readback confirmation. A 202 response remains pending and is followed through GET `confirmations/:confirmationId`.
- POST `preference`: one to three date/day-part windows. A successful request does not establish an appointment.

Mutations preserve their UUID `Idempotency-Key` across uncertain retries. The public widget sends no owner authentication. Server validation, availability, tenant boundaries, hold ownership, pricing authority and calendar persistence remain backend responsibilities.

The form does not silently discard supplied name/site text from older drafts. Moving a field after pricing is not evidence that its contents cannot change the requested job; the backend scope checks and integrated cases still require verification.

## Build and verification

Use Node 22 and the existing repository dependencies.

- `npm --prefix client run build` builds the normal app, loader and production widget module.
- `node --test client/test/widget-transport.test.mjs` checks transport, versions, decimal preservation, retry keys and response validation.
- `node client/test/widget-browser.mjs <source-root> <fresh-evidence-directory>` runs the real quote application against a fresh synthetic database and browser.
- `node client/test/widget-booking-browser.mjs <source-root> <fresh-evidence-directory> final` checks booking UI recovery with explicitly labeled API fixtures. It does not prove a real calendar write.
- `node client/test/widget-integration-boundary.mjs <git-checkout-root>` verifies the frozen engine, application boundary and dependency preservation, allowing only the documented client build/test script changes.

Browser checks use `PRICEBOOK_BROWSER_MODULE` and `PRICEBOOK_BROWSER_EXECUTABLE`; the local verification environment also supplies `ESBUILD_BINARY_PATH` and `QUOTEDONE_GIT`. Each run must use a new evidence directory. Keep failed runs, full requests/responses, synthetic stored records and the tested source binding.

## Integration and launch

Production hosting must serve the freshly built `client/dist/widget.js` and `widget-app.js`. The module needs cross-origin loading support, and API requests must satisfy the business's website allowlist. Local browser tests use an explicitly identified local static host.

Final integration must compare widget, full-page and phone results for the same approved book and facts, and exercise real booking persistence through isolated provider adapters. Address/measurement validation, provider booking, account/billing gates and voice runtime are owned by the backend lane. No provider purchase, live call, live calendar write, merge or deployment is included in this frontend work.
