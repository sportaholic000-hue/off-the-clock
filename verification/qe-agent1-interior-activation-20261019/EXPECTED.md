# PI-00 independent expectations (written before execution)

Base: e50c9f58459a4362537eb5da5dc1cf082fbc3ca8. Evidence reviewed:
9c69eead93a58dbf31ccf64e1f16598055af58c1 (A3's actual HTTP activation probe).
Synthetic data only; personal work, no subagents.

The existing installed interior fixture charges 600 cents per measured wall
sqft, 300 cents per ceiling sqft, and 200 cents per trim LF. Its job is 500
wall sqft, 200 ceiling sqft, 100 trim LF, standard height, no fees, tax, peak
surcharge, markup or positive minimum. Each installed line uses its quantity
once: walls 300000 cents, ceilings 60000 cents, trim 20000 cents. Thus:

| Selected scope | Expected cents |
| --- | ---: |
| Walls | 300000 |
| Walls + ceilings | 360000 |
| Walls + trim | 320000 |
| Walls + ceilings + trim (original fixture) | 380000 |

Installed trim descriptions remain opaque text. Missing optional structured
trim coat/condition details impose no equality constraint. They must never be
filled by reading the description. Supplied customer coats must still be whole
1–3, and conditions good/fair/poor. Explicit owner trim coats/condition must
match independently: mismatch in either field rejects without a quote amount.
Customer answers remain in submitted scope; installed pricing does not gain
an extra coat or preparation charge.

Unselected optional prices do not block complete walls. Selecting missing
ceiling/trim pricing must review without a subtotal. Missing wall price blocks
the service. Invalid saved details remain invalid. A complete tier must survive
an incompatible tier without quoting the incompatible option.

Before repair, a real save, explicit starting-value confirmations and approval
of the original full offering should reproduce current approval with NEEDS
PRICING and both trim activation errors, omitted from the public catalog.
After repair the identical book and approval should be QUOTING LIVE, without
any receipt rewrite or new inferred settings. Unapproved/stale approvals still
prevent quoting until explicit owner approval. Ordinary configuration edits
still invalidate approval.

This eligibility/validation correction changes no previously valid amount or
arithmetic. As in specs/QUOTE_REAUDIT_REPAIRS_20261006.md (Scope and policy),
retain v12; no automatic approval renewal. Capture genuine v12 saved widget
and voice receipts on the pristine starting server, then replay identical
amounts, wording and durable rows after repair. F2 remains outside scope.
