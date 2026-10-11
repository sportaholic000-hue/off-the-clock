# Expected results written before wording experiments — 2026-10-11

Owner approval in this task governs wording; platform specification §§6.3, 8,
12.5 and 12.11 govern the existing price-book and billing surfaces.

- Billing trial ends at 2026-10-25T01:30:00.000Z: UTC displays `Oct 25, 2026`;
  America/Los_Angeles displays `Oct 24, 2026`; Asia/Tokyo displays `Oct 25, 2026`.
  The business timezone comes from the existing onboarding account, as on
  owner call/calendar screens; unset/invalid timezone falls back to UTC.
  At 2026-10-11T01:30:00.000Z, Days left is exactly `14` in every timezone.
- A trial with one unconfirmed 125-second call shows 0 of 60 minutes and one
  pending call. Completion uses the existing meter: ceil(125/60) = 3 used,
  57 left and $0.00 overage. Paid Operator 302 minutes = 2 × $0.35 = $0.70.
- Price-book preview, active and trial Operator, QuoteDone and legacy Scale:
  all three approved customer-gets strings appear; none of the old strings
  appear. The actual editor button remains `Save & validate`.
- Fallback dashboard, active and trial Starter: only the existing calls and
  delivered-quotes placeholder cards remain. Operator: four cards, live service
  caption names the widget. QuoteDone/Scale: four cards, existing call caption.
  No stored or preview activity is supplied for these tests.
- Setup ANSWERING STATUS: unchanged first sentence on all four plans, followed
  by exactly the approved plan-specific sentence(s); trials follow their plan.
- Existing saved quote counters, local-only preview fixtures and
  planDescriptions.js remain unchanged. Counter meanings are reported only.
- All required standalone files and both full gates must complete with zero
  failures/skips/cancellations/TODOs on hosted Node 22. Local Chromium launch
  failures are environment limitations, with hosted browser evidence required.
- The owner-query and tenant route/middleware inventories remain strict.
- The Docker proof must exercise the existing Railway restart/restore script,
  as well as the existing voice-enabled synthetic smoke. No live providers.

Do not tag until the final report commit passes all required hosted checks.
