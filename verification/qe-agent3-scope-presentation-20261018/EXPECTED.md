# Agent 3 scope and presentation expectations

Written before the first execution of `test/qeAgent3ScopePresentation20261018.spec.mjs`.
These are presentation-boundary oracles. They do not authorize a pricing,
selector, receipt-validation, or engine-version change.

## F6 — restoration receipts

- The restoration implementation is inherited from commit
  `8aae4f4ea90047bc0ea841853a93415f5d2ef232`, with that commit retained as a
  merge parent.
- `startingValueAdoptions` is server-owned receipt state. It must not appear as
  a row in the owner approval table.
- The existing restoration cases remain authoritative: a restored service is
  editable but receives new identity/state without inherited approval; a
  surviving service keeps its remote receipt; forged receipt fields remain
  rejected.

## F14 — roofing material wording

| Accessory mode | Dependent-line receipt | Visible material-price basis |
| --- | --- | --- |
| `per_square_allin` | unconfirmed, stale, or absent | Includes starter, drip edge, ridge cap, flashing, and vents. |
| `per_square_allin` | confirmed and exact for this product/effective price | Includes starter, drip edge, and ridge cap; excludes the separately priced flashing/vent lines. |
| `itemized` | unconfirmed, stale, or absent | Excludes starter, drip edge, and ridge cap; includes flashing and vents. |
| `itemized` | confirmed and exact for this product/effective price | Excludes starter, drip edge, ridge cap, and the separately priced flashing/vent lines. |

- The receipt decision is per product. Mixed products show their own bases.
- A tier price that differs from the receipt's exact base value uses the
  unconfirmed wording for that effective tier price.
- The guided interview, which has no saved dependent-line receipt, uses the
  same unconfirmed mode wording.

## F18 — option-specific surface scope

- With Base excluding two requested door sides and Complete charging
  `2 x 5,000c = 10,000c`, Base remains `$1,064`, Complete remains `$1,164`, and
  only Base says door sides are excluded.
- An exclusion becomes whole-quote additional work only when every available
  option excludes it. The complete option is never removed and no total across
  priced plus unpriced work is invented (`fullJobTotal` remains `null`).
- A genuine customer-declared separate job remains additional work.
- Historical false-global receipts are normalized only on a cloned customer
  presentation. The stored JSON and all option amounts remain byte-for-byte
  unchanged. Widget retry and saved-voice projection show the corrected
  per-option truth.

## F19 — mowing first visit

- For 10,000 square feet at `0.1c/sq ft`, severe first-service multiplier `2`,
  and a 10% range: Base recurring is `$9–$11` (midpoint `$10`) and Base first
  visit is `$18–$22` (midpoint `$20`).
- A Complete option at `0.2c/sq ft` is recurring `$18–$22` (midpoint `$20`)
  and first visit `$36–$44` (midpoint `$40`).
- Recurring and first-visit labels, units, tax wording, ranges, and midpoint
  labels are distinct. Maintained recurring and one-time results have no
  first-visit controls.

## Required verification

- Focused Agent 3 regression, including real Chromium rendering.
- Existing restoration regression from the inherited repair.
- Strict quote/price-book gate.
- Full test suite and existing failure checker outcome.
- Owner app/widget build.
- Hosted CI on the exact pushed branch head. Historical hosted success at
  `d4f9394a0836ad007d50b2c33d6ffe56b4e4ea03` qualifies only the independently
  checked restoration repair, not this combined branch.
