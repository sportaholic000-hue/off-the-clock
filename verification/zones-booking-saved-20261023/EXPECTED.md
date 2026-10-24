# Saved travel-zone booking expectations

Written before test execution. Base: 4afd8df19a7620a9100402fdff476edaf0101545.
Synthetic quote-time owner inputs: Core E2L/E2M = 0 cents; Outer E2H/E2J = 3500 cents.

Each row must run through both the public widget HTTP booking routes and the phone tool runtime.
Allowed means availability, hold and confirmation succeed with exactly one appointment/provider event.
Refused means REQUOTE_REQUIRED with the existing new-quote wording and zero appointments/provider events.

| Quoted postal code | Later owner change | Booking postal code | Expected |
| --- | --- | --- | --- |
| E2J 2A1 | Outer raised to 4000 cents | E2J 2A1 | Allowed |
| E2J 2A1 | All zones deleted | E2J 2A1 | Allowed |
| E2L 4L1 | E2J moved into Core | E2J 2A1 | Refused |
| E2L 4L1 | None | E2L 4L2 | Allowed |
| E2L 4L1 | None | E2M 1A1 | Allowed |
| E2L 4L1 | None | E2J 2A1 | Refused |
| E2L 4L1 | None | E3B 5A3 | Refused |
| E2J 2A1 | None | E2H 1A1 | Allowed |
| E2J 2A1 | None | E2L 4L1 | Refused |
| E2J 2A1 | None | E3B 5A3 | Refused |
| No zones when quoted | None | E3B 5A3 | Allowed |

The saved quote JSON must remain byte-identical across owner edits and booking.
The booking location check must never load the current price book.
Saved Core pricing still applies after current Core becomes 3500 cents; saved Outer
does not permit Core even if current Core becomes 3500 cents. Deleted current zones
do not invalidate saved Outer. Missing postal/no applied zone charge/legacy quote
controls retain their previous behavior.

Unchanged quote expectations: Core 10500 cents, Outer 14000 cents, Maine 15000 cents,
no zones 13000 cents; weekly Outer 12500 cents per visit and first visit 15500 cents.
All original quote-side assertions remain unchanged. No new customer or owner wording.
