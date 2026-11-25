# Neon re-audit of v49 — verdicts and repairs (November 25, 2026)

Every item was checked against the code and reproduced with the real engine,
voice runtime or booking service before any change. Repairs are one commit
each, with a test in `test/audit-neon-v49/` (expected values written before
the run), and engine version v50.

| # | Verdict | Action |
|---|---|---|
| NEW-1 | **Confirmed — my v49 regression** ("undefined affected square feet" on per-foot / per-item repairs) | Fixed: the driver is "100 linear feet" / "3 items". New harness rule CUSTOMER_TEXT found it on its own before the fix |
| NEW-2 | **Confirmed** (withheld caller: booking 400). **Also found:** no caller could reschedule in the same call (booking handle carried the lead's customer id) | Fixed: withheld caller books with the lead's callback number, or is asked for one; same-call reschedule works. Kept: caller ID stays the identity for callers with a number; a withheld caller cannot change a booking by phone (booking-service security check) |
| NEW-3 | **Confirmed — my v49 incomplete fix** (callback question lost the scope token; quote not linked to a customer) | Fixed |
| NEW-4 | **Confirmed** (availability offered dates confirm then refused) | Fixed: availability offers only dates the quote price holds for; none left gives confirm's own reason. Site visits unchanged |
| NEW-5 | **Confirmed — my v49 incomplete fix** (outline, narrow walkway, L-corner) | Fixed: adjoining length matched to a run of connected edges; band along free edges only; partial edges keep the v49 formula |
| NEW-6 | **Not a bug.** The editor tells owners to use one purchase group "only for the exact same product and variant", so walls and ceiling in one group are the same paint and color and share cans (deliberate core 4 rule, October 5). A ceiling in another color goes in its own group and gets its own cans | A change to always separate them was made, failed core 4 in the v50 full gate, and was reverted. Verdict test added |
| NEW-7 | **Matches the engine spec** (`quote_engine_v2.md` line 1184: bagging = area labor x percent) and the owner help text says so | Not changed. Owner ruling requested |
| NEW-8 | **Confirmed — my v49 incomplete fix** (business-rate quotes whose rate depends on the address) | Fixed: code required when tax follows job location or the business is Canadian |
| NEW-9 | **Confirmed — my v49 incomplete fix** (prompt still demanded an area) | Fixed |
| NEW-10 | **Confirmed** (interview allowed 51-100% for 50% fields) | Fixed: per-field limit |
| Note | "GST & PST" with an ampersand refused | Fixed |

## Why v49 caused regressions

The consistency harness compared statuses and prices only; it never read the
words a customer sees, and the phone tests stopped at the quote. Added in this
round: harness rule CUSTOMER_TEXT (no undefined / NaN / null in any customer
text), and an end-to-end phone fixture (`test/audit-neon-v49/voiceCallFixture.mjs`)
that runs quote -> lead -> availability -> book -> change in one call.

## Expectations of mine that were wrong (corrected in the tests)

- NEW-6: I adopted the proposed fix without checking the owner-facing
  purchase-group rule; the full gate caught it and the change was reverted.

- NEW-1: the area-priced check first used a fixture that never reaches the
  per-unit code.
- NEW-2: a same-call change for a withheld caller was expected to work; the
  booking service requires the caller ID, so it was replaced by the
  caller-with-a-number case (which was broken).
- NEW-4: the first date window passed before the fix (10-time cap filled
  with June); narrowed.
- NEW-5: the L outline with 10 ft adjoining also fits the inside corner of
  the L; band 29, not 28.

## Tests changed because the behavior changed on purpose

- `test/travelZones20261020.spec.mjs` Season booking month 7: refusal now at
  availability (same code and message).
- `test/audit-neon-v48/item14BookingPostalCode.spec.mjs`: a Canadian
  location-taxed business-rate quote now needs the code.
- `test/audit-neon-v48/item03InterviewPercents.spec.mjs`: message "0 to 50".
