NOT CLEAN

**32 confirmed delivery/follow-up defects; one business-policy conflict.** The quote engine’s arithmetic, website price extraction, subscription billing and payment access gates were not audited. No application fixes, merge, deployment or provider/live-data writes were performed. No subagents were used.

Exact audited source: **73c00622d6f2df31f57773b32e41355a7421f1a3** on **codex/quote-release-candidate-20261006**. The remote branch ref and local checkout were verified against that exact SHA before inspection. A separate clone and audit branch `codex/lead-delivery-audit-20261006` were used. The committed changes are confined to this directory.

**What actually reaches the owner**

| Path | Durable data | Implemented external delivery | Owner recovery |
|---|---|---|---|
| Normal phone capture | Customer + CAPTURED lead; call transcript while accepted turns persist | Optional lead webhook if configured; first-party owner SMS/email alert absent | Calls/Leads expose contact; job notes lost; no voice delivery state |
| Urgent phone request | Separate events + PENDING outbox | No consumer; urgent event not an implemented webhook event | Urgency missing from call/lead; must inspect transcript manually |
| Web review inquiry | One transactional submission + lead + quote-request receipt | Optional signed webhook worker with durable retries | Owner/staff can read saved contact and scope |
| Web instant inquiry | Quote + submission + quote-request receipt; no ordinary review lead | Quote-request webhook is enriched with saved contact inside the transaction | Owner has internal receipt; staff lacks contact in its safe quote view |
| Preferred-time request | Preference + immutable receipt + PENDING outbox; not an appointment | No preference/owner-alert consumer | Calendar shows saved contact in a matching date range; Calls/Leads can show stale facts |
| Confirmed shared booking | Provider-confirmed appointment + receipt + outbox; optional booking webhook | Booking webhook exists; promised customer texts/reminders are not a first-party outbox consumer | Confirmed/pending states are kept distinct in tested shared booking handlers |
| AI failure/unanswered forwarding | Fallback call metadata | One business-number Dial, then apology/Hangup; no transcript capture continuation | Phone number may remain, but no actionable fallback lead or owner alert |

**Evidence and boundaries**

Every defect below has both pinned source and an execution experiment. The minimal shared fixtures are temporary SQLite stores with current migrations, clearly synthetic owners/callers, reserved 555 numbers and `.invalid` email addresses, a fixed synthetic clock, and in-memory/local provider transports. Fixture account records only satisfy pre-existing access prerequisites; billing decisions are not evaluated as audit findings. Synthetic saved quote outcomes are delivery fixtures; their arithmetic is not under test.

Expectations were recorded in [EXPECTED.md](EXPECTED.md) before execution. Raw final observations are in [results.json](results.json), [phone-results.json](phone-results.json) and [live-render-results.json](live-render-results.json); [findings.json](findings.json) is the structured defect catalog. [source-binding.json](source-binding.json) binds source files to the exact audited commit. The independent scripts measure expected outcomes; exit zero means experiments completed, not that the product is clean.

**Findings index**

| ID | Severity | Confirmed defect | Execution |
|---|---|---|---|
| D01 | High | Voice capture discards the actual request notes | E01, E20 |
| D02 | High | First-party owner alerts and the voice/preference outbox have no delivery consumer | E05, E28, E21 |
| D03 | High | Urgency is absent from the call and lead records owners read | E05, E23 |
| D04 | High | Production voice composition has no SMS, live-transfer or appointment-change provider adapters | E22, E37 |
| D05 | High | One failed SMS attempt permanently prevents a later retry | E10 |
| D06 | High | An unsuccessful transfer does not create its promised callback lead | E11 |
| D07 | High | AI failure fallback forwards once and hangs up without request capture | E21 |
| D08 | High | Legitimate anonymous caller IDs are rejected before tenant resolution | E27 |
| D09 | High | Voice lead capture rejects callers who do not supply a name | E36 |
| D10 | High | The valid urgency-tool schema allows an input that always fails | E06 |
| D11 | Medium | Correcting contact information creates another lead for the same call/request | E04 |
| D12 | Medium | A new capture event reopens an owner-dismissed lead | E03 |
| D13 | Medium | A returning caller omitting email erases the known customer email | E03 |
| D14 | Medium | Booking lookup limits the tenant before filtering for the caller | E38 |
| D15 | Medium | Returning-caller tool drops identity/address and omits saved request history | E39 |
| D16 | Medium | Customer identity is not unified across web/voice or credential rotation | E15, E45 |
| D17 | Medium | Voice lead webhook and lead CSV omit a saved email | E12 |
| D18 | Medium | Standalone voice quote requests are missing from the actionable lead queue and contact exports | E07, E12 |
| D19 | High | Owners cannot distinguish failed voice delivery from sent delivery on the saved request | E32, E22 |
| D20 | Medium | An older failed webhook becomes undiscoverable behind the newest 20 events | E17 |
| D21 | Medium | Unresolved preferred-time requests disappear when their requested dates leave the calendar range | E28 |
| D22 | Medium | Calls/Leads show stale contact when a preferred-time request supplies corrected information | E28 |
| D23 | Medium | Staff cannot recover contact for an instant web inquiry without a lead or booking | E29 |
| D24 | Medium | Completed calls retain transport outcomes and no generated summary | E23 |
| D25 | High | Normal fallback callback overwrites a successful completed call and forwards it again | E23 |
| D26 | High | Call-end cleanup drops queued caller text and buffered model transcript | E25, E26 |
| D27 | High | Cold restart leaves persisted active calls stranded without a recoverable lead | E24 |
| D28 | High | OPERATOR LIVE readiness can coexist with an unavailable inbound route | E19 |
| D29 | Medium | Production Calls deep links and refresh return 404 | E40 |
| D30 | Medium | The open dashboard does not receive newly saved calls | E41 |
| D31 | High | Duplicate signed inbound callbacks create parallel sessions and can reopen completed calls | E42, E09, E34 |
| D32 | Medium | The specified default per-owner concurrent-call ceiling is not enforced | E43 |

High means a request/channel, important follow-up fact or recovery state can be lost/blocked/misrepresented. Medium means an independently reproducible loss of workflow accuracy, discoverability, identity/history or a required capacity guard, with some manual recovery still possible. These are synthetic impacts; no claim is made that a real customer was lost.

**D01 — Voice capture discards the actual request notes (High)**

- **Business/customer impact:** A callback card can contain a name and number but none of the work or timing the customer requested; the owner must re-interview the caller or comb through any available transcript.
- **Pinned file and line:** [server/src/voice/voiceToolRuntime.js:574](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L574), [server/src/voice/voiceToolRuntime.js:590](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L590), [server/src/ownerRecordViews.js:24](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/ownerRecordViews.js#L24).
- **Smallest configuration/inputs:** One bound synthetic call; captureLead({name:"[SYNTHETIC] Alex",email:"alex@example.invalid",address,notes:"[SYNTHETIC] Gate fell down; call after 5pm."}). No pricing or calendar needed.
- **Expected/governing rule:** build_guide captureLead: retain every collected input plus transcript pointer; platform §§6.2/6.8: actionable owner follow-up information.
- **Actual execution (E01, E20):** Returns captured. Stored notes is null, describedService is null, and neither staff lead JSON nor rendered Calls includes the supplied problem/callback instruction. The callback email survives.
- **Root cause:** captureLead hard-codes notes:null and NULL describedService; the normalized lead view also has no notes projection.
- **Recommended fix, not implemented:** Persist bounded caller notes and a request description; expose them in the common owner/staff lead view and existing Calls/Leads components. Preserve their provenance and do not treat notes as pricing instructions.

**D02 — First-party owner alerts and the voice/preference outbox have no delivery consumer (High)**

- **Business/customer impact:** Owners can miss ordinary inquiries, emergencies and time requests unless they manually discover saved data. A PENDING database row alone does not contact the owner.
- **Pinned file and line:** [server/src/voice/voiceToolRuntime.js:948](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L948), [server/src/bookingPreferenceService.js:185](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/bookingPreferenceService.js#L185), [server/src/server.js:485](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/server.js#L485), [server/src/outboundWebhookSchema.js:1](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/outboundWebhookSchema.js#L1).
- **Smallest configuration/inputs:** One ordinary voice capture, one flooding flag, or one valid preferred-time request. Restart the only registered delivery worker with local stubs; no first-party notification configuration exists.
- **Expected/governing rule:** platform §§5.4/5.7/6.8/6.11/13.2 and build_guide post-call automation: notify the owner of leads, immediately for urgency; preserve retry/failure recovery.
- **Actual execution (E05, E28, E21):** Urgency and booking.preference_requested remain PENDING with zero corresponding provider attempts after worker recreation. The server starts the webhook worker, not an outbox consumer. Ordinary capture has no first-party owner alert producer. Optional webhooks process only lead.created, quote.requested and appointment.booked, and are not SMS/email owner alerts.
- **Root cause:** There is no owner-alert dispatcher or outbox worker wired into server lifecycle. Auth email code is not a lead-alert channel.
- **Recommended fix, not implemented:** Implement a durable tenant-bound owner notification pipeline for the actually supported owner channels; create events atomically with capture, distinguish queued/attempted/provider-accepted/failed, retry after restart, and bypass digest delays for urgency. Require/configure an owner destination and expose readiness/failure honestly.

**D03 — Urgency is absent from the call and lead records owners read (High)**

- **Business/customer impact:** Even an owner checking the inbox cannot identify which saved request requires immediate follow-up.
- **Pinned file and line:** [server/src/voice/voiceToolRuntime.js:958](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L958), [server/src/ownerCallService.js:29](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/ownerCallService.js#L29), [server/src/ownerRecordViews.js:24](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/ownerRecordViews.js#L24).
- **Smallest configuration/inputs:** Capture a caller, then flagUrgent({reason:"flooding",summary:"[SYNTHETIC] Water through kitchen ceiling."}).
- **Expected/governing rule:** platform §§6.2/13.2: visible urgency and a complaint/urgent lead card with the transcript; urgency must remain evident independently of notification delivery.
- **Actual execution (E05, E23):** Tool returns flagged and an events row exists, but calls.urgency and normalized lead.urgency remain null. A real completed flooding call still shows null urgency; no COMPLAINT lead type is created by the flag path.
- **Root cause:** The handler writes separate events/outbox rows without updating the call/lead or joining those rows into the owner read models.
- **Recommended fix, not implemented:** Atomically mark the bound call and appropriate lead/thread urgent, preserve reason/summary, apply the complaint classification when relevant, and expose it to authorized owner/staff views.

**D04 — Production voice composition has no SMS, live-transfer or appointment-change provider adapters (High)**

- **Business/customer impact:** Customers cannot receive the promised written follow-up or reach a human through the advertised tool, and appointment-change requests do not get applied. Source-defined injectable handlers do not establish a deployed delivery channel.
- **Pinned file and line:** [server/src/voice/productionVoiceRuntime.js:31](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/productionVoiceRuntime.js#L31), [server/src/voice/productionVoiceRuntime.js:76](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/productionVoiceRuntime.js#L76), [server/src/server.js:462](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/server.js#L462), [server/src/voice/voiceToolRuntime.js:905](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L905), [server/src/voice/voiceToolRuntime.js:1030](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L1030), [server/src/voice/voiceToolRuntime.js:1143](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L1143).
- **Smallest configuration/inputs:** Valid signed local call with a synthetic Google session and provisioned owner phone; capture a lead, sendSms(callback), transferCall(caller_requested), or cancel a caller-owned confirmed synthetic appointment.
- **Expected/governing rule:** platform §§5.4/5.6/5.7/13.3: implemented transactional texts, warm transfer and confirmed appointment changes.
- **Actual execution (E22, E37):** Actual production composition returns SMS unavailable and transfer unavailable and writes FAILED outbox rows. The cancellation handler with the same default provider dependency returns unavailable and leaves the appointment CONFIRMED. None falsely reports success.
- **Root cause:** server.js calls installProductionVoice without providers. The default is {}; bookingService is supplied separately and does not populate these adapters.
- **Recommended fix, not implemented:** Supply real production adapters for the approved channels and shared appointment operations through server construction, with bounded calls, provider receipts, tenant/caller checks and recovery. Do not label these capabilities available until their dependencies are ready.

**D05 — One failed SMS attempt permanently prevents a later retry (High)**

- **Business/customer impact:** A transient outage becomes permanent lost written follow-up for the saved inquiry, even after the provider recovers. This runtime defect remains relevant when D04 is wired.
- **Pinned file and line:** [server/src/voice/voiceToolRuntime.js:875](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L875), [server/src/voice/voiceToolRuntime.js:884](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L884), [server/src/voice/voiceToolRuntime.js:936](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L936).
- **Smallest configuration/inputs:** Local sendSms stub throws ETIMEDOUT on attempt one, then returns SENT; retry the same lead/template under a new toolCallId and recreated runtime.
- **Expected/governing rule:** Audit retry/failure requirement and platform §5.7: transient provider failure must permit safe recovery without pretending a message was sent.
- **Actual execution (E10):** First and second replies both unavailable; provider invoked once only; the event remains FAILED after recovery. New dispatcher idempotency keys do not help.
- **Root cause:** The application-level event identity is fixed to call+handle+template. Any prior non-SENT row immediately returns unavailable instead of claiming a retry or reconciling an uncertain provider result.
- **Recommended fix, not implemented:** Use a leased durable delivery job with retry policy and provider idempotency/receipt reconciliation; SENT should replay, retryable failures should re-attempt, and timeouts after acceptance should remain explicitly uncertain until reconciled.

**D06 — An unsuccessful transfer does not create its promised callback lead (High)**

- **Business/customer impact:** A customer seeking a person is told transfer failed but the owner gets no actionable lead; manual discovery of the phone number is the only recovery.
- **Pinned file and line:** [server/src/voice/voiceToolRuntime.js:1015](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L1015), [server/src/voice/voiceToolRuntime.js:1030](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L1030), [server/src/voice/voiceToolRuntime.js:1070](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L1070).
- **Smallest configuration/inputs:** One bound caller asks for a human; local transfer provider throws a synthetic no-answer error; no pre-existing lead.
- **Expected/governing rule:** platform §5.6: no answer/outside window must fall back to a lead card and authorized callback promise; transfers never dead-end.
- **Actual execution (E11):** Returns unavailable with a truthful failure message but call detail contains zero leads and no captured transfer reason in the callback queue. Caller number survives on the call row.
- **Root cause:** Transfer failure writes delivery state and returns; it neither creates a callback request nor invokes a shared durable fallback capture path.
- **Recommended fix, not implemented:** Atomically preserve the caller/request/reason as an actionable callback lead on every unsuccessful transfer, notify the owner, and return only an owner-authorized callback commitment.

**D07 — AI failure fallback forwards once and hangs up without request capture (High)**

- **Business/customer impact:** An after-hours or unavailable owner can lose the entire request during the exact provider failure the fallback is meant to cover. Forwarding that is answered can still reach the owner; this finding concerns the unanswered continuation.
- **Pinned file and line:** [server/src/voice/productionVoiceRuntime.js:46](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/productionVoiceRuntime.js#L46), [server/src/voiceRuntimeRoutes.js:227](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voiceRuntimeRoutes.js#L227), [server/src/voice/voicePersistence.js:178](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voicePersistence.js#L178).
- **Smallest configuration/inputs:** Synthetic Google connect rejects; signed fallback callback is invoked for a provisioned synthetic owner with fallback number +19025550199.
- **Expected/governing rule:** platform §12.4 and §5.7: failure/missed-call transcript lead, AI_FALLBACK flag, owner alert and missed-call text-back; no audio storage.
- **Actual execution (E21):** HTTP 200 TwiML dials the business, then says to try again and hangs up. Saved call is FALLBACK with no transcript, no lead and no outbox event. If that business phone does not answer, no transcription/capture step exists after Dial.
- **Root cause:** The production fallback is exclusively forward mode; recordFallback persists call metadata only. No speech-capture or missed-call automation is attached.
- **Recommended fix, not implemented:** Add a transcript-only capture continuation for unanswered/failed forwarding and AI startup/drop failures, with durable owner-linked lead/alert and honest callback instructions. Preserve any earlier transcript and inputs. Do not introduce call recording.

**D08 — Legitimate anonymous caller IDs are rejected before tenant resolution (High)**

- **Business/customer impact:** Privacy-conscious prospective customers are unable to leave a request and the owner has no recoverable call record.
- **Pinned file and line:** [server/src/voiceRuntimeRoutes.js:183](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voiceRuntimeRoutes.js#L183), [server/src/voiceRuntimeRoutes.js:353](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voiceRuntimeRoutes.js#L353).
- **Smallest configuration/inputs:** Otherwise valid locally signed inbound form, From:"anonymous", valid synthetic AccountSid/CallSid/To and Direction:"inbound".
- **Expected/governing rule:** platform §5.1: ON answers inbound calls; unavailable contact details require honest capture rather than an authentication rejection. Twilio documents non-number caller IDs for withheld/unavailable callers (https://www.twilio.com/docs/voice/twiml).
- **Actual execution (E27):** HTTP 400 Voice unavailable; zero call records for the owner; no business fallback or callback-capture prompt.
- **Root cause:** normalizeIncomingCall requires From to be E.164 before the signed destination establishes the tenant.
- **Recommended fix, not implemented:** Keep signature/account/destination validation strict while representing unavailable caller ID explicitly. Ask for a confirmed callback channel through the capture tool and prevent caller-memory matching until an identity is known.

**D09 — Voice lead capture rejects callers who do not supply a name (High)**

- **Business/customer impact:** A usable inquiry is blocked solely because the caller declines or has not yet given a name.
- **Pinned file and line:** [server/src/voice/toolSchemas.js:77](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/toolSchemas.js#L77), [server/src/voice/toolSchemas.js:113](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/toolSchemas.js#L113).
- **Smallest configuration/inputs:** Bound call with known synthetic callback phone; captureLead({notes:"[SYNTHETIC] Please quote repair; prefers no name."}).
- **Expected/governing rule:** September 30 owner direction/shared boundaries: callback contact is required for an estimate; a name is optional. build_guide capture preserves collected details.
- **Actual execution (E36):** Dispatcher rejects with MISSING_TOOL_FIELD and creates zero leads although context supplies a valid callback number. Runtime code itself can represent name:null.
- **Root cause:** Tool declaration and validation require a nonempty name, stricter than the approved contact requirement and the persistence handler.
- **Recommended fix, not implemented:** Make the name optional for saving a callback request; retain verified available contact and request text. Require additional identity only for operations that truly need it, such as confirmed booking.

**D10 — The valid urgency-tool schema allows an input that always fails (High)**

- **Business/customer impact:** The model can make a schema-valid emergency flag call that produces no flag or alert.
- **Pinned file and line:** [server/src/voice/toolSchemas.js:84](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/toolSchemas.js#L84), [server/src/voice/toolSchemas.js:116](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/toolSchemas.js#L116), [server/src/voice/voiceToolRuntime.js:952](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L952).
- **Smallest configuration/inputs:** flagUrgent({reason:"safety"}) on a bound synthetic call; summary is omitted as permitted by the tool declaration.
- **Expected/governing rule:** platform §§5.4/13.2 and voice global urgency: immediately preserve and flag urgency; a valid declared call must not silently lose it.
- **Actual execution (E06):** TOOL_EXECUTION_FAILED, zero urgency events; production wraps it as needs_details rather than a successful urgent flag.
- **Root cause:** Schema marks summary optional, while the handler rejects every empty/missing summary.
- **Recommended fix, not implemented:** Unify the contract. Prefer preserving the urgent reason immediately and enriching the summary later; any truly required field must be required and described consistently in declaration, validator and runtime.

**D11 — Correcting contact information creates another lead for the same call/request (Medium)**

- **Business/customer impact:** Owners may call the stale contact or pursue the same job twice; earlier lead handles and cards remain valid.
- **Pinned file and line:** [server/src/voice/voiceToolRuntime.js:570](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L570), [server/src/voice/voiceToolRuntime.js:572](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L572), [server/src/voice/voiceToolRuntime.js:590](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L590).
- **Smallest configuration/inputs:** On one call capture name "[SYNTHETIC] Alxe", then corrected "[SYNTHETIC] Alex" with correct@example.invalid.
- **Expected/governing rule:** platform §§6.8/12.18/13.6: coherent customer/lead thread; exact retry and contact correction should not create contradictory actionable requests.
- **Actual execution (E04):** Two CAPTURED leads persist: misspelled old contact and corrected contact. Adding/changing address likewise changes the identity input.
- **Root cause:** Mutable contact/address content is hashed into leadId instead of identifying the inquiry independently of its corrections.
- **Recommended fix, not implemented:** Use a stable inquiry/thread identity tied to owner and call/request, update versioned contact facts within that identity, and link multiple actual service requests explicitly rather than using changed contact to identify a new job.

**D12 — A new capture event reopens an owner-dismissed lead (Medium)**

- **Business/customer impact:** Completed/dismissed requests reappear as work to do and can cause duplicate unwanted callbacks.
- **Pinned file and line:** [server/src/voice/voiceToolRuntime.js:590](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L590), [server/src/quoteDoneRoutes.js:276](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/quoteDoneRoutes.js#L276).
- **Smallest configuration/inputs:** Capture one lead; owner PATCHes its status to DISMISSED; dispatch identical capture args with a different toolCallId using a recreated runtime.
- **Expected/governing rule:** Audit duplicate-event requirement and platform §6.8: customer capture retries must preserve owner follow-up disposition.
- **Actual execution (E03):** Status changes back to CAPTURED. Exact replay of the same dispatcher key is safe, but a distinct provider event is not.
- **Root cause:** UPSERT unconditionally assigns status=excluded.status even when capture data is unchanged and the owner has already handled the lead.
- **Recommended fix, not implemented:** Separate capture-data updates from owner workflow status. Preserve disposition unless an explicit, authorized new inquiry/reopen action changes it; use a revision check when combining updates.

**D13 — A returning caller omitting email erases the known customer email (Medium)**

- **Business/customer impact:** Future follow-up and caller-memory operations lose a previously usable contact channel unless the owner searches older records.
- **Pinned file and line:** [server/src/voice/voiceToolRuntime.js:558](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L558), [server/src/voice/voiceToolRuntime.js:585](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L585).
- **Smallest configuration/inputs:** Capture returning@example.invalid for a caller; on the next call capture only the name with the same owner/phone.
- **Expected/governing rule:** platform §§6.6/12.18/13.7: preserve the returning customer and accurate follow-up channels.
- **Actual execution (E03):** customers.notesJson becomes {voiceVersion:1,email:null}. The prior lead still holds historical email, but the current customer record loses it.
- **Root cause:** Customer UPSERT replaces notesJson wholesale with the latest invocation, including null for an omitted optional field.
- **Recommended fix, not implemented:** Merge provided contact fields explicitly; distinguish omission from an authorized clear/change. Retain historical provenance and update canonical contact only after confirmation.

**D14 — Booking lookup limits the tenant before filtering for the caller (Medium)**

- **Business/customer impact:** Returning customers can be incorrectly treated as having no booking; reschedule/cancel/follow-up requests fail as the business grows.
- **Pinned file and line:** [server/src/voice/voiceToolRuntime.js:1215](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L1215).
- **Smallest configuration/inputs:** One stored caller-owned confirmed appointment plus 25 newer appointments for different callers under the same owner; no customer row needed.
- **Expected/governing rule:** platform §§13.3/13.7: find the caller-owned booking before offering modification or fallback; tenant data must remain isolated.
- **Actual execution (E38):** getCustomerContext returns not_found even though the caller-owned appointment exists. With a customer row, it instead returns found with empty appointments.
- **Root cause:** SQL fetches only the owner’s newest 25 appointments; caller matching happens afterwards in JavaScript.
- **Recommended fix, not implemented:** Apply normalized caller/customer ownership filters in SQL before ordering/limiting; use a stable bounded per-caller history and preserve tenant binding.

**D15 — Returning-caller tool drops identity/address and omits saved request history (Medium)**

- **Business/customer impact:** The agent cannot recognize the caller or explain the saved inquiry’s follow-up state, making customers repeat their request or believe it was lost.
- **Pinned file and line:** [server/src/voice/voiceToolRuntime.js:1210](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L1210), [server/src/voice/voiceToolRuntime.js:1225](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L1225), [server/src/voice/toolDispatcher.js:93](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/toolDispatcher.js#L93).
- **Smallest configuration/inputs:** Save a synthetic named caller, complete address, one open lead and one synthetic saved quote receipt; invoke getCustomerContext.
- **Expected/governing rule:** platform §§6.6/13.7: customer-safe past quote status/ranges, bookings and open leads for the caller; no raw rates.
- **Actual execution (E39):** Handler has saved name and address but dispatched result has only found/customerHandle/recentAppointments:[]. No open lead or quote history is returned despite one of each in storage.
- **Root cause:** Runtime returns name/address while projector expects greetingName and has no address projection. The handler reads appointments but never loads saved leads or quotes.
- **Recommended fix, not implemented:** Define one shared safe caller-context schema and align runtime/projector. Return allowed identity/address fields and tenant/caller-bound lead/quote statuses using stored sanitized receipts, never current recalculation or internal rates.

**D16 — Customer identity is not unified across web/voice or credential rotation (Medium)**

- **Business/customer impact:** Returning-caller history splits across records and channels; routine credential rotation can orphan the relationship used to find existing bookings.
- **Pinned file and line:** [server/src/voice/voiceToolRuntime.js:571](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L571), [server/src/voice/voiceToolRuntime.js:585](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L585), [server/src/quoteDoneRoutes.js:138](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/quoteDoneRoutes.js#L138), [server/src/schema.js:182](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/schema.js#L182).
- **Smallest configuration/inputs:** Web review request with phone +19025550144 then voice capture of that phone; separately, two voice captures of +19025550137 with synthetic handle secrets A and B.
- **Expected/governing rule:** platform §§6.6/12.18: widget/caller threads merge on normalized E.164 within the owner; credentials are not customer identity.
- **Actual execution (E15, E45):** Web submission creates zero customer rows. Later voice creates a separate identity without linking the web request. Changing only the handle secret produces two customer IDs for the exact same owner/phone.
- **Root cause:** Web capture does not upsert/link customers. Voice computes customerId from a credential-derived HMAC and upserts by ID, rather than resolving a canonical owner+normalized-phone identity.
- **Recommended fix, not implemented:** Use a shared per-owner contact-normalization/customer resolver with a durable unique phone identity where present; keep handle secrets separate from customer IDs and preserve booking/thread references during merges.

**D17 — Voice lead webhook and lead CSV omit a saved email (Medium)**

- **Business/customer impact:** Owners using the implemented external integration or CSV lose a contact channel that the caller actually provided.
- **Pinned file and line:** [server/src/voice/voiceToolRuntime.js:577](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L577), [server/src/outboundWebhookSchema.js:29](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/outboundWebhookSchema.js#L29), [server/src/integrationData.js:8](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/integrationData.js#L8).
- **Smallest configuration/inputs:** Configured local lead.created webhook; capture voice-followup@example.invalid; inspect committed event payload and owner lead CSV.
- **Expected/governing rule:** platform §§6.8/6.10: exported/delivered lead information must accurately preserve available callback channels while excluding internal secrets.
- **Actual execution (E12):** Lead dashboard has the email, but webhook email is null and lead CSV email is empty. Voice stores it in contact.email, not originalSubmission.contact.email.
- **Root cause:** Trigger/export mappings support only the web JSON shape. Standalone voice quote-request contact omissions are separately covered by D18; ordinary web quote-request enrichment does work.
- **Recommended fix, not implemented:** Normalize all producer shapes into one allowlisted contact representation for webhook snapshots and CSV exports, with explicit voice/web fixtures and no internal book/credential fields.

**D18 — Standalone voice quote requests are missing from the actionable lead queue and contact exports (Medium)**

- **Business/customer impact:** Callback work is absent from Leads and external follow-up tools. Recovery requires manually finding the original call rather than working the request queue.
- **Pinned file and line:** [server/src/voice/voiceToolRuntime.js:825](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voiceToolRuntime.js#L825), [server/src/integrationData.js:15](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/integrationData.js#L15), [server/src/outboundWebhookSchema.js:93](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/outboundWebhookSchema.js#L93).
- **Smallest configuration/inputs:** Schema-valid logQuoteRequest({description:"[SYNTHETIC] Replace sagging gate; callback after 5."}) without a leadHandle; caller number is known.
- **Expected/governing rule:** platform §§5.5/6.8: unavailable quoting captures a lead plus a pricing request; all callbacks reach the unified lead inbox with the available contact.
- **Actual execution (E07, E12):** Tool says saved for follow-up; quoteRequests and an outbox row exist, but zero lead cards. Quote-request CSV has blank name/phone/email. Its webhook has no submission receipt to enrich contact. The call-detail page can still reveal caller number and request text.
- **Root cause:** leadHandle is optional; handler saves only a quoteRequests row. Export/webhook enrichment relies solely on quoteSubmissions, which this logging path never writes.
- **Recommended fix, not implemented:** Create or bind an actionable lead in the logging transaction, require/provide a stable lead reference, and project verified caller contact from the bound call/lead when no submission receipt exists.

**D19 — Owners cannot distinguish failed voice delivery from sent delivery on the saved request (High)**

- **Business/customer impact:** A quiet delivery failure appears indistinguishable from successful follow-up to the owner, so saved requests can remain unattended.
- **Pinned file and line:** [server/src/ownerCallService.js:26](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/ownerCallService.js#L26), [server/src/ownerCallService.js:60](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/ownerCallService.js#L60), [server/src/ownerRecordViews.js:20](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/ownerRecordViews.js#L20), [client/src/calls.jsx:15](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/client/src/calls.jsx#L15).
- **Smallest configuration/inputs:** Capture a lead; local SMS provider throws an error containing clearly synthetic private details; read owner Call/Lead routes.
- **Expected/governing rule:** Explicit audit requirement: owners can distinguish delivery failure/success and recover saved requests; platform §§5.7/6.2/6.8.
- **Actual execution (E32, E22):** Outbox is FAILED, but call.failureCode remains null and neither call nor lead response contains delivery/outbox/SMS state. Private exception text is correctly not returned. Webhook status UI only covers webhookDeliveries.
- **Root cause:** Owner read models and UI have no relationship/projection for voice outbox attempts. Call media failureCode is not notification failure state.
- **Recommended fix, not implemented:** Expose tenant-bound delivery attempts/results and safe error codes per call/request, with explicit queued/uncertain/failed/sent labels and owner retry/recovery actions. Keep raw provider messages private.

**D20 — An older failed webhook becomes undiscoverable behind the newest 20 events (Medium)**

- **Business/customer impact:** Normal later activity hides unresolved lost deliveries and removes the practical owner retry path.
- **Pinned file and line:** [server/src/outboundWebhookService.js:58](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/outboundWebhookService.js#L58), [client/src/ownerIntegrations.jsx:59](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/client/src/ownerIntegrations.jsx#L59), [server/src/ownerIntegrationRoutes.js:7](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/ownerIntegrationRoutes.js#L7).
- **Smallest configuration/inputs:** One old FAILED webhook delivery followed by at least 21 recent event deliveries; request integration configuration.
- **Expected/governing rule:** Audit recovery requirement and platform §6.10: failed delivery must remain discoverable/retryable by its owner.
- **Actual execution (E17):** Exactly 20 recent deliveries returned; older failure is absent, with no cursor, filter, total or separate failed list. Retry accepts a known eligible ID, but that random ID cannot be discovered through another provided route.
- **Root cause:** Unconditional LIMIT 20 on the sole delivery list; the UI displays only that list.
- **Recommended fix, not implemented:** Add tenant-scoped pagination and a persistent failed/needs-attention filter/count. Make older eligible failures discoverable without direct database access.

**D21 — Unresolved preferred-time requests disappear when their requested dates leave the calendar range (Medium)**

- **Business/customer impact:** An owner who misses the preferred day can lose sight of the callback task even though the customer was promised follow-up.
- **Pinned file and line:** [server/src/ownerCalendarService.js:73](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/ownerCalendarService.js#L73), [server/src/ownerCalendarService.js:82](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/ownerCalendarService.js#L82), [server/src/quoteDoneRoutes.js:271](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/quoteDoneRoutes.js#L271).
- **Smallest configuration/inputs:** Valid REQUESTED preference for 2026-10-07; advance synthetic clock ten days without resolving it.
- **Expected/governing rule:** platform §6.8: unified actionable follow-up inbox and reminder for untouched leads; saving a time request is not a booking.
- **Actual execution (E28):** Preference is still REQUESTED in durable storage but absent from the default calendar requests after the date passes. There is no separate unified pending-preference inbox or Leads projection. A manually selected historical calendar range can still retrieve it.
- **Root cause:** Pending requests are filtered by preferred appointment date instead of workflow status, and are not projected into an independent follow-up queue.
- **Recommended fix, not implemented:** Keep unresolved time requests in a tenant-bound actionable inbox regardless of requested date; label overdue/expired preferences, preserve history, and provide a resolution/renewal workflow.

**D22 — Calls/Leads show stale contact when a preferred-time request supplies corrected information (Medium)**

- **Business/customer impact:** An owner following up from Calls/Leads can use the wrong email or site even though the correction was saved successfully.
- **Pinned file and line:** [server/src/ownerCallService.js:54](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/ownerCallService.js#L54), [server/src/ownerRecordViews.js:22](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/ownerRecordViews.js#L22), [client/src/calls.jsx:43](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/client/src/calls.jsx#L43).
- **Smallest configuration/inputs:** Original lead old@example.invalid; valid preference supplies latest-preference@example.invalid, corrected name and a corrected job address.
- **Expected/governing rule:** platform §6.2 linked booking/request information and §6.8: accurate collected follow-up details must reach the owner.
- **Actual execution (E28):** Calendar schedule correctly contains latest contact/location. Call bookingRequests omit both; its linked lead and /api/leads still show old@example.invalid. The Calls request displays timing/note without the updated contact/address.
- **Root cause:** Call query omits bookingPreferences.customerJson/locationJson; lead projection uses only original capture and has no explicit corrected-contact provenance.
- **Recommended fix, not implemented:** Include the preference’s submitted contact/location in Calls and request cards, clearly identifying the latest confirmed follow-up channel and preserving older receipt information separately. Do not silently overwrite a historical receipt.

**D23 — Staff cannot recover contact for an instant web inquiry without a lead or booking (Medium)**

- **Business/customer impact:** A staff member authorized to send/follow up a quote cannot contact this prospect through the application.
- **Pinned file and line:** [server/src/ownerRecordViews.js:10](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/ownerRecordViews.js#L10), [server/src/quoteDoneRoutes.js:141](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/quoteDoneRoutes.js#L141), [server/src/quoteDoneRoutes.js:284](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/quoteDoneRoutes.js#L284), [client/src/quotedone.jsx:211](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/client/src/quotedone.jsx#L211).
- **Smallest configuration/inputs:** Synthetic persisted INSTANT web quote with originalSubmission.contact.email="instant-followup@example.invalid"; no review lead or appointment; read /api/quotes as the owner and their staff member.
- **Expected/governing rule:** platform §6.9 gives staff calls/leads/quotes-send; §6.8 requires usable follow-up information without exposing pricing internals.
- **Actual execution (E29):** Owner can find email inside owner-only internal evidence. Staff quote contains only id/service/status/result and no contact; no linked lead exists. The web quote-request webhook is correctly enriched with email, so that earlier suspicion is ruled out.
- **Root cause:** Safe quote projection omits customer contact and original follow-up facts, while instant requests intentionally do not create review leads. Hiding owner-only calculations also hides the only in-app contact representation.
- **Recommended fix, not implemented:** Provide a common allowlisted quote inquiry/contact view for authorized staff and owner, sourced from the persisted submission; keep calculations/rates owner-only and show the follow-up channel in the existing quote card.

**D24 — Completed calls retain transport outcomes and no generated summary (Medium)**

- **Business/customer impact:** Owners cannot scan the feed for what happened or what follow-up is needed and must open every transcript.
- **Pinned file and line:** [server/src/voice/productionVoiceRuntime.js:99](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/productionVoiceRuntime.js#L99), [server/src/ownerCallService.js:14](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/ownerCallService.js#L14), [client/src/calls.jsx:8](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/client/src/calls.jsx#L8).
- **Smallest configuration/inputs:** Actual signed local call captures an inquiry and a flooding flag, receives a transcript, then sends normal Twilio stop.
- **Expected/governing rule:** platform §5.7: every call has transcript, summary and semantic outcome LEAD/QUOTED/BOOKED/etc.; §6.2 readable call information.
- **Actual execution (E23):** Stored status COMPLETED, outcome TWILIO_STOP, summaryText null. The transcript and lead are present. Production session-end update writes transport reason rather than the saved business result.
- **Root cause:** No post-call summary/semantic-outcome derivation is wired; owner views accurately display the incomplete producer record.
- **Recommended fix, not implemented:** Derive semantic outcome from committed lead/quote/booking/transfer receipts and store a bounded, fact-grounded summary after transcript drain. Keep transport termination/failure separately.

**D25 — Normal fallback callback overwrites a successful completed call and forwards it again (High)**

- **Business/customer impact:** Owners see a completed request as a failed call, and the customer can be unexpectedly forwarded after finishing the conversation.
- **Pinned file and line:** [server/src/voiceRuntimeRoutes.js:449](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voiceRuntimeRoutes.js#L449), [server/src/voiceRuntimeRoutes.js:470](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voiceRuntimeRoutes.js#L470), [server/src/voice/voicePersistence.js:189](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voicePersistence.js#L189).
- **Smallest configuration/inputs:** Complete a signed synthetic lead call normally; POST its correctly signed resume-fallback URL with matching call/account/numbers.
- **Expected/governing rule:** Audit duplicate/stale-event requirement: successful saved outcomes must survive retries; platform §12.4 fallback is for session failure.
- **Actual execution (E23):** Before callback: COMPLETED/TWILIO_STOP with saved lead/transcript. After: FALLBACK/VOICE_SESSION_UNAVAILABLE/failureCode, plus new Dial-to-owner TwiML. The fallback URL exists unconditionally after Connect.
- **Root cause:** Resume route never examines stored call status/outcome; recordFallback unconditionally overwrites any existing bound row, including completed calls.
- **Recommended fix, not implemented:** Differentiate normal completion from failed stream termination using persisted session/business state and provider callback facts. Make fallback transition idempotent, avoid forwarding a completed conversation, and never overwrite a terminal successful outcome with a replay.

**D26 — Call-end cleanup drops queued caller text and buffered model transcript (High)**

- **Business/customer impact:** Final phone/email corrections, request details or promises can vanish from the owner’s only written record of the call.
- **Pinned file and line:** [server/src/voice/geminiMediaBridge.js:359](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/geminiMediaBridge.js#L359), [server/src/voice/geminiMediaBridge.js:503](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/geminiMediaBridge.js#L503), [server/src/voice/googleGenAiLiveAdapter.js:29](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/googleGenAiLiveAdapter.js#L29), [server/src/voice/googleGenAiLiveAdapter.js:40](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/googleGenAiLiveAdapter.js#L40).
- **Smallest configuration/inputs:** Queue final caller transcription, immediately close the local socket; separately deliver a partial model outputTranscription then close the Twilio transport before turnComplete.
- **Expected/governing rule:** platform §§5.7/6.2: preserve the written call record; no audio storage. Important final corrections are still collected information.
- **Actual execution (E25, E26):** Queued caller callback correction stores zero turns. Buffered model follow-up promise also leaves storedTranscript:[]. Both cases execute the unmodified bridge/adapter; a completed earlier caller turn does persist.
- **Root cause:** finish sets ended before draining transcriptTail; queued transcript tasks skip when ended. Local adapter close marks closed without flushing modelText, unlike the provider-origin onclose path.
- **Recommended fix, not implemented:** Stop accepting new media, then durably drain already accepted transcript/tool work with bounded shutdown and flush buffered transcription before finalizing call state. Preserve incomplete/interrupted flags where appropriate.

**D27 — Cold restart leaves persisted active calls stranded without a recoverable lead (High)**

- **Business/customer impact:** A process crash can leave customer requests permanently recorded as live rather than available for owner follow-up.
- **Pinned file and line:** [server/src/voice/productionVoiceRuntime.js:45](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/productionVoiceRuntime.js#L45), [server/src/voice/productionVoiceRuntime.js:99](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/productionVoiceRuntime.js#L99), [server/src/voice/voicePersistence.js:130](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voicePersistence.js#L130), [server/src/server.js:485](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/server.js#L485).
- **Smallest configuration/inputs:** Take a crash-consistent backup of a real synthetic CONNECTED voice call containing request text but no completed capture tool; cold-start the actual server against that temporary crash snapshot.
- **Expected/governing rule:** Audit restart/failure requirement and platform §12.4: interrupted requests need a truthful failed/missed-call state, preserved transcript and owner follow-up recovery.
- **Actual execution (E24):** After full server startup, call remains CONNECTED, outcome/failureCode null, zero leads. No active live session exists for the snapshot. Recovery depends on a later provider callback that may never arrive.
- **Root cause:** Call completion is callback-only. Startup/worker lifecycle has no durable session lease/heartbeat reconciliation or orphaned-request recovery.
- **Recommended fix, not implemented:** Introduce durable session ownership/leases and reconcile expired active sessions on restart; preserve existing transcript, create an actionable interrupted-call lead, and notify/retry without prematurely terminating another process’s live session.

**D28 — OPERATOR LIVE readiness can coexist with an unavailable inbound route (High)**

- **Business/customer impact:** The owner can believe callers are covered while their actual webhook cannot answer or capture them. This is a label/backend defect, not a request to audit carrier billing or payment gates.
- **Pinned file and line:** [server/src/onboardingService.js:297](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/onboardingService.js#L297), [client/src/dashboard.jsx:30](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/client/src/dashboard.jsx#L30), [server/src/voice/productionVoiceRuntime.js:34](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/productionVoiceRuntime.js#L34).
- **Smallest configuration/inputs:** Persisted operator enabled/provisioned phone with about/hours; restart with voice disabled and missing signed-voice config. Evaluate the actual operatorView and production voice composition.
- **Expected/governing rule:** platform §5.1 and honest readiness requirement: ON/LIVE means AI answers calls; label must reflect backend dependencies.
- **Actual execution (E19):** eligible:true, missing:[] and actual view title OPERATOR LIVE / EVERY CALL FROM HERE ON IS COVERED. Production composition configured:false; inbound POST returns 503 Voice unavailable.
- **Root cause:** Eligibility inspects profile setup only; the displayed live state trusts operatorEnabled and ignores runtime switches/configuration and channel readiness.
- **Recommended fix, not implemented:** Return a computed backend readiness/coverage state that includes the signed voice runtime and required adapters; distinguish configured/connecting/available/failed, and block or visibly suspend LIVE when those dependencies fail.

**D29 — Production Calls deep links and refresh return 404 (Medium)**

- **Business/customer impact:** An owner bookmarking, refreshing or opening a call link cannot recover that request through the deployed app route.
- **Pinned file and line:** [server/src/productionAssets.js:5](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/productionAssets.js#L5), [server/src/productionAssets.js:19](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/productionAssets.js#L19), [client/src/main.jsx:64](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/client/src/main.jsx#L64).
- **Smallest configuration/inputs:** Mount the unchanged production owner asset handler on the cold-built owner dist; GET /dashboard, /calls and /calls?record=SYNTHETIC-CALL.
- **Expected/governing rule:** platform §6.2 owner Calls view and audit saved-request recovery: direct navigation/refresh must reach the owner application.
- **Actual execution (E40):** /dashboard is 200; both Calls URLs are 404. In-app history.pushState navigation can still work until the user refreshes or opens a deep link.
- **Root cause:** Production SPA path allowlist omits /calls although the client router and CallFeed link to it.
- **Recommended fix, not implemented:** Include the existing Calls owner route in SPA serving and verify direct navigation/refresh with and without the record query, preserving API authentication and tenant scoping.

**D30 — The open dashboard does not receive newly saved calls (Medium)**

- **Business/customer impact:** An owner keeping the dashboard open can miss new requests until reloading or changing a setting, especially with D02’s absent alerts.
- **Pinned file and line:** [client/src/dashboard.jsx:46](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/client/src/dashboard.jsx#L46), [client/src/dashboard.jsx:52](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/client/src/dashboard.jsx#L52).
- **Smallest configuration/inputs:** Mount the actual Dashboard with real React hooks and real local server API; initial synthetic call exists; persist a second call while it stays mounted.
- **Expected/governing rule:** platform §§5.7/6.1: calls stream to the live dashboard feed.
- **Actual execution (E41):** Initial call renders. A fresh real /api/calls read contains the new call, but the mounted dashboard never displays it and makes zero additional UI fetches during the observation. Source has no polling/subscription path; data reload occurs on mount or settings/toggle actions.
- **Root cause:** One mount-time useEffect loads a static snapshot; no live update mechanism updates state when calls/requests arrive.
- **Recommended fix, not implemented:** Add tenant-authenticated event subscription or bounded polling/invalidation for actual call/lead activity; handle reconnect/session changes and show stale/offline state honestly in existing components.

**D31 — Duplicate signed inbound callbacks create parallel sessions and can reopen completed calls (High)**

- **Business/customer impact:** Duplicate provider events can mix transcripts/tools and let one session mark a still-running conversation completed. E09’s permissive internal runtime call is supporting evidence, not a separately counted public vulnerability.
- **Pinned file and line:** [server/src/voiceRuntimeRoutes.js:421](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voiceRuntimeRoutes.js#L421), [server/src/voice/voicePersistence.js:138](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voicePersistence.js#L138), [server/src/voice/productionVoiceRuntime.js:74](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/productionVoiceRuntime.js#L74).
- **Smallest configuration/inputs:** POST the same legitimate locally signed incoming CallSid twice; connect both returned stream URLs. Stop the first stream, then replay the incoming callback once more.
- **Expected/governing rule:** platform §12.2: one Gemini session per inbound call; audit duplicate/stale-event requirement: retries must not change successful call ownership/state or revive completed work.
- **Actual execution (E42, E09, E34):** One call row but two live provider sessions. Stopping the first marks the row COMPLETED while the second socket is still open. A later duplicate incoming event supplies a fresh Stream URL for that completed CallSid. Reusing the already consumed original nonce is correctly rejected 403 (E34), which does not prevent a newly issued nonce.
- **Root cause:** Each callback issues a new nonce; createSession treats any existing correctly bound CallSid as newly created regardless of status or an active media session. There is no durable per-call session claim.
- **Recommended fix, not implemented:** Make incoming callback handling idempotent by trusted CallSid and terminal state, and lease one active session per call across processes. Safe exact-retry responses must not mint another live session or revive terminal calls; retain original binding/outcome.

**D32 — The specified default per-owner concurrent-call ceiling is not enforced (Medium)**

- **Business/customer impact:** The required capacity guard does not work. During real provider/resource saturation this increases the risk of unhandled requests; the local stub run proves the missing guard, not a live-load failure.
- **Pinned file and line:** [server/src/voiceRuntimeRoutes.js:387](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voiceRuntimeRoutes.js#L387), [server/src/voice/productionVoiceRuntime.js:51](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/productionVoiceRuntime.js#L51), [server/src/voice/voicePersistence.js:130](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voicePersistence.js#L130).
- **Smallest configuration/inputs:** Six distinct signed CallSids simultaneously connect to one synthetic provisioned owner; all provider sessions are local stubs held open.
- **Expected/governing rule:** platform §12.2: per-owner concurrency ceiling defaults to five; excess calls use transcript capture fallback so they are still answered.
- **Actual execution (E43):** All six open Google sessions; all five additional requests return Stream TwiML; no excess-call fallback lead. No admission limit/configuration is checked by the traced production path.
- **Root cause:** Inbound eligibility checks profile/access but has no atomic owner/platform active-session admission control.
- **Recommended fix, not implemented:** Add cross-process leased concurrency admission for the configured owner/platform ceilings and route excess callers into the durable transcript-only capture path; release/reconcile leases on all endings/restarts.

**Business-policy conflict — P01: fixed guide deadlines versus owner-specific commitments**

- **Severity/impact:** Medium. The instructions can authorize a deadline the business explicitly does not offer, undermining customer expectations even when the request itself is saved.
- **Source:** [specs/voice_quote_flows.md:56](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/specs/voice_quote_flows.md#L56), [specs/voice_quote_flows.md:99](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/specs/voice_quote_flows.md#L99), [server/src/voice/voicePromptCompiler.js:56](https://github.com/sportaholic000-hue/off-the-clock/blob/73c00622d6f2df31f57773b32e41355a7421f1a3/server/src/voice/voicePromptCompiler.js#L56). Platform §5.8 forbids guessing policies; §13.2 uses an owner-set callback window.
- **Smallest synthetic input:** compileVoiceSystemInstruction with no live services and owner knowledge policy: “[SYNTHETIC] No same-day quote or callback. Quotes and callbacks are provided on the next business day.”
- **Expected:** one explicit governing commitment/precedence, bounded by owner policy and actual available delivery channel.
- **Actual (E35):** compiled instructions contain that next-business-day policy and the unchanged guide’s fixed same-day quote promise and text-in-a-minute promise. A generic prohibition on inventing successful notifications is also present; it does not supply an explicit timing-policy reconciliation.
- **Cause:** guide globals and owner policy are concatenated without resolving their conflicting commitment. This is an executed prompt conflict, not proof a live model spoke the false promise.
- **Owner policy decision / recommendation:** explicitly decide which owner-confirmed callback/quote timing governs and suppress fixed historical deadlines when conflicting or unsupported. Preserve the voice guide’s conversational style while binding commitments to that rule. No rule was silently changed in this audit.

**Suspicion dispositions and controls that held**

- **Tenant routing/isolation:** valid signed called number selects the owner; supplied owner selectors did not redirect capture. Wrong owner/call/expired/deleted lead handles fail; foreign owner/staff reads returned 404; staff read models did not expose owner-only calculation evidence. Existing owner-call tests also exercise bad cross-tenant booking links. No cross-tenant customer-data leak was confirmed in these tested paths.
- **Web durability/retries:** concurrent HTTP and two independent Node processes returned one 201 and one 200 for the same request, with one stored receipt. Changed request-ID reuse returned 409. Full transaction failure rolled back without a saved acknowledgement. Unread/disconnected HTTP response and cold-process replay recovered the original request once (E13/E14/E30/E31/E33/E44).
- **Voice persistence acknowledgements:** injected failure after lead commit but before handle issuance produced an error, not a false saved reply. Removing the fault recovered one deterministic lead and an exact response replay (E02). This does not repair missing job notes or owner delivery.
- **Shared booking confirmation:** existing tests exercised provider refusal, timeout/recovery, pending/confirmed distinction, exact event identity/time checks and concurrent slot locks. No newly confirmed premature booking acknowledgement in these shared handlers was found. Preferred-time REQUESTED remains explicitly unbooked.
- **Webhook retry machinery:** synthetic 503 exhausted eight attempts to visible FAILED; rightful-owner retry then delivered, foreign retry was rejected; concurrent workers claimed one event and expired lease replay retained stable event ID. Endpoint change canceled queued old-destination work (E16/E18). Receiver-side dedupe remains necessary for at-least-once delivery; a 2xx response proves receiver acceptance, not a human owner read.
- **Web quote-request contact suspicion ruled out:** the AFTER INSERT quoteSubmissions trigger enriches pending quote.requested with allowlisted customer contact before transaction commit. E29 verified the email is present. D17 concerns voice lead JSON/CSV; D18 concerns standalone logs without submission receipts, not ordinary web quote requests.
- **Stale call-context suspicion narrowed:** E09 can invoke a completed call’s internal handler, but that alone is not a public exploit. E34 confirms original consumed nonce replay is rejected. E42 establishes the actual public duplicate-callback/fresh-nonce path, reported once as D31.
- **Logs/privacy/audio:** caller-sensitive provider error text did not reach the tool result in E32; voice composition logs safe codes, and webhook error handling uses an allowlist without receiver payload/URL/exception text. No inappropriate customer logging was confirmed in the traced delivery paths. Tests used no real audio, recordings or live providers; no audio was stored.
- **Dashboard quote-counter suspicion ruled out:** real stored-data branch labels the counter QUOTES / ALL SAVED QUOTES, rather than pretending every saved quote was delivered. The simulated preview branch is separate. D24/D28/D30 are different producer/readiness/live-update failures.

**Verification and limits**

| Cold command/run | Result |
|---|---|
| npm ci under Node 22.23.3 | Passed; 262 packages |
| npm run build | Passed owner and widget production builds |
| 23 selected existing spec files, cold-existing.tap | 229/229 passed |
| Five additional files, cold-additional.tap | 47/47 passed |
| Three support files, cold-support.tap | 15/15 passed |
| Combined existing tests | **291/291; zero failures, cancellations, skips or TODOs** |
| Independent experiments | **45 completed; 11 met the prewritten outcome, 34 produced expectation mismatches; zero final experiment/harness errors** |

Independent mismatches are adjudicated by source and reachability rather than counted one-for-one as bugs: repeated observations are grouped, E09 is not a standalone public defect, and E35 is a policy conflict. Conversely, an experiment can prove more than one independent root cause. The resulting catalog contains 32 defects and one policy conflict.

Initial harness faults were corrected without application/test changes: duplicate synthetic Twilio number SIDs, incomplete synthetic active-account prerequisites, and an omitted required bridge callback. Their preliminary failed attempts are not counted as product defects or passing experiments. Final cold product runs had no environment failures. React’s renderer printed its deprecation notice; the mounted Dashboard hooks and real API run still completed. The renderer is a test tool, not a new product dependency.

Coverage includes phone/web storage, owner/staff route and rendered visibility, signed HTTP/WebSocket boundaries, duplicate events, corrections, concurrent HTTP/process submissions, expired/wrong handles, loss of an HTTP acknowledgement, post-persistence faults, local provider refusal/timeouts, retry exhaustion/lease restart, stale call state, crash-snapshot cold server restart, incomplete contacts, absent configuration and transcript shutdown. It includes default production composition and optional webhook producers/worker.

No real carrier forwarding, real SMS/email deliverability, real model speech, provider quotas or live customer data were used. Absolute freedom from arbitrary model false statements cannot be established with local stubs: tested tool acknowledgements are truthful, but the full freeform provider conversation and end-to-end human receipt are unverified. The prompt policy conflict is reported directly. No readiness claim is made for pricing, billing, payment access or the overall product. Full pricing and billing suites were not used as audit proof. [REPRODUCE.md](REPRODUCE.md) lists exact commands and test-file selections.

**Prioritized paid-pilot blockers within this scope**

1. **P0 — retain the request and alert its owner:** D01/D02/D03/D07/D08/D09/D10/D19/D26/D27. Close silent saved-but-undelivered paths, preserve notes/final turns, support incomplete caller identity, and make fallback/restart recovery actionable.
2. **P0 — one honest live session and truthful coverage:** D04/D05/D06/D25/D28/D31. Wire supported providers, recover failed delivery, retain transfer failures, prevent duplicate/reopened sessions and stop claiming LIVE when the runtime cannot answer.
3. **P1 — reliable follow-up views and identity:** D11–D18/D20–D24/D29/D30. Preserve owner disposition/contact/history, expose all failures and pending requests, support staff follow-up and working Calls links/live feed.
4. **P1 — enforce the configured concurrency guard and resolve callback timing:** D32 and P01. Excess callers still need a durable capture path; owner commitments need an explicit policy.

**Exact audited SHA:** `73c00622d6f2df31f57773b32e41355a7421f1a3`. **Coverage:** implemented lead/receptionist delivery and owner follow-up only, as bounded above. **Counts:** 31 existing files / 291 passing cold tests; 45 independent experiments; 32 confirmed defects; one policy conflict; zero final experiment errors. **Verified GitHub report:** [REPORT.md](https://github.com/sportaholic000-hue/off-the-clock/blob/codex/lead-delivery-audit-20261006/verification/lead-delivery-20261006/REPORT.md). The final handoff additionally pins the uploaded report commit.
