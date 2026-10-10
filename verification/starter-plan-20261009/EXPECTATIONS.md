# Handwritten expectations — before running the new regressions

Base: be473b6542c498a6e96b056b5be2c3d59d9e4055.
Synthetic accounts and fake providers only. These expected amounts are literal,
independently written values, not derived from the implementation under test.

| Plan | Monthly cents | Annual cents | Monthly minutes | One extra minute | 71 extra | 72 extra |
|---|---:|---:|---:|---:|---:|---:|
| Starter | 6900 | 69000 | 150 | 35 | 2485 | 2520 |
| Operator | 11900 | 119000 | 300 | 35 | 2485 | 2520 |
| QuoteDone | 27900 | 279000 | 1200 | 35 | 2485 | 2520 |

| From | To | Monthly difference cents | Annual difference cents |
|---|---|---:|---:|
| Starter | Starter | 0 | 0 |
| Starter | Operator | 5000 | 50000 |
| Starter | QuoteDone | 21000 | 210000 |
| Operator | Starter | -5000 | -50000 |
| Operator | Operator | 0 | 0 |
| Operator | QuoteDone | 16000 | 160000 |
| QuoteDone | Starter | -21000 | -210000 |
| QuoteDone | Operator | -16000 | -160000 |
| QuoteDone | QuoteDone | 0 | 0 |

Differences describe recurring subscription prices, not a promise of a mid-cycle
credit or charge. Stripe's verified subscription/invoice events remain authoritative.
At 300 used minutes Starter overage is 5250 cents: Operator saves 250 cents monthly.
At 1200 used minutes Starter overage is 36750 cents: QuoteDone saves 15750 cents monthly.
At 1200 used minutes Operator overage is 31500 cents: QuoteDone saves 15500 cents monthly.
Annual savings use the annual recurring price difference divided across twelve monthly
allowances, rounding the resulting savings down to a whole cent (Starter→Operator at
300 minutes: 1083 cents; Operator→QuoteDone at 1200 minutes: 18166 cents).

Each selected plan gets the existing 14-day trial and 60 confirmed-minute cap, with
no trial overage. Paid warnings at 60, 30 and 0 remaining; trial warnings at 30 and 0.
For each paid plan, 71 extra minutes creates no invoice; 72 creates exactly 2520 cents.
Unconfirmed duration is not included. Fallback and spam calls remain zero.

Starter can answer and use listed prices, capture requests and owner alerts, but
cannot call booking/transfer tools or price-book tools. No provider calls or new
booking records on any denied path. Operator can quote in the website widget and
use booking/transfer, but cannot price-book quote on the phone. QuoteDone can do both.
Plan changes take effect from the current verified account, including mid-call.
All stored price books, widget keys/settings, calendar connections and appointments
survive a downgrade; upgrading restores access. Releases/status reads remain available.
Starter staff logins are refused while the owner's login remains available.

The existing independent concrete patio fixture, with tiers removed, remains
353889 cents (customer result $3538.89) for both Operator widget and QuoteDone phone.
Existing engine reference totals remain byte-for-byte unchanged; no arithmetic edits.

Production Stripe billing requires six distinct plan Price IDs, including
STRIPE_STARTER_MONTHLY_PRICE_ID and STRIPE_STARTER_ANNUAL_PRICE_ID. Both templates
and Railway setup must name the new IDs. No real Stripe configuration is changed.
