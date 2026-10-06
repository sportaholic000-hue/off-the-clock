# Synthetic backup/restore rehearsal: expectations written before execution

Base: `73c00622d6f2df31f57773b32e41355a7421f1a3`.

- Mowing: 5,000 square feet × $0.02 = **$100.00**. Maintained grass,
  weekly service, no clippings/edging, zero minimum, markup, fees, tax,
  seasonal surcharge and range buffer. Low, middle and high are all $100.00.
  Restart and restore must preserve this result and the exact original receipt.
- A request explicitly asking for review produces a lead and **no dollar total**.
- The booking has no deposit or additional price; it must preserve the quoted
  $100.00 without calculating or collecting another amount.
- Missing, corrupt or unconfirmed saved pricing must never authorize a new
  dollar estimate. Historical request retries still return their original
  $100.00 receipt; they are retrievals, not new calculations.
- A snapshot is complete only if every owner in the durable price-book creation
  ledger has its saved book. An unconfirmed save must never become approved/live
  simply because a backup omitted its pause marker. Invalid snapshots must not
  replace the last accepted snapshot or publish a restore directory.

Only disposable synthetic owners/data, temporary volume and independent temporary
archive. Real production startup, HTTP routes, SQLite, backup and restore CLIs;
calendar provider replaced with a local deterministic stub. Synthetic paid
entitlement and calendar configuration are fixture setup, not billing or OAuth
verification. All real provider switches remain off.
