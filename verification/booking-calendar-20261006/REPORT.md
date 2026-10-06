# Booking/calendar repair verification — October 6

Branch `fix/booking-calendar-20261006`, pinned base
`73c00622d6f2df31f57773b32e41355a7421f1a3`. No subagents, main merge,
deployment, live data or real calendar accounts. All provider requests in
application tests terminate at a synthetic, tenant-scoped fake provider.

## Confirmed defects and changes

| ID | Source evidence at pinned base | Failing execution before repair | Repair |
|---|---|---|---|
| B01 | calendarTime.js computed local start + duration for its loop, then added elapsed duration in UTC | Spring-forward 01:00–03:00 offered a two-hour job ending04:00; fall-back00:00–02:00 omitted the valid04:00 UTC start | Validate occupied elapsed time against owner-local working hours, including both sides of a clock transition |
| B02 | bookingService.js finalizers unconditionally replaced appointment/hold state | Late pending or rejection demoted a confirmed booking; late success resurrected a provider-cancelled one | Transactional terminal-state fencing; preserve reconciled state, receipts and single outbox event |
| B03 | validateConfirmation checked hold expiry but not whether the selected start/notice boundary had passed | A12:00 UTC slot confirmed at12:01, both while held and after a slow free/busy read | Check the current start/notice boundary before and after asynchronous preparation |
| B04 | Confirmation carried its original policy snapshot across the async free/busy read | Disabling owner booking during that read still created an event | Revalidate current intent, revision, settings, time and service area in the transaction claiming the provider write |

[BASELINE_SOURCE.txt](BASELINE_SOURCE.txt) preserves the source excerpts;
[baseline-reproductions.tap](baseline-reproductions.tap) records all seven initial
failing executions. B04 is separately reproduced in
[expanded-before.tap](expanded-before.tap):21 controls passed, B04 failed.
[EXPECTATIONS.md](EXPECTATIONS.md) was written before experiments.

The first DST repair failed two additional boundary controls, recorded in
[dst-repair-controls-before.tap](dst-repair-controls-before.tap). The completed
repair preserves valid short appointments when a closing wall time is skipped,
and rejects appointments spanning closed portions of a repeated hour. An
existing restart test also caught an acknowledgement regression in the first
terminal-fencing attempt; the code was corrected, without changing that test.
Initial fixture setup failures are kept distinct from product findings.

## Executed acceptance coverage

- Independent SQLite worker threads race on the same file: exactly one hold,
  appointment, fake provider event and booked outbox event. Concurrent real
  HTTP requests independently verify the same outcome using the real server.
- Hold boundary299999/300000/300001ms, expiry release and old-hold rejection.
- Exact/changed retries, independent service instances, process/store restart,
  alternate keys and one appointment per intent.
- Known free/busy/create rejection, response loss, lookup outage and local
  finalization rollback: durable owner-visible records; ambiguous writes retain
  their slot and reconcile once using the same provider event ID.
- America/Moncton UTC and Los Angeles conversions before/after spring DST,
  autumn DST, missing/repeated times, working-window and elapsed-duration bounds.
- Cross-tenant intent/hold/slot/confirmation tests and actual authenticated
  calendar, dashboard and call-detail routes, including forged owner filters.
- Confirmed appointments appear in owner dashboard counts, calendar schedule,
  call-linked detail and the fake provider calendar with identical UTC bounds.
- A real-browser regression uses the unchanged customer widget, dashboard and
  owner Calendar against the real synthetic server, with a Los Angeles browser.
  The widget explicitly displays business-local Moncton times; it does not
  silently substitute the browser timezone.

Google's official event creation documentation confirms caller-supplied event
IDs support duplicate-safe retry after a lost response:
https://developers.google.com/workspace/calendar/api/guides/create-events .
The production adapter is exercised through fake fetch, not replaced in the
real-server tests. No provider network fallback exists in that fixture.

## Verification status at source checkpoint

- Targeted existing/new booking, calendar, adapter, route and preference checks:
  **122/122**, zero failures/skips.
- New actual-server acceptance tests: **2/2**, zero failures/skips.
- Local browser acceptance: Chromium fails during launch with SIGTRAP; retained
  in [browser-local.tap](browser-local.tap). No skip or gate relaxation added.
- Cold build, full suite, strict quote suite and hosted result: pending at this
  checkpoint. This report will be updated with final counts and exact revision.

CI only adds this exact branch to its push triggers; checks are unchanged.
No schema migration or pricing arithmetic change is required.
