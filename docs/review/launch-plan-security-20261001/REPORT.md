# Launch plan and dependency verification — 2026-10-01

Started from **claude/integration-pr3-pr4-20261001 @ 4df8b23dab66beba557a018d6e351a4b13febd5c**. Scope: signup plan persistence, verified billing activation, onboarding entitlement, removal of new Scale purchases, and dependency remediation.

## Result

New owners keep the plan they select. Signup records Operator or QuoteDone with **pending_payment** and a **null trial end**. Checkout defaults to that stored plan, requires a payment method for the existing 14-day trial, and only verified Stripe webhook processing activates the subscription. A return URL cannot grant access.

QuoteDone jurisdiction and price-book setup remain blocked while payment is pending and unlock after a verified, unexpired trial or active subscription. Operator follows its existing setup and does not display QuoteDone jurisdiction controls. The database guard requiring verified payment-method evidence for trialing/active status remains unchanged.

Scale is removed from signup choices, billing choices, accepted signup plans, new Checkout configuration, and resumable client Checkout jobs. Explicit Scale checkout requests fail before any customer/session/ledger creation. Optional historical Scale price mappings still reconcile existing subscriptions; this does not enable a new purchase.

The deployment provider-write flag is now passed to billing status, so the UI correctly disables checkout when provider operations are disabled. No phone or voice behavior changed.

Locked monthly offers remain **Operator $119 / 300 minutes**, **QuoteDone $279 / 1,200 minutes**, and **$0.35/minute overage**. No pricing constants were changed.

## Security

Updated bcrypt to **6.0.0** and Express to **4.22.3**. The lockfile also resolves body-parser **1.20.8**, qs **6.16.0**, browserslist **4.29.3**, baseline-browser-mapping **2.11.26**, nanoid **3.3.19**, and postcss **8.5.28**. The bcrypt 5 tar/node-pre-gyp dependency chain is gone. A regression verifies existing bcrypt 5 password hashes still authenticate with bcrypt 6, and password reset revokes old sessions.

The independently executed baseline production audit contained **11 vulnerabilities: 1 critical, 5 high, 5 moderate**. The final command exited **0**:

`npm audit --omit=dev --json --cache .npm-cache --fetch-retries=0 --fetch-timeout=15000`

Exact final output is [final-audit.json](final-audit.json); the original is [baseline-audit.json](baseline-audit.json).

~~~json
"vulnerabilities": {
  "info": 0,
  "low": 0,
  "moderate": 0,
  "high": 0,
  "critical": 0,
  "total": 0
}
~~~

This is a point-in-time npm advisory result for this lockfile, not a guarantee against future advisories.

## Verification

Node **22.23.2**, npm **10.9.8**, Windows, Edge **154.0.4258.37**. Dependencies were installed cold from the new lockfile with `npm ci --no-audit --no-fund --cache .npm-cache --fetch-retries=0 --fetch-timeout=15000` (311 packages, exit 0). The unchanged price-book browser tests require Playwright; the bundled external test runtime and installed Edge were supplied through their existing environment variables. No test dependencies were added to the launch dependency graph.

| Check | Exact result | Evidence |
| --- | --- | --- |
| Cold full suite, all 55 root spec files, isolated new DB, concurrency 1 | **903 tests; 892 pass; 9 fail; 2 skipped; 0 cancelled; 0 todo** | [full-cold.tap](full-cold.tap), [command.json](command.json) |
| New signup, verified trial/active, card guard, Scale rejection, bcrypt compatibility | **8/8 pass** | [launch-plans.tap](launch-plans.tap) |
| Billing transport | **7/7 pass** | [billing-transport.tap](billing-transport.tap) |
| Final-bundle billing browser scenarios | **11/11 pass; no page errors** | [billing-browser.json](billing-browser.json) |
| Real-handler signup browser journeys | **Operator and QuoteDone pass; no page errors** | [signup-browser.json](signup-browser.json) |
| Actual server startup with provider writes disabled | **Both plans preserved; setup access false; Checkout 503; no billing provider records created** | [availability.json](availability.json), [availability.log](availability.log) |
| Main bundle | **Pass: 1,607 modules, 481.35 kB / 138.70 kB gzip** | [build.log](build.log) |
| Widget bundle | **Pass: 1,587 modules, 452.07 kB / 104.38 kB gzip** | [build.log](build.log) |

The full suite exits **1** because the same nine out-of-scope voice failures remain; it has **no new failures** relative to the stated 893-test / 882-pass baseline. Ten added root regressions account for the increase to 903 / 892. Sessions, recovery, auth limits, billing reconciliation, and the unchanged database guard tests pass. Both builds exit **0**.

The browser signup journeys use the built application, real signup/session handlers, real SQLite migrations and billing/onboarding services, and signed local webhook events validated by the Stripe SDK. Stripe customer/Checkout/subscription responses are synthetic. They verify stored plan and pending status, the chosen Checkout Price ID, card-required Checkout, reload persistence, URL tampering, trial activation, Operator jurisdiction deferral, and QuoteDone jurisdiction/price-book setup access. They do not make live Stripe calls.

The full suite does not boot server.js. Its one-line billing provider-availability wiring was verified separately by the actual-server smoke check. Final source and bundle hashes are in [source-bindings.json](source-bindings.json). See [Operator screenshot](Operator-onboarding.png) and [QuoteDone screenshot](QuoteDone-onboarding.png).

Reproduction from the repository root after npm ci:

~~~powershell
# Set these to installed test-only Playwright and Chromium/Edge locations.
$env:PRICEBOOK_BROWSER_MODULE = '<absolute path to playwright package>'
$env:PRICEBOOK_BROWSER_EXECUTABLE = '<absolute path to msedge.exe or chromium>'
$env:DATABASE_PATH = '<new temporary sqlite path>'
$specs = rg --files test | Where-Object { $_ -match '^test[\\/][^\\/]+\.spec\.(js|mjs)$' } | Sort-Object
node --test --test-concurrency=1 $specs
node --test test/launchPlans.spec.mjs
node --test client/test/billing-transport.test.mjs
npm run build --workspace client
node client/test/launch-plans-browser.mjs . '<fresh evidence directory>'
node client/test/billing-browser.mjs . '<another fresh evidence directory>' final
node verification/launch-plan-security/availability.mjs '<third fresh evidence directory>'
npm audit --omit=dev --json --cache .npm-cache --fetch-retries=0 --fetch-timeout=15000
~~~

Exact remaining failures:

1. test/googleGenAiLiveAdapter.spec.mjs — missing voice adapter module.
2. voice tool runtime persists a safe review quote and lead without exposing internal identities.
3. voice runtime binds availability to quote plus lead and sequences one hold before one confirmation.
4. test/voicePromptCompiler.spec.mjs — missing voice prompt compiler module.
5. tool schemas are closed and reject owner, rate, raw datetime, and raw identifier fields.
6. quote release requires an affirmative recap confirmation and availability requires an address-bound lead.
7. dispatcher rejects handler results containing raw rates instead of exposing them.
8. mutations are idempotent and conflicting reuse of a tool call id is rejected.
9. test/voiceWebSocketServer.spec.mjs — missing voice websocket module.

## Remaining launch risks

- **Real Stripe configuration is unverified.** Confirm the deployed Operator/QuoteDone Price IDs resolve to the approved amounts and intervals, the webhook works in the intended Stripe mode, and the external billing portal catalogue excludes Scale. This change does not read or configure that external catalogue. The owner-selected plan is preserved while awaiting verified payment; it is intentionally not granted a trial at signup.
- **Historical affected signups:** the old insert did not store the original requested plan. No automatic recovery can infer that lost selection. Existing pending owners can explicitly select QuoteDone at Checkout; this task does not guess or backfill old choices.
- **Metering remains incomplete in the voice lane.** The calls table has a minutesBilled field, but voicePersistence inserts zero and sums stored minutes across all history. No production writer of billed call minutes, billing-period allowance accounting/enforcement for 300/1,200 minutes, Stripe usage submission, or overage accounting was found. planAccess has a tested 60-minute trial cap helper, but it has no production callers. The dashboard has preview activity only, not a production usage meter. No call-minute source was built.
- **The nine voice failures above remain.** Voice, telephony, the onboarding phone step, quote engine, price book, widget source, CI and repository hygiene were not changed.
- Some existing price-book copy and old specifications still mention Scale. That wording is outside the authorized price-book lane; the launch purchase surfaces and API reject Scale.
- Live account-email delivery remains deferred by the owner.

No deployment, merge, live provider purchase, or live email delivery was performed. This closes the scoped plan/dependency implementation with the verification limits above; it does not declare the whole product ready to launch.
