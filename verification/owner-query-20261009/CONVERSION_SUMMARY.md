# Owner query conversion inventory

Base: `fc6efdea1266ed0e4be750d3cc4f3ed6d336645b`
Branch: `fix/owner-query-20261009`

The direct-prepare scan fails on the base with 374 unlisted statements. Each remaining exception is keyed to its precise SQL argument and occurrence in `server/src/ownerQueryExceptions.js`.

| File | Direct prepares routed through helper |
| --- | ---: |
| `server/priceBookService.js` | 2 |
| `server/src/billingCustomerLifecycle.js` | 2 |
| `server/src/billingEvidence.js` | 6 |
| `server/src/billingMutationGuard.js` | 1 |
| `server/src/billingProvider.js` | 3 |
| `server/src/billingRoutes.js` | 20 |
| `server/src/billingStateService.js` | 29 |
| `server/src/bookingCapabilities.js` | 4 |
| `server/src/bookingPreferenceService.js` | 5 |
| `server/src/bookingRoutes.js` | 1 |
| `server/src/bookingService.js` | 74 |
| `server/src/calendarOAuthState.js` | 2 |
| `server/src/callbackRequestService.js` | 4 |
| `server/src/customerIdentityService.js` | 1 |
| `server/src/leadCaptureRepair20261006.js` | 10 |
| `server/src/outboundWebhookService.js` | 3 |
| `server/src/ownerAlertService.js` | 3 |
| `server/src/ownerWorkflowService.js` | 1 |
| `server/src/quoteDate.js` | 1 |
| `server/src/quoteEmailService.js` | 3 |
| `server/src/tenant.js` | 2 |
| `server/src/voice/productionVoiceRuntime.js` | 10 |
| `server/src/voice/voiceInboundReceipt.js` | 1 |
| `server/src/voice/voicePersistence.js` | 23 |
| `server/src/voice/voiceRecovery.js` | 5 |
| `server/src/voice/voiceSettings.js` | 2 |
| `server/src/voice/voiceToolRuntime.js` | 34 |

Total direct prepares converted: **252**.

The only SQL changed adds owner predicates to owner rows, call-bound nonce/handle records, or owner-bound idempotency receipts. The latter receives an owner column with an empty legacy default so existing receipt replay remains available.

Verification after client build:

- `npm test`: 4,421/4,421 passed.
- `npm run test:quote`: 3,082/3,082 passed across 155 files.
- Direct-prepare scan and owner-row/legacy-receipt regressions: 3/3 passed (`AFTER.tap`).
- Docker executable unavailable, so the voice smoke test was not run.
