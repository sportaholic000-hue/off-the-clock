# Handwritten expectations before implementation

These expected outcomes were recorded before running the new regression tests.

| Case | Expected |
| --- | --- |
| Signed inbound call to a provisioned Operator number, `operatorEnabled=0`, no carrier bridge settings | HTTP 200 with a Twilio media `<Stream>`; one connected call; no `<Dial>` to the owner's phone. |
| Active trial or payment failure still inside seven-day grace, `operatorEnabled=0` | HTTP 200 with a Twilio media `<Stream>`; forwarding is controlled on the owner's phone. |
| Signed inbound call to an unknown destination | HTTP 404; no tenant call row, media session, or forwarding receipt. |
| Trial ended or payment failed | HTTP 200 backup message capture (`<Gather>`), zero AI minutes; no `<Dial>`. |
| Trial minute allowance exhausted | HTTP 200 backup message capture (`<Gather>`), zero AI minutes; no `<Dial>`. |
| Service ended | HTTP 200 saying `This business is currently unavailable.`, with `<Hangup>` and no `<Stream>` or `<Dial>`. |
| Spam caller | HTTP 200 `<Reject reason="rejected"/>`, spam excluded from billing. |
| Two owners' numbers, signed inbound for owner A | Only owner A's signed number can produce its forwarding check, call and minute record; owner B sees no row from A. A request that reuses A's CallSid with B's number fails HTTP 403. |
| Inbound forwarded check | Owner A sees time, caller, and `ForwardedFrom` presence/number only for A's verified signed incoming call; the owner cannot submit or mark a call forwarded from the dashboard. |
| Signed Twilio webhook with `ForwardedFrom` present but empty, versus omitted | The first reports marker present with no usable number; the second reports marker absent. Neither value changes whether the call is answered. |
| Signed completion for an answered forwarded call of 125 seconds | The existing billing calculation is unchanged: `minutesBilled=3`, with no second billing on callback replay. |
| Provisioning without carrier settings | Twilio number purchase completes; provisioning is `provisioned` without a carrier connect request. |
| Configuration templates | Neither local nor Railway example lists a carrier connection URL/token; the credential inventory still requires every real provider secret to be blank. |
| Setup rail with a provisioned number and filled About/Hours but expired account access | It says `Not live yet`, not `Ready to answer`; the owner cannot mistake configured routing for current entitlement. |
| Dashboard with no call records | It describes account readiness and forwarding; it never instructs the owner to turn on a dashboard operator control. |
| Day-90 customer-data erasure after cancellation | An owner-bound forwarding receipt is removed with the call and transcript rows. |
| Quote gate catalog timing under sequential files | The existing 1,500 ms thresholds and all quote assertions stay identical; catalog checks that passed sequentially in `npm test` pass without parallel-worker contention. The missing Chromium executable remains a separate browser launch failure. |

The manual forwarding instructions must say that conditional forwarding waits for the carrier's no-answer delay, while always-forward sends calls immediately. All proposed screen copy requires owner approval.
