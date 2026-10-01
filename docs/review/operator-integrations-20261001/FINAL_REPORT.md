# Operator CSV exports and outbound webhooks — 2026-10-01

## Result

The requested CSV/export and signed-webhook behavior passes its functional checks. The cold original/final comparison has **no new failures**: the same nine out-of-scope voice failures remain. Hosted CI remains red from the inherited browser/voice failures, detailed below. This is a draft for owner review, not a merged/deployed release.

Started from the requested `d03a2a3b5e80eb78ca40d3620d0f6dd47d54e809`. Implementation is saved on `codex/operator-exports-webhooks-20261001` at `e9342d6b04eb6d6a53fb00f51f80ab8afab812f6`, in [draft PR #9](https://github.com/sportaholic000-hue/off-the-clock/pull/9). Nothing is merged or deployed.

## What changed

- Owners download tenant-scoped leads, quote requests and bookings from the dashboard. Selection comes from the validated owner session; supplied owner IDs cannot select a different tenant. Exports use selected record fields and omit credentials/internal quote snapshots.
- CSV cells are quoted and escaped, with UTF-8 BOM and CRLF. Formula prefixes `= + - @`, full-width versions and whitespace/control-prefixed formulas receive an apostrophe. Stored data stays unchanged. Paging covers more than 500 records.
- Owners register one public HTTPS endpoint and select lead, quote-request and confirmed-booking events. Their signing secret is encrypted with the existing credential facility and bound to owner/version; ordinary reads omit it.
- Database triggers capture allowlisted snapshots in the producer transaction. A separate background worker signs POSTs with HMAC-SHA256, validates/pins public DNS addresses, checks TLS and rejects redirects. Network/receiver failure does not change a successful producer write.
- Delivery has eight automatic attempts, durable leases/crash recovery, a stable event ID/body, fresh retry timestamps, owner-scoped status and manual retry. Batches rotate across owners so the first backlog cannot starve later tenants. Endpoint changes cancel old queued deliveries.

Existing source edits are limited to `.env.example`, migration/server integration wiring, the authenticated API's CSV response support and one owner dashboard component mount. Added modules implement these integrations and tests. There are no stylesheet, public-page, voice, forwarding, incoming-call, quote-engine, price-book or booking implementation edits. [Source/scope evidence](source-binding.json), [scope check](scope-boundary.json).

## Exact validation

| Check | Result | Evidence |
| --- | --- | --- |
| Original cold suite | 973 tests; 964 pass; 9 fail; 0 skip | [Original totals/failure names](baseline-results.json) |
| Final cold suite | 1,014 tests; 1,005 pass; 9 fail; 0 skip | [Final totals/failure names](final-results.json) |
| New failures | 0; identical nine voice failure names | Original/final comparison |
| Focused integration regressions | 41 pass; 0 fail | [Exact TAP output](focused.tap) |
| Built-dashboard browser workflows | 13 pass; 0 fail; 0 runtime errors | [Named checks](browser-results.json) |
| Owner production build | Exit 0 | [Build output](build-app.log) |
| Widget production build | Exit 0 | [Build output](build-widget.log) |

The focused command was:

```text
node --test test/ownerIntegrations.spec.mjs test/integrationDownloads.spec.mjs
```

[All 41 named regression outcomes](focused.tap) cover owner authentication and revocation, all three export types and webhook events, tenant isolation, formula/control/quote escaping, >500-row paging, allowlisted payloads, secret encryption and tenant binding, signing, retry timing/exhaustion/manual retry, durable reopen, concurrent claims and lease recovery, account/dispatch changes during DNS, rollback, event toggles/rotation/removal, and worker fairness. A real localhost HTTPS receiver independently verifies HMAC and returns 503 then 204; its fresh certificate/key is generated in memory. No private key is saved or committed.

Cold runs used Node v22.23.2 in fresh processes, sequential original then final, with every original server spec and both existing client transport specs; final also includes the two new specs. The unchanged editor/browser specs were given Playwright and Edge paths. No tests were removed, skipped or rewritten to obtain the comparison.

```text
node --experimental-test-module-mocks --test --test-concurrency=1 --test-force-exit <all original test/*.spec.js and test/*.spec.mjs plus client/test/*.test.mjs; final also includes the two new integration specs>
```

The exact executable argument arrays and browser environment setup are in [cold-commands.json](cold-commands.json). Complete TAP logs are compressed in [baseline.tap.gz](baseline.tap.gz) and [final.tap.gz](final.tap.gz); decompression yields the SHA-256 recorded in their result JSON. Both report exit code 1 because the nine unchanged voice failures remain.

The built dashboard was checked with:

```text
node verification/operator-integrations/fixture.mjs
node -e "process.env.PLAYWRIGHT_MODULE_PATH='C:/Users/money/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';process.env.BROWSER_EXECUTABLE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';import('./verification/operator-integrations/browser.mjs')"
```

The fixture uses a fresh synthetic database/authentication and disables receiver/provider writes. [13 named browser checks](browser-results.json) include real CSV downloads, tenant/account switching, HTTPS registration, one-time key display/readback, event capture/toggles, rotation, invalid URL rejection and removal, with no runtime errors.

Both production build commands ran in `client` and returned code 0:

```text
node ../node_modules/vite/bin/vite.js build
node ../node_modules/vite/bin/vite.js build --config vite.widget.config.js
```

[Owner build log](build-app.log): Vite 6.4.3, 1,609 modules; 487.76 kB application JS. [Widget build log](build-widget.log): 1,587 modules; 452.35 kB widget JS. Client/bundle source did not change after these builds; the final fairness fix changes the server worker only.

## Hosted CI

The integration branch had already advanced from d03a2a3 to fbf6e27 with three CI files and no application-source changes. Its [hosted run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36835956484) reports 948 tests, 918 pass, 28 fail, 2 skip. PR #9's [implementation run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36844984150) reports 989 tests, 959 pass, 28 fail, 2 skip: 41 additional passing tests, with exactly the same failure names. Those failures are the nine known voice failures and 19 pre-existing editor/browser failures. Hosted builds/audit were skipped after that gate failed; the build results above are local. The CI command also omits the existing client transport tests and module-mocks flag used in the complete local comparison. [Exact hosted comparison](hosted-ci.json). CI is still red; no CI files were edited.

## Remaining risks and deployment requirements

- Run the worker with a persistent, running Express server and SQLite database. Production defaults to dispatch enabled unless explicitly false; set `OUTBOUND_WEBHOOKS_ENABLED=true` when copying the checked-in development example. Preview mode disables delivery.
- Preserve `CREDENTIAL_ENCRYPTION_KEY` alongside database backups; changing/losing it without a credential migration prevents signing. Key-version labels do not provide a key ring.
- Delivery is at least once: the receiver must validate raw-body signatures and deduplicate event IDs. A POST already sent can finish after endpoint removal/rotation. Historical canceled events are not replayed to a new endpoint.
- Receiver/network failures are isolated; a database/disk failure can still reject the original transactional write. Monitor queue/disk capacity. Customer snapshots currently have no automatic retention purge; a retention policy remains to be selected.
- No live customer receiver was contacted. Before production enablement, perform an owner-controlled end-to-end receiver check. The nine original voice failures and inherited hosted CI failures remain outside this feature's completion.

[Webhook contract and deployment instructions](../../operator-integrations.md). This report approves neither public visual design nor whole-project launch readiness.

## Functional labels for owner review

The draft uses the existing dashboard controls/classes, with no visual redesign. Proposed functional labels are: Webhooks and CSV support; Download leads CSV; Download quote requests CSV; Download bookings CSV; HTTPS webhook URL; New lead; New quote request; Confirmed booking; Save webhook; Rotate signing secret; Remove webhook; Refresh delivery status; Retry delivery; Webhook signing secret. They are recorded here for review under AGENTS.md; nothing has been shipped live.
