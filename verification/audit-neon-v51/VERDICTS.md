# Neon audit of v51 — verdicts and repairs (November 26, 2026)

Neon audited `6f57b78e`. Every item was reproduced on `84abf100` before any
change; one commit each with a test written first (`test/audit-neon-v51/`);
engine version v52.

| # | Verdict | Action |
|---|---|---|
| V51-1 | **Confirmed — my v50 incomplete fix** (web quote typed (506) 555-0123 invisible to the caller's phone history; no owner "Call customer" link) | Fixed: web leads store the +1 number; history also matches by the saved customer link (finds quotes saved before the fix); call link accepts North American numbers. Tenant route review recorded |
| V51-2 | **Confirmed** (5-digit ZIP holding ZIP+4 zones went to review under "send to me") | Fixed: asks for the ZIP+4. The v45 #13 test expected the old outcome ("as before", no spec rule) and was updated |
| V51-3 | **Confirmed** (the order of travel zones decided whether an Ottawa business with a Gatineau zone went live) | Fixed: readiness skips a zone in another province with no rate entered (own-province missing rate still blocks, v46 #1 — my first version broke that and the v46 test caught it); a status notice names the zones going to review |
| V51-4 | **Confirmed** (an installed option on itemized painting refused for the customer) | Fixed: the option's own mode decides |
| V51-5 | **Confirmed — my v50 incomplete fix** ("yes, that's me, no gate on the fence" denied) | Fixed: after a yes, only a correction denies ("no wait", "actually no", "no, it's not me / that's my…") |
| V51-6 | **Confirmed** (saved quote could not be emailed to the email confirmed at booking) | Fixed: quote email + booking/preferred-time emails for that quote; owner view offers it. Staff email test now creates the booking tables the service reads |

Tests changed on purpose: `test/qeNeonV45_20261122.spec.mjs` (#13 bare ZIP
now asks), `test/staffLogin20261009.spec.mjs` (minimal schema gains the
booking tables).
