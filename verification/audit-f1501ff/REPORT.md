# Audit f1501ff — repairs and open rulings (November 24, 2026)

Branch `quote-engine`. Engine `quote-engine-vnext-accuracy-20261125-v49`.
Every fix was reproduced before it was changed, has a test in
`test/audit-f1501ff/` with expected values written before the run, and is its
own commit.

## How regressions are now caught

`test/invariants/` (runs inside `npm run test:quote`): from 50 live base
services, every price is removed and set to $0 one at a time (1,600
outcomes). Readiness must agree with the real quote, owner preview with the
customer path, and nothing may throw. Every outcome is frozen; any change fails
the gate until it is recorded with a reason in `test/invariants/CHANGES.md`.

Proof it works: on untouched f1501ff it found 42 readiness crashes (#1), 18
silent fence-catalog holds (#4, wider than reported) and the #6 customer
refusal by itself. The engine fingerprint corpus (1,267 frozen jobs) was also
diffed against f1501ff: only 18 jobs changed, all by the intended #3
disclosure; no total and no ready/held result changed.

## Fixed

| Item | Fix |
|---|---|
| #1 critical | Unfinished or overlapping fence rows no longer crash readiness; each service is isolated; a book whose readiness throws is refused before it is written |
| #3 | Roof quotes say "Not included; confirmed and priced on site: flashing and vents" when the base wording excludes them |
| #4 | Fence catalogs: coverage per fence type and height row; same sample jobs as a single fence; withheld rows named on the owner screen. Correction: removal is a yes/no answer, so this is disclosure, not a block |
| #5a | Travel rule read from the service |
| #5b | Concrete base-included labor share is a per-condition notice |
| #5c | Overlay readiness answers the floor-sound question |
| #5d | Included $0 prices found in fence catalog rows |
| #5e | Low-slope roofs with roll underlayment are tested |
| #6 | Not-sure pitch with a band or rise reaches the customer |
| #7 | Tree-shaped fields typed JSON (rule tested for every field) |
| #11 | Empty short-load band list is no band list |
| #12 (part) | A repair's own $0 unit price/minimum needs a classification; $0 low-slope prices can be marked included |
| #13 | Unselected optional-item quantities are listed as not included (price as before, per spec STEP 2b); the widget clears unticked quantities |
| #15 (part) | Leveling disclosure; repair dimensions no longer list the hidden area; concrete non-choice notices; full-clone note |
| #2 | A porch or other low section under 4/12: the form asks what covers it now (shingles / flat roofing / not sure), not its rise. Shingles: owner's low-slope method on those squares only (IRC R905.2.2; estimates charge double coverage on low squares only) |
| #8 | Installed painting uses the painter's own coats; wall and ceiling coats are not asked (trim coats until the owner sets them); the quote states the coats |
| Found by the new FORM_CANNOT_ASK rule | A fence catalog quote with no height yet crashed; it now asks for the height |

## Decided by industry standard (owner direction, November 24, 2026)

- **#10 hip roof labor: kept at 1.20.** The audit said 1.20 rests on all-in
  costs. Checked at the source: SquareDash's "Labor Per Square" table gives
  simple gable $150-175, hip $175-225 (1.23x at midpoints), complex with
  dormers $225-300 (1.62x). RoofCalc's labor figures give about 1.11x. The
  1.20 is labor-only and 1.40 for complex is conservative. Lowering it would
  under-quote hip roofs.
- **#9 vaulted rooms: dropped.** Callers cannot give gable-end and ceiling
  measurements over the phone.
- **#12 $0 add-ons, flat-roof details, disposal: unchanged.** A $0 line is
  an ordinary "included / no charge" line on contractor estimates; core
  prices already need a classification.
- **Flat roof repair $0 allowance (9 known harness findings): unchanged.**
  The quote path is safe (a medium job with a $0 allowance, or a large job
  with no largest-repair size, is held and names the field); only readiness
  is cautious. Reworking repair readiness days before launch is not worth
  the risk.
- **New line items (#3, #14): after launch.** Quotes already say what is not
  included; new lines are new scope.
- **#15 remaining (roof edge lengths, package rounding, siding trim field):
  not done.** Edge lengths are no more answerable over the phone than
  vaulted ceilings.
- **Neon #13** (tier name not passed): no behavior difference could be
  reproduced; left unchanged.

## Labels shipped without a spec label (AGENTS.md asks for owner approval)

- "What covers the low-slope part of the roof now?" — Shingles / Flat
  roofing (rolled roofing or a membrane) / Not sure.
- Quote note: "The low-slope part of the roof is priced with its low-slope
  underlayment on the basis that it has shingles now; its slope is confirmed
  on site."
- Review message: "The low-slope part of this roof has flat roofing now, so
  it needs a low-slope roof system; the business will inspect before
  quoting."
- Roof quote notes: "Not included; confirmed and priced on site: flashing and
  vents." and "Flashing and vents are included only where listed in this
  estimate. Any others, for example chimney, skylight or wall flashing, are
  confirmed and priced on site."

`specs/BUILD_STATUS.md` was not updated: AGENTS.md forbids editing /specs/
without your written approval for that file.
