# Owner-approved retention, October 9, 2026

The erasure boundary is `service end + 90 × 24 hours`. The existing retention
worker performs cleanup at or after that boundary. Verified reactivation before
the boundary keeps its existing behavior, including a payment received before
the deadline that a delayed worker reconciles afterward. Once erasure starts,
the owner must register a fresh account. Their former email address is available
for that signup. No text messages are sent. The existing service-end dashboard
and email notice still tells the owner to turn off call forwarding.

## What is deleted

All rows belonging to the business are deleted from these tables:

```
appointmentChanges appointments
bookingHolds bookingIdempotency bookingIntents bookingPolicies
bookingPreferences bookingSettings
businessProfiles calendarConnections calendarOAuthStates callerBlocklist
callbackRequests calls customers leads
operatorCoverageOperations phoneProvisioningOperations
ownerAlertAttempts ownerAlerts ownerRecordEvents ownerRecordWorkflows
ownerReportSettings
priceBookCreationRecords priceBookDrafts
quoteAccessKeys quoteEmailDeliveries quoteEmailRecipients quoteRequests
quoteSubmissions quotes
staffInvitations transcriptTurns
voiceDurationRecovery voiceForwardingArrivals voiceOpaqueHandles
voiceQuoteNarrations voiceSessionNonces voiceSmsAttempts voiceSmsDeliveries
voiceToolIdempotencyReceipts voiceToolReceipts
webhookDeliveries webhookEndpoints widgetSettings
billingVoiceUsage
```

`users`: delete all staff rows, both pending and active. Remove owner and staff
`authTokens`, `authSessions`, and cascading `authRefreshTokens`. Delete legacy
hashed tool receipt scopes and `voiceModelFailures` entries tied to the owner's
call SIDs. Delete owner-specific `voicePlatformAlerts`; clear that owner's probe
SID in the shared `voiceCircuitState` without disturbing global circuit state.
Delete nonbilling `events`, `outboxEvents`, and `ownerEmailDeliveries`.

Global IP-hash authentication throttles (`authRateLimits`) and anonymous homepage
demo session counters are not business records; they have no owner association.

The managed file inventory is:

| Location | Action |
| --- | --- |
| `PRICEBOOK_PATH/<ownerId>.json` (default `data/pricebooks`) | Delete the saved price book. Production uses `APP_DATA_DIR/pricebooks`. |
| Same directory, `<ownerId>.unconfirmed` and `<ownerId>.<UUID>.tmp` | Delete paused-save marker and incomplete saves. |
| `PRICEBOOK_PATH.saves/<SHA256(ownerId)>.sqlite` and its `-journal`, `-wal`, `-shm` sidecars | Acquire the save mutex, delete owned files, and remove the lock database. Other owners' locks remain. |
| Live SQLite database and WAL | Delete tenant rows with `secure_delete`; truncate the WAL before recording completion. Billing rows remain. |
| `APP_DATA_DIR/backups/snapshot-*/off-the-clock.sqlite`, `pricebooks/<ownerId>.json`, `manifest.json` | Redact tenant rows and file, vacuum copied database, recompute and verify manifest. Preserve other businesses and billing evidence. |
| `APP_DATA_DIR/backups/.offsite-continuous/snapshots/*` | Apply the same snapshot redaction. |
| `RAILWAY_VOLUME_MOUNT_PATH/restores/<recovery-directory>/off-the-clock.sqlite` and `pricebooks/<ownerId>.json` | Redact managed restored copies too. |
| `APP_DATA_DIR/backups/.offsite/pending.enc`, `.offsite-continuous/pending.enc` and associated `state.json` | Redact unpublished encrypted retries; update byte count and checksum. |
| Configured bucket, `OFFSITE_BACKUP_PREFIX/daily/*.enc{,.json}` and `continuous/*.enc{,.json}` | Download, authenticate, redact, re-encrypt and verify replacement, including uploads missing their publication marker. Other businesses' logical contents remain identical. |
| `APP_DATA_DIR/backups/.retention/<SHA256(ownerId)>/*` | Temporary erasure work and crash-recovery journal. Before deleting a remote original, durably retain its clean replacement. Remove work after success; retry incomplete replacement on the next sweep. |

Backup writers are fenced during redaction, in-flight local work is drained, and
the retention lease is renewed while archives are processed. Retention changes
do not change quote arithmetic. Database guards and the price-book save mutex
reject late writes for an erased account.

## What remains and why

The owner `users` row is a disabled billing foreign-key record. These are its
**only columns**, including neutral values required by the existing schema:

| Fields | Retained value and purpose |
| --- | --- |
| `id` | Original immutable foreign key for financial evidence. |
| `ownerId`, `role` | `NULL`, `owner`; maintain the account/FK constraint. No staff row remains. |
| `plan`, `trialEndsAt`, `paymentFailedAt`, `annualPaidThroughAt`, `paidThroughAt`, `serviceEndsAt`, `createdAt` | Billing plan, entitlement/debt boundaries and account chronology used by the existing financial reconciler. |
| `planStatus` | Set to `canceled` at erasure. Later verified financial events may update financial state but cannot remove the erasure marker or restore sign-in. |
| `dataDeletedAt` | Irreversible erasure marker; denies sessions and prevents restoration. |
| `email` | Replace with `erased-<SHA256(id)>@account.invalid`; required unique, non-null placeholder, not the original address. |
| `passwordHash` | Replace with `!`, not a usable password hash. |
| `firstName`, `businessName` | Empty strings to satisfy non-null constraints. |
| `timezone`, `emailVerifiedAt` | Neutral `UTC`, `NULL`; original values are removed. |

Keep financial records in `billingAccounts`, `billingAnnualTerms`,
`billingCancellations`, `billingCheckoutRequests`, `billingEventReceipts`,
`billingInvoiceEvidence`, `billingLifecycleNotices`, `billingMinuteAlerts`,
`billingRecoveryHolds`, `billingSubscriptionEvidence`,
`billingSubscriptionHistory`, `billingTrialMinuteAlerts`, `billingUsageCharges`,
and `billingUsagePeriods`. Financial operation/retention leases are transient
coordination rows and are removed when their operation finishes. Preserve only
`billing.*` events/outbox rows and their email delivery evidence. Original
invoice/receipt and billing-delivery evidence may contain billing contact data;
these are billing records, not an active login or business profile.

`billingCancellations.calendarRevokeAttemptedAt` records when revocation was
attempted, before contacting Google. `calendarRevokeStatus` records only a safe
outcome (`REVOKED`, `FAILED`, `TIMEOUT`, `UNREADABLE`, `PROVIDER_DISABLED`, or
`UNAVAILABLE`; `ATTEMPTING` while in progress). Prefer the refresh token, otherwise
the access token, for Google's OAuth revocation endpoint. Do not retain a token
or response body in this evidence. HTTP errors, rejected requests and a bounded
ten-second timeout do not block deleting local tokens or business records.

If local files, backups, or WAL truncation fail, owner/staff credentials are
already erased and sign-in stays disabled. The cancellation completion marker
remains unset so the worker retries. Remote account permissions, encryption keys,
provider-managed object-version history and independent/manual backup copies
must also follow the operator's retention policy; no live provider is exercised
by the tests.

## Expectations written before execution

For service ending `2026-11-20T12:00:00.000Z`, erasure is due exactly
`2027-02-18T12:00:00.000Z`. One millisecond earlier retains data. At the boundary,
business A has no nonbilling rows, staff, auth secrets or price-book files;
business B's rows and book bytes are identical. Inventoried tests populate every
nonfinancial ownerId table discovered in the migrated database with FK-valid
synthetic rows, then inspect every table after erasure. Google succeeds, returns
400, rejects, or times out: all four permit local deletion, exactly one attempt
is recorded, and the stored token exists when the fake request is made.

Expired account sessions/refresh and new sessions are rejected; fresh signup can
reuse the former email. File failure is retryable without reopening sign-in.
Shared local/daily/continuous backups restore only A's disabled billing record
and B's unchanged data. Failed remote replacement keeps a clean recovery journal
and a later retry succeeds. Handwritten S3 expectations are path-style
`/synthetic-bucket/probe.json` on `localhost`, virtual-style `/probe.json` on
`synthetic-bucket.localhost`, and `auto` in both signatures. The approved caller
copy and banner title match exactly.
