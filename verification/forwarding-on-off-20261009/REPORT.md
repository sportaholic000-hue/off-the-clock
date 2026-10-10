# Forwarding on/off — synthetic verification

Base: `be473b6542c498a6e96b056b5be2c3d59d9e4055` (`claude/release-candidate-20261009d`). Branch: `fix/forwarding-on-off-20261009`. No live carrier, Twilio, Google, email, SMS, or deployment was used.

The owner's October 1/9 forwarding rulings supersede the older dashboard-toggle and outbound-test wording in `specs/platform_spec_v2.md` §4. No spec or public page was edited.

## Broken or incomplete

- The required Playwright Chromium revision was unavailable in this sandbox. Its install fetched a zero-byte/invalid archive and failed; browser tests cannot be claimed as passing here. See `BROWSER_FAILURES.md` and raw logs for exact tests.
- Docker is not installed here, so `verification/receptionist-20261008/docker-voice-smoke.mjs` could not run. A real carrier forwarding call and the Do Not Disturb timing must be checked by the owner; synthetic webhooks cannot prove them.
- The proposed owner-screen wording below is pending owner approval.

## Changes

| Files | Result |
| --- | --- |
| `server/src/platformIntegrations.js`, `server/src/server.js`, `server/src/onboardingService.js` | Twilio number provisioning finishes without a carrier bridge; carrier connection/coverage operations, outbound phone test, dashboard toggle and preview toggle routes are removed. Incoming eligibility uses account access, a provisioned number and business About/Hours; the legacy switch does not gate it. |
| `.env.example`, `deployment/railway.env.example`, `test/providerCredentials.spec.mjs` | Removed carrier URL/token from setup templates and changed the credentials inventory regression to require their absence. |
| `server/src/voice/productionVoiceRuntime.js`, `server/src/voiceRuntimeRoutes.js`, `server/src/voice/voiceForwardingCheck.js`, `server/src/schema.js` | Signed, tenant-bound inbound calls answer; a separate owner-scoped receipt records arrival time, caller and whether Twilio supplied `ForwardedFrom`. The owner's GET returns only the latest arrival for the currently provisioned destination. Unknown numbers and reused CallSids across owners fail closed. |
| `server/src/voice/voiceFallbackRoutes.js`, deleted `server/src/voice/operatorOffRouting.js` | Removed the off-state hang-up/automatic ring-back path and the backup capture's dial-back to the owner's forwarded number. Explicit caller-requested transfer remains available. |
| `server/src/billingCustomerLifecycle.js`, `client/src/billing.jsx` | Service end no longer attempts or claims automatic carrier shutdown. The owner is told to turn off forwarding; billing amounts and duration arithmetic were not changed. |
| `client/src/onboarding.jsx`, `client/src/dashboard.jsx`, `client/src/ui.jsx`, `client/src/voiceOperatorControl.js` | Setup displays the receptionist destination and manual conditional/always-forward instructions. A signed inbound arrival replaces the outbound test. Dashboard and setup report readiness without an on/off control. |
| `verification/tenant-isolation-20261007/routes.json`, `route-sources.json` | Reviewed the removed and added routes and repinned the route source inventory. |
| `server/src/websitePriceTransport.js` | An existing non-browser gate found that the IPv4 benchmarking network `198.18.0.0/15` was accepted as public. It is now rejected; the already present regression for `198.18.0.1` passes. This is a URL safety filter, with no quote arithmetic change. |
| `server/scripts/quote-vnext-gate.js` | Runs selected files sequentially like `npm test`. The first parallel run exceeded two existing 1,500 ms catalog timing thresholds under worker contention, while the same cases passed sequentially. Assertions and quote arithmetic are unchanged. |

The old `operatorEnabled`, `carrierSetupStatus`, and coverage migration table remain as legacy schema data; no live route or production service reads them to turn answering on/off or calls a carrier API. Neither environment template asks for carrier connection credentials.

## Owner-screen text

Every **new or changed** phrase below is **proposed, pending owner approval**. Brackets denote a runtime value.

| Screen | Removed or changed old text | Proposed replacement or removal — pending owner approval |
| --- | --- | --- |
| Setup rail | `Flips on once your number is set and the About and Hours sections have content.` | `Ready when your account has access, your number is set, and the About and Hours sections have content.` |
| Phone header | `Plug in your line`; `Keep the number your customers already know. Nothing about it changes for them, except that someone always answers.` | `Forward calls to your receptionist`; `Keep your business number. Choose when your phone forwards calls to the receptionist number below.` |
| Setup brand | `Put your operator on the line.` | `Set up your receptionist.` |
| Phone button | `Connected`, `Connecting`, `Connect this number` | `Number ready`, `Getting number`, `Get receptionist number` |
| Local preview notice | `This simulates the setup screens. It does not provision a number, place a call, change carrier setup, contact a carrier, or make the operator available to customers.` | `This shows setup screens without provisioning a number or routing real calls.` |
| Provisioned phone notice | `Connected. Your line is ready.`; `Flip the operator on from your dashboard any time.` | `Your receptionist number`; `[receptionist number]` |
| Old outbound phone check | `Hear it answer`; `Call your own number right now. You will hear Off The Clock pick up, the same way your customers will.`; `Call my number now`, `Call again`, `CALLING`, `RINGING`, `LIVE`, `CHECK YOUR PHONE`; `The test call could not be completed. Try again in a moment.` | Removed. A signed forwarding check replaces it. |
| Conditional forwarding | None | `Set once: forward missed calls`; `On your business phone, forward calls you do not answer, decline, or receive while busy or unreachable to [receptionist number]. Check how declined calls behave with your carrier. Your carrier's no-answer delay still applies. Do Not Disturb may wait through that delay too; check it on your phone.` |
| Always forwarding | None | `Instant on or off: always forward`; `Turn on always-forward to send every call to [receptionist number] immediately. Turn it off to let your business phone ring normally.` |
| Samsung help | None | `Samsung Galaxy (Android): Phone → More options → Settings → Supplementary services → Call forwarding. Choose Always forward, Busy, Unanswered, or Unreachable, enter the receptionist number, and enable it.` Link label: `Samsung instructions`. |
| Apple help | None | `iPhone (GSM): Settings → Apps → Phone → Call Forwarding → turn on → Forward To → enter the receptionist number. Turn it off in the same menu. For forwarding only missed or busy calls, ask your carrier.` Link label: `Apple instructions`. |
| Verizon help (US only) | None | `Verizon mobile dial codes (US destinations): dial *71 followed by the 10-digit receptionist number for unanswered calls; dial *72 followed by the 10-digit number for always-forward; dial *73 to turn forwarding off.` Link label: `Verizon instructions`. `Other carriers may use different codes.` |
| Inbound check | None | `Check that forwarding reaches us`; `Turn forwarding on, then call your business number from another phone. Wait through your carrier's no-answer delay if you chose missed calls. This check only reports a signed call that reached your receptionist number.`; `Check recent call`; `Reached [time] from [caller]. Twilio forwarded marker: present/absent ([ForwardedFrom when usable]).`; `No call has reached this receptionist number yet.` |
| Go-live step | `Review the operator control` / `Put your operator on the line`; simulated-control description; `Answering is ready before pricing. QuoteDone activates separately as each service gets its prices.`; `SIMULATED ON`, `SIMULATED OFF`; `VISUAL REVIEW ONLY · NO CALLS ARE ROUTED`; `OPERATOR LIVE — every call from here on is covered.` | `Review receptionist readiness`; `Calls that reach your receptionist number are answered while your account has access. Choose when to forward on your own phone.`; `Receptionist ready. Forwarding is controlled on your business phone.` |
| Simulated go-live notice | `SIMULATED FOR VISUAL REVIEW. Production phone eligibility is unchanged and no telephony action has occurred.` | `SIMULATED FOR VISUAL REVIEW. No number is provisioned and no calls are routed.` |
| Dashboard simulated state | `OPERATOR LIVE (SIMULATED)` / `OPERATOR OFF (SIMULATED)`; `SIMULATED FOR VISUAL REVIEW | NO CALLS ARE ROUTED`; `SIMULATED · REAL OPERATOR REMAINS OFF`; `SIMULATED FOR VISUAL REVIEW. No number is provisioned, NO CALLS ARE ROUTED, production eligibility is unchanged, and the real operator remains off.` | `RECEPTIONIST PREVIEW`; `VISUAL REVIEW ONLY | NO CALLS ARE ROUTED`; `SIMULATED · NO CALLS ARE ROUTED`; `SIMULATED FOR VISUAL REVIEW. No number is provisioned, NO CALLS ARE ROUTED.` |
| Dashboard active/setup | `OPERATOR LIVE`, `OPERATOR OFF`; `EVERY CALL FROM HERE ON IS COVERED`, `CALLERS CAN LEAVE A REQUEST`, `VOICE SETUP NEEDS ATTENTION`; `HANDLING CALLS NOW`, `NOT HANDLING CALLS`; the dashboard switch | `RECEPTIONIST READY`, `RECEPTIONIST SETUP NEEDED`; `FORWARDED CALLS ARE ANSWERED`, `COMPLETE THE PHONE AND BUSINESS SETUP`; `FORWARDING IS CONTROLLED ON YOUR PHONE`; no switch. |
| Dashboard off banner | `Operator is off. Calls reaching your Off The Clock number ring your phone.`; `Operator is off. Calls reaching your Off The Clock number cannot be routed to your phone yet. Finish phone setup.`; `Finish phone setup` | `Choose when calls reach your receptionist by setting forwarding on your business phone.`; `Forwarding setup` |
| Dashboard empty call feed | `Your operator is on. Answered calls will appear here.`; `Turn the operator on to start handling calls.` | `Calls answered at your receptionist number will appear here.`; `Once your account and receptionist setup are ready, forwarded calls will appear here.` |
| Dashboard blocker | `Finish [missing] before the operator can go live/be reviewed.` | `Finish [missing] before the receptionist can answer calls.` |
| Header status | `OPERATOR LIVE`, `OPERATOR OFF` | `RECEPTIONIST READY`, `SETUP NEEDED` |
| Billing service end | `Forwarding shutdown confirmed.`; `Carrier forwarding shutdown is pending confirmation. Turn off forwarding on your business line.` | `Turn off forwarding on your business line from your phone or carrier account.` |
| Service-ended owner notice | `Carrier shutdown is tracked in Billing.` within the existing notice | Removed that sentence; the notice still asks the owner to turn off forwarding and gives the record export deadline. |

The old success message `Connected. Your line is ready.` and dashboard live wording implied an automatic carrier action. The new check says only that a signed call reached the Twilio destination. Twilio says `ForwardedFrom` may be omitted by a carrier even for a forwarded call; an absent marker is not proof of no forwarding.

## Published forwarding instructions

- **Samsung Galaxy Android:** Phone → More options → Settings → Supplementary services → Call forwarding; select Always, Busy, Unanswered, or Unreachable; enter the destination and enable. [Samsung support](https://www.samsung.com/us/support/answer/ANS10001907/). Samsung notes carrier/model variation.
- **iPhone on GSM:** Settings → Apps → Phone → Call Forwarding → enable → Forward To → destination. Disable in the same menu. Apple says to ask the carrier about conditional forwarding. [Apple iPhone User Guide](https://support.apple.com/en-au/guide/iphone/iph7405291c4/ios).
- **Verizon mobile, US destination:** `*71` + ten-digit destination for unanswered calls, `*72` + destination for all calls, `*73` to stop. [Verizon Call Forwarding FAQ](https://www.verizon.com/support/call-forwarding-faqs/). The code is shown only for US profiles; other carriers may use different codes.
- **Marker semantics:** Twilio says `ForwardedFrom` is carrier dependent and not supplied by all carriers. [Twilio Voice TwiML request parameters](https://www.twilio.com/docs/voice/twiml).

The owner's Android Do Not Disturb observation (six rings without forwarding) is recorded as an observation, not a guarantee. Conditional forwarding may wait through the carrier's no-answer delay; only always-forward is presented as immediate.

## Tests: handwritten expectation versus actual

Expected results are in `EXPECTED.md`, written before the new regressions were run.

| Case | Expected | Actual |
| --- | --- | --- |
| Signed provisioned call, legacy switch off, no bridge | Stream to receptionist, no automatic Dial | Passed. |
| Active trial and payment grace | Stream while entitled | Passed with synthetic trial evidence and grace timestamp. |
| Unknown destination | 404 and no tenant call | Passed. |
| Trial expired, payment grace expired, 60 confirmed trial minutes | Backup capture, zero new AI minutes | Passed. |
| Service ended, blocked caller | Unavailable message; Reject for spam | Passed. |
| Forwarded signed call, 125-second completion and replay | Three billable minutes exactly once | Passed. |
| Signed forwarding arrival and empty/omitted `ForwardedFrom` | Owner-scoped time/caller/marker, no cross-tenant access | Passed. |
| Twilio provisioning with no carrier URL/token | One fake Twilio selection/purchase, saved SID, `not_required` | Passed. |
| Credential templates without retired carrier keys | Both templates omit URL/token; remaining secrets are blank | Passed targeted inventory regression (1/1). |
| Configured number with expired account in setup rail | `Not live yet` | Passed. |
| Dashboard empty state and setup heading | No dashboard on/off instruction | Passed targeted copy regression (4/4). |
| Day-90 cancellation erasure | Forwarding arrival receipt removed with calls | Passed in lifecycle suite (52/52). |
| Benchmark address `198.18.0.1` | Refused as non-public | Passed existing regression; it failed in the first broad run. |

The first base probe of the new forwarding checks failed where the old dashboard off gate intercepted the call. The focused final fake-provider/telephony tests passed 30/30; the quote-path wrapper passed 29/29 and the updated terminology file passed 25/25. These targeted counts overlap the full suites and are not added to them.

## Full verification

| Command | Total | Passed | Failed | Skipped | Cancelled | TODO |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `npm test` | 4,561 | 4,504 | 57 Chromium launch | 0 | 0 | 0 |
| `npm run test:quote` | 3,187 | 3,130 | 57 Chromium launch | 0 | 0 | 0 |

`npm run build` passed. Exact browser-launch failures are listed in `BROWSER_FAILURES.md`; both final suites had zero non-browser failures. Docker was unavailable. The real carrier/phone behavior, including no-answer delay and `ForwardedFrom` availability, remains for an owner test.

Two discarded quote-gate runs had one 1,500 ms wall-clock catalog assertion each under variable sandbox scheduling: `core 9: 320 missing-share products via public` took 1,921 ms, then `QP-03 320-product all_free; quick=false` took 1,804 ms. Both cases passed the final uncontended run; no price or quote assertion changed.
