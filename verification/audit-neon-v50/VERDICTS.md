# Neon audit of v50 — verdicts and repairs (November 26, 2026)

Neon audited `0d9426a4`. Every item was reproduced on `0ffa6b0b` before any
change; one commit each with a test written first (`test/audit-neon-v50/`);
engine version v51.

Note on Neon's scorecard: "NEW-6 Fixed" describes my change that was
reverted after it (`c045629c`): walls and ceiling in one purchase group are,
by the price book's own instruction, the same product and color and share
cans. A differently colored ceiling goes in its own group.

| # | Verdict | Action |
|---|---|---|
| V50-1 | **Confirmed** (a reschedule moved a job into the busy season or winter period at the old price) | Fixed: reschedule availability runs the same date filter under the booked option; the phone reschedule re-checks the held time. Done outside `bookingService.js`, which is pinned byte-identical (my first attempt edited it; the pin test failed; moved) |
| V50-2 | **Confirmed** (one-option quotes could not be booked as a job, web or phone) | Fixed: with no option sent and one allowed, that option is used (booking boundary); the phone asks only with 2+ options |
| V50-3 | **Confirmed** ((506) 555-0123 accepted by the quote form, refused by booking; web quote unlinked) | Fixed: widget sends +1 form; web quote links by it for CA/US businesses. Routes file pinned, so the fix is in the widget |
| V50-4 | **Confirmed — my v50 incomplete fix** (float edge lengths; narrow slab against a wall thickened through; all-sides strip) | Fixed: exact lengths, a run may be every edge, narrow shortcut only with nothing adjoining |
| V50-5 | **Confirmed** (any "not"/"no" in "yes, that's me…" denied identity) | Fixed: denial = starts with a negation, explicit identity denial, or a standalone no; idioms excluded; unsure still reveals nothing |
| V50-6 | **Confirmed — my v49 incomplete fix** (area questions still shown/asked on per-foot and per-item repairs) | Fixed: new field property `hiddenWhen`, honored by the shared visibility check and the phone question list |
| V50-7 | **Confirmed** (recoverable booking refusals became a generic tool failure on the phone) | Fixed: answered as status unavailable with what to do next |
| NEW-7 | Owner ruling still pending (spec line 1184) | Not changed |

Tests changed on purpose: `test/audit-neon-v49/new04AvailabilityBookingTerms.spec.mjs`
(the refusal is now an answer, not a thrown error).
