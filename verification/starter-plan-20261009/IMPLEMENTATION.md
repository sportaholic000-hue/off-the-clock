# Three-plan implementation review

Base: `claude/release-candidate-20261009d`, `be473b6542c498a6e96b056b5be2c3d59d9e4055`.
Branch: `feat/starter-plan-20261009`.

Handwritten expected amounts are in EXPECTATIONS.md. Every owner-facing addition is
listed verbatim in OWNER_WORDING.md as proposed, pending owner approval.
No provider account was used or configured, no deployment was performed, no text
message was sent, and no quote-engine arithmetic or public marketing page changed.

## Downgrade behavior

Verified Stripe subscription events update the current account plan. The application
does not treat a requested portal change or a JWT claim as entitlement evidence.
Until Stripe confirms a scheduled change, the previously confirmed plan remains in
force. Recurring price differences are not simulated proration invoices or credits.

- QuoteDone → Operator: phone price-book tools stop, including cached getQuote replay
  in a connected call. Price book, AI setup, website widget, booking and transfer stay.
- Either higher plan → Starter: price-book/widget routes, AI price-book setup,
  calendar setup/read/write routes, public and authenticated new booking operations,
  receptionist booking/transfer tools and pending transfer acceptance stop.
- Saved price-book files, quote receipts, widget keys/settings, calendar connections,
  booking policies and confirmed appointments remain unchanged. Existing appointments
  are not canceled. Hold release and public confirmation-status routes retain their
  existing behavior. Owner call/lead history and lifecycle exports remain available.
- Upgrading restores access to saved settings. The phone capabilities are selected
  when a connection starts; upgrades enable additional declared tools on the next
  call. Downgrades are checked afresh before every tool dispatch and cached replay.
- Starter accepts the owner's login only. Existing staff records are kept; new staff
  sessions and existing session/refresh use are refused while Starter is selected.
- Existing in-progress provider operations are not undone. For example, a booking
  already submitted before the change may finish reconciling. A new availability,
  hold, confirmation or preference request is refused after the change.
- Existing usage-period rules are retained: an open period without allocated charges
  can adopt verified new terms; a period with an allocated overage installment retains
  its recorded plan/allowance so prior invoices are not rewritten. Later monthly
  allowances use the confirmed plan. No provider proration settings were changed.

## Compatibility and rollout checks outside this task

The two new Stripe price IDs must be configured, along with the existing four IDs,
before enabling billing on this version. The authorized operator must also include
the approved Starter prices in the Stripe billing portal's available plan choices.
This task deliberately does not create Stripe prices or change that account's portal.
Legacy Scale reconciliation/access is retained but Scale is not offered at signup.

The public demo's old two-plan copy in `server/src/demo/demoInstructions.js` remains
unchanged under the no-public-page-change instruction. Claude should update that
marketing copy alongside the homepage. Real provider acceptance and browser UI
interaction are not established by fake-client or server-render tests.
