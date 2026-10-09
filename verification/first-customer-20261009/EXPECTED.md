# Expected outcomes recorded before the rehearsal

Base: `be473b6542c498a6e96b056b5be2c3d59d9e4055`. All identities, contact details, provider credentials and job facts in this rehearsal are marked synthetic and confined to local temporary storage. Statuses below are expectations, not observations.

| Step | Spec authority | Expected before execution |
| --- | --- | --- |
| 1. Accounts | `platform_spec_v2.md` §4 step 1, §12.10; §8 | An Operator and a QuoteDone owner sign up with selected-plan trials, receive console verification tokens, verify, log in, log out, and log back in. Unverified login is refused. |
| 2. Onboarding | Platform §4 steps 2, 5, 7; §6.5; `quote_engine_v2.md` price-book draft section | Without `GEMINI_TEXT_MODEL`, AI draft refuses with a readable unavailable message. Manual business knowledge and prices can be entered and reloaded. No invented AI draft is saved. |
| 3. Price book | Platform §6.3; engine §Class 1, `INTERIOR_PAINTING`, `FENCING_INSTALL`, `LANDSCAPING_MOWING`; `QUOTE_TRADE_DECISIONS_20261003.md` fence height and currency | Owner enters three services; explicit rates survive save/reload unchanged. Each service is customer-ready only after saved configuration approval. |
| 4. Calendar | Platform §6.7, §12.3, §12.8, §13.5 | Halifax hours Mon–Fri 09:00–17:00, Oct 12 10:00–11:00 blocked, 120-minute minimum notice, 14-day horizon, 15-minute buffers, and direct customer booking enabled survive reload. |
| 5. Widget | Platform §7; engine customer sanitization and range/display; §12.3; `QUOTE_TRADE_DECISIONS_20261003.md` fence heights | One allowed synthetic origin loads the real embed. A customer gets one quote for each configured service, no raw owner rates. Offered slots exclude time before notice, blackout and buffer conflicts; confirmation produces one appointment. |
| 6. Owner records | Platform §6.1, §6.2, §6.4, §6.7, §6.8 | Same quote totals and one appointment/lead appear on owner dashboard, calendar and leads/calls surfaces. |
| 7. Staff/isolation | Platform §6.9; per-owner isolation paragraph in §9 | QuoteDone staff can see own calls/leads/calendar but no pricing or billing. Other owner sees no QuoteDone customer records; staff sees none of the other owner. Operator has one seat, QuoteDone two. |
| 8. Voice | Platform §5.3–5.5, §5.7, §6.2, §12.5; `voice_quote_flows.md` mowing and global number confirmation | Synthetic signed Twilio stream plus fake Google session collects mowing details/name, saves transcript, lead and quote; owner screens reflect them. Usage remains unconfirmed before a signed synthetic completion, then billed minutes follow rounded-up confirmed Twilio duration. |
| 9. Billing | Platform §8, §12.11; `TRIAL_ENTITLEMENT_DECISION_20261006.md`; `OVERAGE_MINUTE_RULES_20261006.md` | Trial UI describes selected tier, 14-day status, 60-minute cap, usage and no initial charge until trial end. With no live Stripe, management/payment actions may state provider unavailable rather than pretending a charge occurred. |

## Hand calculations written before any widget quote request

Select TAX_NONE, zero markup/fees, zero range buffer and zero pre-tax minimum. For these standard, measured scopes, low = mid = high to the cent under `quote_engine_v2.md` STEP 9. These numbers assume the owner UI can configure the stated standard-rate mode; if its required offering fields differ, record the block instead of changing the expected result after seeing output.

Before requesting a customer quote, the owner editor showed that new fence work requires a complete installed or itemized offering. The intended installed offering is 100 measured linear feet at **$25.98 installed per foot**, at the offered six-foot height, with standard posts and footings included and no gates. The hand calculation is 100 × $25.98 = **$2,598.00**. This replaces the older component inputs for the fence if the installed offering can be saved. The amount was computed before the widget request. The original component calculation below is retained as an audit trail of the initial expectation.

1. Fence installation: 100 measured linear feet, 6-foot priced/requested height, flat ground, zero gates/corners, 8-foot post spacing, $10.00 labor/foot, $15.00 material/foot, posts not included, $5.00/post and $2.00 concrete/post. Posts = ceil(100/8)+1 = 14. Labor $1,000.00 + material $1,500.00 + posts $70.00 + concrete $28.00 = **$2,598.00**.
2. Lawn mowing: 1,000 measured square feet, one-time visit, maintained grass, no bagging or edging, $0.10/square foot, both applicable multipliers 1.00. 1,000 × $0.10 = **$100.00 per visit**.
3. Interior painting: 100 measured square feet of standard-height wall, good condition, two coats, no ceiling/trim; $2.00 labor and $1.00 material per wall square foot per coat. 100 × 2 × ($2.00 + $1.00) = **$600.00**.

The first widget attempt returned $620.00 for painting because the editor carried a 10% finish-paint material waste assumption that the first handwritten calculation omitted. That is $400 labor + $220 material. This was a test setup mistake, not evidence of bad arithmetic. For the next independent run, the owner explicitly sets the finish-paint material waste to zero, matching the already written $600 expectation. Both observations remain in the report.

For booking, a blackout excludes appointment intervals that overlap it. The 15-minute before/after buffer applies against busy calendar events and existing bookings. A separate fake Tuesday 10:00–11:00 Halifax busy event tests the buffer: 09:00–10:00 and 11:00–12:00 one-hour slots must be excluded, while a Monday 09:00–10:00 slot may end exactly when the Monday blackout begins.

For the signed synthetic mowing voice call, 1,000 measured square feet × $0.10 per square foot × 1.00 one-time × 1.00 maintained = **$100.00 per visit**. A synthetic 125-second Twilio completion should round to **3 billed minutes** after the call ends, while the status before the completion remains unconfirmed.
