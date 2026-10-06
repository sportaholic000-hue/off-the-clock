# Pre-execution expectations

Audited application: 73c00622d6f2df31f57773b32e41355a7421f1a3.
Written before independent experiments or the selected cold test run. No application fixes are permitted.

Rules: platform_spec_v2 §§5.4–5.8, 6.1–6.2, 6.6–6.8, 6.11, 7, 12.3–12.4, 12.18, 13.2–13.4; build_guide captureLead and post-call automation; voice_quote_flows global urgency/booking/capture rules; AGENTS tenant binding and transcript-only rules. September 27 owner ruling (submitQuote source): a web request needs a valid callback channel and exact retries are immutable receipts.

| Case | Expected outcome before execution |
|---|---|
| C01 | Cold npm ci, owner/widget build and selected existing delivery tests complete without failures/skips; environmental failures distinguished. |
| V01 | Voice capture saves name, email, caller phone, address and supplied notes; owner and staff recover the actual request. |
| V02 | Exact duplicate capture and restart retries produce one logical lead; changed contact corrections preserve the request without reopening a dismissed record. |
| V03 | Missing optional email/address does not erase previously known customer information. |
| V04 | Same normalized phone from web and voice maps to one per-owner customer; no merging across owners. |
| V05 | Saved ordinary lead triggers an implemented owner notification or an explicit visible undelivered state. |
| V06 | Urgency immediately notifies correct owner, marks the call/lead urgent, survives restart and exposes failure; optional summary does not disable urgency. |
| V07 | Quote request without lead handle still reaches an actionable owner follow-up queue with caller contact. |
| V08 | Persistence failure cannot yield a saved acknowledgement; failure after persistence is recoverable and exact replay does not duplicate records. |
| V09 | Wrong tenant/call/type/expired lead handles cannot operate on other records. Completed/stale call contexts cannot mutate current lead disposition. |
| V10 | SMS failures/timeouts are truthful, retryable after recovery/restart and visible to owner; same event not sent twice concurrently. |
| V11 | Failed or unavailable live transfer retains an actionable callback request and never reports connection success. |
| P01 | Signed incoming request maps only the called number; duplicate provider events preserve one call and successful outcome. |
| P02 | Provider session failure/missed call preserves transcript/contact as a lead, notifies owner and provides recovery; no audio storage. |
| P03 | Actual successful capture/booking produces semantic call outcome and readable summary, not transport status alone. |
| P04 | Process restart does not strand CONNECTING/CONNECTED calls or pending delivery indefinitely. |
| W01 | Public web submission resolves owner from public key; injected owner IDs cannot redirect requests. |
| W02 | Valid email-only or phone-only web contact and review request survives, is visible, and notification includes usable callback details. |
| W03 | Incomplete/invalid contacts rejected before saving; no false success. |
| W04 | Exact concurrent/restart/lost-response web retries produce one record and replay same receipt; changed request-ID reuse fails. |
| W05 | Successful instant-estimate inquiry remains actionable to owner with stored contact/location, even without review lead or booking. |
| H01 | Optional webhook producer and worker retain accurate voice/web name, phone, email and service while excluding secret/internal data. |
| H02 | Provider errors retry durably with bounded attempts, visible failure and owner retry; restart/expired lease resumes. |
| H03 | Concurrent workers claim once; delivery timeout after receiver accepted may replay with stable event ID (receiver dedupe required). |
| H04 | Owner can discover and retry every terminal failed delivery, including older records behind recent successful events. |
| H05 | Endpoint remove/change/rotation behavior is explicit; no cross-tenant dispatch/retry; updates don't silently deliver stale contact details. |
| D01 | Calls/leads/dashboard routes and rendered components recover stored request/contact/urgency/delivery state; owner/staff isolation holds. |
| D02 | Readiness labels do not promise answering while actual voice configuration routes only fallback/unavailable. |
| S01 | Customer transcripts/contact/provider errors are not leaked to inappropriate logs, public responses or another tenant. |

Selected cold existing tests cover owner calls (service/HTTP/render), voice runtime/persistence/security/entry/WebSocket, media bridge and provider adapter, integrations/export, booking persistence/confirmation/preferences/tenant routes, calendar links, service-area eligibility and lifecycle. They are evidence about these paths only, not pricing arithmetic or billing.

Additional expectations recorded before their execution:

- E28: Preferred-time requests are saved before REQUESTED, retain latest callback contact/location for owner review, trigger an owner delivery attempt, and remain recoverable when the preferred dates pass (§6.8 unified inbox and §5.7 post-call automation).
- E29: Staff can recover the callback channel for a persisted instant web inquiry; the optional quote-request webhook must contain actionable contact information (§6.9 staff quotes-send and §6.8 follow-up).
- E30: A web transaction failure leaves no partial saved records and no saved acknowledgement (§owner September 27 persistence ruling).
- E31: A fresh process replays a persisted web receipt unchanged, without creating another request.
- E32: Delivery failure is visible from the call/lead record and independently recoverable; successful SMS and provider exceptions never expose another owner's contact or exception text.
- E33: A real local HTTP client disconnect after POST persistence can retry the original request ID and retrieve one saved receipt, with no duplicate lead.
- E34: A consumed voice nonce cannot reopen a completed call through the signed production WebSocket route; internal service calls alone do not establish an externally reachable stale-call defect.
- E35: Compiled voice instructions reconcile owner-specific callback commitments with historical fixed-time promises; otherwise record a policy conflict, without claiming a real model uttered either promise.
- E36: A legitimate request with a known callback phone can be saved without a supplied name (September 30 shared owner direction: callback contact required, name optional); missing identity must not discard the request.
- E37: A caller-owned appointment cancellation reaches its implemented provider path; unavailable provider remains truthful and produces a recoverable owner request.
- E38: Caller-specific booking lookup works even when 25 newer appointments belong to other customers in the same tenant.
- E39: Returning-caller context retains the saved name/address and saved quote/open-lead status; no raw rates or other tenant data.
- E40: Production owner-app serving supports direct navigation and refresh of /calls and /calls?record=..., alongside /dashboard.
- E41: An already-open dashboard receives a new persisted call in its live feed without the owner reloading or changing settings (§5.7 streamed feed; §6.1 live call feed). A fresh backend read should prove the call exists while mounted UI behavior is measured.
- E42: Duplicate signed inbound callbacks for one CallSid cannot create two live provider sessions or reopen a completed call. Existing sessions and semantic outcomes survive duplicate events (one Gemini session per call, §12.2).
- E43: Six concurrent legitimate calls to one synthetic owner respect the §12.2 default per-owner ceiling of five; the excess call follows a durable fallback capture path.
- E44: Two independent Node processes submitting the same new web request against the temporary SQLite store commit one request/lead and return one new receipt plus one immutable replay.
- E45: Repeated voice captures of the same per-owner normalized phone retain one customer identity across a synthetic handle-secret rotation; customers/booking links are not handle credentials (§12.18).
