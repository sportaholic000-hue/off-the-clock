# Chromium launch failures

The sandbox lacks Playwright's `chromium_headless_shell-1234` executable. An attempted browser installation downloaded an invalid zero-byte archive (see `chromium-install.log`). Each name below failed at `browserType.launch` before executing its browser assertions. No non-browser failure remained in either final suite.

The following 57 test names failed in **both** `npm test` and `npm run test:quote`:

1. Astra 2 browser: tier-only confirmation can be answered in measurement form
2. Astra 2 browser: tier-only confirmation can be answered in customer wizard
3. Astra 4 browser: product change shows its own confirmation and clears the old Yes
4. billing screen shows exact notice amount/date and owner cancellation is one click, no GET mutation
5. reactivation refreshes dashboard from persisted backend state and permits CSV download
6. expired export window disables all CSV buttons and no longer offers setup/service
7. real caller widget in Los Angeles books Moncton DST time, visible in owner dashboard and calendar
8. scope editor groups entries of the same kind and names them by their matching facts
9. F11 browser boolean leaves preserve No, unanswered and the exact key
10. F11/F13 browser depth-three values retain zero, fractional rates and rejected text
11. F13 browser legacy flat and two-level controls use the same exact parser
12. lead capture repairs: production owner app navigation, stored contacts and live feed
13. named review contact signup prefill remains unconfirmed until save and survives reopening
14. named review contact AI draft, empty edit and rejected save preserve the confirmed person
15. real dashboard always shows zero-call usage, then refreshes the $160.30 overage and $0.30 nudge on focus
16. QuoteDone dashboard shows $0.35 overage, annual monthly allowance and no Operator upgrade nudge
17. unverified period and pending historical charge are visible without an invented zero balance
18. owner alert repairs: production dashboard, Calls, retry and staff visibility
19. D19/D20: production browser shows saved quote email status and browses/retries older failures
20. owner dashboard browser: real compiled calls, review, progression, reports and staff boundaries
21. editor D1: root factor survives no-edit blur save reopen and same-type switches
22. editor D1: nested factor survives no-edit blur save reopen and same-type switches
23. editor D1: flat factor survives no-edit blur save reopen and same-type switches
24. editor D1: equal factor survives no-edit blur save reopen and same-type switches
25. editor D1: a genuine absent default is displayed without being written by focus or blur
26. editor D2: conflicting minima survive no-edit focus blur preview switches and unrelated edits
27. editor D2: deliberate 14.02 resolves both minima and only its own AI confirmation
28. editor locked rate: 0.0049 types blurs saves and reopens exactly
29. editor locked rate: 0.0050 types blurs saves and reopens exactly
30. editor locked rate: 0.0051 types blurs saves and reopens exactly
31. editor locked invalid text: lossless rejection survives blur same-type switch and save
32. editor locked maps tiers and explicit enablement stay separate for two same-type records
33. editor D1 direct: reviewer minimal legacy fixture saves root 0.23 without a nested copy
34. editor D2 direct: deliberately typing the displayed candidate resolves the conflict and revokes affected approval
35. editor fixed-cent boundaries: 14.00 14.01 14.02 retain exact cents and adjacent sub-cent entries reject
36. pending manual save preserves a newer numeric edit and its question
37. pending manual save preserves a newer structured price-map edit
38. pending manual save prevents duplicate confirmation and premature review
39. unchanged confirmed value saves once and advances normally
40. failed manual save keeps the confirmed value available for retry
41. stale interview preserves the unsaved answer and requires explicit reconciliation: keep answer
42. stale interview preserves the unsaved answer and requires explicit reconciliation: saved answer
43. late 200 response cannot replace a new service preview
44. late 400 response cannot replace a new service preview
45. old completion cannot clear current loading and invalid input cannot retain old ready
46. invalid replacement rejects an old delayed success and unchanged focus blur does not request again
47. interview owner can add separate demolition entries and explicitly choose up-to access
48. interview rate controls accept 3.5 cents per foot and reject fractional-cent gates
49. interview accepts ordinary floor names and retains invalid drafts for correction
50. display browser: changing mulch quantity method requires a fresh quantity in its new unit
51. display browser: all 15 product fields select names, invalidate confirmations, and roofing quotes $2520
52. display browser: actual dashboard and owner preview show production missing-price labels
53. display browser: $172.50 minimum appears on all four surfaces and equal preview endpoints collapse
54. QP-02 rendered owner measurements collect tier-only hardwood confirmation and preview $1960
55. re-audit browser: Remove gate offering yields a coherent saveable draft and unchanged no-gate price
56. website owner screen shows an unsaved draft, literal prices and source; saves only on review
57. website owner screen says no prices found and preserves the current prices
