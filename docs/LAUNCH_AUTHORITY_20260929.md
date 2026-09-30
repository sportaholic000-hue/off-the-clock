# Off The Clock - launch authority

This page is the current execution authority for the owner-directed launch work
started on September 29, 2026. It is bound to base commit
`d2b20520cdd056e0b3ffea6f46219df7e8af3f0d` and supplements, but does not
silently rewrite, the specifications under `specs/`.

## Required product outcome

Ship the complete Off The Clock product: an AI phone operator and an embeddable
website widget that use the business owner's approved price book to quote
supported, sufficiently measured work accurately, fail closed when a reliable
quote is not possible, and book the appropriate visit or job on the owner's
calendar.

The launch target is the complete product. A reduced pilot is not the target.

## Locked accuracy rules

- The accepted VNext arithmetic engine is the single pricing authority for the
  phone operator, widget, and authenticated owner flow.
- No LLM, browser code, voice prompt, or booking code calculates or alters a
  price. The AI can only gather inputs and call the server-side engine.
- Owner-approved price-book values are the only Class 1 rates. Missing,
  inactive, stale, ambiguous, unsupported, or unapproved pricing fails closed
  to owner review.
- Money remains exact integer cents internally. Customer payloads never expose
  rates, costs, line items, markup, margin, or private price-book rules.
- Supported selected work can be priced while separately declared additional
  work is retained for an on-site estimate. No combined total may imply that
  the separate work was priced.
- Missing measurements or uncertainty about the selected priced work blocks a
  released price. No channel may invent measurements.
- The phone and widget must receive the same result for the same tenant,
  approved book revision, service, inputs, and fee choices.
- Every issued result must remain traceable to the exact request, price-book
  revision, approval state, engine result, and persisted record.

## Protected project decisions

- Preserve the original 459-line `specs/voice_quote_flows.md`. Implementation
  must reconcile runtime behavior around it; editing it requires a demonstrated
  conflict and explicit owner approval.
- Preserve the owner-authoritative master toggle: ON means the AI answers every
  inbound business call; OFF means the business line handles calls normally.
- No call audio is recorded or stored. Store transcripts only.
- The voice model never receives raw price-book rates.
- Plan gating remains outside the engine.
- Every tenant-data query is scoped by the authenticated/resolved owner.
- Provider purchases, live calls, calendar writes, messages, billing changes,
  deployments, and production-data changes require their own verified release
  gate; local implementation work does not authorize them.

## Parallel ownership

Backend/operator lane owns `server/**`, database migrations, server integration
tests, provider adapters, and the shared quote/booking tool contracts.

Widget/customer-experience lane owns `client/**` and consumes the server
contracts. It must not perform pricing arithmetic or infer a successful booking
without a confirmed server response.

Both lanes start from the bound base commit and work in separate branches or
worktrees. Shared dependency or root configuration changes are coordinated
before merge.

## Required release evidence

Launch is not complete until evidence covers all of the following from the
exact release commit:

1. The complete hand-calculated and adversarial engine suites pass.
2. Public, authenticated, and voice requests produce identical sanitized quote
   results for identical inputs.
3. Missing, malformed, contradictory, unknown, unsupported, or unapproved
   inputs cannot release an amount.
4. Concurrent booking attempts cannot double-book a slot; retries return the
   original booking and changed-payload retries conflict.
5. A real phone call completes service confirmation, required questions,
   numeric read-back, quote/review behavior, explicit slot confirmation,
   booking, transcript persistence, and safe failure fallback.
6. The production widget completes quote/review, follow-up, and booking paths
   on mobile and desktop without receiving private pricing data.
7. Authentication, subscription state, provider provisioning, rate limits,
   webhook signatures, tenant isolation, and secret handling pass negative
   tests.
8. The built and deployed release commit passes health, persistence,
   backup/restore, provider sandbox, and end-to-end smoke tests.

## Change reporting

Every implementation report must state what changed, why it changed, the exact
tests run and their results, remaining risks, and whether any provider or
production state was touched. Passing a component test is not a claim that the
whole product is ready.
