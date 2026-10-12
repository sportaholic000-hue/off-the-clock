# Deploy-day checklist — October 20, 2026 target

Prepared October 12 from the pinned candidate-k base and reconciled for candidate l. Use only the final validated SHA and tag from [candidate l’s report and handoff](../release-candidate-20261012l/REPORT.md); no tag or deployment approval is assumed here. Every checkbox below is **NOT RUN**. This is an owner-executable plan, not authorization to merge, deploy, configure providers, purchase resources, create keys or change DNS. Obtain separate owner authorization for execution and any charges. This pack does not satisfy the release audit gate.

Historical owner report only: Railway project `brilliant-nature`, service `off-the-clock`; `main` auto-deploys; no configured variables, volume or domain; US West/sfo; Railpack; last reported deployment failed July 20. None of that account state was checked during this task. Intended replacement: US East application hosting, root Dockerfile, `/data` persistent volume, complete runtime configuration and a private Railway backup bucket.

## Ordered execution

### 1. Establish authority, release identity and recovery custody

- [ ] Owner approves the execution window, resource/provider spending, final candidate and responsible operator. Complete the blocking actions in [OWNER_ACTIONS.md](OWNER_ACTIONS.md), including policy review and provider access. Obtain the independent release-audit decision separately.
- [ ] From an operator checkout, run the read-only identity checks:

```bash
git ls-remote https://github.com/sportaholic000-hue/off-the-clock.git 'refs/tags/rc-20261012l*'
git rev-parse HEAD
```

Required tag evidence, with placeholders filled from the final validated candidate-l handoff (not fabricated values):

```text
<ACTUAL_ANNOTATED_TAG_OBJECT_SHA> refs/tags/rc-20261012l
<FINAL_VALIDATED_CANDIDATE_L_SHA> refs/tags/rc-20261012l^{}
```

Stop if the tag is absent, its peeled SHA differs from the reviewed final candidate, or required independent Astra + Sol clean audits for both scopes do not cover that same commit. An untagged work checkpoint is not a release.

Keep a private recovery inventory of signing keys, credential-encryption key/version and backup-encryption key outside `/data`. Do not paste those values into evidence. Assign someone to watch authenticated backup/retention health after launch; there is no automatic backup-alert email/SMS in this implementation.

**Evidence:** approval, exact approved source SHA, independent audit/CI references, recovery custodian, no secret values. **Stop/recovery:** a changed tag, unreviewed source or inaccessible recovery keys stops execution. Resolve identity/access before proceeding; do not retag.

### 2. Re-read Railway state and contain the automatic-deploy trigger

- [ ] Owner opens the actual project/service/environment and records current source branch, latest deployment SHA, builder, region, volumes, variables, domains and pending changes. Record names/status only for secrets. If the reported empty service now holds real customer data, stop this synthetic-only procedure and obtain a reviewed migration plan.
- [ ] Before any authorized merge to `main`, disable GitHub automatic deployments in service source settings and confirm that state. Hold pending deployments and staged configuration changes until the approved source/configuration are ready. Disabling GitHub autodeploy does not make applying configuration changes harmless; those changes can create deployments too.
- [ ] Record the intended `main` integration SHA when a separately authorized merge occurs. A merge to connected `main` would otherwise trigger a Railway build. This documentation branch is not a deployment source and must not be substituted for release approval.

**Evidence:** timestamped source/autodeploy readback and no unexpected queued deployment. **Stop/recovery:** if a build starts early, cancel/hold it using Railway before admitting traffic, inspect the attempted SHA and configuration, and preserve its logs. Do not assume a failed historical deployment protects against a new accidental deployment. Official procedure: [GitHub autodeploys](https://docs.railway.com/deployments/github-autodeploys), checked 2026-10-12.

### 3. Prepare storage and Docker configuration before applying deployment changes

- [ ] Select the intended **US East** application region using the actual available Railway selection. Use one region, one replica and no serverless sleeping for this SQLite/volume service. Record the selected label/identifier; none is inferred from the former sfo setting.
- [ ] Use repository root as Root Directory and the root `Dockerfile`, replacing the historical Railpack choice. Leave custom build/start commands empty. The Dockerfile uses Node 22, `npm ci`, `npm run build`, then directly starts `node server/src/server.js` as PID 1.
- [ ] Attach persistent volume at `/data`. Confirm Railway supplies `RAILWAY_VOLUME_MOUNT_PATH=/data`; do not manufacture platform metadata. Set `APP_DATA_DIR=/data/app`. Leave `DATABASE_PATH`, `PRICEBOOK_PATH`, `TMPDIR`, `TEMP`, `TMP` overrides absent.
- [ ] Set health path `/api/health`, deployment health timeout 300 seconds, On Failure restart policy, platform draining 120 seconds, application shutdown 110 seconds and overlap 0. These follow the repository deployment guide and validator. Allow a brief redeploy interruption with the single volume.
- [ ] Review volume capacity and memory headroom: snapshots serialize the database into memory before scrubbing retry secrets; continuous backups are full recovery copies. Do not treat snapshot count or database disk size as a memory/storage ceiling.

**Evidence:** reviewed configuration worksheet, actual volume attachment, source Dockerfile/build settings. **Stop/recovery:** missing mount, symlink/path errors, memory exhaustion, builder mismatch or more than one SQLite writer service blocks rollout. Correct infrastructure; never bypass startup checks with fake environment metadata. Sources: [Dockerfile](../../Dockerfile), [deployment validator](../../server/src/deploymentConfig.js), [Railway guide](../../docs/RAILWAY_SETUP.md).

### 4. Prepare variables, private bucket and domain assignment

- [ ] Complete [CONFIGURATION.md](CONFIGURATION.md), initially using its infrastructure-stage disabled feature flags. Confirm independent secret values and owner-controlled admin access privately. Email production settings are intentionally staged later; `console` is not real delivery.
- [ ] Owner provisions/selects the authorized private Railway bucket and records its physical region, actual S3 `BUCKET` value, endpoint and URL style. Map credentials using private variable references. Use the application archive-encryption key, unique production prefix and template overrides (`auto`, `virtual`) only after matching the bucket Credentials tab. Do not guess service-reference syntax or enable public access.
- [ ] Add the planned `app.offtheclockai.com` custom domain to the correct service, target port 3000. Owner copies the exact assigned CNAME and TXT names/values into DNS. Preserve root/www/mail records. Use direct DNS-only routing for the initial repository-prescribed ingress check. No Railway hostname or token is prefilled here.

**Evidence:** variable-name checklist, private bucket selection/region, redacted reference bindings, assigned DNS records. **Stop/recovery:** unresolved credential ownership, destination collision, wrong bucket identifier/style, missing DNS ownership or a secret in logs stops execution. Correct the configuration privately. Existing bucket upload history must remain accessible; do not change its key/prefix/destination casually. Official bucket/domain links, checked 2026-10-12: [buckets](https://docs.railway.com/storage-buckets), [domains](https://docs.railway.com/networking/domains/working-with-domains).

### 5. Deploy only the separately approved release and inspect startup

- [ ] After configuration is ready and the owner separately authorizes integration/deployment, record the resulting approved `main` SHA and its required checks. If it differs from the pinned candidate, review the difference; do not carry forward an audit assertion automatically.
- [ ] With autodeploy still disabled, explicitly deploy that confirmed source from the connected branch using Railway. Confirm which latest commit will be used before selecting Deploy Latest Commit. If the owner instead elects to re-enable autodeploy, treat that action and the subsequent `main` merge as the deployment trigger. Do not use both paths and assume they are equivalent evidence.
- [ ] Record build output showing the Dockerfile's clean install/build and runtime logs showing `Off The Clock AI server listening on 3000`. Confirm the deployed SHA in Railway metadata, not just the local Git checkout.

In Railway SSH **inside the running container at `/app`**, this read-only command reports only non-secret identity/path fields:

```bash
node -p 'JSON.stringify({commit:process.env.RAILWAY_GIT_COMMIT_SHA,mode:process.env.NODE_ENV,volume:process.env.RAILWAY_VOLUME_MOUNT_PATH,root:process.env.APP_DATA_DIR,port:process.env.PORT})'
```

Use Railway's actual running-container SSH facility; `railway run` on a laptop does not inspect the deployed volume. No generic environment dump.

**Evidence:** build/deployment ID, approved and actual SHA, startup time and validator success. **Stop/recovery:** any failed validator/build/health check or unexpected SHA stops admission. Fix the named configuration issue or return to a previously accepted compatible image. There may be no accepted prior deployment; do not label July's failed deployment a rollback target. A code rollback alone does not roll back SQLite migrations.

### 6. Verify HTTPS, health and protected surfaces

- [ ] Wait for Railway domain verification/TLS, then from the operator workstation:

```bash
curl --fail-with-body --silent --show-error https://app.offtheclockai.com/api/health
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://app.offtheclockai.com/api/admin/backups/offsite
```

Expected: first command HTTP 200, `{"ok":true}`; second unauthorized (401/403), never backup details. Open `/login`, `/dashboard`, `/widget.js`, `/widget-app.js` and `/demo/otc-live-demo.js`; confirm assets and expected login protection, not a raw source directory. A disabled demo's session request must remain unavailable, not silently bill Gemini.
- [ ] In a private REST client use POST `/api/admin/login` with the configured admin email and its password (not the stored bcrypt hash). Use the returned access token as Bearer authentication for GET `/api/admin` and GET `/api/admin/backups/offsite`. Do not save the token in evidence. Owners/staff must not obtain these admin responses.
- [ ] Verify actual ingress throttling using owner-controlled synthetic accounts: one connection cannot obtain fresh allowances by forging forwarded IP headers; a separate mobile connection has its own allowance. Do not exhaust real users' accounts.

**Evidence:** TLS/certificate success, status/body samples with credentials removed, authenticated admin result, ingress observations. **Stop/recovery:** certificate error, public admin data, unexpected origin routing or spoofable ingress blocks launch. `/api/health` proves only application/database readiness; it does not prove providers, backups or retention. Source: [lifecycle.js](../../server/src/lifecycle.js), [admin registration](../../server/src/server.js), [off-site status route](../../server/src/offsiteBackups.js).

### 7. Enable the complete owner-authorized provider configuration and accept real integrations

- [ ] Owner completes Twilio, Stripe, Calendar and Gemini groups and creates the Resend key directly into Railway **on deploy day**. Apply only the complete authorized configuration, including `ALLOW_PROVIDER_WRITES=true`, the intended email settings and the accepted feature flags; confirm actual new deployment SHA again.
- [ ] Perform the acceptance checks in OWNER_ACTIONS: real OAuth with the two approved scopes; received email plus readable delivery receipt; Stripe live price/webhook/entitlement evidence; Twilio signed incoming/status handling; real Gemini speech; owner-phone forwarding/DND. Use synthetic business/customer content and owner-controlled participants/inboxes/calendars only. Live charges, number purchase and provider configuration require their own explicit owner approval; no fake test cards in live Stripe.
- [ ] Preserve product decisions: phone forwarding controls answering, no in-app on/off switch, no SMS, no recordings/audio files; transcripts only. Starter remains answer-only; Operator adds booking/transfer/Price Book/widget; QuoteDone adds phone Price Book quotes. No entitlement shortcuts for acceptance.

**Evidence:** redacted transaction/session IDs and outcomes, received-message evidence, approved-scope consent, transcript and forwarding observation. **Stop/recovery:** a syntactically valid key, API acceptance receipt or green `/api/health` is insufficient. Do not admit customers while a required provider path fails. Turn off forwarding on the owner's phone to stop routing test calls; never invent an application switch. Use reviewed operational feature flags if necessary, remembering disabled provider writes also prevent revocation/release retries.

### 8. Seed and record the synthetic recovery baseline

- [ ] In the real app create an owner-controlled test business named `[PLACEHOLDER — SYNTHETIC LAUNCH BUSINESS]`, through normal signup/onboarding with its selected plan. Use an owner-controlled real inbox for authentication; never manufacture verification tokens or edit the database to grant a plan.
- [ ] Record a distinct saved profile note, one lead/call transcript, and, for an appropriately entitled test plan, an owner-entered and approved price book, saved quote and confirmed test booking. Record IDs, timestamps, exact values and counts privately. Test bookings use the designated owner test calendar and are cleaned up through normal owner controls afterward.
- [ ] For all following restore comparisons, state which records existed **before** each backup's capture time. Keep a small private baseline ledger; no actual customer data or keys in Git.

**Evidence:** IDs and exact expected saved values, book approval state and capture times. **Stop/recovery:** absent or unstable records make the drill inconclusive. Correct the baseline through the app before taking a replacement snapshot; do not declare a restore proven by an empty database.

### 9. Prove persistence and graceful shutdown

- [ ] Restart the service, then perform a fresh redeploy of the same approved source/configuration. After each, verify the same synthetic record IDs/values and saved approval state, health 200, and the actual `/data` mount. Record restart and redeploy separately.
- [ ] Capture the prior instance's `[shutdown] requests and workers drained; database closed` message and normal exit. Verify the drain fits within 110/120-second application/platform windows. Source hooks drain HTTP, voice, workers and final backups before closing SQLite.

**Evidence:** before/after baseline comparisons, deployment IDs, shutdown logs and exit status. **Stop/recovery:** missing records, `deadline or drain failure`, unexpected SIGKILL or a new empty root blocks launch. Preserve logs/storage; restore only to a new directory as below. Do not unlink permanent `.lock.sqlite` files to force progress; current mutual exclusion uses OS-released SQLite locks. Sources: [lifecycle.js](../../server/src/lifecycle.js), [server worker shutdown](../../server/src/server.js), [backupRetentionLock.js](../../server/src/backupRetentionLock.js).

### 10. Verify local and independent off-site protection

In the running container at `/app`, after the synthetic baseline is committed:

```bash
node server/scripts/backup.js
```

- [ ] Record the exact completed bundle path printed and its capture time. This command makes a local snapshot; it does not itself certify a cloud upload.
- [ ] Inspect authenticated GET `/api/admin/backups/offsite` after the workers catch up. Require HTTP 200 and `ok:true`, a recent daily `lastSuccessAt` (<26 hours), `lastBackupDay`, continuous `lastCheckpointId`/`lastSuccessAt`, `pendingChanges:false`, no active error, and healthy erasure/retention summaries. Record `versioning.state`, `checkedAt` and `error`. `UNKNOWN`, access errors or unresolved erasure are not acceptance.
- [ ] Using authorized bucket access, confirm matching completed ciphertext and `.enc.json` objects under the actual `daily/` and `continuous/` prefixes. The app downloads and checksum-checks an upload before success; do not accept mere object existence or `configured:true` as proof. Do not publish objects or copy their content into the report.
- [ ] Ensure a **completed continuous checkpoint captured after the synthetic writes** is selected for restoration. A daily object may predate the baseline: daily publication is once per UTC day and is not overwritten to update a drill. Restore it against its own capture-time baseline; wait for the next daily object if a post-baseline daily proof is needed.

**Evidence:** local bundle path, redacted admin JSON, completed object keys/checksums/times, selected post-baseline checkpoint. **Stop/recovery:** 503, stale daily backup, pending changes, incorrect style/credentials, version-state errors or mismatched metadata blocks acceptance. Preserve pending ciphertext/state and correct permissions/configuration; let bounded retries run. Never delete state or rotate keys to make status green. Local copies alone cannot survive volume loss. Sources: [backups.js](../../server/src/backups.js), [offsiteBackups.js](../../server/src/offsiteBackups.js), [continuousOffsite.js](../../server/src/continuousOffsite.js), [off-site guide](../../docs/OFFSITE_BACKUPS.md).

### 11. Restore synthetic records using the existing CLIs

Precondition: no customer admission; only the synthetic drill data. Quiesce test writes/calls. In the running container, keep the existing environment and keys for the download/restore commands. Set the three shell variables below privately to the exact observed bundle path, successful UTC day and completed checkpoint ID. They are operator shell inputs, not application configuration names. Every target must be a new direct child of `/data/restores`; if one exists, choose a new suffix, never delete it merely to rerun.

```bash
node server/scripts/restore.js --backup "$OTC_SNAPSHOT_BUNDLE" --target /data/restores/launch-local-20261020
npm run restore:offsite -- --day "$OTC_BACKUP_DAY" --target /data/restores/launch-daily-20261020
npm run restore:offsite -- --checkpoint "$OTC_CHECKPOINT_ID" --target /data/restores/launch-continuous-20261020
```

- [ ] Each must exit 0 and print a new destination with the source capture time/commit. Verify those fields against the chosen receipt. The source commit is snapshot provenance, not permission to run an older image without compatibility review.
- [ ] Before starting the app on a restored root, stage an isolated readback deployment: `ALLOW_PROVIDER_WRITES=false`, voice/Stripe/demo/email delivery disabled, `OUTBOUND_WEBHOOKS_ENABLED=false`, and temporarily unset all five required off-site destination variables **in this synthetic-only drill configuration** to prevent restored workers publishing into production storage. Removing configuration here is temporary isolation, not a way to clear retention failures. Keep the original credentials/recovery inventory and original root intact.
- [ ] Under owner authorization, set `APP_DATA_DIR` to the selected new restore directory and redeploy the same candidate with the same credential key/version and signing secrets. Keep derived paths unset. Log in with the existing synthetic owner and compare the baseline records, values, counts and price-book approval. Do not initiate provider actions from the restored copy. Backup health will deliberately be unhealthy while its destination is disabled; that is not launch acceptance.
- [ ] The required independent recovery proof is readback of the post-baseline off-site checkpoint. A daily restore from before seeding proves archive integrity only, not those later records. Record this distinction. Do not wipe the production volume to imitate the automated destructive drill.
- [ ] Return `APP_DATA_DIR` to `/data/app`, reapply the complete accepted launch configuration, and redeploy. Verify the original baseline, providers and healthy daily/continuous/retention status again. Inventory the retained managed restore copies; do not leave an untracked manual export elsewhere. Application erasure scans managed `/data/restores` copies, but does not inventory arbitrary external exports or platform-native volume backups.

**Evidence:** all CLI exit codes/results, exact source receipts, recovered synthetic IDs/values, restored-root identity, final original-root health. **Stop/recovery:** any `RESTORE_FAILED`, `OFFSITE_*` error, wrong key/checksum/schema, missing record or lock conflict is a failed drill. Keep source bundle, pending state and redacted logs; use a fresh target after diagnosis. Do not assume another branch or another worker has repaired it. If readback fails, return to the intact original root and hold launch. Sources: [backup CLI](../../server/scripts/backup.js), [local restore CLI](../../server/scripts/restore.js), [off-site restore CLI](../../server/scripts/restore-offsite.js), [restore implementation](../../server/src/backups.js).

### 12. Final owner go/no-go and continuing checks

- [ ] Recheck final SHA, complete runtime values, TLS, application health, protected admin health, provider receipts and restore evidence. Record all unrun/failed checks; do not convert them to passes.
- [ ] Confirm privacy wording was reviewed against the complete current policy and public pages were published by their authorized owner, outside this task. Confirm OAuth production approval/exception and actual provider readiness.
- [ ] Owner decides whether to reopen signup/forwarding and whether to re-enable `main` autodeploy. Record that choice. If Wait for CI is used, verify the actual workflow trigger on `main`; it does not replace manual review of required jobs or the release audit.
- [ ] Assign daily review of authenticated backup/retention health, account balances, email capacity, errors and available volume/memory. Overdue deletion, pending historical-copy cleanup, pending database-history flushing or permanent provider failure returns unhealthy; preserve failure evidence and act, rather than resetting markers. At an expired operation’s next writable cleanup pass, candidate l removes live retry material even if a retention lock blocks historical-copy cleanup. That pending work survives restart and still needs successful cleanup; an empty live retry table alone is not proof of complete erasure. No new monitoring feature is added by this pack.

**Launch decision:** GO only with the owner's independent release authorization and completed evidence. Otherwise HOLD, with owner-phone forwarding off and customer admission withheld. October 20 is a target, not permission to waive OAuth, payment, restore or privacy prerequisites.
