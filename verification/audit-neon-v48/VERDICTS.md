# Neon audit of v48 — verdicts and repairs (November 25, 2026)

Every Part 1 item was checked against the code and, where it affects a quote,
reproduced with the real engine before any change. Repairs are one commit
each, with a test in `test/audit-neon-v48/` (expected values written before
the run), and engine version v49.

## Part 1

| # | Verdict | Action |
|---|---|---|
| 1 | **Confirmed — my regression** (audit f1501ff #3 left flashing for the site, so every such roof became PARTIAL with no total) | Fixed: written exclusion only; the 18 frozen roofs return to their f1501ff results |
| 2 | **Confirmed** (per-item/per-foot repairs required square feet) | Fixed: area not required. Kept: an area the caller gives over the owner's largest repair still goes to review (deliberate Oct 16 rule) |
| 3 | **Confirmed** (interview saved 15% as 15). Real over-quote only up to the engine bound (≤5% compaction = up to 6× gravel) | Fixed: converted to a fraction once when a draft becomes the price book; over 100% refused |
| 4 | **Mostly per spec**: platform spec §4.6 excludes open-key fields from AI starter drafts ("stay empty and appear in NEEDS PRICING"). Sod pallet size 0 accepted is real but only shows NEEDS PRICING | Not changed |
| 5 | **Confirmed** (owner preview lacked postal code and work month). Owner-only screen | Fixed: one shared rule (`server/customerContextFields.js`) |
| 6 | **Confirmed for several wall colors** (ceiling pooled into "wall color 1") | Fixed: ceiling in its own cans when walls have several colors; one color unchanged |
| 7 | **Confirmed** (withheld caller ID: QUOTE_BOUNDARY_FAILED) | Fixed: getQuote asks for a callback number (`callbackPhone`) |
| 8 | **Confirmed** (PST/QST/RST refused) | Fixed: PST, QST, RST, TPS, TVQ recognized |
| 9 | **Fence part not reproduced**: removal gets the busy-season charge through its labor share (10% x 60% x 4900 = 294). Subfloor allowance has no labor share, so no charge, by design | Not changed |
| 10 | **Confirmed** (thickened edge along the foundation) | Fixed: free edges only |
| 11 | **Not reproduced**: the bare-ground gap is listed in the owner's scope coverage; the help text owners see (`priceBookCopy.js`) is correct; the quoted text is an unused copy | Not changed |
| 12 | **Confirmed** (blank gate-corner answer refused a closed yard with a shape error) | Fixed: asked when it breaks the run; working layouts unchanged |
| 13 | Real but minor (low end of the range only, for an unusual tax setup) | Not changed |
| 14 | **Confirmed** (blank booking postal code skipped the tax check) | Fixed for location-taxed quotes only |
| 15 | Real, cosmetic (duplicate primer/prep lines; rounding at most a cent) | Not changed |
| 16 | Real, cosmetic | Not changed |

## Part 2 (judged by impact; not reproduced line by line)

- **BC/MB dual tax:** BC's default (contractor pays PST on materials, charges
  5% GST) is the engine's prefill. The customer-pays-PST exception exists but
  is niche. Not a launch issue.
- **Per-service tax mode, Lloydminster/Flin Flon, SK yard care, metric
  gravel/soil/mulch, standing-seam bundles, repair disposal, carpet ordered
  yardage, open siding types, curb-bagged cleanup, mulch overage on stated
  yards, plant categories:** new features or edge cases. After launch.
