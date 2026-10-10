# Regression evidence

Exact base: `be473b6542c498a6e96b056b5be2c3d59d9e4055`.

The same 68 regression/control cases were run against base production source and the changed source. The base worktree received only these tests and the synthetic fixture price-ID additions needed to request Starter; no base production source was changed. Base rejected the new three-plan fixture configuration, which also prevents that fixture’s Operator/QuoteDone controls from reaching billing on the base. These are regression failures, not a count of separate defects.

Before: 68 total, 3 passed, 65 failed, 0 skipped. After: 68 total, 68 passed, 0 failed, 0 skipped. Full-suite final-commit counts are reported separately.

| Test | Base | Changed source |
|---|---|---|
| Starter signup → verified trialing → correct onboarding access | FAIL | PASS |
| Starter signup → verified active → correct onboarding access | FAIL | PASS |
| Operator signup → verified trialing → correct onboarding access | FAIL | PASS |
| Operator signup → verified active → correct onboarding access | FAIL | PASS |
| QuoteDone signup → verified trialing → correct onboarding access | FAIL | PASS |
| QuoteDone signup → verified active → correct onboarding access | FAIL | PASS |
| Starter cannot unlock a trial without verified payment evidence | FAIL | PASS |
| Operator cannot unlock a trial without verified payment evidence | FAIL | PASS |
| QuoteDone cannot unlock a trial without verified payment evidence | FAIL | PASS |
| Scale signup is rejected without creating an account | FAIL | PASS |
| bcrypt 6 accepts existing bcrypt 5 hashes and reset revokes the old session | FAIL | PASS |
| Railway three-plan configuration documents STRIPE_STARTER_MONTHLY_PRICE_ID | FAIL | PASS |
| Stripe enabled refuses missing STRIPE_STARTER_MONTHLY_PRICE_ID | FAIL | PASS |
| Railway three-plan configuration documents STRIPE_STARTER_ANNUAL_PRICE_ID | FAIL | PASS |
| Stripe enabled refuses missing STRIPE_STARTER_ANNUAL_PRICE_ID | FAIL | PASS |
| Railway three-plan configuration documents STRIPE_OPERATOR_MONTHLY_PRICE_ID | FAIL | PASS |
| Stripe enabled refuses missing STRIPE_OPERATOR_MONTHLY_PRICE_ID | FAIL | PASS |
| Railway three-plan configuration documents STRIPE_OPERATOR_ANNUAL_PRICE_ID | FAIL | PASS |
| Stripe enabled refuses missing STRIPE_OPERATOR_ANNUAL_PRICE_ID | FAIL | PASS |
| Railway three-plan configuration documents STRIPE_QUOTEDONE_MONTHLY_PRICE_ID | FAIL | PASS |
| Stripe enabled refuses missing STRIPE_QUOTEDONE_MONTHLY_PRICE_ID | FAIL | PASS |
| Railway three-plan configuration documents STRIPE_QUOTEDONE_ANNUAL_PRICE_ID | FAIL | PASS |
| Stripe enabled refuses missing STRIPE_QUOTEDONE_ANNUAL_PRICE_ID | FAIL | PASS |
| Starter lineup: Starter prices, included allowance and exact overage | FAIL | PASS |
| Starter lineup: Starter account and feature access | FAIL | PASS |
| Starter lineup: Operator prices, included allowance and exact overage | PASS | PASS |
| Starter lineup: Operator account and feature access | FAIL | PASS |
| Starter lineup: QuoteDone prices, included allowance and exact overage | PASS | PASS |
| Starter lineup: QuoteDone account and feature access | FAIL | PASS |
| Starter lineup: Starter to Starter recurring price differences | FAIL | PASS |
| Starter lineup: Starter to Operator recurring price differences | FAIL | PASS |
| Starter lineup: Starter to QuoteDone recurring price differences | FAIL | PASS |
| Starter lineup: Operator to Starter recurring price differences | FAIL | PASS |
| Starter lineup: Operator to Operator recurring price differences | FAIL | PASS |
| Starter lineup: Operator to QuoteDone recurring price differences | FAIL | PASS |
| Starter lineup: QuoteDone to Starter recurring price differences | FAIL | PASS |
| Starter lineup: QuoteDone to Operator recurring price differences | FAIL | PASS |
| Starter lineup: QuoteDone to QuoteDone recurring price differences | FAIL | PASS |
| Starter lineup: Starter monthly upgrade savings at 300 minutes | FAIL | PASS |
| Starter lineup: Starter monthly upgrade savings at 1200 minutes | FAIL | PASS |
| Starter lineup: Operator monthly upgrade savings at 1200 minutes | FAIL | PASS |
| Starter lineup: Starter annual upgrade savings at 300 minutes | FAIL | PASS |
| Starter lineup: Operator annual upgrade savings at 1200 minutes | FAIL | PASS |
| Starter lineup: Starter monthly confirmed usage, warnings and 2520-cent installment | FAIL | PASS |
| Starter lineup: Starter annual confirmed usage, warnings and 2520-cent installment | FAIL | PASS |
| Starter lineup: Operator monthly confirmed usage, warnings and 2520-cent installment | FAIL | PASS |
| Starter lineup: Operator annual confirmed usage, warnings and 2520-cent installment | FAIL | PASS |
| Starter lineup: QuoteDone monthly confirmed usage, warnings and 2520-cent installment | FAIL | PASS |
| Starter lineup: QuoteDone annual confirmed usage, warnings and 2520-cent installment | FAIL | PASS |
| Starter lineup: Starter trial has 60 minutes, no overage, warnings once | FAIL | PASS |
| Starter lineup: Operator trial has 60 minutes, no overage, warnings once | FAIL | PASS |
| Starter lineup: QuoteDone trial has 60 minutes, no overage, warnings once | FAIL | PASS |
| Starter lineup: verified Starter to Operator subscription event | FAIL | PASS |
| Starter lineup: verified Starter to QuoteDone subscription event | FAIL | PASS |
| Starter lineup: verified Operator to Starter subscription event | FAIL | PASS |
| Starter lineup: verified Operator to QuoteDone subscription event | FAIL | PASS |
| Starter lineup: verified QuoteDone to Starter subscription event | FAIL | PASS |
| Starter lineup: verified QuoteDone to Operator subscription event | FAIL | PASS |
| Starter lineup: legacy CHECK migration preserves periods, charges, indexes and foreign keys | FAIL | PASS |
| Starter lineup: downgrade suspends staff login but retains owner login and staff data | FAIL | PASS |
| Starter lineup: real signup renders three plan choices with exact prices, minutes and exclusions | FAIL | PASS |
| Starter lineup: Operator widget quotes 353889 cents; downgrade blocks exact retry without deleting prices or quotes | FAIL | PASS |
| Starter lineup: QuoteDone real phone getQuote remains 353889 cents; Operator downgrade refuses replay | FAIL | PASS |
| Starter lineup: downgrade preserves data and blocks owner/public booking, widget and price book | FAIL | PASS |
| Starter lineup: Starter real phone boundary offers only entitled tools | FAIL | PASS |
| Starter lineup: Operator real phone boundary offers only entitled tools | FAIL | PASS |
| Starter lineup: QuoteDone real phone boundary offers only entitled tools | PASS | PASS |
| Starter lineup: pending warm transfer cannot connect after downgrade to Starter | FAIL | PASS |
