# Three-branch release integration — October 7, 2026

Target: `codex/quote-release-candidate-20261006`. Base: `5c1050dce191e9b97f20234b2747554bbbf3a20c`.

## Ordered inputs

| Order | Branch | Pinned commit |
| --- | --- | --- |
| 1 | feat/billing-lifecycle-20261007 | 852caa913d44d5b7e3b3cec6d90d9dd02ba1679e |
| 2 | feat/offsite-backups-20261007 | 0062c4307f54f5a4839ead1f912d2d4c889889b4 |
| 3 | fix/tenant-isolation-20261007 | 1189372bd5872d8c9d719cf7248e4d5ec3636da2 |

Each input remains an actual merge parent, in this order. No squash or cherry-pick substitutes. [CONFLICTS.json](CONFLICTS.json) records all 12 textual conflict instances across seven files and the resolution of every one. Both sides' test files and stricter behavior are retained.

## Combined behavior and regressions

- Expanded the tenant matrix from 98 to **115 HTTP/WebSocket registrations**: 111 in preview and 112 in production, union 115. Reviewed every newly merged route, including all four billing lifecycle/export routes, admin-only off-site status, owner alerts, webhook delivery history, lead activity, fallback/status/transfer and SMS provider callbacks. Kept runtime, mounted middleware, route source, added-route, anonymous-router and hidden-declaration guards. All 24 route source fingerprints are explicitly reviewed.
- Seeded real synthetic alert, transfer and SMS receipts for foreign-ID attacks; test signatures, saved bindings, tokens, guessed IDs, both tenants and provider/no-mutation snapshots. Own billing state and all three CSV exports remain available; only an authenticated admin can read off-site status. Seeded notification work is scheduled beyond the observation window so the legitimate background worker cannot race immutable authorization snapshots.
- Reproduced day-90 deletion failing with a foreign-key violation after callback/alert/SMS merges. Delete those child rows first and remove both tool and encrypted inbound receipt namespaces, always scoped to the ended tenant. The regression checks the exact boundary, byte-identical other-tenant rows, financial evidence retention and clean foreign keys.
- Reproduced an already-issued fallback capture callback dialing after service end. Capture, partial and repeat endpoints now honor the same service-end boundary and return Hangup, with no AI, Dial or Gather.
- The strict saved-service check initially prevented recovery of immutable quote receipts when the current book was corrupt/missing. Owner-bound existing submission IDs now reach the existing exact-payload digest check before current-book validation. Exact replay returns the original receipt; changed service/payload returns 409; new quotes still require a valid saved service. Backup/restart/corrupt-book tests cover this interaction.
- Preserved anonymous caller support without permitting reuse of a CallSid under a different caller, destination or owner. Generic 403 selector tests replace weaker 400/ignored-selector expectations, while retaining positive own-tenant reads and writes.
- Backup rehearsal now verifies a captured synthetic email via the real HTTP route before login; no session is granted before verification. Real $100 quote, lead, confirmed-booking, backup/restore and immutable replay assertions remain.
- Rebuilt the committed owner-app assets from the merged sources. No quote arithmetic changed: all inputs and this integration retain `quote-engine-vnext-date-context-20261006-v7`. Owner-only deadlines, $0.35/min overage with 60/30/0 alerts, upfront annual trial-end charge and monthly resets remain covered by the inherited release tests.

## Verification checkpoint

Synthetic data only. Local Node 22 cold `npm ci` installed 288 packages; owner app and widget builds passed; `npm audit --omit=dev --audit-level=high` found **zero vulnerabilities**. The empty `.github/known-test-failures.txt` is retained.

Focused final verification (disjoint test files):

| Tests | Pass | Fail / skip / cancelled / TODO |
| --- | ---: | --- |
| Expanded tenant matrix, backup recovery and booking application | 246 | 0 / 0 / 0 / 0 |
| Named contact, lead capture and owner-alert selector contracts | 23 | 0 / 0 / 0 / 0 |
| Billing lifecycle, production callbacks and release integration | 57 | 0 / 0 / 0 / 0 |
| Off-site encryption, retention and synthetic S3 restore | 23 | 0 / 0 / 0 / 0 |
| Total focused checks | **349** | **0 / 0 / 0 / 0** |

The initial local full gate ran 3,594 tests with 69 failures and zero skips: 16 were integration fixture/selector failures repaired and rerun above; 53 were missing Chromium failures. This is not a passing local full gate. Browser installation is being retried; the hosted cold run on the exact published head is the final complete-gate evidence. No tests are disabled or allowlisted. Full/quote counts and the exact hosted run are reported in the task completion after publication, rather than predicting them in this pre-publication checkpoint.

No subagents, merge to main, deployment, live data, real payments, email or SMS. Off-site tests use the loopback fake S3 service only.
