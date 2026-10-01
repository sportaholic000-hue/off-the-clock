# Railway implementation and verification — 2026-10-01

Implementation: [draft PR #11](https://github.com/sportaholic000-hue/off-the-clock/pull/11), commit **d64e25117253ab8f9199f59711f437a897a0963a**.
Exact starting commit: **7a911afd993bc0d5c07c3d20f977c8988f072208**.
[Owner setup guide](https://github.com/sportaholic000-hue/off-the-clock/blob/d64e25117253ab8f9199f59711f437a897a0963a/docs/RAILWAY_SETUP.md).
[Complete environment template](https://github.com/sportaholic000-hue/off-the-clock/blob/d64e25117253ab8f9199f59711f437a897a0963a/deployment/railway.env.example).

The implementation and checks are complete. No Railway service, paid resource, domain/DNS change or off-site destination was provisioned. This is deployment preparation, with a real Linux container proof; it is not a claim that the service is live or that the separate voice lane is launch-ready.

## What changed

- One Docker image runs a fresh lockfile install and both existing Vite builds, then starts the API directly as PID 1. Committed node_modules, dist, runtime data and real .env files are excluded from the image inputs.
- Existing owner app and widget assets are served by the API. Widget JS remains accessible from customer websites. Unknown/private paths are not exposed by the SPA fallback. The existing demo JS is byte-for-byte unchanged and its session route remains installed.
- Production boot validates required secrets, origin settings, provider feature groups, explicit proxy policy, drain time and actual mounted storage before opening SQLite. All database, price-book, backup and temporary-file paths derive from APP_DATA_DIR inside the declared volume. Railway development-mode overrides are refused.
- SQLite uses WAL and synchronous FULL in production. Health checks query the database and fail readiness during draining.
- SIGTERM stops accepting traffic, finishes tracked asynchronous HTTP work even after a client disconnects, awaits active outbound webhook work and backups, then closes SQLite. A missed deadline exits nonzero for journal/lease recovery rather than closing the database underneath unfinished work.
- TRUST_PROXY controls the canonical client address for existing auth, booking, quote and demo limits. Railway mode uses its protected X-Real-IP and ignores X-Forwarded-For; direct mode ignores forwarded headers. Tests exercise an actual simulated HTTP proxy, forged headers, distinct clients, malformed values and IPv6 aliases.
- Scheduled six-hour online SQLite snapshots include price-book JSON and a checksummed manifest. Integrity, foreign keys and checksums are verified before a snapshot is published. Thirty-day retention preserves the newest snapshot. The restore CLI validates a complete bundle and restores only into a new directory under /data/restores; it cannot overwrite current data.
- CI's existing bundle build was moved before the full tests because the new production-start checks correctly require built bundles. The existing nine-failure voice list was preserved. A separate Linux Docker proof tests the actual image with deliberately poisoned committed artifacts.

There are 25 additional regression tests. Deployment/configuration: 8; proxy identity: 4; backup/recovery: 7; shutdown/readiness: 4; production process/restart/restore: 1; active webhook-worker shutdown: 1. Existing demo tests were adjusted to the single proxy policy.

## Exact checks and results

| Check | Result |
|---|---|
| Immutable baseline, Windows Node v22.23.2, full cold suite | 1,027 tests; 1,016 pass; 9 fail; 2 skipped; 0 cancelled |
| Final Windows Node v22.23.2, full cold suite | 1,052 tests; 1,041 pass; the identical 9 fail; 2 skipped; 0 cancelled |
| Final focused Windows deployment/compatibility suite | 91 tests; 91 pass; 0 fail; 0 skipped/cancelled |
| Final GitHub Linux CI, push and PR runs | 1,052 tests; 1,041 pass; 9/9 known failures; 2 skipped; no new failures; jobs successful |
| Clean local npm ci | Exit 0; 311 packages installed from unchanged lockfile |
| Owner app and widget build | Both pass locally, in GitHub CI and in Docker |
| Local npm audit --json | Exit 0; info 0, low 0, moderate 0, high 0, critical 0, total 0 |
| GitHub npm audit --omit=dev --audit-level=high | Exit 0; found 0 vulnerabilities |
| Linux Docker image/restart/redeploy/restore proof | Passed on the same implementation commit |

The full suite still exits 1 from the nine baseline voice failures; the CI baseline-comparison step succeeds because no additional failure is present. This is not an all-green voice suite. Windows baseline duration: 1,160,961.6453 ms. Final Windows duration: 675,476.3975 ms. Focused duration: 74,158.1035 ms.

Commands:

```sh
npm ci --no-audit --no-fund
npm run build
node --test test/*.spec.js test/*.spec.mjs
npm audit --json
npm audit --omit=dev --audit-level=high

node --test test/deploymentConfig.spec.mjs test/clientAddress.spec.mjs test/backups.spec.mjs test/lifecycle.spec.mjs test/liveDemo.spec.mjs test/ownerIntegrations.spec.mjs test/authSessionService.spec.mjs test/deploymentProcess.spec.mjs

docker build --progress=plain -t otc-railway-proof .
node verification/railway/docker-smoke.mjs otc-railway-proof
```

Windows commands used the bundled Node v22.23.2/npm CLI with explicit test-glob expansion and task-private temporary/cache paths; the saved exit metadata gives exact arguments. Existing browser tests used the bundled Playwright and Edge executable. No dependencies or lockfile entries were added for this implementation. Linux CI's existing browser installation remains separate from production dependencies.

Hosted evidence:
- [Push CI](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36934361215).
- [PR CI](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36934367000).
- [Linux container proof](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36934361209).

Docker proof image: **sha256:4c42a3218fc4f94ae0fff2b691006410697f90a5af5659578ef56d4cd05cd841**. It proves fresh dependencies and rebuilt bundles despite poisoned checkout artifacts; actual Linux SIGTERM with exit 0 and the database-closed log; same-container restart; a different container reading the same volume; actual restore CLI and a fresh process reading the restored database and two tenant-bound price books; refusal of an unmounted directory and a Railway development-mode override. These are isolated synthetic records, not real customer data.

## Source verification and scope

Every one of the 29 changed files was read back against its local Git blob hash: **zero mismatches**. SOURCE_BINDING.json lists hashes and the complete changed-file allowlist. Comparing the immutable base and final Git trees found **zero unexpected changed files**.

The package lockfile, every client file, the public demo JS and all voice implementation files remain identical to the base. No quote-engine, price-book implementation, widget behavior, telephony, marketing-page or email-delivery implementation was changed. Production asset serving uses the existing builds.

## Known baseline failures

The normalized names are identical before and after:

1. test/googleGenAiLiveAdapter.spec.mjs
2. voice tool runtime persists a safe review quote and lead without exposing internal identities
3. voice runtime binds availability to quote plus lead and sequences one hold before one confirmation
4. test/voicePromptCompiler.spec.mjs
5. tool schemas are closed and reject owner, rate, raw datetime, and raw identifier fields
6. quote release requires an affirmative recap confirmation and availability requires an address-bound lead
7. dispatcher rejects handler results containing raw rates instead of exposing them
8. mutations are idempotent and conflicting reuse of a tool call id is rejected
9. test/voiceWebSocketServer.spec.mjs

## Remaining setup decisions and practical limits

- The owner still needs the Railway account/plan, service and volume, private credentials, domain creation and live smoke checks. The app subdomain's CNAME target and TXT ownership token are assigned by Railway only after service/domain creation. The guide specifies the exact record types and name, and where to copy the service-specific values; no DNS target was invented.
- Actual Railway ingress has not been exercised. The single-address policy follows [Railway staff's protected X-Real-IP contract](https://station.railway.com/questions/security-critical-questions-on-edge-prox-8fddd775) and passes simulated-proxy tests. The guide includes an actual-service check using forged headers and two real connections. A separately exposed direct backend must not trust client-authored X-Real-IP.
- Local snapshots cannot recover from loss of the whole Railway volume. An independent off-site destination remains an owner decision; no uploader/bucket/subscription was created. At 50 GB average storage, R2 Standard is $0.75/month before its free allowance, or $0.60 if its 10 GB allowance is unused; B2 is approximately $0.35/month before applicable credits. These are USD storage-only estimates, not total bills. [R2 current pricing](https://developers.cloudflare.com/r2/pricing/), [B2 current pricing](https://www.backblaze.com/cloud-storage/pricing).
- Default recovery can lose up to six hours of changes after the last successful backup; sustained backup failure can extend this. Full snapshots require storage headroom and monitoring. Continuous off-site replication and point-in-time recovery described in the earlier platform spec are not implemented by this task.
- SQLite snapshots are transactionally consistent. Price books are complete individual JSON files; a bundle is not one transaction spanning SQLite and every price book. Keep bundles private and preserve encryption/signing secrets separately. Recovery was tested for this schema/implementation; older-schema restores require compatibility review.
- A single attached volume means brief redeploy downtime and one replica. Railway startup health checks are not continuous uptime monitoring.
- The baseline has no complete live-call WebSocket runtime. Its future WebSocket drain must join the shutdown lifecycle before voice is enabled. The nine voice failures and live provider checks remain Claude's lane. Live email stays deferred; console delivery cannot deliver customer recovery/verification emails.
- Fresh Docker/npm checks passed for the recorded image and dependency set. The floating Node 22 base can receive future patches; rerun the same check on future runtime/dependency changes. No container OS vulnerability scanner was claimed.

## Errors corrected during this work

Earlier GitHub runs failed because one uploaded file contained truncated tool output, the production tests ran before bundles were built, and the first container checker ignored stderr and could not clean its private root-owned synthetic files. These were implementation/save/checker errors, not merely the known voice failures. They were corrected; the final code was hash-verified and both hosted CI runs plus the Docker proof passed. The production process fixture also now allows slower Windows cold startup and registers each child for cleanup.

The final implementation branch is kept at the tested commit. Evidence is saved separately so recording results does not rerun the implementation workflows.
