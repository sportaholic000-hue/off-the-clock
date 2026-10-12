# Candidate-l reconciliation — still unapproved and undeployed

The original launch-pack report below records the separate documentation task at `4417e7b749a71fbee6207315ebcd75425fa25036`; its historical inspection and NOT RUN statements are not candidate-l test results. The exact commit was integrated into candidate l. These five drafts are now reconciled with the verified live-expiry repair, without publishing policy or changing configuration.

Current behavior: the next writable cleanup pass discards expired live material without depending on abandoned-copy cleanup, stops provider retries, and durably tracks remaining copy removal and database-history flushing. That work resumes after restart and terminal provider failure; unresolved cleanup keeps health unhealthy and erasure incomplete. The local preparation pass cannot reactivate away this obligation. The former description of longer live retention was a confirmed defect, not an owner-approved exception. Stopped workers and inaccessible historical storage still cannot be represented as completed physical deletion.

See [candidate l’s report](../release-candidate-20261012l/REPORT.md) for before/after evidence, final source and CI status. The restore diagnostics’ historical missing-book discrepancy remains **NOT REPRODUCED / cause unknown**; no quote-engine repair is claimed. Deployment, provider acceptance, full-policy review and both-scope Astra + Sol clean audits remain separate prerequisites. The original evidence follows unchanged as history.

---

# Launch-pack report — documentation complete; live acceptance not run

Prepared October 12, 2026 for the October 20 launch target. This pack is ready for owner review, not a deployment authorization or a release-audit pass. Provider/account readiness, policy approval and live upload/restore evidence remain outstanding.

## Source and scope

Repository: `sportaholic000-hue/off-the-clock`. A fresh clone was created for this task. Before branching, `git ls-remote https://github.com/sportaholic000-hue/off-the-clock.git 'refs/tags/rc-20261012k*'` returned:

```text
4959515817dc94dd81c393746845fc1ab68742cf refs/tags/rc-20261012k
ead53fa174d577b280506b67573a29d6b0358237 refs/tags/rc-20261012k^{}
```

The peeled commit matched the required SHA. `codex/launch-pack-20261012` did not exist remotely when work began; it was created locally from that commit, not `main`. Only `verification/launch-pack-20261012/**` was written. No application, public-page, specification, workflow, restore-test or restore-diagnostics file was changed. No other worker's branch was incorporated. No agents were delegated work.

The final documentation commit and remote branch readback are supplied in the delivery message. A report cannot contain its own Git commit hash without changing that hash. The source pin above remains the runtime version inspected, distinct from the later documentation-only delivery SHA.

## Deliverables

| File | Contents |
|---|---|
| [DEPLOY_DAY.md](DEPLOY_DAY.md) | Twelve ordered stages: authorization/source identity, containment of the `main` autodeploy trigger, Docker/volume configuration, variables/bucket/domain, deliberate deployment, health/authentication, provider acceptance, synthetic baseline, restart/redeploy, uploads, isolated restore/readback, owner go/no-go. Each stage has expected evidence and stop/recovery actions. Every live checkbox is NOT RUN. |
| [CONFIGURATION.md](CONFIGURATION.md) | Source-checked core, platform-derived, email, Twilio/Gemini/Calendar/demo, Stripe and S3-compatible bucket settings; private placeholders and dependency gates; all 81 distinct assignment names in the Railway template covered. Planned Resend values are explicit. |
| [PRIVACY_RETENTION_DRAFT.md](PRIVACY_RETENTION_DRAFT.md) | Implementation facts, billing and non-expiring operational exceptions, first-attempt retry clock and its physical-removal limitation. Four proposed amendment locations, each with current text “not supplied,” two complete options and a recommendation. OWNER REVIEW ONLY; no legal conclusion or publication. |
| [OWNER_ACTIONS.md](OWNER_ACTIONS.md) | Seven dependency-ordered owner actions, October 20 risks and 17 dated official documentation links. Includes existing Google billing-account reactivation before a new account, AI Studio project selection/credits/funding, Resend capacity/key custody, live billing/voice and actual acceptance. |
| [REPORT.md](REPORT.md) | Inspection scope, factual boundaries, decisions and validation record. |

## What was inspected

Read the governing [AGENTS.md](../../AGENTS.md), [BUILD_STATUS.md](../../specs/BUILD_STATUS.md), relevant stack/security/launch/backup portions of [platform_spec_v2.md](../../specs/platform_spec_v2.md), and [billing lifecycle requirements](../../specs/BILLING_LIFECYCLE_20261007.md). Read the four requested owner approvals: [rulings](../owner-rulings-20261010.md), [October 10 wording](../owner-wording-approval-20261010.md), [October 11 wording](../owner-wording-approval-20261011.md) and [demo wording](../owner-wording-approval-20261011-demo.md). Current owner instructions govern this pack; no spec was edited.

Deployment references: root [Dockerfile](../../Dockerfile), [package scripts](../../package.json), [Railway variable template](../../deployment/railway.env.example), [Railway setup](../../docs/RAILWAY_SETUP.md), [off-site backups](../../docs/OFFSITE_BACKUPS.md), and [tenant retention guide](../../docs/TENANT_RETENTION_20261010.md).

Runtime source was read for the behavior documented here, including:

- Startup/ingress/shutdown: `server/src/deploymentConfig.js`, `runtimeConfig.js`, `clientAddress.js`, `lifecycle.js`, relevant `server.js` initialization/routes/workers, `auth.js`, `authSessionService.js`, `passwordHashConfig.js`, `credentialEncryption.js` and `client/src/api.js`.
- Provider configuration and permission gates: `billingConfig.js`, `billingRoutes.js`, `billingUsagePolicy.js`, `platformIntegrations.js`, `googleCalendarScopes.js`, `geminiTextModel.js`, `demo/liveDemo.js`, `voice/liveModelName.js`, `voice/voiceReadiness.js`, `voice/voiceAdmission.js`, and relevant `voice/productionVoiceRuntime.js`, `voiceDurationRecovery.js` and `outboundWebhookTransport.js` sections. These paths are under `server/src/`.
- Email send/read behavior: `server/src/email.js`, `ownerAlertEmail.js`, `ownerEmailDelivery.js` and `quoteEmailProvider.js`.
- Retention/backup behavior: `server/src/billingCustomerLifecycle.js`, `billingTenantErasure.js`, `billingRetentionSteps.js`, `calendarRetentionRevocation.js`, `backups.js`, `backupRetentionLock.js`, `tenantBackupErasure.js`, `offsiteHistory.js`, `offsiteStore.js`, `offsiteVersionErasure.js`, `offsiteBackups.js`, `continuousOffsite.js` and the archive-encryption interface in `offsiteArchive.js`.
- Operator commands: `server/scripts/backup.js`, `restore.js`, `restore-offsite.js` and their package-script mappings. Read-only identity/health commands were checked against Git syntax and registered application routes. Restore argument order, fresh-target requirement, output fields and failure behavior were checked from source; the commands were not executed against a running service.

Public official provider documentation was checked on **2026-10-12**. The dated links and topics are in OWNER_ACTIONS: Google OAuth/Calendar/Billing/Gemini, Resend domain/key/quotas, Stripe live/webhooks, Twilio incoming/status callbacks, and Railway autodeploy/domain/bucket/teardown. These reads establish published requirements, not account status or guaranteed review times. Railway teardown behavior was also corroborated through its official search excerpt and the repository guide.

## Facts kept separate

| Category | Evidence / treatment |
|---|---|
| Repository facts | Pinned source, actual environment names, startup validation, routes, CLI arguments, gates, retention code and backup status. No inferred successful execution. |
| Historical owner report | Railway `brilliant-nature` / `off-the-clock`, `main` autodeploy, absent variables/volume/domain, US West/sfo, Railpack and July 20 failed deployment. Not freshly verified. |
| Owner-specified project | `gen-lang-client-0870829296` is the project to check; billing linkage, credits, balance, rate limits and model access remain unverified. |
| Planned settings | US East application hosting, root Dockerfile, `/data/app` on `/data`, private Railway bucket, Resend email and proposed app origin from the repository. Bucket/email/provider locations are separate and unverified. |
| Live verification | None. No account sessions, keys, DNS assignments, successful OAuth/call/email/payment/upload/restore or production health were inspected. |

The earlier deployment template's “live email deferred” comment is historical; current owner instructions specify `EMAIL_PROVIDER=resend`, `EMAIL_DELIVERY_ENABLED=true`, `EMAIL_FROM=no-reply@offtheclockai.com`, with `RESEND_API_KEY=<OWNER_SUPPLIED_ON_DEPLOY_DAY>`. The owner creates that key directly into Railway on deploy day. The pack does not contain a key. `ALLOW_PROVIDER_WRITES=true` is reserved for the complete, separately owner-authorized launch configuration.

The older tenant-retention guide's version-1/revoke-once wording and older off-site lock descriptions were not treated as current runtime behavior: candidate k uses version-2 multi-step completion and permanent SQLite lock files. Those read-only guides remain unchanged.

## Owner decisions and launch blockers

1. Supply the complete privacy policy and choose the amendment wording before publication. Decide how to reconcile the source's cleanup-driven removal with any absolute 30-day physical-retention promise, and explicitly address non-expiring operational records and unmanaged copies. The source checks expiry from each step's first recorded initialization, including when provider writes are disabled; blocked abandoned-copy cleanup or database flushing can delay physical removal. This is a source observation, not an executed defect reproduction or authority to change the ruling.
2. Confirm public homepage/privacy prerequisites and the actual Google OAuth review path; restore usable existing Google billing and verify paid Gemini model access/funding/credits for the intended project. No provider timeline is assumed.
3. Approve actual production origins, regions, provider identities, secret custody, email capacity and live Stripe/Twilio setup. The email adapter sends and retrieves receipts; the documented Resend send-only permission does not cover both. Select suitable access and test both operations. No new product/pricing decision is proposed.
4. Separately authorize the deployment/integration window and pass independent release checks plus real OAuth, inbox delivery, speech, handset forwarding and persistent off-site restore acceptance. A configured bucket or green `/api/health` is insufficient. A failed restore is a launch hold, independent of another worker's task.

Locked decisions are preserved: owner-phone forwarding controls on/off; no app switch, SMS, call recording or audio storage; transcripts only; new Calendar scopes remain `calendar.freebusy` plus `calendar.events.owned`. The privacy draft does not claim that live calling/AI providers never process audio or that all storage is US East.

## Validation and NOT RUN record

Documentation validation uses read-only source comparison and inline checks, not new operational helper scripts:

- Compared all 81 distinct environment assignment names in `deployment/railway.env.example` with CONFIGURATION: zero missing. Also compared all 57 distinct direct `env.NAME` / `process.env.NAME` references across `server/src/**/*.js`: zero missing names.
- Checked executable checklist command paths, arguments and package mappings against source. Reviewed all five deliverables; validated 46 relative links, balanced Markdown fences, absence of control characters and credential-shaped values, and the write allowlist. Exactly five new Markdown files were present and every existing tracked file was unchanged. Repeated `git ls-remote` immediately before delivery preparation: the tag still matched and the destination branch remained absent. Final Git whitespace/staged-scope and remote content checks are recorded in the handoff.
- No application or generated build output was changed. The deliverable is documentation only; no application test result is asserted.

| Check | Status / reason |
|---|---|
| `npm ci`, `npm run build`, `npm test`, `npm run test:quote`; browser/Docker/integration suites | **NOT RUN** — documentation-only scope; no runtime or test changes. No pass counts claimed. |
| Hosted CI or independent release audit for this delivery | **NOT RUN / not inspected** — this launch pack is not the release audit gate. |
| Railway account/source/builder/region/volume/domain/health/shutdown/restart/redeploy | **NOT RUN** — no account or deployment changes authorized. Historical state only. |
| Local/off-site backup CLI execution, bucket upload/version behavior and synthetic restore/readback | **NOT RUN** — written acceptance steps only; no configured service/bucket was accessed. No dependency on the other restore-diagnostics chat. |
| Provider setup, OAuth verification/revocation, billing balances/credits/top-ups, Resend key creation/delivery receipts, Stripe live payments/webhooks, Twilio/Gemini/real phone tests | **NOT RUN** — owner-only live actions and future acceptance. No purchases, messages, keys or provider configuration. |
| Privacy publication or complete-policy legal review | **NOT RUN** — current complete policy not supplied; draft options only. No legal-compliance claim. |

Delivery is limited to publishing a documentation commit on `codex/launch-pack-20261012`, followed by `git ls-remote` and remote file-content verification. The command-line `git push -u origin codex/launch-pack-20261012` attempt failed with `could not read Username for https://github.com: No such device or address`. The authenticated GitHub connector provides the publication path: a new branch from the required base and a five-file Git tree/commit, with a guarded branch update. No credentials were created or copied to the clone. Git author identity was also absent locally, so the local commit used a command-only `Codex <codex@localhost>` identity without editing Git configuration. Final remote commit metadata comes from GitHub. No merges or tags are authorized or performed.
