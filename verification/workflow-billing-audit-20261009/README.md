# October 9 workflow and billing audit repairs

Branch: `fix/workflow-billing-audit-20261009`.
Base: `c99ea0519c3966b9b6a2bc4c750c036cd16d6b80` from
`claude/release-candidate-20261009`.

Docker is unavailable in this sandbox, so the requested image-based voice smoke
test could not run. The signed local HTTP/WebSocket voice regression did run.
Full browser gate results are recorded below; JSDOM checks are not Chromium
visual verification.

## Scope and changes

1. **Quote acceptance.** A single saved option is selected automatically,
   including its null tier name. An explicitly supplied name must match it.
   Multiple options retain the unique exact string-name requirement. The owner
   form hides the picker and omits the tier field for one option.
   Source: `server/src/ownerWorkflowService.js`,
   `client/src/ownerRecordActions.jsx`.
   Tests: `audit 1` in `test/workflowBillingAudit20261009.spec.mjs` and
   `test/workflowBillingAudit20261009.dom.spec.mjs`. The real `getQuote` path
   saves an untiered concrete patio quote, then progresses SENT → ACCEPTED →
   INVOICED with **353889 cents**. Null, omitted, incorrect and named tier
   inputs are covered. Existing named-tier workflow tests remain passing.

2. **Booking access after service ends.** Four public POST routes now apply
   `accountAccessDecision` to the resolved owner before calling a booking
   service: availability, holds, confirmation and preference. Denial is
   403 / `BOOKING_UNAVAILABLE` / `This business is currently unavailable.`
   Existing hold release and confirmation status reads remain accessible.
   Source: `server/src/bookingRoutes.js`, `server/src/server.js`; account and
   allowed-origin reads use the injected production `ownerQuery` helper.
   Tests: `audit 2` in `test/workflowBillingAudit20261009.spec.mjs`. Real local
   HTTP requests with the fake Google adapter verify unchanged booking rows,
   no provider calls on denial, active booking, release and status controls.
   Route source hashes were regenerated using `routeSourceInventory('server')`
   from `test/helpers/tenantRouteInventory.mjs` and rechecked.

3. **Confirmed usage only.** The admission meter and billing snapshot share
   the existing confirmed-duration validation: completed/recovered lifecycle,
   completed receipt, valid provider digest and integer duration matching the
   per-call rounded minutes. Local measurements remain provisional evidence;
   they do not consume the cap, allowance or create overage or a pending debt.
   The billing screen shows `Calls still being confirmed: N` separately.
   Source: `server/src/billingVoiceUsage.js`,
   `server/src/billingMinuteService.js`, `client/src/minuteUsage.jsx`.
   Tests: `audit 3` in both new files, plus updated
   `test/billingCoreRepair20261006Meter.spec.mjs`,
   `verification/billing-core-repairs-20261006/followup-voice-regression.mjs`
   (run by `test/billingCoreRepair20261006CallEntry.spec.mjs`) and
   `test/overageMinute20261006.spec.mjs`. Legacy meter fixtures now supply
   confirmed duration receipts; rounding, signature checks, tenant rejection,
   replay, restart, fallback exclusions and warning assertions are retained.
   The real signed voice test admits the next call before a duration receipt,
   then refuses a new trial call after the receipt confirms 61 minutes.

**Missing-duration recovery:** inspection of `server/src` and `server/scripts`
found no later Twilio call-duration fetcher. The current confirmation path is
the signed `/api/twilio/voice/status` callback into `providerComplete`.
If that receipt never arrives, the call remains unconfirmed. No fetcher was
built, as instructed.

## Before / after evidence

[Money expectations](EXPECTATIONS.md) were written before running tests.
The identical final regression tests were run in a detached worktree at the
pinned base, with no changes to its production source, and against the fix.

| Item | Base pass / fail | Fixed pass / fail |
| --- | ---: | ---: |
| Quote acceptance (`audit 1`) | 5 / 5 | 10 / 0 |
| Booking access (`audit 2`) | 2 / 4 | 6 / 0 |
| Confirmed minutes (`audit 3` and F10 meter/voice) | 9 / 13 | 22 / 0 |
| Total | 16 / 22 | 38 / 0 |

The expanded set includes 25 new tests and 13 existing meter/voice regressions.
Each name and result is in [regressions.json](regressions.json).
TAP evidence (trailing whitespace removed): [base TAP](regressions-base.tap),
[fixed TAP](regressions-after.tap).

```sh
node --test --test-concurrency=1 --test-reporter=tap \
  test/workflowBillingAudit20261009.spec.mjs \
  test/workflowBillingAudit20261009.dom.spec.mjs \
  test/billingCoreRepair20261006Meter.spec.mjs \
  test/billingCoreRepair20261006CallEntry.spec.mjs
```

Existing targeted workflow, route, warning, charging and lifecycle checks:
**117/117 passed** across `ownerDashboard20261007.spec.mjs`,
`bookingRoutes.spec.mjs`, `overageMinute20261006.spec.mjs` and
`billingSystem20261008.spec.mjs`.

## Full verification

| Command | Total | Passed | Failed | Skipped / cancelled |
| --- | ---: | ---: | ---: | ---: |
| `npm test` | 4,376 | 4,319 | 57 | 0 / 0 |
| `npm run test:quote` | 3,037 | 2,980 | 57 | 0 / 0 |

Both commands exit 1. All 57 failures in each final run are Chromium
`browserType.launch` failures with `SIGTRAP`; no browser assertion ran for
those checks. No other failure remains in either final run. Full counts,
failed test names, classifications and complete-log SHA-256 hashes are in
[full-gates.json](full-gates.json).

An earlier complete quote run had 2,979 passes and 58 failures. Alongside
the same 57 launch failures, the existing test `presentation 4: priced mowing
clippings replace common disposal; phone quotes $110` failed with
`VoiceToolDispatchError` / `TOOL_EXECUTION_FAILED`. Its five-test isolated
group then passed 5/5; the test also passed in both final full gates. The
intermittent cause was not identified, and no change was made to that test
or its production path. The earlier failure is retained in `full-gates.json`.

Docker is not installed, so
`node verification/receptionist-20261008/docker-voice-smoke.mjs <image>`
was not run.

Runtime: Node 22.23.3 for the final full gates, Node 22.16.0 for both focused
before/after runs; Playwright 1.56.0, installed Chromium headless shell 141.
`PRICEBOOK_BROWSER_MODULE=/workspace/scratch/18cbdaa4aace/node22/lib/node_modules/playwright`.
`npm ci` and `npm run build` passed. Generated tracked `client/dist` changes
are restored before publication. The change uses synthetic data and fake
providers only. No SMS, production provider traffic, deployment, merge,
subagents or edits to the prohibited directories are part of this task.
