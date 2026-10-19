# Expected behavior, recorded before the repair

Base: `c1817621f6eccb31822979bf994efc4902682d34`.

The caller confirms quantity, not the applicability of a price condition. The
five reported prefixes, logical/temporal/payment/eligibility conditions, and
unclassified qualification language must return the unchanged `needs_review`
verbatim-listing fallback. No extended amount, currency or calculated speech
may be released. A condition following the amount or in another sentence of
the same saved paragraph must also prevent multiplication.

Direct parser tests and the real dispatcher/runtime must agree. The dispatcher
must load the saved owner's knowledge, refuse foreign/changed listings, reject
draft prices and require confirmation. It must not write business data merely
to calculate or refuse a listed price.

Hand-calculated positive controls:

| Saved unit price | Confirmed quantity | Expected amount | Rounding wording |
| --- | --- | --- | --- |
| $10 each | 3 | $30.00 | Absent |
| $2.50 / linear foot | 120 | $300.00 | Absent |
| CAD 0.035 / linear foot | 3 | CAD 0.11 | Present |
| $0.025 each | 1 | $0.03 | Present |
| $0.004 each | 1 | $0.00 | Present |
| $1.25 each | 2.5 | $3.13 | Present |
| $1.000000 each | 3 | $3.00 | Absent |
| $1,234.50 each | 2 | $2,469.00 | Absent |
| EUR 2.50 each | 4 | EUR 10.00 | Absent |
| $1.20 / square foot | 500 | $600.00 | Absent |

Product dimensions (`2x4`, `2×4`), grade numbers (`Grade 2`), fractional-inch
names (`3/4 inch`) and number designators (`#2`) retain their existing meaning.
Other numeric qualifiers, tiers, multiple prices, composite unit bases and
ambiguous quantity text remain refused. Calculating a listed amount does not
add tax, fees or discounts.

The voice-prefixed regression filename must be selected by the existing full
suite and excluded from the strict quote suite. No selector changes are needed.
