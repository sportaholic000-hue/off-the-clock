# Off The Clock — read-only inspection

Date: September 29, 2026. Repository: sportaholic000-hue/off-the-clock.

## Assessment

**The inspected candidate is not ready for the complete product launch.** The accepted quote engine and repaired widget/application quote boundary are substantially stronger than the phone runtime and production integrations around them. I reproduced a calendar-confirmation defect and confirmed missing voice implementation, misleading operator-live state, and incomplete email/notification delivery.

The direction remains an AI phone receptionist/operator and an embeddable website widget that gather job facts, quote from the business owner's approved price book, and book the appropriate job or estimate visit into the owner's calendar. I found no reason to replace that direction or rewrite the accepted engine.

## Inspection boundary and source identity

I read all 43 project Markdown files in the combined repair candidate before inspecting its implementation, plus 11 additional Markdown files on the separate demo/growth branches and relevant recovery/historical variants. I inspected repository trees and branch relationships, engine/application source, schema/migrations, frontend flows, provider adapters, test harnesses, and release configuration. Third-party dependency documentation is outside the project-document inventory.

Tests ran in an isolated inspection copy with synthetic databases and stripped provider credentials. Builds were written only inside that copy. No project checkout, repository branch, specification, production database, provider account, deployment, or PR was changed. No subagents were used.

| Item | Inspected identity / status |
| --- | --- |
| Main | ed12dca1253a8790c885b071ab6037e05632bea0; still the early July skeleton |
| Combined repaired candidate | 7df3fcee45dc3fce19904c67f0cf5575449fdf15 on codex/quotedone-audit-repairs-20260927 |
| PR #3 | Open draft: Repair and verify the QuoteDone widget and application flow |
| PR base | codex/quotedone-application-completion at 9670fdb5c55f35a0ccddcd397f2d188b5c811844; not main |
| Protected VNext engine | Git tree dcd481193b10c3cfc667cb23d22fb41b16322cff; 19 files preserved |
| Original voice guide | Blob 7329bde3db8e3b38916e1cd6fbe1ca3fffaffaa5; 459 lines preserved |
| Demo and growth work | Separate branches; their checks do not establish integration into this candidate |

[Inspected commit](https://github.com/sportaholic000-hue/off-the-clock/commit/7df3fcee45dc3fce19904c67f0cf5575449fdf15), [PR #3](https://github.com/sportaholic000-hue/off-the-clock/pull/3).

The latest launch authority requires the complete product and preserves the original voice guide, master toggle, accepted engine, exact money, tenant isolation, and transcript-only storage. The later separate-work decision allows a supported selected job to be priced while additional work is retained for an on-site estimate, with no combined total implying that extra work was priced. [Launch authority](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/docs/LAUNCH_AUTHORITY_20260929.md), [separate-work decision](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/docs/quotedone-completion/R6_SEPARATE_WORK_20260928.md).

## Findings that need action

The recent repairs made useful progress. The current candidate contains the combined schema/migrations, booking administration, durable authentication tokens and calendar OAuth state, and encrypted calendar credentials. The application checks pass for these components. Earlier recovery notes describing missing schema, booking administration, and OAuth wiring are historical; I am not carrying those repaired items forward as current defects.

P0 means the central promised product cannot function. P1 means incorrect customer behavior or a required launch capability is missing. P2 means documentation/release maintenance can cause repeated mistakes.

### F1 — P0: the actual inbound phone route does not run the operator

The registered Twilio inbound route returns one static spoken sentence: “Your Off The Clock operator connection is ready.” It does not install the voice runtime routes/WebSocket server or start a Gemini conversation. VOICE_RUNTIME_ENABLED cannot supply that missing wiring.

Three implementation files referenced by tests are absent from the inspected GitHub tree:

- server/src/voice/googleGenAiLiveAdapter.js
- server/src/voice/voicePromptCompiler.js
- server/src/voiceWebSocketServer.js

Dormant HTTP boundaries, audio/media helpers, persistence, and tools are useful pieces, but they do not constitute a working inbound operator. Independent voice checks produced 57 passes and 9 failures: three missing-module failures and six unresolved tool-contract/test disagreements. Those disagreements must be reconciled against approved behavior before changing tests.

The onboarding test-call implementation speaks a greeting and checks call completion; it does not demonstrate quote/booking tools. The dormant fallback defaults to asking the caller to try again later and hanging up, leaving the required transcript/lead follow-up behavior unfinished.

**Needed:** complete and wire the runtime around the preserved guide; secure the active HTTP/WebSocket entry points; align tool contracts; prove service selection, required questions, numeric read-back, quote/review, explicit slot confirmation, booking, transcript persistence, and safe failure fallback in an actual call.

[Active inbound route, line 456](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/server.js#L456), [dormant voice boundary](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/voiceRuntimeRoutes.js), [test-call integration, line 120](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/platformIntegrations.js#L120).

### F2 — P1: calendar recovery can falsely confirm a booking

I reproduced three cases with the real booking service, synthetic in-memory state, and provider doubles. No provider requests were made.

| Recovery case | Observed result | Required behavior |
| --- | --- | --- |
| Creation outcome ambiguous; event lookup returns CANCELLED | HTTP 201, customer CONFIRMED, persisted CONFIRMED | Never confirm a cancelled event |
| Creation ambiguous; lookup returns PENDING_CONFIRMATION | HTTP 201, customer CONFIRMED, persisted CONFIRMED | Keep it pending until provider confirmation |
| Pending appointment polled; provider event is confirmed on the next day | Customer gets original day; appointment becomes CONFIRMED | Verify the exact promised event time |

The ambiguous-create branch at bookingService.js line 879 treats any returned event as confirmed, discarding status and timing. Polling checks status but never compares provider start/end with the appointment. The Google adapter legitimately returns cancelled, tentative, and timed events, so these are valid adapter outcomes.

**Needed:** validate confirmed status, expected event identity, and exact start/end in both recovery paths. Keep tentative outcomes pending and handle cancelled/mismatched events explicitly. Add these independently specified regression cases. Passing happy-path/retry/concurrency tests miss this condition.

[Ambiguous recovery, line 873](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/bookingService.js#L873), [polling, line 948](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/bookingService.js#L948), [event normalization, line 267](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/googleCalendarAdapter.js#L267). The companion evidence file records the three observed outcomes.

### F3 — P1: OPERATOR LIVE is based on a saved flag rather than verified coverage

Eligibility requires a provisioned number and About/Hours text; it does not verify the running voice service or carrier coverage. The toggle saves operatorEnabled before the carrier action. Without CARRIER_CONNECTION_URL, that action returns platform_action_required, which the route accepts as success. The dashboard then displays OPERATOR LIVE and EVERY CALL FROM HERE ON IS COVERED.

The error rollback writes !enabled instead of restoring the previous state. A repeated enable request that fails can therefore switch an already-enabled operator off.

**Needed:** distinguish pending setup from confirmed routing, verify runtime readiness, restore the exact previous state on failure, and show coverage only after routing is verified. Preserve ON answering every inbound call and OFF ringing the business normally.

[Toggle, line 321](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/server.js#L321), [eligibility, line 323](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/onboardingService.js#L323), [carrier fallback, line 98](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/platformIntegrations.js#L98), [dashboard state, line 30](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/client/src/dashboard.jsx#L30).

### F4 — P1: production email and account recovery are incomplete

The sole transactional-email adapter logs email contents and reports accepted. This console path remains available in production when EMAIL_PROVIDER is console, the example default. Other configured production providers throw “not configured yet.” Verification mail contains a relative API path, reset mail a raw reset token, and the client has no dedicated password-reset screen.

Registration commits the account/token before sending mail. A delivery exception fails the request after the account exists, leaving a straightforward retry to hit duplicate-email handling. The durable token implementation itself is stronger: hashed, single-use token checks pass.

**Needed:** real delivery, trusted absolute verification/reset URLs, usable frontend recovery, no token contents in production logs, and safe resend/retry after delivery failure.

[Email adapter](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/email.js), [registration/delivery, line 159](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/auth.js#L159), [reset email, line 236](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/auth.js#L236), [client router](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/client/src/main.jsx).

### F5 — P1: delivery, usage billing, and owner operations remain unfinished

Booking/preference services persist pending outbox events, but the active application has no delivery worker consuming them. Dormant voice tools contain individual provider/outbox handling; this does not deliver the active booking queue. Calendar creation uses sendUpdates=none. A booking response is therefore not evidence that the customer or owner was notified.

Voice persistence has per-call minutes and trial helpers, but completed Stripe overage usage reporting is absent. Billing state has suspendExpiredGracePeriods without an installed scheduler invoking it. Request-time access checks do not replace lifecycle processing and communication.

The owner application also lacks complete operational surfaces. Admin explicitly says it is scheduled for a later phase. Calls/customer/calendar pages are not implemented client routes. Outside clearly marked local preview, dashboard activity counters/feed do not report actual operational activity.

**Needed:** durable notification/retry processing, required post-call/customer follow-up, usage/lifecycle processing, and the operational views required by the complete-product scope. Verify delivery and billing outcomes rather than equating queued events or checkout return URLs with success.

[Booking outbox, line 999](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/bookingService.js#L999), [billing lifecycle, line 867](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/billingStateService.js#L867), [dashboard API, line 435](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/server.js#L435), [operational routing](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/client/src/main.jsx).

### F6 — P1: an assembled and accepted release branch is missing

PR #3 targets the completion branch while main remains the early skeleton. Merging that PR alone does not assemble a main release. There were zero GitHub check runs on the inspected head. The workflow filters cover claude/phase-2-audit-fixes rather than the current head/base. Root npm test runs seven files and excludes most booking, durable-auth, calendar, billing, public-boundary, and voice checks.

The tree tracks 5,057 dependency files, an old client/dist build, and three SQLite files: data/phase0-gate.sqlite, data/prod.sqlite, and data/refix.sqlite. I did not inspect their contents or establish that they contain production data. Review provenance before removing them. The documented Windows recovery incident crossed npm workspace links while restoring tracked node_modules and removed unpublished source, so controlled source-only assembly matters.

**Needed:** one exact release commit and explicit merge path, full CI gates, fresh builds, and reviewed dependency/database cleanup that preserves needed data and cannot traverse workspace links. Prove deployed health, durable storage, backup restoration, and the chosen process topology.

[Workflow](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/.github/workflows/phase0-2-branch-regression.yml), [root test script](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/package.json), [recovery history](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/docs/BACKEND_RECOVERY_HANDOFF_20260929.md).

### F7 — P2: contradictory historical instructions still invite scope drift

build_guide.md lines 487–490 describes coverage-hour gating and a different OFF fallback. Current authority/platform section 5.1 requires ON to answer every call and OFF to ring the business normally. The platform addendum still mentions coverage hours. Frozen engine audit documents retain historical no-production-integration language despite the later authorized bridge. Older completion reports describe different commits; their acceptance status cannot be applied to the current candidate.

The original guide also includes interview shortcuts incompatible with current measured-input rules: floor-area painting, home-size roofing, unknown-membrane averages, guessed layers, and inferred fence geometry. Restoring the guide does not authorize using those guesses to release prices.

**Needed:** one current decision/status index; clearly labeled historical checkpoints; explicit mapping from interview questions to measured engine inputs or unpriced review. Demonstrate specific conflicts before requesting protected-spec changes. Do not silently replace the voice guide, loosen measurement requirements, or make ordinary customer details prevent otherwise valid quotes.

[Build guide conflict, line 487](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/specs/build_guide.md#L487), [current authority](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/docs/LAUNCH_AUTHORITY_20260929.md), [preserved guide](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/specs/voice_quote_flows.md).

## Thorough quote-engine assessment

### What is sound

The accepted VNext engine is preserved. Its three regression/adversarial/repair suites passed independently: **311/311**. The original precision corpus, verified against its asset hashes, passed **22/22**. I found no new arithmetic defect in this inspection.

I checked exact decimal/BigInt rational arithmetic, half-up cents, quantity/geometry derivations, cost versus selling-price classifications, markup versus margin, tax mappings, minimum order, range endpoints, fee rules, tiers, zero-price policies, approval receipts, safe input snapshots, and customer sanitization. Missing or unsupported pricing fails closed.

The bridge retains fractional unit-rate precision: a sub-cent unit rate is not an incomplete zero-priced service. Zero minimums and explicit free/included policies are permitted by current decisions. Markup and margin use distinct formulas. The legacy nearest-ten-dollar rounding is not a reason to change current exact-cents behavior.

Customer sanitization checks retained calculations and releases an allowlist without raw rates, costs, line items, markup, margin, or private rules. Persistence binds the original submission, book snapshot/revision, internal outcome/calculation, and customer result. Exact retries recover the saved receipt; changed-payload retries conflict.

[Exact math](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/quote-engine-vnext/exactMath.js), [engine](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/quote-engine-vnext/engine.js), [contracts](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/quote-engine-vnext/contracts.js), [application bridge](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/quoteDoneBridge.js).

### Actual service coverage

Sixteen of twenty service types have supported customer-ready cases. Coverage is conditional: all ready cases still need current owner approval, required measurements, applicable configured rates, and supported options.

| Service | Usable contract / principal limit |
| --- | --- |
| Roofing replacement | Measured roof surface, identified materials/layers and supported pitch/story/complexity; guesses or unresolved accessory basis require review |
| Roofing repair | Identified repair/source/material, measured affected area, configured repair bands; unknown diagnosis requires review |
| Flat-roof replacement | Measured area, identified membranes/layers, supported residential scope; unknown-average/commercial/insulation cases require review |
| Flat-roof repair | Identified repair and measured area; selected ponding treatment needs configured pricing |
| Interior painting | Measured walls/coats, uniform good condition; measured ceiling/trim additions; unsupported condition/material-basis cases require review |
| Exterior painting | Entirely review-only |
| Flooring install | Supported vinyl-plank/tile, measured area/rooms/layout and explicit removal scope; stairs/unsupported materials or underlayment require review |
| Flooring replacement | Same contract plus supported measured removal/subfloor allowances; unsupported variants require review |
| Fencing install | Entirely review-only; safe post/geometry/concrete/gate contract unresolved |
| Fencing replacement | Entirely review-only |
| Concrete driveway | Measured rectangle or closed orthogonal outline; exact area/perimeter/volume; unsupported demolition/finish cases require review |
| Concrete patio/slab | Same measured geometry; area-only/unsupported geometry cannot release a price |
| Landscaping cleanup | Measured area and explicit debris/slope/haul-away choices |
| Mulch | Measured area/depth or actual volume, with explicit preparation/edge measurements |
| Sod | Measured area, owner waste/preparation factors, explicit disposal scope |
| Planting | Confirmed counts by configured size class, preparation area, selected mulch quantity |
| Mowing | Measured mowable area, frequency/condition, explicitly selected priced bagging/edging |
| Siding replacement | Measured wall area and supported material/story scope; unsupported selected removal/trim requires review |
| Siding repair | Identified material/damage, measured affected area, configured repair bands |
| Custom | Entirely review-only until a safe contract is approved |

These are intentional safeguards. Contract expansion requires separately scoped owner decisions and independent expected-value controls. Removing review gates to make more services appear available would undermine accuracy.

### Remaining quote/product alignment

- **Phone/widget parity:** dormant voice getQuote returns review when fee-selection handles are supplied, while the widget supports selected fees. Identical approved inputs and fee choices must produce identical results once voice is wired. [Voice fee gap, line 396](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/voice/voiceToolRuntime.js#L396).
- **Seasonal policy:** configured peak-month pricing can block activation/release pending an explicit date policy. Do not guess from free text or the server clock. [Seasonal decision, line 120](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/quoteDoneBridge.js#L120).
- **Additional work:** PARTIAL_ESTIMATE_READY carries nested pricedEstimate, retains owner follow-up, and sets fullJobTotal to null. Keep it. Selected unsupported/unmeasured work remains review-only. [Scope disclosure](https://github.com/sportaholic000-hue/off-the-clock/blob/7df3fcee45dc3fce19904c67f0cf5575449fdf15/server/src/quoteScopeDisclosure.js).
- **Pricing envelope:** the repaired form collects pricing facts/callback first and structured booking identity/address afterward. Supplied unsupported legacy name/location shapes receive explicit editable rejection instead of being silently dropped. Historical exact retries still recover old receipts. This is a useful repair, not a new instruction to reject ordinary customer details.

Preserve the accepted engine. The necessary next work is around adapters, delivery, contracts, and release verification.

## Independently verified evidence

Counts from different workflow types are reported separately.

| Check | Outcome |
| --- | --- |
| VNext engine, three suites | 311 passed, 0 failed |
| Application, 32 files | 312 passed, 0 failed |
| Combined ordinary engine/application tests | 623 passed, 0 failed across 35 files |
| Original precision corpus | 22 passed, 0 failed |
| Widget/billing transport | 15 passed, 0 failed |
| Public/authenticated/preview pricing-envelope HTTP | 53 checks passed |
| Booking HTTP with intercepted synthetic calendar | 4 workflow checks passed |
| Built widget browser flow, real local API/database | 22 checks passed |
| Full-page/owner browser flow, real local API/database | 7 checks passed |
| Voice, eight test files | 57 passed, 9 failed |
| Independent adverse booking probes | Three incorrect confirmation outcomes reproduced |
| Production app and widget builds | Both passed |

The passing booking/browser controls do not contradict F2: their recovery fixtures miss cancelled/tentative outcomes and changed event times. Browser runs used headless Edge with synthetic accounts and intercepted provider requests. No live provider traffic was sent.

Earlier editor/replay/demo/growth results were read as prior evidence for their named sources, not claimed as independently rerun here. Engine replay instrumented from repository tests is not an independent external audit. None of the local checks proves real phone operation, live calendar acceptance, delivered SMS/email, Stripe sandbox acceptance, deployed behavior, or backup restoration.

[Machine-readable inspection evidence](Inspection_Evidence.json) records exact test groups and the new reproduction.

## Recommended next implementation order

1. Bind work to one candidate and current decision index; preserve the engine/guide and define the merge path.
2. Fix the reproduced booking recovery and operator state/rollback defects with focused independent regression cases.
3. Complete approved phone runtime and adapters, including fee parity, interruption/fallback, transcripts, and verified ON/OFF routing.
4. Complete delivery, usage/lifecycle processing, and operational surfaces required by the complete-product scope.
5. Gate the exact assembled release through CI/local checks, then separately authorized provider sandbox, real-call/calendar, deployment, and restore acceptance.

End-of-week launch depends on completing and verifying that work. Current evidence does not support promising the deadline. A reduced pilot would change the current authorized scope and is not assumed here.

## Markdown inventory

### Combined candidate — all 43 project Markdown files

- AGENTS.md
- README.md
- client/COMBINED_ACCEPTANCE.md
- client/WIDGET_BACKEND_HANDOFF.md
- docs/BACKEND_RECOVERY_HANDOFF_20260929.md
- docs/LAUNCH_AUTHORITY_20260929.md
- docs/SHARED_API_CONTRACT_20260929.md
- docs/phase-2-inspection-findings.md
- docs/quotedone-completion/ACCEPTANCE.md
- docs/quotedone-completion/APPLICATION_REPORT.md
- docs/quotedone-completion/CONTRACT_TRACE.md
- docs/quotedone-completion/OWNER_DECISIONS.md
- docs/quotedone-completion/PREREQUISITE_CHECKPOINT.md
- docs/quotedone-completion/R1_REPAIR_REPORT_20260928.md
- docs/quotedone-completion/R5_QUOTE_FLOW_PROGRESS_20260928.md
- docs/quotedone-completion/R6_SEPARATE_WORK_20260928.md
- docs/quotedone-completion/REPAIR_CONTRACT_20260927.md
- docs/quotedone-completion/REPAIR_REPORT_20260927.md
- docs/quotedone-completion/REPRODUCE.md
- docs/quotedone-completion/REQUEST_CONTRACT_20260928.md
- docs/quotedone-completion/RUNTIME_EXCEPTION_20260914.md
- docs/quotedone-completion/START_HERE.md
- docs/review/resume-20260929/CHECKPOINT.md
- docs/review/resume-20260929/CHECKPOINT2.md
- docs/review/resume-20260929/FINAL_REPORT.md
- docs/review/resume-20260929/REPRODUCE.md
- server/quote-engine-vnext/AUDIT.md
- server/quote-engine-vnext/AUDIT_PRECISION_20260910.md
- server/quote-engine-vnext/AUDIT_REPAIRS_104_127.md
- server/quote-engine-vnext/AUDIT_REPAIRS_128_138.md
- server/quote-engine-vnext/AUDIT_REPAIRS_139_146.md
- server/quote-engine-vnext/AUDIT_REPAIRS_147_150.md
- server/quote-engine-vnext/COMPLETION.md
- server/quote-engine-vnext/CUSTOMER_AMOUNT_PRECISION.md
- server/quote-engine-vnext/HANDOFF_ABC.md
- server/quote-engine-vnext/OWNER_HANDOFF_20260910.md
- server/quote-engine-vnext/README.md
- specs/BUILD_STATUS.md
- specs/build_guide.md
- specs/history/voice_quote_flows_legacy_v2.md
- specs/platform_spec_v2.md
- specs/quote_engine_v2.md
- specs/voice_quote_flows.md

### Additional demo/growth Markdown files

- demo/website-live-sales: sales-demo/LIVE_ACCEPTANCE.md
- demo/website-live-sales: sales-demo/README.md
- demo/website-live-sales: sales-demo/SOURCES.md
- demo/website-live-sales: sales-demo/evidence/VERIFICATION.md
- growth/public-pages-review: growth/README.md
- growth/public-pages-review: growth/evidence/COMPETITOR_EXPANSION_VERIFICATION.md
- growth/public-pages-review: growth/evidence/EDITORIAL_COMPLETION_20260911.md
- growth/public-pages-review: growth/evidence/SALES_COPY_CORRECTION_20260911.md
- growth/public-pages-review: growth/evidence/VERIFICATION.md
- growth/public-pages-review: growth/research/COMPETITOR_EXPANSION_20260911.md
- growth/public-pages-review: growth/research/RESEARCH_AND_CHANGES.md

Also read docs/recovery/STOPPED_SOURCE_SNAPSHOT_20260929.md on the preserved recovery branch and relevant older AGENTS/BUILD_STATUS variants. This inventory identifies project documents; it does not claim every historical version or third-party README was audited.

