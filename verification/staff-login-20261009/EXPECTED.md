# Expected results written before implementation or test execution

Base `be473b6542c498a6e96b056b5be2c3d59d9e4055`, the newest `claude/release-candidate-20261009*` head returned by GitHub at the start. Platform §6.9 supplies staff role permissions. The owner ruling of 2026-10-09 supersedes the older seat counts: Starter 0, Operator 1, QuoteDone 1; Scale retains unlimited staff. All names, emails, plans, tokens, providers and business records in tests are synthetic.

| Scenario | Handwritten expected result |
| --- | --- |
| Owner on Operator/QuoteDone invites one name/email | 201; one pending staff seat; no password returned or chosen by owner; fake transactional email accepted with a fragment-only, one-time 24-hour invite link. |
| Staff accepts at 23h 59m, chooses password | 200; status active; login succeeds; invitation token replay 400 and wrong-purpose token 400. |
| Staff accepts at exactly 24h | 400 invalid/expired; remains pending and cannot sign in. |
| Owner resends pending invite | 200, new email token; old token 400; new token works once. Active invite resend 409. |
| Owner cancels pending invite | 200; invite token 400; account absent and slot free. |
| Owner removes active staff | 200; all staff access and refresh sessions rejected immediately; owner session remains valid; slot free. |
| A second invite with one existing pending or active staff | 409 with explicit one-seat plan message; neither target account nor email created. Starter first invite 403 with zero-seat message. |
| Operator or QuoteDone → Starter → original plan | Staff remains in the database but cannot log in, use access token or refresh while Starter; owner list says suspended by plan; restoration re-enables that same login. Scale may have more than one staff; downgrade deterministically suspends excess staff, without deletion. |
| Forged owner/body selector, cross-business invite/accept/remove | 400/403/404 as applicable; no other business name, email, record or token disclosed; owner-bound reads/writes use ownerQuery. |
| Staff API role matrix | 200 for own calls, leads, quote list and quote follow-up/SENT action, calendar and customers; 403 for pricing meta/rates/save/approval, billing when configured, team read/mutations. Another owner's customer/lead/quote/call must not appear. |
| UI | Owner sees invite form and pending/active/suspended state with resend/cancel/remove; staff sees only Calls, Leads, Quotes, Calendar, Customers navigation and a password setup page for the fragment link. Owner cannot see a password in responses or UI. |
| Existing account email schema upgrade | Existing verification/reset tokens remain valid; consumed tokens stay consumed; indexes and one-use trigger remain enforced; staff invite purpose is available after migration and on a fresh database. |
| Staff sends a saved quote by email | A confirmed saved customer address queues exactly one owner-bound outbox item; fake email provider receives the saved customer-facing amounts and qualifications; repeat send does not duplicate. Another tenant's quote ID is 404 and an unconfirmed or changed recipient is refused. No SMS is attempted. |
| Malformed invite address | An address with angle brackets or control whitespace is rejected 400 before an account or email is created. |
| Fake email provider rejects an invite | The owner gets a 503 delivery message; the pending slot remains, the failed link is unusable, and resend through the recovered fake provider yields one usable link. |
