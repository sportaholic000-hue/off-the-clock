# Expected outcomes, written before execution

Base: `0069c801c37e98f052c4e6d237437259a4024e91`. Synthetic identities and provider data only. The 2026-10-10 owner rulings in the task supersede older plan, seat, forwarding and text-message language in the platform spec.

| Step | Source | Expected result |
| --- | --- | --- |
| 1. Owner accounts | Platform §4 step 1, §12.10; owner plan ruling | Operator and QuoteDone owners receive fake email verification, sign in, sign out and sign back in; an unverified owner cannot sign in. |
| 2. Onboarding | Platform §4 steps 2/5, §6.5; owner service-area ruling | With no `GEMINI_TEXT_MODEL`, the AI draft says unavailable; manually entered knowledge, prices and structured Halifax service area save and reload. |
| 3. Price Book | Platform §6.3 and quote engine Class 1; owner first-visit ruling | First visit has no raw field keys or false “This price book changed” error. Fence $25.98 per installed foot at six feet, mowing $0.10/sqft and interior paint $2 labor plus $1 materials/sqft/coat survive save/reload and owner approval. |
| 4. Calendar | Platform §6.7, §12.3, §12.8 | Halifax Mon–Fri 09:00–17:00, Oct 12 10:00–11:00 blocked, 120-minute notice, 14-day horizon, 15-minute before/after buffers, and customer direct booking survive reload. |
| 5. Widget/booking | Platform §7, §12.3, §6.8; owner widget ruling | One allowed origin loads the actual embed; three cent-exact estimates, a valid slot and booking; widget quote and booking appear in Leads. |
| 6. Owner records | Platform §6.1/6.2/6.4/6.7/6.8 | Dashboard, calendar, quotes, leads and calls agree with customer totals and appointment. |
| 7. Staff and isolation | Platform §6.9, §9; owner staff ruling | Owner invites one office-staff seat through Team; fake email link sets invitee password. Staff sees own Calls, Leads, Quotes, Customers, Calendar and cannot access Price Book, Billing or Team. Other business sees no records; removal ends staff session. |
| 8. Voice | Platform §5.3–5.5, §5.7; voice flows; owner forwarding ruling | Signed fake Twilio forwarded call reaches the receptionist and appears in setup forwarding check with time, caller and forwarded marker. Fake Google tool session yields a $100 mowing quote, transcript/lead/quote; minutes stay unconfirmed until signed 125-second completion, then bill 3. |
| 9. Billing | Platform §8, §12.11; trial entitlement ruling | QuoteDone trial page shows selected plan, 14-day trial, 60-minute trial cap, usage and no initial charge; no Stripe operation occurs. |
| A. Starter | Owner 2026-10-10 plan ruling | Starter $69/150 included monthly minutes answers and captures a lead; booking, transfer, Price Book and widget are unavailable with an explanation. |
| B. Operator | Owner 2026-10-10 plan ruling | Operator widget quote works, while its phone call cannot produce a Price Book quote; answering and booking remain available. |
| C. QuoteDone | Owner 2026-10-10 plan ruling | QuoteDone phone Price Book quote succeeds. |
| D. Staff | Platform §6.9 as amended by owner ruling | See step 7; invite, password, scoped screens, removal/session revocation. |
| E. Widget Leads | Platform §6.8; owner 2026-10-10 ruling | Each widget quote and the booking appear in Leads. |
| F. First visit | Owner 2026-10-10 ruling | No raw field names or false revision conflict on initial Price Book load. |

## Calculations committed before customer requests

No tax, markup, fees, range buffer, material waste or minimum. Fence: 100 measured feet × $25.98 installed per foot = **$2,598.00**. Lawn: 1,000 measured sqft × $0.10/sqft = **$100.00 per visit**. Painting: 100 measured wall sqft × 2 coats × ($2 labor + $1 materials) = **$600.00**. The same lawn input yields **$100.00** from QuoteDone phone quoting. For a fake 125-second Twilio completed call, the rounded billing duration is **3 minutes**, and before the callback **0 confirmed minutes**.

An Oct 12 10:00–11:00 Halifax blackout rejects overlapping slots. A fake Oct 13 10:00–11:00 busy event plus 15-minute before/after buffers rejects adjacent one-hour slots. The fake calendar credential and synthetic trial evidence are fixtures; the service area and staff are entered through product screens.
