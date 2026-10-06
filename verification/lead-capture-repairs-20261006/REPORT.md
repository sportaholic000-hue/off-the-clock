# First lead-capture/follow-up repair batch

All thirteen assigned repairs are implemented. Final verification status: **PASS — all thirteen assigned findings repaired and exact-source hosted gates green**. This is a capture/follow-up batch; owner delivery, voice lifecycle reliability and launch readiness are not established.

Starting source was verified as `b749dd6f76a6625314f87e4e8bf11fc3b3a0dbb3` in a separate clone. The exact historical audit `1de55bebfd6f916404df7493a8b3d7dbd3ba38f2` was fetched/read without merging. Application-source equality was verified before reproduction; the starting revision also contains the approved selected-plan trial decision. Neither that decision nor billing/access implementation was changed.

AGENTS.md, BUILD_STATUS.md, and governing lead, voice, owner/staff and follow-up specifications were read first. No subagents, merges, deployment, real callers, provider operations or production-store writes were used. All application data, tokens and provider destinations in experiments are synthetic; stores are temporary and network delivery is replaced by local stubs.

## Assigned finding results

Every assigned finding was reproduced before its repair. [EXPECTED.md](EXPECTED.md) contains the pre-execution expectations; [baseline-results.json](baseline-results.json) and [baseline-live-render-results.json](baseline-live-render-results.json) retain the initial failures.

### D01 — FIXED

**Root cause:** Caller notes were discarded and description was null.

**Change:** Bounded notes and explicit description are stored; notes supply the description when none exists. Calls/Leads use the common owner/staff projection.

**Source:** [server/src/leadCaptureRepair20261006.js:33](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/leadCaptureRepair20261006.js#L33); [server/src/ownerRecordViews.js:34](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/ownerRecordViews.js#L34); [client/src/calls.jsx:37](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/client/src/calls.jsx#L37).

**Execution evidence:** E01/E20; nameless notes/description regression; actual owner/staff routes, server render and browser Calls.

### D03 — FIXED

**Root cause:** Urgency existed only in an event/outbox.

**Change:** Urgency is saved transactionally on the call and relevant inquiry; reason and caller summary appear in existing views. A saved flag explicitly does not confirm notification.

**Source:** [server/src/voice/voiceToolRuntime.js:905](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/voice/voiceToolRuntime.js#L905); [server/src/ownerRecordViews.js:15](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/ownerRecordViews.js#L15).

**Execution evidence:** E05 assigned persistence clause; all four reasons, target inquiry, rollback, real routes/render/browser. Existing web timing strings remain visible.

### D09 — FIXED

**Root cause:** Capture required a caller name despite a verified callback phone.

**Change:** Omitted name is valid; supplied blank/invalid/oversized fields still fail. Nameless requests retain callback information.

**Source:** [server/src/voice/toolSchemas.js:77](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/voice/toolSchemas.js#L77); [server/src/voice/voiceToolRuntime.js:569](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/voice/voiceToolRuntime.js#L569).

**Execution evidence:** E36; omitted-name and invalid-input regressions; nameless actual-route fixture.

### D10 — FIXED

**Root cause:** The handler required an optional urgency summary.

**Change:** Every schema-valid reason works without a summary. Invalid reasons remain rejected.

**Source:** [server/src/voice/toolSchemas.js:88](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/voice/toolSchemas.js#L88); [server/src/voice/voiceToolRuntime.js:905](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/voice/voiceToolRuntime.js#L905).

**Execution evidence:** E06; active_leak/flooding/safety/complaint without summary, persistent reason and unconfirmed-notification wording.

### D11 — FIXED

**Root cause:** Mutable contact/address content determined lead identity.

**Change:** Owner/call inquiry identity is stable. Opaque handles or inquiry numbers identify corrections; different inquiry numbers, calls and standalone work descriptions retain distinct inquiries. Correction snapshots retain provenance.

**Source:** [server/src/leadCaptureRepair20261006.js:9](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/leadCaptureRepair20261006.js#L9); [server/src/voice/voiceToolRuntime.js:556](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/voice/voiceToolRuntime.js#L556).

**Execution evidence:** E04; corrected contact/address, explicit distinct jobs, simultaneous duplicate corrections, exact/changed-payload retry, wrong owner/call/expired/deleted handles.

### D12 — FIXED

**Root cause:** Capture UPSERT reset owner disposition.

**Change:** Existing inquiry updates never change its disposition. Exact replay, new provider events and cold-process replay preserve DISMISSED.

**Source:** [server/src/leadCaptureRepair20261006.js:50](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/leadCaptureRepair20261006.js#L50).

**Execution evidence:** E03; actual PATCH dismissal followed by correction/replay; independent child-process restart replay; post-persistence handle failure.

### D13 — FIXED

**Root cause:** Omitted email overwrote customer notes with null.

**Change:** Provided fields merge into existing contact. Omitted email/address preserve known customer and inquiry information. A previous address is retained on the customer but is not invented as the site of a new job.

**Source:** [server/src/leadCaptureRepair20261006.js:25](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/leadCaptureRepair20261006.js#L25); [server/src/leadCaptureRepair20261006.js:46](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/leadCaptureRepair20261006.js#L46).

**Execution evidence:** E03; returning call omits email/address, canonical email retained; update fault rolls back both customer and inquiry.

### D17 — FIXED

**Root cause:** Lead CSV/webhook read only the web submission email path; installed triggers did not upgrade.

**Change:** Both web and voice email paths are exported. Atomic trigger replacement upgrades existing stores. Only unattempted pending snapshots receive corrections; historical attempts/deliveries stay unchanged.

**Source:** [server/src/integrationData.js:5](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/integrationData.js#L5); [server/src/outboundWebhookSchema.js:27](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/outboundWebhookSchema.js#L27); [server/src/outboundWebhookSchema.js:84](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/outboundWebhookSchema.js#L84).

**Execution evidence:** E12; fresh/old-trigger upgrade and direct SQL producer tests, historical snapshot test, CSV and actual existing-worker delivery to local stub.

### D18 — FIXED

**Root cause:** Standalone review requests had no actionable bound contact lead.

**Change:** Logging atomically creates or binds a follow-up inquiry with available caller contact, request row and existing outbox linkage. Exact description matches bind captured work; exact retries recover the same inquiry and retain later corrections/disposition. CSV/webhook contact is allowlisted.

**Source:** [server/src/voice/voiceToolRuntime.js:790](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/voice/voiceToolRuntime.js#L790); [server/src/integrationData.js:12](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/integrationData.js#L12).

**Execution evidence:** E07/E12; standalone/matching/bound/distinct requests, contact added later, replay after correction, attempted snapshot immutability, database failure rollback and retry.

### D22 — FIXED

**Root cause:** Preferred-time corrected contact/site was invisible in Calls/Leads.

**Change:** Tenant-bound views project preferred request contact/site with original details and source provenance. Addresses replace coherently. Later explicit voice contact corrections take precedence; empty legacy preferences retain established display identity.

**Source:** [server/src/leadCaptureRepair20261006FollowUp.js:3](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/leadCaptureRepair20261006FollowUp.js#L3); [server/src/ownerRecordViews.js:51](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/ownerRecordViews.js#L51); [server/src/ownerCallService.js:52](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/ownerCallService.js#L52).

**Execution evidence:** E28 assigned contact clause; original receipts byte-identical, latest-field precedence, legacy empty preference, actual owner/staff routes/render/browser. Older unresolved inbox and notifications remain open.

### D23 — FIXED

**Root cause:** Instant quote contact was trapped in owner-only evidence.

**Change:** Quotes and Calls retrieve the original submission tenant-bound and expose only safe contact/location/context to authorized owner/staff. Stored prices and customer result are read without recalculation.

**Source:** [server/src/ownerRecordViews.js:24](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/ownerRecordViews.js#L24); [server/src/leadCaptureRepair20261006FollowUp.js:13](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/leadCaptureRepair20261006FollowUp.js#L13); [server/src/quoteDoneRoutes.js:284](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/quoteDoneRoutes.js#L284); [client/src/quotedone.jsx:211](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/client/src/quotedone.jsx#L211).

**Execution evidence:** E29; contact from inline and separate submission, actual staff quote route/render/browser, private-field sentinels absent, saved $221.23 and raw receipts unchanged.

### D29 — FIXED

**Root cause:** Production SPA allowlist omitted /calls.

**Change:** Production /calls and /calls?record=... serve the existing compiled owner app with no-store. Existing API/unknown-path behavior is retained.

**Source:** [server/src/productionAssets.js:5](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/productionAssets.js#L5).

**Execution evidence:** E40; real production asset handler HTTP 200/no-store, browser deep link, reload, Calls Refresh and dashboard feed navigation.

### D30 — FIXED

**Root cause:** An open dashboard loaded activity only once.

**Change:** The owner dashboard uses a tenant-authenticated five-call feed endpoint. Reads run after the previous read completes, at five-second cadence; hidden tabs pause. One timer/read, bounded error backoff, stale indication, explicit Refresh recovery and session/unmount cleanup prevent stale tenant data.

**Source:** [server/src/quoteDoneRoutes.js:272](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/server/src/quoteDoneRoutes.js#L272); [client/src/leadCaptureRepair20261006Feed.js:3](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/client/src/leadCaptureRepair20261006Feed.js#L3); [client/src/dashboard.jsx:49](https://github.com/sportaholic000-hue/off-the-clock/blob/b356fd0babee91c117d1c2973be68996b15e51bb/client/src/dashboard.jsx#L49).

**Execution evidence:** E41 mounted live dashboard: one additional fetch, new saved call visible within 6.5-second observation. Five scheduler regressions plus production browser new arrival/navigation, delayed response tenant switch and timer cleanup.

## Verification and limits

- Exact repaired application/test source: `b356fd0babee91c117d1c2973be68996b15e51bb` ([source tree](https://github.com/sportaholic000-hue/off-the-clock/tree/b356fd0babee91c117d1c2973be68996b15e51bb)); remote tree and every changed source blob were verified in [source-revision.json](source-revision.json). Only assigned production files, prefixed lead-specific helpers/tests and this evidence directory changed. Excluded files and the historical audit are untouched. No excluded-file integration patch is required.
- New regression coverage: 24 capture/contact/fault tests, five feed scheduler tests, eight actual-route/render tests and five production-browser tests (42 including parent tests). Final focused local capture/feed/routes/render plus existing HTTP/render tests: **50/50**, zero failures/skips/cancellations/TODOs ([TAP](final-owned-helper-paths.tap)). Counts overlap the full suite and must not be added to its total.
- Baseline experiments: 33 original synthetic experiments plus one mounted dashboard experiment, reproducing all thirteen assigned findings. Assigned after-fix rerun: twelve original experiments plus mounted E41, zero experiment errors. Ten complete original expectations pass; E05 and E28 still fail their unowned notification/older-inbox clauses. Their assigned urgency/contact clauses pass. E41 observes the documented five-second cadence for 6.5 seconds; the original one-second baseline remains unchanged.
- Retries cover same/changed dispatcher payload, new provider event, corrected description/contact, omitted fields, dismissed disposition, failure before commit and lost acknowledgement after persistence. Independent child-process replay verifies durable capture state. Multiple genuine jobs remain distinct. Foreign owner/call/staff requests and expired/deleted handles fail closed.
- Stored quote/submission/preference receipts remain byte-identical in the contact regressions; the saved $221.23 fixture stays $221.23. Staff contact projections and real browser responses exclude injected private cost/rate sentinels. No quote arithmetic, approval, receipt or price-book repair was made.
- Hosted gates: **strict quote 2,105/2,105 across 97 files; full suite 2,488/2,488; zero failures, skips, cancellations or TODOs**. [Exact-source hosted run 37516621001](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37516621001) and [hosted-results.json](hosted-results.json) verify cold install, production build, both complete gates, the browser scenarios and the production dependency audit. [Log excerpts](hosted-results-excerpt.log) preserve the scenario results and counters. Existing strict/full gates and dependency manifests/lockfiles are unchanged; no tests or gates were weakened.
- Local cold `npm ci` and production build pass. Local browser download/startup failed; complete gates are therefore verified with the existing hosted Chromium workflow. Earlier failed attempts, compatibility regressions and any local noncompletion are retained separately in [local-environment.json](local-environment.json), rather than counted as successful tests. The production browser scenarios exercise actual server routes, stored SQLite rows and compiled app navigation; API content is not fabricated by browser interception.

The first checkpoint passed hosted strict 2,085/2,085 and full 2,468/2,468. Later checks caught and corrected a newer-description replay issue, address-alias mixing, an empty-legacy-preference display-name regression, and dropped web timing strings. A browser fixture also incorrectly reapplied an owner token on every navigation; its session setup was corrected without changing application authorization. These intermediate results are not used as final-source proof.

Existing historical duplicates and already-discarded information are not retrospectively deleted or reconstructed. This repair prevents the specified capture defects on subsequent operations and keeps historical receipts/provenance. No production backfill was performed.

Urgency acknowledgement says the flag was saved and owner notification has not been confirmed. No notification adapter, transfer/SMS adapter, session recovery, concurrency enforcement, minute metering or callback/deadline policy was implemented.

## Remaining historical audit defects

The following **nineteen unassigned defects remain open for coordinated follow-up**. They are the preserved audit's findings, not a claim that this capture-only batch re-audited or repaired their full subsystems. The [historical report](https://github.com/sportaholic000-hue/off-the-clock/blob/1de55bebfd6f916404df7493a8b3d7dbd3ba38f2/verification/lead-delivery-20261006/REPORT.md) retains source, inputs, governing rules and reproductions for each.

| Finding | Severity | Remaining problem |
|---|---|---|
| D02 | High | First-party owner alerts and the voice/preference outbox have no delivery consumer |
| D04 | High | Production voice composition has no SMS, live-transfer or appointment-change provider adapters |
| D05 | High | One failed SMS attempt permanently prevents a later retry |
| D06 | High | An unsuccessful transfer does not create its promised callback lead |
| D07 | High | AI failure fallback forwards once and hangs up without request capture |
| D08 | High | Legitimate anonymous caller IDs are rejected before tenant resolution |
| D14 | Medium | Booking lookup limits the tenant before filtering for the caller |
| D15 | Medium | Returning-caller tool drops identity/address and omits saved request history |
| D16 | Medium | Customer identity is not unified across web/voice or credential rotation |
| D19 | High | Owners cannot distinguish failed voice delivery from sent delivery on the saved request |
| D20 | Medium | An older failed webhook becomes undiscoverable behind the newest 20 events |
| D21 | Medium | Unresolved preferred-time requests disappear when their requested dates leave the calendar range |
| D24 | Medium | Completed calls retain transport outcomes and no generated summary |
| D25 | High | Normal fallback callback overwrites a successful completed call and forwards it again |
| D26 | High | Call-end cleanup drops queued caller text and buffered model transcript |
| D27 | High | Cold restart leaves persisted active calls stranded without a recoverable lead |
| D28 | High | OPERATOR LIVE readiness can coexist with an unavailable inbound route |
| D31 | High | Duplicate signed inbound callbacks create parallel sessions and can reopen completed calls |
| D32 | Medium | The specified default per-owner concurrent-call ceiling is not enforced |

**P01 remains unresolved:** fixed callback/deadline guide commitments conflict with owner-specific timing. The rule is still PROPOSED, not approved; timing specs and prompt compiler were left unchanged.

Prioritized next work:

1. Owner alerts and honest delivery/failure state: D02/D19, with D20 recovery visibility.
2. Reliable voice/fallback/lifecycle and truthful readiness: D04–D08, D25–D28, D31; preserve requests through provider failures and restarts.
3. Caller history/identity and unresolved follow-up visibility: D14–D16, D21/D24.
4. Coordinated concurrency behavior (D32) and explicit timing-policy decision (P01).

The thirteen assigned capture/follow-up findings are repaired; these remaining defects prevent a broader owner-delivery or launch-readiness claim.
