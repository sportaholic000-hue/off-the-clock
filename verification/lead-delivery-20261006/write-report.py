from pathlib import Path
import json,hashlib,subprocess,re,shutil,os
out=Path('verification/lead-delivery-20261006');pin='73c00622d6f2df31f57773b32e41355a7421f1a3';repo='https://github.com/sportaholic000-hue/off-the-clock';branch='codex/lead-delivery-audit-20261006'
findings=[]
def finding(id,severity,title,experiments,sources,minimum,expected,actual,cause,fix,impact):
 findings.append(dict(id=id,severity=severity,title=title,experiments=experiments.split(','),sources=[{'file':f,'line':n} for f,n in sources],minimum=minimum,expected=expected,actual=actual,rootCause=cause,recommendedFix=fix,impact=impact))
V='server/src/voice/voiceToolRuntime.js';P='server/src/voice/productionVoiceRuntime.js';R='server/src/voiceRuntimeRoutes.js';C='server/src/ownerCallService.js';O='server/src/ownerRecordViews.js';S='server/src/voice/toolSchemas.js';W='server/src/outboundWebhookService.js'
finding('D01','High','Voice capture discards the actual request notes','E01,E20',[(V,574),(V,590),(O,24)],
 'One bound synthetic call; captureLead({name:"[SYNTHETIC] Alex",email:"alex@example.invalid",address,notes:"[SYNTHETIC] Gate fell down; call after 5pm."}). No pricing or calendar needed.',
 'build_guide captureLead: retain every collected input plus transcript pointer; platform §§6.2/6.8: actionable owner follow-up information.',
 'Returns captured. Stored notes is null, describedService is null, and neither staff lead JSON nor rendered Calls includes the supplied problem/callback instruction. The callback email survives.',
 'captureLead hard-codes notes:null and NULL describedService; the normalized lead view also has no notes projection.',
 'Persist bounded caller notes and a request description; expose them in the common owner/staff lead view and existing Calls/Leads components. Preserve their provenance and do not treat notes as pricing instructions.',
 'A callback card can contain a name and number but none of the work or timing the customer requested; the owner must re-interview the caller or comb through any available transcript.')
finding('D02','High','First-party owner alerts and the voice/preference outbox have no delivery consumer','E05,E28,E21',[(V,948),('server/src/bookingPreferenceService.js',185),('server/src/server.js',485),('server/src/outboundWebhookSchema.js',1)],
 'One ordinary voice capture, one flooding flag, or one valid preferred-time request. Restart the only registered delivery worker with local stubs; no first-party notification configuration exists.',
 'platform §§5.4/5.7/6.8/6.11/13.2 and build_guide post-call automation: notify the owner of leads, immediately for urgency; preserve retry/failure recovery.',
 'Urgency and booking.preference_requested remain PENDING with zero corresponding provider attempts after worker recreation. The server starts the webhook worker, not an outbox consumer. Ordinary capture has no first-party owner alert producer. Optional webhooks process only lead.created, quote.requested and appointment.booked, and are not SMS/email owner alerts.',
 'There is no owner-alert dispatcher or outbox worker wired into server lifecycle. Auth email code is not a lead-alert channel.',
 'Implement a durable tenant-bound owner notification pipeline for the actually supported owner channels; create events atomically with capture, distinguish queued/attempted/provider-accepted/failed, retry after restart, and bypass digest delays for urgency. Require/configure an owner destination and expose readiness/failure honestly.',
 'Owners can miss ordinary inquiries, emergencies and time requests unless they manually discover saved data. A PENDING database row alone does not contact the owner.')
finding('D03','High','Urgency is absent from the call and lead records owners read','E05,E23',[(V,958),(C,29),(O,24)],
 'Capture a caller, then flagUrgent({reason:"flooding",summary:"[SYNTHETIC] Water through kitchen ceiling."}).',
 'platform §§6.2/13.2: visible urgency and a complaint/urgent lead card with the transcript; urgency must remain evident independently of notification delivery.',
 'Tool returns flagged and an events row exists, but calls.urgency and normalized lead.urgency remain null. A real completed flooding call still shows null urgency; no COMPLAINT lead type is created by the flag path.',
 'The handler writes separate events/outbox rows without updating the call/lead or joining those rows into the owner read models.',
 'Atomically mark the bound call and appropriate lead/thread urgent, preserve reason/summary, apply the complaint classification when relevant, and expose it to authorized owner/staff views.',
 'Even an owner checking the inbox cannot identify which saved request requires immediate follow-up.')
finding('D04','High','Production voice composition has no SMS, live-transfer or appointment-change provider adapters','E22,E37',[(P,31),(P,76),('server/src/server.js',462),(V,905),(V,1030),(V,1143)],
 'Valid signed local call with a synthetic Google session and provisioned owner phone; capture a lead, sendSms(callback), transferCall(caller_requested), or cancel a caller-owned confirmed synthetic appointment.',
 'platform §§5.4/5.6/5.7/13.3: implemented transactional texts, warm transfer and confirmed appointment changes.',
 'Actual production composition returns SMS unavailable and transfer unavailable and writes FAILED outbox rows. The cancellation handler with the same default provider dependency returns unavailable and leaves the appointment CONFIRMED. None falsely reports success.',
 'server.js calls installProductionVoice without providers. The default is {}; bookingService is supplied separately and does not populate these adapters.',
 'Supply real production adapters for the approved channels and shared appointment operations through server construction, with bounded calls, provider receipts, tenant/caller checks and recovery. Do not label these capabilities available until their dependencies are ready.',
 'Customers cannot receive the promised written follow-up or reach a human through the advertised tool, and appointment-change requests do not get applied. Source-defined injectable handlers do not establish a deployed delivery channel.')
finding('D05','High','One failed SMS attempt permanently prevents a later retry','E10',[(V,875),(V,884),(V,936)],
 'Local sendSms stub throws ETIMEDOUT on attempt one, then returns SENT; retry the same lead/template under a new toolCallId and recreated runtime.',
 'Audit retry/failure requirement and platform §5.7: transient provider failure must permit safe recovery without pretending a message was sent.',
 'First and second replies both unavailable; provider invoked once only; the event remains FAILED after recovery. New dispatcher idempotency keys do not help.',
 'The application-level event identity is fixed to call+handle+template. Any prior non-SENT row immediately returns unavailable instead of claiming a retry or reconciling an uncertain provider result.',
 'Use a leased durable delivery job with retry policy and provider idempotency/receipt reconciliation; SENT should replay, retryable failures should re-attempt, and timeouts after acceptance should remain explicitly uncertain until reconciled.',
 'A transient outage becomes permanent lost written follow-up for the saved inquiry, even after the provider recovers. This runtime defect remains relevant when D04 is wired.')
finding('D06','High','An unsuccessful transfer does not create its promised callback lead','E11',[(V,1015),(V,1030),(V,1070)],
 'One bound caller asks for a human; local transfer provider throws a synthetic no-answer error; no pre-existing lead.',
 'platform §5.6: no answer/outside window must fall back to a lead card and authorized callback promise; transfers never dead-end.',
 'Returns unavailable with a truthful failure message but call detail contains zero leads and no captured transfer reason in the callback queue. Caller number survives on the call row.',
 'Transfer failure writes delivery state and returns; it neither creates a callback request nor invokes a shared durable fallback capture path.',
 'Atomically preserve the caller/request/reason as an actionable callback lead on every unsuccessful transfer, notify the owner, and return only an owner-authorized callback commitment.',
 'A customer seeking a person is told transfer failed but the owner gets no actionable lead; manual discovery of the phone number is the only recovery.')
finding('D07','High','AI failure fallback forwards once and hangs up without request capture','E21',[(P,46),(R,227),('server/src/voice/voicePersistence.js',178)],
 'Synthetic Google connect rejects; signed fallback callback is invoked for a provisioned synthetic owner with fallback number +19025550199.',
 'platform §12.4 and §5.7: failure/missed-call transcript lead, AI_FALLBACK flag, owner alert and missed-call text-back; no audio storage.',
 'HTTP 200 TwiML dials the business, then says to try again and hangs up. Saved call is FALLBACK with no transcript, no lead and no outbox event. If that business phone does not answer, no transcription/capture step exists after Dial.',
 'The production fallback is exclusively forward mode; recordFallback persists call metadata only. No speech-capture or missed-call automation is attached.',
 'Add a transcript-only capture continuation for unanswered/failed forwarding and AI startup/drop failures, with durable owner-linked lead/alert and honest callback instructions. Preserve any earlier transcript and inputs. Do not introduce call recording.',
 'An after-hours or unavailable owner can lose the entire request during the exact provider failure the fallback is meant to cover. Forwarding that is answered can still reach the owner; this finding concerns the unanswered continuation.')
finding('D08','High','Legitimate anonymous caller IDs are rejected before tenant resolution','E27',[(R,183),(R,353)],
 'Otherwise valid locally signed inbound form, From:"anonymous", valid synthetic AccountSid/CallSid/To and Direction:"inbound".',
 'platform §5.1: ON answers inbound calls; unavailable contact details require honest capture rather than an authentication rejection. Twilio documents non-number caller IDs for withheld/unavailable callers (https://www.twilio.com/docs/voice/twiml).',
 'HTTP 400 Voice unavailable; zero call records for the owner; no business fallback or callback-capture prompt.',
 'normalizeIncomingCall requires From to be E.164 before the signed destination establishes the tenant.',
 'Keep signature/account/destination validation strict while representing unavailable caller ID explicitly. Ask for a confirmed callback channel through the capture tool and prevent caller-memory matching until an identity is known.',
 'Privacy-conscious prospective customers are unable to leave a request and the owner has no recoverable call record.')
finding('D09','High','Voice lead capture rejects callers who do not supply a name','E36',[(S,77),(S,113)],
 'Bound call with known synthetic callback phone; captureLead({notes:"[SYNTHETIC] Please quote repair; prefers no name."}).',
 'September 30 owner direction/shared boundaries: callback contact is required for an estimate; a name is optional. build_guide capture preserves collected details.',
 'Dispatcher rejects with MISSING_TOOL_FIELD and creates zero leads although context supplies a valid callback number. Runtime code itself can represent name:null.',
 'Tool declaration and validation require a nonempty name, stricter than the approved contact requirement and the persistence handler.',
 'Make the name optional for saving a callback request; retain verified available contact and request text. Require additional identity only for operations that truly need it, such as confirmed booking.',
 'A usable inquiry is blocked solely because the caller declines or has not yet given a name.')
finding('D10','High','The valid urgency-tool schema allows an input that always fails','E06',[(S,84),(S,116),(V,952)],
 'flagUrgent({reason:"safety"}) on a bound synthetic call; summary is omitted as permitted by the tool declaration.',
 'platform §§5.4/13.2 and voice global urgency: immediately preserve and flag urgency; a valid declared call must not silently lose it.',
 'TOOL_EXECUTION_FAILED, zero urgency events; production wraps it as needs_details rather than a successful urgent flag.',
 'Schema marks summary optional, while the handler rejects every empty/missing summary.',
 'Unify the contract. Prefer preserving the urgent reason immediately and enriching the summary later; any truly required field must be required and described consistently in declaration, validator and runtime.',
 'The model can make a schema-valid emergency flag call that produces no flag or alert.')
finding('D11','Medium','Correcting contact information creates another lead for the same call/request','E04',[(V,570),(V,572),(V,590)],
 'On one call capture name "[SYNTHETIC] Alxe", then corrected "[SYNTHETIC] Alex" with correct@example.invalid.',
 'platform §§6.8/12.18/13.6: coherent customer/lead thread; exact retry and contact correction should not create contradictory actionable requests.',
 'Two CAPTURED leads persist: misspelled old contact and corrected contact. Adding/changing address likewise changes the identity input.',
 'Mutable contact/address content is hashed into leadId instead of identifying the inquiry independently of its corrections.',
 'Use a stable inquiry/thread identity tied to owner and call/request, update versioned contact facts within that identity, and link multiple actual service requests explicitly rather than using changed contact to identify a new job.',
 'Owners may call the stale contact or pursue the same job twice; earlier lead handles and cards remain valid.')
finding('D12','Medium','A new capture event reopens an owner-dismissed lead','E03',[(V,590),('server/src/quoteDoneRoutes.js',276)],
 'Capture one lead; owner PATCHes its status to DISMISSED; dispatch identical capture args with a different toolCallId using a recreated runtime.',
 'Audit duplicate-event requirement and platform §6.8: customer capture retries must preserve owner follow-up disposition.',
 'Status changes back to CAPTURED. Exact replay of the same dispatcher key is safe, but a distinct provider event is not.',
 'UPSERT unconditionally assigns status=excluded.status even when capture data is unchanged and the owner has already handled the lead.',
 'Separate capture-data updates from owner workflow status. Preserve disposition unless an explicit, authorized new inquiry/reopen action changes it; use a revision check when combining updates.',
 'Completed/dismissed requests reappear as work to do and can cause duplicate unwanted callbacks.')
finding('D13','Medium','A returning caller omitting email erases the known customer email','E03',[(V,558),(V,585)],
 'Capture returning@example.invalid for a caller; on the next call capture only the name with the same owner/phone.',
 'platform §§6.6/12.18/13.7: preserve the returning customer and accurate follow-up channels.',
 'customers.notesJson becomes {voiceVersion:1,email:null}. The prior lead still holds historical email, but the current customer record loses it.',
 'Customer UPSERT replaces notesJson wholesale with the latest invocation, including null for an omitted optional field.',
 'Merge provided contact fields explicitly; distinguish omission from an authorized clear/change. Retain historical provenance and update canonical contact only after confirmation.',
 'Future follow-up and caller-memory operations lose a previously usable contact channel unless the owner searches older records.')
finding('D14','Medium','Booking lookup limits the tenant before filtering for the caller','E38',[(V,1215)],
 'One stored caller-owned confirmed appointment plus 25 newer appointments for different callers under the same owner; no customer row needed.',
 'platform §§13.3/13.7: find the caller-owned booking before offering modification or fallback; tenant data must remain isolated.',
 'getCustomerContext returns not_found even though the caller-owned appointment exists. With a customer row, it instead returns found with empty appointments.',
 'SQL fetches only the owner’s newest 25 appointments; caller matching happens afterwards in JavaScript.',
 'Apply normalized caller/customer ownership filters in SQL before ordering/limiting; use a stable bounded per-caller history and preserve tenant binding.',
 'Returning customers can be incorrectly treated as having no booking; reschedule/cancel/follow-up requests fail as the business grows.')
finding('D15','Medium','Returning-caller tool drops identity/address and omits saved request history','E39',[(V,1210),(V,1225),('server/src/voice/toolDispatcher.js',93)],
 'Save a synthetic named caller, complete address, one open lead and one synthetic saved quote receipt; invoke getCustomerContext.',
 'platform §§6.6/13.7: customer-safe past quote status/ranges, bookings and open leads for the caller; no raw rates.',
 'Handler has saved name and address but dispatched result has only found/customerHandle/recentAppointments:[]. No open lead or quote history is returned despite one of each in storage.',
 'Runtime returns name/address while projector expects greetingName and has no address projection. The handler reads appointments but never loads saved leads or quotes.',
 'Define one shared safe caller-context schema and align runtime/projector. Return allowed identity/address fields and tenant/caller-bound lead/quote statuses using stored sanitized receipts, never current recalculation or internal rates.',
 'The agent cannot recognize the caller or explain the saved inquiry’s follow-up state, making customers repeat their request or believe it was lost.')
finding('D16','Medium','Customer identity is not unified across web/voice or credential rotation','E15,E45',[(V,571),(V,585),('server/src/quoteDoneRoutes.js',138),('server/src/schema.js',182)],
 'Web review request with phone +19025550144 then voice capture of that phone; separately, two voice captures of +19025550137 with synthetic handle secrets A and B.',
 'platform §§6.6/12.18: widget/caller threads merge on normalized E.164 within the owner; credentials are not customer identity.',
 'Web submission creates zero customer rows. Later voice creates a separate identity without linking the web request. Changing only the handle secret produces two customer IDs for the exact same owner/phone.',
 'Web capture does not upsert/link customers. Voice computes customerId from a credential-derived HMAC and upserts by ID, rather than resolving a canonical owner+normalized-phone identity.',
 'Use a shared per-owner contact-normalization/customer resolver with a durable unique phone identity where present; keep handle secrets separate from customer IDs and preserve booking/thread references during merges.',
 'Returning-caller history splits across records and channels; routine credential rotation can orphan the relationship used to find existing bookings.')
finding('D17','Medium','Voice lead webhook and lead CSV omit a saved email','E12',[(V,577),('server/src/outboundWebhookSchema.js',29),('server/src/integrationData.js',8)],
 'Configured local lead.created webhook; capture voice-followup@example.invalid; inspect committed event payload and owner lead CSV.',
 'platform §§6.8/6.10: exported/delivered lead information must accurately preserve available callback channels while excluding internal secrets.',
 'Lead dashboard has the email, but webhook email is null and lead CSV email is empty. Voice stores it in contact.email, not originalSubmission.contact.email.',
 'Trigger/export mappings support only the web JSON shape. Standalone voice quote-request contact omissions are separately covered by D18; ordinary web quote-request enrichment does work.',
 'Normalize all producer shapes into one allowlisted contact representation for webhook snapshots and CSV exports, with explicit voice/web fixtures and no internal book/credential fields.',
 'Owners using the implemented external integration or CSV lose a contact channel that the caller actually provided.')
finding('D18','Medium','Standalone voice quote requests are missing from the actionable lead queue and contact exports','E07,E12',[(V,825),('server/src/integrationData.js',15),('server/src/outboundWebhookSchema.js',93)],
 'Schema-valid logQuoteRequest({description:"[SYNTHETIC] Replace sagging gate; callback after 5."}) without a leadHandle; caller number is known.',
 'platform §§5.5/6.8: unavailable quoting captures a lead plus a pricing request; all callbacks reach the unified lead inbox with the available contact.',
 'Tool says saved for follow-up; quoteRequests and an outbox row exist, but zero lead cards. Quote-request CSV has blank name/phone/email. Its webhook has no submission receipt to enrich contact. The call-detail page can still reveal caller number and request text.',
 'leadHandle is optional; handler saves only a quoteRequests row. Export/webhook enrichment relies solely on quoteSubmissions, which this logging path never writes.',
 'Create or bind an actionable lead in the logging transaction, require/provide a stable lead reference, and project verified caller contact from the bound call/lead when no submission receipt exists.',
 'Callback work is absent from Leads and external follow-up tools. Recovery requires manually finding the original call rather than working the request queue.')
finding('D19','High','Owners cannot distinguish failed voice delivery from sent delivery on the saved request','E32,E22',[(C,26),(C,60),(O,20),('client/src/calls.jsx',15)],
 'Capture a lead; local SMS provider throws an error containing clearly synthetic private details; read owner Call/Lead routes.',
 'Explicit audit requirement: owners can distinguish delivery failure/success and recover saved requests; platform §§5.7/6.2/6.8.',
 'Outbox is FAILED, but call.failureCode remains null and neither call nor lead response contains delivery/outbox/SMS state. Private exception text is correctly not returned. Webhook status UI only covers webhookDeliveries.',
 'Owner read models and UI have no relationship/projection for voice outbox attempts. Call media failureCode is not notification failure state.',
 'Expose tenant-bound delivery attempts/results and safe error codes per call/request, with explicit queued/uncertain/failed/sent labels and owner retry/recovery actions. Keep raw provider messages private.',
 'A quiet delivery failure appears indistinguishable from successful follow-up to the owner, so saved requests can remain unattended.')
finding('D20','Medium','An older failed webhook becomes undiscoverable behind the newest 20 events','E17',[(W,58),('client/src/ownerIntegrations.jsx',59),('server/src/ownerIntegrationRoutes.js',7)],
 'One old FAILED webhook delivery followed by at least 21 recent event deliveries; request integration configuration.',
 'Audit recovery requirement and platform §6.10: failed delivery must remain discoverable/retryable by its owner.',
 'Exactly 20 recent deliveries returned; older failure is absent, with no cursor, filter, total or separate failed list. Retry accepts a known eligible ID, but that random ID cannot be discovered through another provided route.',
 'Unconditional LIMIT 20 on the sole delivery list; the UI displays only that list.',
 'Add tenant-scoped pagination and a persistent failed/needs-attention filter/count. Make older eligible failures discoverable without direct database access.',
 'Normal later activity hides unresolved lost deliveries and removes the practical owner retry path.')
finding('D21','Medium','Unresolved preferred-time requests disappear when their requested dates leave the calendar range','E28',[( 'server/src/ownerCalendarService.js',73),('server/src/ownerCalendarService.js',82),('server/src/quoteDoneRoutes.js',271)],
 'Valid REQUESTED preference for 2026-10-07; advance synthetic clock ten days without resolving it.',
 'platform §6.8: unified actionable follow-up inbox and reminder for untouched leads; saving a time request is not a booking.',
 'Preference is still REQUESTED in durable storage but absent from the default calendar requests after the date passes. There is no separate unified pending-preference inbox or Leads projection. A manually selected historical calendar range can still retrieve it.',
 'Pending requests are filtered by preferred appointment date instead of workflow status, and are not projected into an independent follow-up queue.',
 'Keep unresolved time requests in a tenant-bound actionable inbox regardless of requested date; label overdue/expired preferences, preserve history, and provide a resolution/renewal workflow.',
 'An owner who misses the preferred day can lose sight of the callback task even though the customer was promised follow-up.')
finding('D22','Medium','Calls/Leads show stale contact when a preferred-time request supplies corrected information','E28',[(C,54),(O,22),('client/src/calls.jsx',43)],
 'Original lead old@example.invalid; valid preference supplies latest-preference@example.invalid, corrected name and a corrected job address.',
 'platform §6.2 linked booking/request information and §6.8: accurate collected follow-up details must reach the owner.',
 'Calendar schedule correctly contains latest contact/location. Call bookingRequests omit both; its linked lead and /api/leads still show old@example.invalid. The Calls request displays timing/note without the updated contact/address.',
 'Call query omits bookingPreferences.customerJson/locationJson; lead projection uses only original capture and has no explicit corrected-contact provenance.',
 'Include the preference’s submitted contact/location in Calls and request cards, clearly identifying the latest confirmed follow-up channel and preserving older receipt information separately. Do not silently overwrite a historical receipt.',
 'An owner following up from Calls/Leads can use the wrong email or site even though the correction was saved successfully.')
finding('D23','Medium','Staff cannot recover contact for an instant web inquiry without a lead or booking','E29',[(O,10),('server/src/quoteDoneRoutes.js',141),('server/src/quoteDoneRoutes.js',284),('client/src/quotedone.jsx',211)],
 'Synthetic persisted INSTANT web quote with originalSubmission.contact.email="instant-followup@example.invalid"; no review lead or appointment; read /api/quotes as the owner and their staff member.',
 'platform §6.9 gives staff calls/leads/quotes-send; §6.8 requires usable follow-up information without exposing pricing internals.',
 'Owner can find email inside owner-only internal evidence. Staff quote contains only id/service/status/result and no contact; no linked lead exists. The web quote-request webhook is correctly enriched with email, so that earlier suspicion is ruled out.',
 'Safe quote projection omits customer contact and original follow-up facts, while instant requests intentionally do not create review leads. Hiding owner-only calculations also hides the only in-app contact representation.',
 'Provide a common allowlisted quote inquiry/contact view for authorized staff and owner, sourced from the persisted submission; keep calculations/rates owner-only and show the follow-up channel in the existing quote card.',
 'A staff member authorized to send/follow up a quote cannot contact this prospect through the application.')
finding('D24','Medium','Completed calls retain transport outcomes and no generated summary','E23',[(P,99),(C,14),('client/src/calls.jsx',8)],
 'Actual signed local call captures an inquiry and a flooding flag, receives a transcript, then sends normal Twilio stop.',
 'platform §5.7: every call has transcript, summary and semantic outcome LEAD/QUOTED/BOOKED/etc.; §6.2 readable call information.',
 'Stored status COMPLETED, outcome TWILIO_STOP, summaryText null. The transcript and lead are present. Production session-end update writes transport reason rather than the saved business result.',
 'No post-call summary/semantic-outcome derivation is wired; owner views accurately display the incomplete producer record.',
 'Derive semantic outcome from committed lead/quote/booking/transfer receipts and store a bounded, fact-grounded summary after transcript drain. Keep transport termination/failure separately.',
 'Owners cannot scan the feed for what happened or what follow-up is needed and must open every transcript.')
finding('D25','High','Normal fallback callback overwrites a successful completed call and forwards it again','E23',[(R,449),(R,470),('server/src/voice/voicePersistence.js',189)],
 'Complete a signed synthetic lead call normally; POST its correctly signed resume-fallback URL with matching call/account/numbers.',
 'Audit duplicate/stale-event requirement: successful saved outcomes must survive retries; platform §12.4 fallback is for session failure.',
 'Before callback: COMPLETED/TWILIO_STOP with saved lead/transcript. After: FALLBACK/VOICE_SESSION_UNAVAILABLE/failureCode, plus new Dial-to-owner TwiML. The fallback URL exists unconditionally after Connect.',
 'Resume route never examines stored call status/outcome; recordFallback unconditionally overwrites any existing bound row, including completed calls.',
 'Differentiate normal completion from failed stream termination using persisted session/business state and provider callback facts. Make fallback transition idempotent, avoid forwarding a completed conversation, and never overwrite a terminal successful outcome with a replay.',
 'Owners see a completed request as a failed call, and the customer can be unexpectedly forwarded after finishing the conversation.')
finding('D26','High','Call-end cleanup drops queued caller text and buffered model transcript','E25,E26',[( 'server/src/voice/geminiMediaBridge.js',359),('server/src/voice/geminiMediaBridge.js',503),('server/src/voice/googleGenAiLiveAdapter.js',29),('server/src/voice/googleGenAiLiveAdapter.js',40)],
 'Queue final caller transcription, immediately close the local socket; separately deliver a partial model outputTranscription then close the Twilio transport before turnComplete.',
 'platform §§5.7/6.2: preserve the written call record; no audio storage. Important final corrections are still collected information.',
 'Queued caller callback correction stores zero turns. Buffered model follow-up promise also leaves storedTranscript:[]. Both cases execute the unmodified bridge/adapter; a completed earlier caller turn does persist.',
 'finish sets ended before draining transcriptTail; queued transcript tasks skip when ended. Local adapter close marks closed without flushing modelText, unlike the provider-origin onclose path.',
 'Stop accepting new media, then durably drain already accepted transcript/tool work with bounded shutdown and flush buffered transcription before finalizing call state. Preserve incomplete/interrupted flags where appropriate.',
 'Final phone/email corrections, request details or promises can vanish from the owner’s only written record of the call.')
finding('D27','High','Cold restart leaves persisted active calls stranded without a recoverable lead','E24',[(P,45),(P,99),('server/src/voice/voicePersistence.js',130),('server/src/server.js',485)],
 'Take a crash-consistent backup of a real synthetic CONNECTED voice call containing request text but no completed capture tool; cold-start the actual server against that temporary crash snapshot.',
 'Audit restart/failure requirement and platform §12.4: interrupted requests need a truthful failed/missed-call state, preserved transcript and owner follow-up recovery.',
 'After full server startup, call remains CONNECTED, outcome/failureCode null, zero leads. No active live session exists for the snapshot. Recovery depends on a later provider callback that may never arrive.',
 'Call completion is callback-only. Startup/worker lifecycle has no durable session lease/heartbeat reconciliation or orphaned-request recovery.',
 'Introduce durable session ownership/leases and reconcile expired active sessions on restart; preserve existing transcript, create an actionable interrupted-call lead, and notify/retry without prematurely terminating another process’s live session.',
 'A process crash can leave customer requests permanently recorded as live rather than available for owner follow-up.')
finding('D28','High','OPERATOR LIVE readiness can coexist with an unavailable inbound route','E19',[( 'server/src/onboardingService.js',297),('client/src/dashboard.jsx',30),(P,34)],
 'Persisted operator enabled/provisioned phone with about/hours; restart with voice disabled and missing signed-voice config. Evaluate the actual operatorView and production voice composition.',
 'platform §5.1 and honest readiness requirement: ON/LIVE means AI answers calls; label must reflect backend dependencies.',
 'eligible:true, missing:[] and actual view title OPERATOR LIVE / EVERY CALL FROM HERE ON IS COVERED. Production composition configured:false; inbound POST returns 503 Voice unavailable.',
 'Eligibility inspects profile setup only; the displayed live state trusts operatorEnabled and ignores runtime switches/configuration and channel readiness.',
 'Return a computed backend readiness/coverage state that includes the signed voice runtime and required adapters; distinguish configured/connecting/available/failed, and block or visibly suspend LIVE when those dependencies fail.',
 'The owner can believe callers are covered while their actual webhook cannot answer or capture them. This is a label/backend defect, not a request to audit carrier billing or payment gates.')
finding('D29','Medium','Production Calls deep links and refresh return 404','E40',[( 'server/src/productionAssets.js',5),('server/src/productionAssets.js',19),('client/src/main.jsx',64)],
 'Mount the unchanged production owner asset handler on the cold-built owner dist; GET /dashboard, /calls and /calls?record=SYNTHETIC-CALL.',
 'platform §6.2 owner Calls view and audit saved-request recovery: direct navigation/refresh must reach the owner application.',
 '/dashboard is 200; both Calls URLs are 404. In-app history.pushState navigation can still work until the user refreshes or opens a deep link.',
 'Production SPA path allowlist omits /calls although the client router and CallFeed link to it.',
 'Include the existing Calls owner route in SPA serving and verify direct navigation/refresh with and without the record query, preserving API authentication and tenant scoping.',
 'An owner bookmarking, refreshing or opening a call link cannot recover that request through the deployed app route.')
finding('D30','Medium','The open dashboard does not receive newly saved calls','E41',[( 'client/src/dashboard.jsx',46),('client/src/dashboard.jsx',52)],
 'Mount the actual Dashboard with real React hooks and real local server API; initial synthetic call exists; persist a second call while it stays mounted.',
 'platform §§5.7/6.1: calls stream to the live dashboard feed.',
 'Initial call renders. A fresh real /api/calls read contains the new call, but the mounted dashboard never displays it and makes zero additional UI fetches during the observation. Source has no polling/subscription path; data reload occurs on mount or settings/toggle actions.',
 'One mount-time useEffect loads a static snapshot; no live update mechanism updates state when calls/requests arrive.',
 'Add tenant-authenticated event subscription or bounded polling/invalidation for actual call/lead activity; handle reconnect/session changes and show stale/offline state honestly in existing components.',
 'An owner keeping the dashboard open can miss new requests until reloading or changing a setting, especially with D02’s absent alerts.')
finding('D31','High','Duplicate signed inbound callbacks create parallel sessions and can reopen completed calls','E42,E09,E34',[(R,421),('server/src/voice/voicePersistence.js',138),(P,74)],
 'POST the same legitimate locally signed incoming CallSid twice; connect both returned stream URLs. Stop the first stream, then replay the incoming callback once more.',
 'platform §12.2: one Gemini session per inbound call; audit duplicate/stale-event requirement: retries must not change successful call ownership/state or revive completed work.',
 'One call row but two live provider sessions. Stopping the first marks the row COMPLETED while the second socket is still open. A later duplicate incoming event supplies a fresh Stream URL for that completed CallSid. Reusing the already consumed original nonce is correctly rejected 403 (E34), which does not prevent a newly issued nonce.',
 'Each callback issues a new nonce; createSession treats any existing correctly bound CallSid as newly created regardless of status or an active media session. There is no durable per-call session claim.',
 'Make incoming callback handling idempotent by trusted CallSid and terminal state, and lease one active session per call across processes. Safe exact-retry responses must not mint another live session or revive terminal calls; retain original binding/outcome.',
 'Duplicate provider events can mix transcripts/tools and let one session mark a still-running conversation completed. E09’s permissive internal runtime call is supporting evidence, not a separately counted public vulnerability.')
finding('D32','Medium','The specified default per-owner concurrent-call ceiling is not enforced','E43',[(R,387),(P,51),('server/src/voice/voicePersistence.js',130)],
 'Six distinct signed CallSids simultaneously connect to one synthetic provisioned owner; all provider sessions are local stubs held open.',
 'platform §12.2: per-owner concurrency ceiling defaults to five; excess calls use transcript capture fallback so they are still answered.',
 'All six open Google sessions; all five additional requests return Stream TwiML; no excess-call fallback lead. No admission limit/configuration is checked by the traced production path.',
 'Inbound eligibility checks profile/access but has no atomic owner/platform active-session admission control.',
 'Add cross-process leased concurrency admission for the configured owner/platform ceilings and route excess callers into the durable transcript-only capture path; release/reconcile leases on all endings/restarts.',
 'The required capacity guard does not work. During real provider/resource saturation this increases the risk of unhandled requests; the local stub run proves the missing guard, not a live-load failure.')
assert len(findings)==32
(out/'findings.json').write_text(json.dumps({'auditedSha':pin,'confirmedDefects':findings},indent=2)+'\n')
experiments=[]
for name in ['results.json','phone-results.json','live-render-results.json']:experiments+=json.loads((out/name).read_text())['experiments']
assert len(experiments)==45 and len(set(e['id'] for e in experiments))==45
assert not any(e.get('experimentError') for e in experiments)
for f in findings:assert set(f['experiments'])<=set(e['id'] for e in experiments)
sourcefiles=sorted(set(s['file'] for f in findings for s in f['sources'])|{'AGENTS.md','specs/BUILD_STATUS.md','specs/platform_spec_v2.md','specs/build_guide.md','specs/voice_quote_flows.md','server/src/ownerCallRoutes.js','server/src/outboundWebhookTransport.js','server/src/authMiddleware.js','server/src/tenant.js','client/src/api.js'})
manifest=[]
for name in sourcefiles:
 content=Path(name).read_bytes();manifest.append({'file':name,'gitBlob':subprocess.check_output(['git','rev-parse',pin+':'+name],text=True).strip(),'sha256':hashlib.sha256(content).hexdigest(),'bytes':len(content)})
(out/'source-binding.json').write_text(json.dumps({'auditedSha':pin,'baseBranch':'codex/quote-release-candidate-20261006','verifiedRemoteBaseSha':pin,'auditBranch':branch,'baseTree':subprocess.check_output(['git','rev-parse',pin+'^{tree}'],text=True).strip(),'sourceFiles':manifest},indent=2)+'\n')
counts={}
for name in ['cold-existing.tap','cold-additional.tap','cold-support.tap']:
 text=(out/name).read_text();counts[name]={key:int(re.search(r'^# '+key+r' (\d+)$',text,re.M).group(1)) for key in ['tests','pass','fail','cancelled','skipped','todo']}
assert sum(c['tests'] for c in counts.values())==291 and all(c['tests']==c['pass'] for c in counts.values())
(out/'verification-summary.json').write_text(json.dumps({'auditedSha':pin,'npmCi':'passed cold; 262 packages','node':'22.23.3','build':'owner and widget passed cold','existingTestRuns':counts,'existingTestFiles':31,'independentExperiments':len(experiments),'expectedOutcomesMet':sum(e['meetsExpectation'] for e in experiments),'expectationMismatches':sum(not e['meetsExpectation'] for e in experiments),'finalExperimentErrors':0,'confirmedDefects':32,'businessPolicyConflicts':1,'noSubagents':True,'sourceChanges':False,'providerWrites':False},indent=2)+'\n')
npm_log=Path(os.environ.get('AUDIT_NPM_CI_LOG',str(out/'cold-npm-ci.log')))
if npm_log.resolve() != (out/'cold-npm-ci.log').resolve():
 shutil.copyfile(npm_log,out/'cold-npm-ci.log')
link=lambda f,n:f'[{f}:{n}]({repo}/blob/{pin}/{f}#L{n})'
lines=['NOT CLEAN','',f'**32 confirmed delivery/follow-up defects; one business-policy conflict.** The quote engine’s arithmetic, website price extraction, subscription billing and payment access gates were not audited. No application fixes, merge, deployment or provider/live-data writes were performed. No subagents were used.','',
 f'Exact audited source: **{pin}** on **codex/quote-release-candidate-20261006**. The remote branch ref and local checkout were verified against that exact SHA before inspection. A separate clone and audit branch `{branch}` were used. The committed changes are confined to this directory.','',
 '**What actually reaches the owner**','',
 '| Path | Durable data | Implemented external delivery | Owner recovery |','|---|---|---|---|',
 '| Normal phone capture | Customer + CAPTURED lead; call transcript while accepted turns persist | Optional lead webhook if configured; first-party owner SMS/email alert absent | Calls/Leads expose contact; job notes lost; no voice delivery state |',
 '| Urgent phone request | Separate events + PENDING outbox | No consumer; urgent event not an implemented webhook event | Urgency missing from call/lead; must inspect transcript manually |',
 '| Web review inquiry | One transactional submission + lead + quote-request receipt | Optional signed webhook worker with durable retries | Owner/staff can read saved contact and scope |',
 '| Web instant inquiry | Quote + submission + quote-request receipt; no ordinary review lead | Quote-request webhook is enriched with saved contact inside the transaction | Owner has internal receipt; staff lacks contact in its safe quote view |',
 '| Preferred-time request | Preference + immutable receipt + PENDING outbox; not an appointment | No preference/owner-alert consumer | Calendar shows saved contact in a matching date range; Calls/Leads can show stale facts |',
 '| Confirmed shared booking | Provider-confirmed appointment + receipt + outbox; optional booking webhook | Booking webhook exists; promised customer texts/reminders are not a first-party outbox consumer | Confirmed/pending states are kept distinct in tested shared booking handlers |',
 '| AI failure/unanswered forwarding | Fallback call metadata | One business-number Dial, then apology/Hangup; no transcript capture continuation | Phone number may remain, but no actionable fallback lead or owner alert |','',
 '**Evidence and boundaries**','',
 'Every defect below has both pinned source and an execution experiment. The minimal shared fixtures are temporary SQLite stores with current migrations, clearly synthetic owners/callers, reserved 555 numbers and `.invalid` email addresses, a fixed synthetic clock, and in-memory/local provider transports. Fixture account records only satisfy pre-existing access prerequisites; billing decisions are not evaluated as audit findings. Synthetic saved quote outcomes are delivery fixtures; their arithmetic is not under test.','',
 'Expectations were recorded in [EXPECTED.md](EXPECTED.md) before execution. Raw final observations are in [results.json](results.json), [phone-results.json](phone-results.json) and [live-render-results.json](live-render-results.json); [findings.json](findings.json) is the structured defect catalog. [source-binding.json](source-binding.json) binds source files to the exact audited commit. The independent scripts measure expected outcomes; exit zero means experiments completed, not that the product is clean.','',
 '**Findings index**','', '| ID | Severity | Confirmed defect | Execution |','|---|---|---|---|']
for f in findings:lines.append(f"| {f['id']} | {f['severity']} | {f['title']} | {', '.join(f['experiments'])} |")
lines+=['','High means a request/channel, important follow-up fact or recovery state can be lost/blocked/misrepresented. Medium means an independently reproducible loss of workflow accuracy, discoverability, identity/history or a required capacity guard, with some manual recovery still possible. These are synthetic impacts; no claim is made that a real customer was lost.','']
for f in findings:
 lines += [f"**{f['id']} — {f['title']} ({f['severity']})**",'',
 f"- **Business/customer impact:** {f['impact']}",
 '- **Pinned file and line:** '+', '.join(link(s['file'],s['line']) for s in f['sources'])+'.',
 f"- **Smallest configuration/inputs:** {f['minimum']}",
 f"- **Expected/governing rule:** {f['expected']}",
 f"- **Actual execution ({', '.join(f['experiments'])}):** {f['actual']}",
 f"- **Root cause:** {f['rootCause']}",
 f"- **Recommended fix, not implemented:** {f['recommendedFix']}",'']
lines+=['**Business-policy conflict — P01: fixed guide deadlines versus owner-specific commitments**','',
 '- **Severity/impact:** Medium. The instructions can authorize a deadline the business explicitly does not offer, undermining customer expectations even when the request itself is saved.',
 '- **Source:** '+link('specs/voice_quote_flows.md',56)+', '+link('specs/voice_quote_flows.md',99)+', '+link('server/src/voice/voicePromptCompiler.js',56)+'. Platform §5.8 forbids guessing policies; §13.2 uses an owner-set callback window.',
 '- **Smallest synthetic input:** compileVoiceSystemInstruction with no live services and owner knowledge policy: “[SYNTHETIC] No same-day quote or callback. Quotes and callbacks are provided on the next business day.”',
 '- **Expected:** one explicit governing commitment/precedence, bounded by owner policy and actual available delivery channel.',
 '- **Actual (E35):** compiled instructions contain that next-business-day policy and the unchanged guide’s fixed same-day quote promise and text-in-a-minute promise. A generic prohibition on inventing successful notifications is also present; it does not supply an explicit timing-policy reconciliation.',
 '- **Cause:** guide globals and owner policy are concatenated without resolving their conflicting commitment. This is an executed prompt conflict, not proof a live model spoke the false promise.',
 '- **Owner policy decision / recommendation:** explicitly decide which owner-confirmed callback/quote timing governs and suppress fixed historical deadlines when conflicting or unsupported. Preserve the voice guide’s conversational style while binding commitments to that rule. No rule was silently changed in this audit.','',
 '**Suspicion dispositions and controls that held**','',
 '- **Tenant routing/isolation:** valid signed called number selects the owner; supplied owner selectors did not redirect capture. Wrong owner/call/expired/deleted lead handles fail; foreign owner/staff reads returned 404; staff read models did not expose owner-only calculation evidence. Existing owner-call tests also exercise bad cross-tenant booking links. No cross-tenant customer-data leak was confirmed in these tested paths.',
 '- **Web durability/retries:** concurrent HTTP and two independent Node processes returned one 201 and one 200 for the same request, with one stored receipt. Changed request-ID reuse returned 409. Full transaction failure rolled back without a saved acknowledgement. Unread/disconnected HTTP response and cold-process replay recovered the original request once (E13/E14/E30/E31/E33/E44).',
 '- **Voice persistence acknowledgements:** injected failure after lead commit but before handle issuance produced an error, not a false saved reply. Removing the fault recovered one deterministic lead and an exact response replay (E02). This does not repair missing job notes or owner delivery.',
 '- **Shared booking confirmation:** existing tests exercised provider refusal, timeout/recovery, pending/confirmed distinction, exact event identity/time checks and concurrent slot locks. No newly confirmed premature booking acknowledgement in these shared handlers was found. Preferred-time REQUESTED remains explicitly unbooked.',
 '- **Webhook retry machinery:** synthetic 503 exhausted eight attempts to visible FAILED; rightful-owner retry then delivered, foreign retry was rejected; concurrent workers claimed one event and expired lease replay retained stable event ID. Endpoint change canceled queued old-destination work (E16/E18). Receiver-side dedupe remains necessary for at-least-once delivery; a 2xx response proves receiver acceptance, not a human owner read.',
 '- **Web quote-request contact suspicion ruled out:** the AFTER INSERT quoteSubmissions trigger enriches pending quote.requested with allowlisted customer contact before transaction commit. E29 verified the email is present. D17 concerns voice lead JSON/CSV; D18 concerns standalone logs without submission receipts, not ordinary web quote requests.',
 '- **Stale call-context suspicion narrowed:** E09 can invoke a completed call’s internal handler, but that alone is not a public exploit. E34 confirms original consumed nonce replay is rejected. E42 establishes the actual public duplicate-callback/fresh-nonce path, reported once as D31.',
 '- **Logs/privacy/audio:** caller-sensitive provider error text did not reach the tool result in E32; voice composition logs safe codes, and webhook error handling uses an allowlist without receiver payload/URL/exception text. No inappropriate customer logging was confirmed in the traced delivery paths. Tests used no real audio, recordings or live providers; no audio was stored.',
 '- **Dashboard quote-counter suspicion ruled out:** real stored-data branch labels the counter QUOTES / ALL SAVED QUOTES, rather than pretending every saved quote was delivered. The simulated preview branch is separate. D24/D28/D30 are different producer/readiness/live-update failures.','',
 '**Verification and limits**','',
 '| Cold command/run | Result |','|---|---|',
 '| npm ci under Node 22.23.3 | Passed; 262 packages |',
 '| npm run build | Passed owner and widget production builds |',
 '| 23 selected existing spec files, cold-existing.tap | 229/229 passed |',
 '| Five additional files, cold-additional.tap | 47/47 passed |',
 '| Three support files, cold-support.tap | 15/15 passed |',
 '| Combined existing tests | **291/291; zero failures, cancellations, skips or TODOs** |',
 '| Independent experiments | **45 completed; 11 met the prewritten outcome, 34 produced expectation mismatches; zero final experiment/harness errors** |','',
 'Independent mismatches are adjudicated by source and reachability rather than counted one-for-one as bugs: repeated observations are grouped, E09 is not a standalone public defect, and E35 is a policy conflict. Conversely, an experiment can prove more than one independent root cause. The resulting catalog contains 32 defects and one policy conflict.','',
 'Initial harness faults were corrected without application/test changes: duplicate synthetic Twilio number SIDs, incomplete synthetic active-account prerequisites, and an omitted required bridge callback. Their preliminary failed attempts are not counted as product defects or passing experiments. Final cold product runs had no environment failures. React’s renderer printed its deprecation notice; the mounted Dashboard hooks and real API run still completed. The renderer is a test tool, not a new product dependency.','',
 'Coverage includes phone/web storage, owner/staff route and rendered visibility, signed HTTP/WebSocket boundaries, duplicate events, corrections, concurrent HTTP/process submissions, expired/wrong handles, loss of an HTTP acknowledgement, post-persistence faults, local provider refusal/timeouts, retry exhaustion/lease restart, stale call state, crash-snapshot cold server restart, incomplete contacts, absent configuration and transcript shutdown. It includes default production composition and optional webhook producers/worker.','',
 'No real carrier forwarding, real SMS/email deliverability, real model speech, provider quotas or live customer data were used. Absolute freedom from arbitrary model false statements cannot be established with local stubs: tested tool acknowledgements are truthful, but the full freeform provider conversation and end-to-end human receipt are unverified. The prompt policy conflict is reported directly. No readiness claim is made for pricing, billing, payment access or the overall product. Full pricing and billing suites were not used as audit proof. [REPRODUCE.md](REPRODUCE.md) lists exact commands and test-file selections.','',
 '**Prioritized paid-pilot blockers within this scope**','',
 '1. **P0 — retain the request and alert its owner:** D01/D02/D03/D07/D08/D09/D10/D19/D26/D27. Close silent saved-but-undelivered paths, preserve notes/final turns, support incomplete caller identity, and make fallback/restart recovery actionable.',
 '2. **P0 — one honest live session and truthful coverage:** D04/D05/D06/D25/D28/D31. Wire supported providers, recover failed delivery, retain transfer failures, prevent duplicate/reopened sessions and stop claiming LIVE when the runtime cannot answer.',
 '3. **P1 — reliable follow-up views and identity:** D11–D18/D20–D24/D29/D30. Preserve owner disposition/contact/history, expose all failures and pending requests, support staff follow-up and working Calls links/live feed.',
 '4. **P1 — enforce the configured concurrency guard and resolve callback timing:** D32 and P01. Excess callers still need a durable capture path; owner commitments need an explicit policy.','',
 f'**Exact audited SHA:** `{pin}`. **Coverage:** implemented lead/receptionist delivery and owner follow-up only, as bounded above. **Counts:** 31 existing files / 291 passing cold tests; 45 independent experiments; 32 confirmed defects; one policy conflict; zero final experiment errors. **Verified GitHub report:** [REPORT.md]({repo}/blob/{branch}/verification/lead-delivery-20261006/REPORT.md). The final handoff additionally pins the uploaded report commit.']
(out/'REPORT.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'defects':len(findings),'experiments':len(experiments),'existingTests':291,'reportBytes':(out/'REPORT.md').stat().st_size,'severities':{v:sum(f['severity']==v for f in findings) for v in ['High','Medium']}}))
