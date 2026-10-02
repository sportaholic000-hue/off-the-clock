# Real-call usage and Stripe overage

Implementation starts at `380c9153ae0598293dc81ab42072498e04483d97`. Voice integration remains Claude's lane.

## Locked policy and owner rulings

- Operator: $119/month, 300 included minutes. QuoteDone: $279/month, 1,200 included minutes.
- Each completed connected inbound call rounds UP once: `ceil((answeredEndMs - answeredStartMs) / 60000)`. A zero-length leg is zero.
- Spam-filtered calls and calls recorded as AI_FALLBACK are excluded. Trial calls never create overage.
- The entire rounded call belongs to its answered start time. A call beginning in the trial stays free even when it ends after the trial or after the paid reset.
- Trial: 14 days, verified payment method, 60 total minutes. At 60, refuse the next AI call and use the existing fallback. Finish an already-running call; absorb trial overrun.
- Paid calls continue beyond the included allowance, accruing exactly 35 cents per rounded minute over that window's allowance.
- Use VERIFIED Stripe item-level renewal windows, with exclusive end boundaries. Do not use calendar months, guessed dates, fixed 30-day windows, subscription creation time, or dashboard time.
- Annual plans remain. Base payment is annual; allowance and overage renew MONTHLY using the monthly metered item's window.
- Upgrade raises the existing window's allowance without resetting usage. Downgrade keeps that window's higher allowance until renewal; the next verified window uses the new plan.

## Voice-lane handoff (required before claiming live enforcement)

Import only on the trusted server:

```js
import {getCallAllowanceDecision,recordCompletedCall} from './callUsage.js';

// BEFORE accepting a new connected AI call:
const allowance = getCallAllowanceDecision(authenticatedTenantOwnerId);
if (!allowance.canStartNewCall) {
  // Use the existing voice fallback; do not start a new AI session.
}

// ONCE the connected inbound leg completes:
recordCompletedCall({
  tenantOwnerId: authenticatedTenantOwnerId,
  callId: verifiedTwilioInboundCallSid,
  answeredStartAt: answeredStartEpochMilliseconds,
  answeredEndAt: answeredEndEpochMilliseconds,
  spamFiltered: verifiedSpamDecision
});
```

The tenant and call identity come from Claude's verified voice runtime, never a browser, model argument, or public request. Timestamps accept exact UTC ISO with milliseconds or integer epoch milliseconds. Use connected/answered times, not ringing, outbound transfer duration, or dashboard elapsed time. Persist any AI_FALLBACK outcome in the existing calls row BEFORE reporting completion.

The completion entry point is synchronous, transactional, and makes no Stripe requests. Exact repeated reports are no-ops; changed reports and cross-tenant reuse of a call ID are rejected without exposing the other account. Retry an interrupted report with exactly the same fields. Records arriving before verified window evidence remain durable and become attributable when the evidence arrives.

The pre-call gate and completion callback are intentionally NOT wired into voice code in this PR. Both are required to obtain actual live usage and enforce the trial cap. Concurrent calls already in progress finish; completion accounting does not reserve hypothetical future trial minutes.

## Owner dashboard and data

The owner dashboard shows used/remaining minutes, allowance, verified window, and paid overage from the same append-only call ledger. Unknown windows display a pending state rather than fabricated zero usage.

`GET /api/usage` and `GET /api/usage/calls` require owner session authentication and select the tenant exclusively from that session. Staff are denied; both responses use no-store. There is no public usage-ingestion endpoint.

Additive SQLite tables: callUsageRecords, voiceUsagePeriods, voiceUsageAllowanceRevisions, voiceUsageEvidenceReceipts, voiceUsageSubmissions, voiceUsageItemProvisioning. They live in the existing volume-backed database and backups. Completed call records and verified period boundaries are immutable. Historical corrections need an explicit audited reconciliation, not a silent overwrite.

## Stripe setup

Use the existing Stripe account and the same currency for all prices. No additional vendor is required. Set up and verify in Stripe TEST MODE first:

1. Keep the four configured base prices: Operator monthly 11900 cents and annual 119000; QuoteDone monthly 27900 and annual 279000 (existing annual two-month discount).
2. Create an active SUM billing meter with raw events (no hourly/daily preaggregation), event name such as `otc_voice_overage`, customer mapping `by_id` / `stripe_customer_id`, and value key `value`.
3. Create one active recurring MONTHLY metered, per-unit price linked to that meter, exactly 35 cents per unit. No quantity transform, tiers, or annual overage price.
4. Set `STRIPE_USAGE_ENABLED=true`, `STRIPE_OVERAGE_MONTHLY_PRICE_ID=price_...`, `STRIPE_USAGE_METER_ID=mtr_...`, `STRIPE_USAGE_EVENT_NAME=otc_voice_overage`. Keep every existing Stripe/auth/deployment setting from RAILWAY_SETUP.md. Enable `PROVIDER_WRITES_ENABLED=true` only in the intended provider environment.
5. Keep the existing signed Stripe webhook and its supported subscription, Checkout and invoice events. Use the server's API version `2026-08-26.dahlia` (SDK 22.6.2). Do not expose secret keys to the client.
6. Monthly Checkout contains base + monthly meter. Annual Checkout contains the annual BASE only, in flexible billing mode: Stripe currently disallows mixed intervals in Checkout. After the EXISTING billing state verifies the payment method, a durable background job attaches the monthly metered subscription item using `subscriptionItems.create`, no quantity, no prorations, and a stable idempotency key. It retrieves the subscription again to verify the result. Until that succeeds, the usage gate refuses new AI calls.
7. Confirm a monthly and an annual signup through trial, paid renewal, two monthly usage resets, overage aggregation and a TEST invoice. Never verify with a real customer charge. Adding the monthly usage item does not change the existing annual item.
8. Before production, configure matching LIVE-mode prices and meter. Startup performs read-only catalog validation and refuses missing configuration, wrong currency/rate/interval, wrong aggregation, mode mismatch, or an inaccessible catalog. Nothing creates catalog resources or charges customers during startup.

Existing subscriptions without the meter need deliberate migration; this task does not silently recreate or migrate classic subscriptions. An annual flexible subscription awaiting its first monthly item is handled automatically after verified payment method evidence.

## Reporting, retries and operational limits

The worker runs every 30 seconds. It refreshes unavailable current windows using authenticated Stripe subscription retrieval, then queues paid CLOSED-window overage. It sends only `max(total rounded minutes - effective included minutes, 0)`, less already queued units. Late reports generate only the additional delta.

Each event uses the bound customer, a durable unique identifier/idempotency key, and a timestamp one second within the ORIGINAL window's end. Annual overage therefore belongs to the monthly item, never the annual base period. Trial, spam, fallback and included units are not submitted.

Provider requests are outside call/booking/widget flows. Jobs and leases survive restarts. Shutdown stops further work and waits for the in-flight worker before the existing lifecycle closes SQLite. Failed delivery retries exponentially from 30 seconds to one hour.

Inspect `voiceUsageSubmissions` and `voiceUsageItemProvisioning` for RETRY/REVIEW and monitor structured usage error codes. An ambiguous request approaching 24 hours is held for review at 23 hours rather than replayed beyond Stripe's deduplication guarantee. A meter timestamp older than Stripe's 35-day limit is held for review rather than shifted to the wrong month. Do not manually reset REVIEW jobs until Stripe delivery/meter history has been reconciled.

An ACCEPTED meter event means Stripe acknowledged the API request. Stripe aggregates asynchronously; it is NOT proof an invoice was finalized or paid. Review Stripe meter processing errors and test invoice line items before launch. A completed call reported after its original invoice has finalized can require invoice reconciliation. Configure an invoice finalization grace period appropriate to call duration and worker outages; do not bill those units into the next month. If the service misses an entire renewal window, retrieve verified historical billing evidence before attributing its retained records; the worker does not guess missing history. Conflicting or overlapping provider windows fail closed and require review.

## Verification provenance

The SDK tests run against a loopback HTTP server with recorded official API-CONTRACT fixtures and deliberately substituted customer IDs, dates and identifiers. The Meter Event response shape was recorded from the official API example on 2026-10-02. They verify actual SDK serialization, error handling and database state without contacting a Stripe account. They are NOT authenticated sandbox recordings and do NOT prove invoice finalization. Stripe's connected app required reauthentication during this task; no live charges were made.

Primary sources checked:
- [Meter Event API](https://docs.stripe.com/api/billing/meter-event/create): identifier deduplication and timestamp bounds.
- [Mixed intervals](https://docs.stripe.com/billing/subscriptions/mixed-interval?dashboard-or-api=api): monthly usage with annual base, item-level windows, flexible mode and Checkout limitation.
- [Subscription item creation](https://docs.stripe.com/api/subscription_items/create): adds an item without replacing existing items.
- [Flexible billing](https://docs.stripe.com/billing/subscriptions/billing-mode): API version and mode.

