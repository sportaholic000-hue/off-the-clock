# Synthetic booking expectations written before execution

Pinned baseline: 73c00622d6f2df31f57773b32e41355a7421f1a3.
No real calendar, tenant, message, payment or deployment.

Governing rules: platform_spec_v2.md sections 6.7 (working hours), 12.3
(slot locking), 12.8 (owner timezone, UTC storage). User acceptance adds
concurrent callers, expiry, retry integrity, failure visibility and tenant isolation.

- Two independent callers requesting the same slot concurrently: one hold;
  one confirmed appointment; one provider event; one booked outbox event.
- Hold: valid through 299,999 ms; expired at 300,000 ms. At expiry another
  caller can hold the slot. The old caller cannot confirm it.
- Same request/key: same receipt and no second write. Changed payload/key
  collision: conflict. Different keys cannot book the same intent twice.
- Known provider rejection: visible failed appointment, no provider event,
  zero confirmed dashboard bookings. Lost response after successful provider
  write: visible pending appointment, slot retained, recovered once by event ID.
- Pending or failing late create response cannot demote an appointment already
  confirmed by an independent lookup. A late successful create response cannot
  resurrect an appointment already reconciled as cancelled.
- A slot starting 12:00 UTC cannot be newly confirmed at 12:01 UTC, even if
  its five-minute hold has not expired. A slow busy read must recheck this.
- Moncton 2026-03-08 01:00 is 05:00 UTC. Two elapsed hours end at 04:00 ADT,
  beyond an 01:00–03:00 window: zero two-hour slots fit that window.
- Moncton 2026-11-01 00:00–02:00 lasts three elapsed hours. Two-hour slots
  at a 60-minute increment start 03:00 UTC (00:00 ADT) and 04:00 UTC
  (01:00 ADT), ending 05:00 and 06:00 UTC respectively. Exactly two slots.
- Moncton 09:00 on March 7 is 13:00 UTC / 05:00 Los Angeles;
  March 8 is 12:00 UTC / 05:00 Los Angeles. November 1 09:00 AST is
  13:00 UTC / 05:00 Los Angeles. Both repeated 01:30 times on November 1
  must have distinct UTC instants and explicit offsets.
- Tenant B cannot use tenant A's intent, hold, slot or confirmation handle,
  or see A's appointments/contacts/provider events in owner reads.
- Every confirmed booking contributes exactly one to that owner's dashboard,
  appears in the owner's calendar and call detail where call-linked, and has
  the exact same UTC start/end in the fake provider calendar.

Source hypotheses are not findings until their corresponding execution fails.

Before B04 execution: if the owner disables booking or changes availability
while confirmation's free/busy read is pending, the old slot must fail with
SCHEDULE_CHANGED before creating a provider event. Existing revision validation
must also run after the asynchronous read.

DST repair controls before execution: a Sunday 01:00–02:30 window on
March 8 must still admit 01:00–01:30 (05:00–05:30 UTC), despite its nonexistent
closing wall time. A 75-minute job cannot fit a November 1 01:30–01:45 window:
crossing the repeated hour would include closed local times. These controls
must prevent the DST repair from trading one boundary error for another.
