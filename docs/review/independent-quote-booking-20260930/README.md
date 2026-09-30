# Independent quote-to-booking findings — September 30, 2026

**Two booking reliability failures remain at saved PR #3 source `1013190bd8e62e5df3aa70750399873bc050e447`. No full launch gate has passed.** This inspection changed no application, engine, calendar adapter, voice or price-book implementation. The owner has deferred business-email setup until confident in the core product. Voice and ON/OFF remain Claude's lane; the engine/calendar agent received these findings.

## P1 — Restart before provider write strands a booking and blocks the time

Trigger: confirmation durably records an appointment in `PENDING_PROVIDER` and a `202` idempotency receipt, then the process dies during its free/busy check, before any provider event POST. This is a real isolated process termination at an inspection-only barrier, not a fabricated database row.

After restart, the exact confirmation retry returns the stored `PENDING_CONFIRMATION` receipt. All three status polls remain pending; the appointment is still `PENDING_PROVIDER`, its intended provider event is absent, zero provider writes occurred, and another booking intent cannot obtain the original interval. This reproduced in two fresh stores.

The saved implementation returns an existing receipt before reentering the provider-write path (`server/src/bookingService.js:751`). Its poll performs event lookup and returns pending when no event is found (`server/src/bookingService.js:943`), without retrying the missing operation or entering a terminal failure. Pending appointments continue to block availability and holds (`server/src/bookingService.js:461`). There is no startup recovery worker for this path in the inspected server.

Required repair: durable recovery of the provider operation using its deterministic event identity, with truthful pending/confirmed/failure transitions and safe handling of ambiguous writes. A missing acknowledgement alone must never release a time if a real provider event may still exist. Verify interruption before write, after write/before acknowledgement, during reconciliation and after confirmation, across restart and concurrent retries.

## P2 — Reusing a confirmed booking context creates a second appointment for the same job

Trigger: confirm an installed fence job; use the same quote/booking token again, select another free time and send new hold/confirmation keys. The second confirmation returns `201 CONFIRMED`. The same booking intent has two confirmed appointments at distinct times, with separate provider events. This reproduced in two fresh stores.

Exact-key retries already behave correctly. The missing protection is at the persisted quote/job intent: successful confirmation updates the appointment and hold, but leaves the intent active (`server/src/bookingService.js:729`). Later hold/confirmation checks only reject overlapping intervals, allowing another booking of the same job at a different time.

Required repair: atomically bind one active booking outcome to the job/intent while preserving safe status lookup, exact retries and explicit reschedule/cancel behavior. Test new-key repeats, simultaneous different-slot confirms, provider-pending attempts, cancelled/failed outcomes and status reconciliation. Intentional repeat service visits should use separate explicit requests; a reused fence-job context should not silently create another job booking.

## Verified controls and limits

Each valid control agreed through owner preview, authenticated calculation and public submission:

| Synthetic installed offering | Hand calculation | Observed total |
|---|---|---|
| Fence installation | 123.5 LF × $40 + one $250 gate | $5,190 |
| Fence replacement | Same fence + 17.25 removal LF × $8 | $5,328 |
| Interior painting | 177.25 wall sqft × $6 + 80.5 ceiling sqft × $3 + 17.75 trim LF × $2 | $1,340.50 |
| Exterior painting | 311.25 measured wall sqft × $6 | $1,867.50 |

The public responses omitted private pricing fields. Saved requests retained their exact inputs and approved book revision. Exact quote retry, changed signed inputs, changed approval revision, concurrent same-slot holds, explicit confirmation, scope change, foreign tenant/origin, successful booking/retry, review/site-visit distinction, policy change, new busy interval and mismatched provider-event reconciliation passed their tested scenarios.

The corrected independent run has **17 scenario groups: 15 passed, 2 failed**, repeated with the same outcomes in fresh stores. The four existing booking/service/route/preference/receipt files produced **54 passing tests**. Counts overlap and are not complete product coverage. These checks used real application HTTP and SQLite with all external provider traffic intercepted. No browser acceptance, live Google/calendar writes, phone calls, voice parity, carrier routing, production deployment, real email, billing charge or full trade accuracy is certified here. Further engine repairs were still underway during this review.

## Retained test error

The first run's privacy assertion incorrectly rejected the allowed customer-facing `priceDrivers` explanation (`Owner-defined installed offering`). It stopped the downstream booking checks. Its four false privacy failures and prerequisite failure are **review-test errors, not product findings**. The correction allows plain customer explanation text and keeps private rates, costs, line items, markup, book snapshots and pricing configuration forbidden. Expected arithmetic did not change. The original result and original/final review-code hashes are retained.

## Evidence

- [Corrected run](run-02-RESULTS.json) and [fresh-store repeat](run-03-RESULTS.json).
- [Initial invalid run](run-01-RESULTS.json), [original review-code binding](REVIEW_CODE_BINDING.json) and [final review-code binding](FINAL_REVIEW_CODE_BINDING.json).
- [Existing 54-test booking regression](BOOKING_REGRESSION.json).
- [244-file source binding](SOURCE_BINDING.json) and [post-inspection unchanged-source verification](SOURCE_AFTER_REVIEW.json). The snapshot selects the required application, test, configuration, specification and verification files; dependency/runtime junctions are separate. This is not a claim that every repository file was re-audited.
- [Expected outcomes written before execution](../../../verification/inspection/EXPECTATIONS.md), [independent runner](../../../verification/inspection/quote-booking-review.mjs), [inspection-only crash barrier](../../../verification/inspection/provider-boundary.mjs).

GitHub receives source/test code, hashes and sanitized outcomes only. Full synthetic local HTTP logs, tokens, provider fixture data and isolated databases are retained locally and excluded from publication. The saved source—not the peer's evolving working copy—is the tested target.
