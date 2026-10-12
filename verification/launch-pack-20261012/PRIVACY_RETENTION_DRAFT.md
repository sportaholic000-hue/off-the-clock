# Retention and subprocessor amendment — OWNER REVIEW ONLY

Prepared 2026-10-12 from the pinned candidate-k base, reconciled with candidate l’s demonstrated retention repair for a planned October 20 launch. Final verification is in [candidate l’s report](../release-candidate-20261012l/REPORT.md); no deployment, tag or release approval is assumed. The current complete privacy-policy draft was **not supplied**. This is neither a redline of that policy nor a complete replacement. Nothing here is approved for publication, and no legal-compliance conclusion is made.

## Implementation facts to reconcile before approving wording

| Subject | Source-checked behavior |
|---|---|
| Service-end clock | Retention is measured from verified service end, preserving a verified paid term; terminal provider `endedAt`/`canceledAt` or signed-event evidence supplies the fallback, not webhook processing time. `billingCustomerLifecycle.js:87–109`. |
| Day 30 / day 90 | Number release is due at service end +30×24 hours. Nonbilling business-data deletion, backup erasure and connected Google grant revocation are due at +90×24 hours. Export closes at the day-90 boundary. The cleanup worker runs at startup and every minute; failures/leases/outages can delay execution. `billingRetentionSteps.js:25–28`; `billingCustomerLifecycle.js:315–379`. |
| Business records | Profiles, leads, customers, calls/transcripts, quotes, bookings, price books, staff, sessions, nonbilling notices and provider connections are erased. Local deletion proceeds without waiting for Google or object storage. Billing identifiers remain in a disabled account tombstone; original email/name/password are removed. `billingTenantErasure.js:11–64`. |
| Backups and versions | Managed local snapshots, continuous staging, managed restores, pending encrypted copies and configured daily/continuous objects are scrubbed. Shared backups retain other businesses and billing records. Enabled/Suspended bucket versions and delete markers are permanently purged by version ID and relisted for verification. Unsupported/never-enabled versioning follows ordinary deletion; uncertainty or inability to delete stays pending. `tenantBackupErasure.js`; `offsiteVersionErasure.js`; `offsiteStore.js:31–70`. |
| Missing destination | Prior/ambiguous upload history prevents missing credentials/settings from being treated as “nothing to erase.” Local deletion continues; off-site cleanup and health remain unresolved. Changing destination/key does not erase old copies. `offsiteHistory.js:35–70`. |
| Google | Retain only an encrypted refresh token for the retry operation. HTTP 200 or HTTP 400 with `invalid_token` completes revocation; other errors retry. No access-token-only substitute proves the refresh grant revoked. `calendarRetentionRevocation.js`. |
| Phone | Retain the saved Twilio number resource SID for release retries. This SID is an identifier, not encrypted token material. Release success or 404 confirms completion; failed/ambiguous release is not marked released. `billingRetentionSteps.js:76–88,168–185`; `platformIntegrations.js:40,54–59`. |
| Retry clock | `firstAttemptAt` is set when the step is first initialized by cleanup: phone no earlier than day 30, Calendar no earlier than day 90. It is set even if provider operations are disabled. It does not start at cancellation, at webhook receipt, or at the first successful network request. Restart does not reset it. A delayed first cleanup therefore creates a later deadline. `billingRetentionSteps.js:76–106,123–130`. |
| Retry deadline and failures | At first-attempt +30 days, the next writable cleanup pass removes live retry material and records `PERMANENT_FAILURE` without waiting for abandoned-copy cleanup. Unusable material takes that path immediately. The same transaction records any required historical-copy cleanup without retaining the token/SID in that record. Copy cleanup and secure deletion/WAL flushing continue after provider steps become terminal and after restart. New snapshots still exclude the retry table before disk write; confirmed provider-success behavior retains its existing copy-cleanup barrier. `backups.js`; `billingRetentionSteps.js` (`permanentlyFail`, `cleanupPendingCopies`, `flushDeletedSecrets`). |
| Completion | Cancellation erasure version 2 and completion time are recorded only if local, backups, Calendar and phone are all DONE/NOT_REQUIRED and secret flushing is complete. Pending retry-copy cleanup and database-history flushing are also completion barriers. Permanent failure is unresolved, not successful deletion. A disabled local owner row alone is not completion. Admin health includes overdue unstarted steps and permanent failures. `billingRetentionSteps.js:194–228`; `offsiteBackups.js:186–193`; `server.js:475–478`. |

**Demonstrated repair; no retention-policy exception approved.** Candidate l removes the unnecessary dependency between live expiry and abandoned-copy cleanup. Synthetic regressions cover just before, exactly at and after the deadline, including an actual held SQLite retention lock, restart and WAL contention. When the worker processes an expired operation and the live database is writable, both expired retry values are removed and further provider attempts stop. With flushing available, the corresponding main-database/WAL bytes are removed too. Blocked historical copies remain explicitly pending; cleanup resumes after release even though provider steps are terminal. A stopped worker, unwritable database or inaccessible historical storage cannot be represented as successful physical deletion. The maximum 30-day retry-material rule and its first-attempt origin are unchanged; the old draft’s extended-live-retention description was a defect observation, never owner-approved policy.

Routine backup retention is also not an exact maximum age: local snapshots use 30 days by intended setting while retaining the newest; daily storage retains 30 complete daily backups; continuous storage uses 30 elapsed days while preserving the newest complete checkpoint through an outage. Day-90 tenant erasure separately processes retained copies and versions. Unmanaged manual exports, Railway-native volume backups and provider-owned copies are not automatically inventoried by this application. The owner must identify those before promising deletion of every copy.

## Records that remain without an implemented expiry

| Record | Retained fields / purpose / source |
|---|---|
| Billing evidence and disabled account | Original immutable owner ID and financial chronology; subscriptions, invoice/receipt evidence, usage charges/periods, cancellation state and billing-delivery evidence. Some billing records contain billing contact details. No fixed financial expiry is implemented here; choose the policy with qualified review, not an invented legal period. `billingTenantErasure.js:49–64`; `billingCustomerLifecycle.js:44–60`. |
| Cleanup outcomes | Service-end, first-attempt, last-attempt, completion/failure/update timestamps, safe status/reason codes, pending/completed historical-copy cleanup and database-flush flags, and operation identifiers in `billingCancellations.retentionStateJson` and related columns. No cleanup-outcome expiry. `billingRetentionSteps.js:30–72,174–202`. |
| Erased-owner ledger | Owner ID and erasure timestamp in `backups/.retention/erased-owners/<SHA256(ownerId)>.json`; legacy `owners.json` remains as recovery evidence. It prevents stale replacements undoing prior erasures. Hashed filenames do not make the contained owner identifiers anonymous. Records are append-only without expiry. `offsiteHistory.js:80–117`. |
| Destination/upload history | Destination fingerprint derived from endpoint, bucket, prefix and archive-key hash; first upload-attempt and first successful-upload times in `.offsite-history`. No keys/tokens are stored in these receipts; they are not pruned with rotating backups. `offsiteHistory.js:6–38`. |
| Operational alert counts | One platform retention alert contains pending-owner/permanent-failure counts plus created/updated/resolved timestamps. Resolution updates it rather than deleting it. Admin inventory can include owner IDs and safe step outcomes; alert details do not include tokens/SIDs. `billingRetentionSteps.js:231–244`. |

These operational exceptions must be stated explicitly if approved; “everything except billing records” alone would conceal them. No indefinite retry-token exception is proposed.

## Proposed amendment 1: end-of-service business-data retention

**Intended policy location:** “How long we keep information” / “Closing your account.” **Current text:** not supplied.

**Option A — recommended:**

> Your business records are due for deletion 90 days after your service ends. This includes your business profile, customer and lead records, quotes, appointments, call transcripts, staff access and saved pricing, together with their managed backup copies and older stored backup versions. We preserve financial records, such as subscription, payment, invoice and billing-delivery evidence, which may contain billing contact details. We also retain the limited operational records described below. We release your assigned phone number beginning 30 days after service ends and revoke a connected Google Calendar grant as part of day-90 cleanup. Local deletion does not wait for an external provider to recover. We do not record the overall deletion as complete until local data, managed backup copies, Calendar revocation and number release are completed or confirmed unnecessary. Unsuccessful external cleanup remains recorded for follow-up.

**Option B:**

> After your service ends, you can export retained call, lead and quote records until the 90-day deadline. Your assigned number is due for release after 30 days. At day 90, your nonbilling business records and their managed backup copies, including older stored versions, are due for deletion, and we seek to revoke any connected Google Calendar grant. Billing evidence and the limited operational records described in this policy remain. If a storage or provider operation fails, we keep the cleanup unresolved rather than treating that failure as successful erasure, while proceeding with local deletion independently.

**Recommendation:** A makes the completion condition explicit. Before publication, reconcile all manual/platform-managed backup copies and the current full policy; neither option is approval to exclude an existing copy from the owner's deletion rule.

## Proposed amendment 2: limited provider-cleanup retry material

**Intended policy location:** immediately after end-of-service retention, with a cross-reference from “Google Calendar access.” **Current text:** not supplied.

**Option A — recommended, subject to owner review of the operational limits above:**

> To finish disconnecting providers, we keep only the encrypted Google refresh token and/or assigned-number identifier needed for that operation, with a retry limit of 30 days from its first recorded cleanup attempt. When cleanup processes the deadline, it stops provider attempts, removes the expired material from the writable live database and records a permanent failure. Blocked cleanup of historical copies does not extend live retention. Confirmed success or unusable material ends retention sooner through the applicable cleanup path. New application backups exclude this retry material. We track unfinished historical-copy removal and database-history flushing separately, continue that work after restart, and do not report physical deletion complete while it remains unresolved. A permanent failure does not mean the provider action succeeded.

**Option B:**

> Calendar revocation and assigned-number release each have a 30-day retry window measured from their own first recorded cleanup attempt, not from cancellation or a later restart. Once cleanup observes expiry, it deletes the retry material from the writable live database and stops using it, regardless of a blocker on historical-copy removal. It preserves only non-secret status and timing records to continue required copy cleanup and database-history flushing. Confirmed provider completion or unusable material can end retries earlier. New application backups omit the retry material. Pending physical cleanup and failed provider actions remain visible; neither is presented as successful erasure, and an outage is not approval to extend the retention rule.

**Recommendation:** A explains the enforced live deadline and the separate physical-cleanup obligation directly. The first recorded attempt can occur after the scheduled due date if the worker was stopped; neither option restarts that clock or authorizes extended retention. Reconcile this draft against the complete policy before publication, without representing inaccessible historical copies as already deleted.

## Proposed amendment 3: operational evidence retained without expiry

**Intended policy location:** “Information retained after deletion” or an exception immediately under the retention section. **Current text:** not supplied.

**Option A — recommended:**

> We retain limited operational evidence without a fixed expiry: erased-account identifiers and erasure times; service-end and cleanup attempt, completion and failure timestamps and status codes; backup-destination fingerprints and first upload-attempt/success times; and aggregate counts and timestamps for unresolved or resolved cleanup alerts. These records support deletion enforcement, recovery safety and investigation of incomplete cleanup. They do not include the discarded retry tokens or number identifiers, customer conversations, saved pricing or active login credentials. Erased-account identifiers remain identifiers and are not described as anonymous data.

**Option B:**

> Deleting business records does not delete our limited deletion and backup-operation history. That history has no scheduled expiry and includes erased-owner IDs, relevant lifecycle and cleanup timestamps/outcomes, fingerprints identifying backup destinations, first upload times and cleanup-alert counts. We keep it to prevent recovery from reintroducing erased data and to track unresolved cleanup. This exception does not authorize keeping provider retry secrets indefinitely or retaining the deleted business records themselves.

**Recommendation:** A enumerates the actual fields and avoids mislabeling hashed identifiers as anonymous. Explicit owner approval is required for this disclosure and for any change to the underlying retention policy; no change is made here.

## Proposed amendment 4: hosting, backups and transactional email

**Intended policy location:** “Service providers/subprocessors” and “Where information is processed.” **Current text:** not supplied.

**Option A — recommended for the present, undeployed plan:**

> For the planned launch, we intend to host the application on Railway in its US East region, store application-encrypted recovery copies in a private Railway storage bucket, and use Resend for transactional account, service and quote email. The bucket's location and Resend's processing arrangements are separate from the application region. This plan does not establish that every service provider or every copy of information is located in US East. Provider configuration and applicable processing locations will be confirmed before this description is presented as deployed practice.

**Option B:**

> Our planned infrastructure uses Railway for application hosting and private encrypted backup storage, and Resend to deliver transactional emails and report delivery status. US East is the intended application-hosting region only. Backup storage and email processing have separate location and retention arrangements; we have not represented them, or our other providers, as entirely US East. These choices are planned until live configuration and provider terms have been checked.

**Recommendation:** A identifies the intended application region clearly. Replace planned-tense wording only after actual deployment evidence exists, with further owner approval. This is a partial amendment: the complete policy must also address existing Twilio calling, Google/Gemini live processing, Google Calendar and Stripe billing. Their complete terms, data locations and retention were not audited here. Resend receipt metadata can contain recipients, subjects and delivery events; the app reads those for reconciliation. Owner must confirm provider retention terms and any separate copies before approving a comprehensive deletion statement.

Preserve in the complete policy: no SMS sending; no call recording or audio storage by the application; transcripts only. Live audio still passes through the calling/AI providers to provide the service. New Calendar grants request `https://www.googleapis.com/auth/calendar.freebusy` and `https://www.googleapis.com/auth/calendar.events.owned`; older equivalent/full grants are accepted. This draft does not claim providers never process audio or that no data crosses regions.

## Review record

| Owner decision | Status |
|---|---|
| Supply the current complete policy and identify insertion points/contradictions | Pending |
| Choose A/B or edited wording for each amendment | Pending |
| Review demonstrated live-expiry behavior and truthful historical-copy/WAL cleanup disclosure; no extension to the rule | Pending owner wording approval |
| Approve disclosure of non-expiring operational records and financial retention policy | Pending |
| Confirm Railway app/bucket locations, Resend/provider terms and unmanaged-copy inventory | Pending |
| Authorize publication by the public-site owner after review | Not authorized by this task |

The older [tenant retention guide](../../docs/TENANT_RETENTION_20261010.md) describes version-1 completion and an older revoke-once/access-token fallback. Those passages do not describe candidate l's version-2 retry/completion code above. The [off-site guide](../../docs/OFFSITE_BACKUPS.md) also contains historical lock wording; candidate l preserves permanent SQLite lock files. These read-only documents were not edited.
