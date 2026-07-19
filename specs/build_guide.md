# OFF THE CLOCK AI — BUILD GUIDE
# Sequential prompts for Codex (sole build tool).
# Frontend visual reference: Claude Design exports in /design-reference.
# Copy and paste each section in order. Do not skip gates.
# Companion spec files (give to builder alongside this doc):
#   quote_engine_v2.md
#   voice_quote_flows.md
#   platform_spec_v2.md

=======================================================
STEP 1 — SYSTEM INSTRUCTIONS
Set these once before any build prompts.
Create a file called AGENTS.md at the repo root and paste
the content in.
=======================================================

────────────────────────────────────────────────────
AGENTS.md (create this file at the repo root)
────────────────────────────────────────────────────

# AGENTS.md — Off The Clock AI

## Specs are law
All specifications live in /specs/:
  /specs/quote_engine_v2.md        ← wins all conflicts
  /specs/voice_quote_flows.md
  /specs/platform_spec_v2.md
  /specs/BUILD_STATUS.md           ← read this first every
                                     session; update it when
                                     a phase gate passes

Read the relevant spec section before writing any code for
it. Where a spec is ambiguous, stop and ask one specific
question. Never resolve conflicts silently. Never improve
specced behavior on your own.

## Phase discipline
Build only the phase named in the current task. No building
ahead. No refactoring completed phases unless explicitly
asked. Check BUILD_STATUS.md at the start of every session
so you know exactly where we are.

## Verification
Nothing is done without evidence. Name the tests run and
show the output. Quote engine work requires the
hand-calculated test suite from the engine spec — expected
values written before execution. Run the full engine
regression suite after any change to /server/quoteEngine.js
or /server/quoteTemplates.js.

## Hard constraints
- Integer cents internally; never multiply stored pricing
  fields by 100
- No default values for owner pricing rates (Class 1 rule)
- NO GRADIENTS in any UI; flat colors per platform spec
  section 2
- Voice agent never receives raw price-book rates
- No call recording or audio storage; transcripts only
- Plan gating at the route layer, never inside the engine
- Every DB query filters by ownerId, no exceptions

## Honesty
State broken or incomplete work plainly at the top of every
response. No self-ratings. No realistic-looking fake data —
marked [PLACEHOLDER] blocks only (dev/internal scaffolding;
the public site carries no placeholder proof blocks — see
Phase 5).


────────────────────────────────────────────────────
BUILD_STATUS.md (create this file at /specs/ in the repo)
────────────────────────────────────────────────────

# Build Status — Off The Clock AI

## Phases
- [ ] Phase 0 — Skeleton (repo, DB, auth, admin shell)
- [ ] Phase 1 — Quote engine + test suite
- [ ] Phase 2 — Price book + onboarding
- [ ] Phase 3 — Voice runtime (Twilio + Gemini)
- [ ] Phase 4 — CRM, quote pages, SMS automations
- [ ] Phase 5 — Public site + demo agents
- [ ] Phase 6 — Widget, Stripe billing, production hardening

## Gate status
Update this file when each gate passes. Format:
Phase N gate passed — [date] — [what was tested]


=======================================================
STEP 2 — BEFORE YOUR FIRST BUILD PROMPT
=======================================================
Attach all three spec files to the conversation or repo
before sending Phase 0. They must be present for every
phase — the prompts reference them by name.

For Codex: place all three files in /specs/ in the repo.
  They are available every session automatically via
  AGENTS.md.


=======================================================
PHASE 0 — SKELETON
Goal: repo, server, database schema, auth, admin shell.
Spec reference: platform_spec_v2.md sections 1, 9, 12.10,
  12.9 only. Do not build anything from other sections yet.
Gate: you can register an account, log in, see an empty
  dashboard, and access the admin panel at /admin.
=======================================================

───── COPY FROM HERE ─────

Read platform_spec_v2.md sections 1 (tech stack), 9
(security/privacy), 12.9 (admin panel), and 12.10 (auth
basics) before writing any code.

Build the following and nothing else:

1. REPO STRUCTURE
   /server/          Express backend
   /client/          React + Vite frontend
   /specs/           Spec files (already present)
   /data/pricebooks/ Empty directory
   /data/            SQLite database location

2. DATABASE SCHEMA (SQLite via better-sqlite3)
   Tables, each with ownerId where owner data lives:
   users: id, email, passwordHash, firstName, businessName,
     plan, planStatus, trialEndsAt, timezone, role,
     createdAt
   calls: id, ownerId, callSid, callerNumber, duration,
     outcome, transcriptJson, summaryText, urgency,
     spamFiltered, minutesBilled, createdAt
   leads: id, ownerId, callId, customerName, callerNumber,
     describedService, collectedInputsJson, type,
     status, createdAt
   quoteRequests: id, ownerId, callId, describedService,
     estimatedValue, createdAt
   quotes: id, ownerId, callId, quoteId, serviceType,
     customerInputsJson, resultJson, tierChosen, status,
     finalInvoiceAmount, pageToken, pageExpiresAt,
     callerType, createdAt
   customers: id, ownerId, phoneE164, name, address,
     notesJson, createdAt
   appointments: id, ownerId, customerId, quoteId,
     serviceType, bookingMode, datetime, durationMinutes,
     status, depositRequested, depositPaid, createdAt
   events: id, ownerId, eventType, payloadJson, createdAt
   Schema must be portable to Postgres by config change.
   Every query that touches owner data filters by ownerId.
   No exceptions.

3. AUTH
   POST /api/auth/register: email, password, firstName,
     businessName. Hash password (bcrypt, cost 12). Send
     verification email (transactional, via configured
     provider). Return JWT on success.
   POST /api/auth/login: rate-limited (5 attempts per IP
     per 15 min). Return JWT.
   POST /api/auth/forgot-password and
   POST /api/auth/reset-password: token via email, expiry
     30 minutes.
   GET  /api/auth/verify-email?token=
   JWT middleware: attach ownerId to every authenticated
     request. All owner routes require it.
   Roles: 'owner' and 'staff' (staff sees no pricing/billing
     routes). Separate role 'admin' for /admin only.

4. ADMIN PANEL (/admin, role=admin, separate auth)
   Placeholder UI only at this phase — empty shell with the
   following labelled sections visible but unpopulated:
   Accounts list, Provisioning failures, A2P status,
   Platform metrics, Global kill switches (env var toggles
   for demo and signups — wire the env vars, not the UI
   yet), Support impersonation placeholder.

5. EMPTY DASHBOARD (/dashboard, role=owner or staff)
   Green/black design system exactly as platform spec
   section 2. Space Grotesk headings, Inter body, JetBrains
   Mono for all data. NO GRADIENTS. Left rail nav with
   placeholder sections: Home, Calls, Leads, Quotes,
   Customers, Price Book, Calendar, Settings. Top bar with
   master toggle (non-functional placeholder at this phase),
   plan indicator, and minutes meter placeholder.

6. ENVIRONMENT CONFIG
   .env.example with every required variable named:
   DATABASE_PATH, JWT_SECRET, BCRYPT_COST, EMAIL_PROVIDER,
   EMAIL_FROM, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
   GEMINI_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
   DEMO_DAILY_BUDGET_USD, DEMO_CONCURRENT_MAX,
   NODE_ENV, ADMIN_EMAIL, ADMIN_PASSWORD_HASH

GATE — report the following and nothing else marks this
phase complete:
- I can POST /api/auth/register and receive a JWT
- I can POST /api/auth/login and receive a JWT
- I can load /dashboard and see the empty shell
- I can load /admin and see the empty admin shell
- Show me the CREATE TABLE statements that ran
- Show me the .env.example file

───── END COPY ─────


=======================================================
PHASE 1 — QUOTE ENGINE
Goal: the complete quoting brain. Backend only. No UI.
Spec reference: quote_engine_v2.md entirely and completely.
  Do not reference the other specs yet.
Gate: the hand-calculated test suite passes and you show
  me the output (real assert/expect results, not prose).
=======================================================

───── COPY FROM HERE ─────

Read quote_engine_v2.md completely before writing any code.
Read it again before running any tests. Build everything it
describes and nothing from the other specs.

Build the following files exactly as specced:
  /server/quoteEngine.js
  /server/quoteTemplates.js
  /server/priceBookService.js
  /server/taxJurisdiction.js
  /server/quoteLog.js        ← SQLite, not JSON append

And the following routes in server.js:
  POST /api/quote/calculate
  POST /api/quote/test       ← dev only, blocked in prod
  POST /api/business/jurisdiction
  POST /api/pricebook/suggest
  POST /api/pricebook/save
  GET  /api/pricebook/:ownerId

VALIDATION GATE — you must complete this before reporting
the phase done. Write the expected values by hand FIRST,
then run the engine, then show both side by side:

Test 1 — ROOFING_REPLACEMENT, TAX_NONE, single price
  customerInputs: roofSizeMethod=home_floor_area,
    roofSizeInput=2000, stories=2, pitch=medium,
    roofComplexity=moderate, roofType=asphalt,
    existingLayers=1, serviceScope=full
  ownerPricing: laborPerSquare=4500 (cents),
    materialCostPerSquare=9000, tearOffPerSquare=2000,
    underlaymentPerSquare=1500, accessoryPricingMode=
    per_square_allin, wasteModerate=0.13,
    pitchAreaFactor_medium=1.12, overhangFactor=1.08,
    pitchMultiplier_medium=1.15, storyMultiplier_2=1.10
  businessDefaults: markupPercent=30, markupMode=markup,
    taxMode=TAX_NONE, minimumJobPrice=0,
    rangeBufferPercent=10
  Expected: calculate roofAreaSqft, materialSquares,
    each line item, markup, final range. Show your
    arithmetic before running.

Test 2 — CONCRETE_DRIVEWAY with TAX_MATERIALS
  customerInputs: dimensionMethod=exact, length=50,
    width=11, thickness=4, finishType=broom,
    reinforcement=wire_mesh, baseNeeded=true,
    demolitionNeeded=false, accessDifficulty=easy
  ownerPricing: laborPerSqft=600, concreteCostPerCubicYard=
    18000, formworkPerLF=2500, wireReinforcementPerSqft=150,
    basePrepPerSqft=175, concreteWasteFactor=0.10,
    assumedDrivewayWidthFt=11
  businessDefaults: markupPercent=30, markupMode=markup,
    taxMode=TAX_MATERIALS, taxPercent=8,
    minimumJobPrice=0, rangeBufferPercent=10
  Expected: area, perimeter, yardage with waste, each line
    item, taxable base with apportioned markup, tax line,
    final range. Show arithmetic first.

Test 3 — Disposal ×100 regression
  LANDSCAPING_CLEANUP with debrisPricing.heavy.disposalFlat=
    15000 (cents = $150). Assert disposalCents === 15000.
    If the result is 1500000 the ×100 bug is present.
    Show the assertion result.

Test 4 — Interior painting NaN regression
  INTERIOR_PAINTING, trimIncluded=true,
    areaInputMethod=sqft. Assert no NaN in any line item.
    Show every line item value.

Test 5 — Dead minimum regression
  Any service with ownerPricing.minimumJob=35000 (cents)
    and a small job that would otherwise quote below it.
    Assert final subtotal >= 35000. Show the minimum
    adjustment line item.

Test 6 — TAX_ALL ordering
  Assert minimum is applied BEFORE tax under TAX_ALL.
  Assert minimum is applied AFTER tax under TAX_MATERIALS.
  Show the step-by-step calculation for each.

Test 7 — Good/Better/Best tiers
  Any service with 2 tiers defined. Assert the result
    contains options[] with 2 entries and each has a
    distinct midEstimate. Show both.

Show all 7 test results. If any fail, fix and re-run before
reporting this phase complete. Update BUILD_STATUS.md.
DEFINITION OF DONE for this phase: tests use real
assert/expect (a test that only console.logs cannot fail
and does not count); "complete" is accepted only with the
actual test-runner output pasted (pass/fail counts) plus
the BUILD_STATUS.md diff — never a prose summary alone.

───── END COPY ─────


=======================================================
PHASE 2 — PRICE BOOK + ONBOARDING
Goal: owners can set up their account and activate quoting.
Spec reference: platform_spec_v2.md sections 4, 6.3 and
  quote_engine_v2.md (for exact field labels — they are
  load-bearing and must not be paraphrased).
Gate: a service goes from NEEDS PRICING to QUOTING LIVE and
  a dashboard test quote returns correct numbers.
=======================================================

───── COPY FROM HERE ─────

Read platform_spec_v2.md sections 4 and 6.3 in full. Read
the owner-field labels in quote_engine_v2.md for every
service you build a price book editor for — the label text
is specified exactly and must appear exactly in the UI.

Build the following:

1. ONBOARDING FLOW (sections 4.1–4.9)
   Steps: Account (already exists from Phase 0), trade
   selection, jurisdiction (tax mode question for US owners
   exactly as the engine spec defines), phone number
   provisioning (Twilio number search and purchase by area
   code, webhook attach, forwarding instructions per carrier,
   test-call button with live LIVE check), knowledge base
   structured editor (sections: About & service area, Hours,
   Services, Policies, FAQs, Never say list — AI draft from
   business name + trade, labeled DRAFT), price book step
   (three paths: AI interview placeholder, suggest starter,
   manual editor), calendar (Google OAuth + Calendly link,
   skippable), voice and greeting (male/female pick, audio
   preview placeholder).

   PROGRESSIVE ACTIVATION RULE: the master toggle may flip
   ON as soon as: Twilio number is provisioned + at least
   the About and Hours KB sections have content. Quoting
   activates per service only when that service passes the
   engine's owner-field validation. Never hold answering
   hostage to the price book.

2. PRICE BOOK EDITOR (section 6.3)
   Per-service list with status chips: QUOTING LIVE (green)
   / NEEDS PRICING (gray, with the exact missing field names
   from the engine's getRequiredOwnerFields output).
   Per-service editor exposes:
   - Class 1 owner pricing fields with the EXACT label text
     from the engine spec. Do not paraphrase labels.
   - Class 2 quantity factors with their default values
     shown and a reset-to-default button.
   - Good/Better/Best tier builder: add up to 3 tiers,
     name each, override specific pricing fields per tier,
     live sample quote preview per tier.
   - Markup/margin toggle with live equivalence text:
     "30% markup = 23.1% margin" updated as the number
     changes.
   - Minimum job price field (per-service, enforced by
     the engine).
   - Tax mode panel: reads from the jurisdiction setting,
     editable, with the disclaimer: "Tax settings are your
     responsibility. Off The Clock applies the mode and
     rate you set — it does not provide tax advice."
   "Suggest a starter book" button: calls /api/pricebook/
     suggest, renders results with the warning: "These are
     AI-suggested placeholder ranges — replace them with
     YOUR prices before going live."

3. AI PRICE BOOK INTERVIEW (section 4.6 — placeholder UI
   with functional backend structure)
   Dashboard button: "Build your price book with your AI."
   Launches a browser voice session (or phone call option
   as a later phase) that asks the owner the engine's Class
   1 fields conversationally. Saves as a DRAFT price book
   only. Owner must review each field on screen and confirm
   before any service activates. The interview never writes
   live pricing directly.

4. ROUTES
   All pricebook routes from Phase 1 wired to the editor UI.
   POST /api/business/jurisdiction wired to onboarding step.
   POST /api/pricebook/save validates all fields per the
   engine spec, converts dollars to cents, saves, re-runs
   validation, returns per-service status.

GATE:
- Walk through the full onboarding flow
- Enter pricing for one service (roofing or fencing)
- Show the service status changes from NEEDS PRICING to
  QUOTING LIVE
- POST /api/quote/test with that service's pricing and
  show the full result with all line items
- Show the markup/margin equivalence updating live
- Update BUILD_STATUS.md

───── END COPY ─────


=======================================================
PHASE 3 — VOICE RUNTIME
Goal: the Twilio number answers calls, the agent quotes
  and books using the engine and calendar.
Spec reference: platform_spec_v2.md section 5 entirely
  + voice_quote_flows.md + quote_engine_v2.md (for the
  tool contract). This is the most complex phase — go
  slower here than anywhere else.
Gate: a real test call through one full trade quote flow
  produces a correct engine payload, a transcript, and a
  calendar booking.
=======================================================

───── COPY FROM HERE ─────

Read platform_spec_v2.md section 5 in full. Read
voice_quote_flows.md in full. Read the TOOLS section
of quote_engine_v2.md.

Build the following:

1. TWILIO MEDIA STREAM ↔ GEMINI LIVE BRIDGE
   Inbound call → TwiML → WebSocket Media Stream →
   bidirectional audio to Gemini Live API. Implement the
   session-resumption pattern so calls longer than the
   Live API audio session cap continue seamlessly.
   Log per-call token counts and compute estimated AI cost
   per call. Store on the call record.

2. SYSTEM PROMPT ASSEMBLY (per call, per owner — section
   5.3)
   Compose from: base operator persona + compressed KB
   facts + hours/policies + calendar availability summary
   + voice quote flows for the owner's QUOTING LIVE
   services only (inject the owner's priced type lists
   into the type-selection questions) + caller memory
   summary + plan/quoting state + urgency rules.
   Keep the assembled prompt lean — see section 1 cost
   note. Log token count per call in dev mode.

3. TOOLS (function calling, section 5.4)
   All tools return only customer-safe data — the agent
   never receives raw rates or line items:
   matchService: engine matcher, always returns service
     name for voice confirmation
   getQuote: calls /api/quote/calculate with callerType
     customer; plan-gated (returns graceful defer script
     if Operator plan or service not QUOTING LIVE)
   checkAvailability: returns available slots in plain
     natural language
   bookAppointment: slot-locking per section 12.3, then
     calendar write + confirmation
   captureLead: creates lead record with all collected
     inputs + transcript pointer
   logQuoteRequest: section 5.5, triggers quote-request
     counter
   sendSms: transactional only, caller's own number, about
     their own inquiry
   flagUrgent: immediate owner notification (SMS + email)
   transferCall: warm transfer per section 5.6, whisper
     summary to owner, graceful fallback if no answer
   modifyAppointment: reschedule or cancel per section 13.3
   getCustomerContext: sanitized customer history — past
     quotes as ranges and status only, never rates

4. SPAM FILTERING (section 5.2)
   Check caller ID against blocklist before answering.
   Filtered calls do not open a Gemini session and do not
   count against plan minutes. Owner can mark any number
   as spam from the call record.

5. PLAN GATING (section 5.5)
   Check plan at the route layer before getQuote runs.
   Operator plan → getQuote unavailable for customers →
   graceful defer script + logQuoteRequest. Never modify
   the engine itself for plan gating.

6. CALL PATH (section 5.1)
   Inbound → spam check → masterToggle check → if ON and
   within coverage hours → Gemini session. If OFF →
   owner-configured behavior: redirect to owner's mobile
   or voicemail-transcript capture (no audio stored —
   transcripts only) → lead card. Never a dead ring.

7. INTENT ROUTING (section 13.1)
   First 10 seconds: classify as NEW_INQUIRY / EXISTING_
   APPOINTMENT / COMPLAINT / ASKING_FOR_OWNER / OTHER.
   Use returning-caller memory to bias the guess. Route
   to the correct flow. Never run quote questions on
   an existing-customer call unless the caller asks.

8. TRANSCRIPTION NOTICE (section 5.8)
   Default ON. Owner-configurable. Plays at call start
   when enabled. Never records audio — transcripts only.

GATE:
- Call the test Twilio number
- Play the difficult caller: volunteer answers early,
  change a measurement mid-flow, say "I don't know" twice
- Agent must: confirm the service, ask questions in the
  voice_quote_flows order for that trade, read back all
  numbers before quoting, deliver the range without
  reading line items or rates, offer to book
- Show the customerInputs JSON the agent assembled
- Show the quote engine result it received
- Show the transcript stored in the database
- Show the calendar event created
- Update BUILD_STATUS.md

───── END COPY ─────


=======================================================
PHASE 4 — CRM, QUOTE PAGES, SMS AUTOMATIONS
Goal: everything that happens after the call.
Spec reference: platform_spec_v2.md sections 5.7, 5.9,
  6.1–6.8, 13.2–13.8.
Gate: a test call produces a transcript, a lead card, a
  quote page with a signed token URL, and a reminder fires
  at the right time.
=======================================================

───── COPY FROM HERE ─────

Read platform_spec_v2.md sections 5.7, 5.9, and all of
section 6 and section 13 before writing any code.

Build the following:

1. POST-CALL AUTOMATION (section 5.7)
   Every call: transcript + summary + outcome chip stored.
   If QUOTED: SMS with quote page link (signed token URL).
   If estimationUsed: include measurement-confirmation
     link — mobile page where the customer confirms or
     corrects measurements, on submit re-runs the quote,
     sends tightened range.
   If BOOKED: SMS confirmation + reminders at T-24h and
     T-2h (quiet hours respected per section 12.8).
   If LEAD: owner notification with one-tap actions.
   Missed/abandoned calls: instant text-back SMS.
   Urgent flags: immediate owner notification bypassing
     digest settings.

2. QUOTE PAGE (section 5.9)
   Served at /q/[signed-token]. Signed, unguessable token
   with expiry matching the quote's validity window
   (owner-set, default 30 days). Contains: range, tiers
   as visual cards when present, scope summary from
   collected inputs, disclaimer, ACCEPT button → booking
   flow + optional deposit link, "request changes" button
   → lead thread. Downloadable PDF version. Mobile-first.
   Expired token → "this quote has expired — request a
   fresh one" with a callback link.

3. DASHBOARD SECTIONS (section 6)
   Home (6.1): real-data counters only — calls answered,
     quotes delivered and total value, appointments booked
     and booked value, quote requests waiting (Operator
     plan counter, prominent, with the upgrade prompt),
     estimated hours saved (labeled as estimate with
     formula visible on hover). Live call feed.
   Calls & Conversations (6.2): full transcript, summary,
     outcome chip, linked records, spam list collapsed.
     Per-call transcript export PDF and plain text.
   Quotes (6.4): status pipeline INSTANT / NEEDS REVIEW /
     SENT / VIEWED / ACCEPTED / INVOICED. NEEDS REVIEW
     renders as actionable lead cards — one-tap review
     and send. Quoted-vs-invoiced final invoice field on
     every quote card; per-service drift computed; insight
     card at 8% drift over 5+ completed jobs with one-tap
     proposed rate adjustment (owner confirms, nothing
     auto-changes).
   Customers (6.6): auto-created from calls, phone-number
     deduplication per section 12.18, full history.
   Leads (6.8): unified inbox — quote requests, review-
     path cards, voicemail transcripts, missed-call
     text-back threads, widget leads. SLA nudge at owner-
     set hours untouched.
   Calendar (6.7): synced view, AI-booked tags, buffer
     rules, blackout dates.
   Reports (section 13.8): per-service funnel — calls →
     quoted → booked → invoiced, conversion % at each
     step, total values, per period.

4. COMPLAINT FLOW (section 13.2)
   Tone-shift, capture specifics, never promise
   unauthorized remedies, callback window, immediate
   owner flag. COMPLAINT type on the lead card.

5. RESCHEDULE/CANCEL (section 13.3)
   modifyAppointment tool: find booking by caller number,
   confirm verbally, reschedule with slot-locking or
   cancel with one retention attempt, update calendar,
   fire new reminders or cancellation SMS.

6. MULTI-SERVICE CALLS (section 13.6)
   Sequential flows per service, shared address/access
   inputs, one combined quote page, one customer record.

GATE:
- Make a test call, get a quote, hang up
- Confirm: transcript stored, quote page accessible at
  its signed URL, SMS received with the link
- Open the quote page, click Accept, confirm calendar
  event updates
- Confirm T-24h reminder is scheduled (show the job in
  the reminder queue)
- On the dashboard, confirm all counter values reflect
  the test call
- Update BUILD_STATUS.md

───── END COPY ─────


=======================================================
PHASE 5 — PUBLIC SITE + DEMO AGENTS
Goal: offtheclockai.com, the two demo voice agents, and
  all public-facing copy.
Spec reference: platform_spec_v2.md sections 0, 2, 3
  entirely.
Gate: the demo scope-lock holds under hostile questioning
  and all four cost controls fire correctly.
Note: the homepage frontend already exists as a Claude
  Design build (see /design-reference/homepage). Wire the
  live demo agents, cost controls, QuoteDone widget, and
  ROI calculator into it rather than rebuilding the visual
  layer. The dashboard build in /design-reference/dashboard
  is a VISUAL REFERENCE ONLY for Phase 4 — match its look;
  rebuild its structure against the real data models.
=======================================================

───── COPY FROM HERE ─────

Read platform_spec_v2.md sections 0, 2, and 3 in full
before writing any code or copy.

Build the following:

1. DESIGN SYSTEM (section 2)
   Implement as Tailwind config and CSS variables:
   --black #0A0A0A, --black-raised #111411,
   --black-line #1E241E, --green #00E676,
   --green-deep #16A34A, --white #F2F5F2, --gray #8A948A.
   NO GRADIENTS. Anywhere. Flat color only. The one
   permitted glow: box-shadow 0 0 24px rgba(0,230,118,.15)
   on live/active elements only. Corner radius 2–4px max.
   Fonts: Space Grotesk headings, Inter body, JetBrains
   Mono for all numbers and data.

2. ALL SITE COPY from the claim language bank (section 0)
   Use the approved phrasings exactly. Never use the
   crossed-out versions. Never invent statistics. NO
   testimonial or social-proof blocks at all — no
   [PLACEHOLDER] boxes, no testimonial-shaped gaps; the
   page has no testimonial section until real proof exists.
   No forwarding mechanics in any public copy.

3. SITE SECTIONS (section 3)
   Hero (3.1): headline + subheadline from section 0
     (config-swappable A/B strings), primary CTA "Start
     Live Demo Call" + secondary "Start free" (CTA copy
     must convey the demo is a live two-way conversation
     the visitor speaks in and can ask anything about the
     product), money-back badge beside both, live-looping
     call card hero visual built from real dashboard
     components — incoming call at 9:42 PM, streaming
     transcript, QuoteDone range assembling, "Booked Tue
     8:00 AM". NOT a video or screenshot. Mono font, green
     status glyphs. TRANSCRIPT PACING: one question per
     turn, always — agent asks ONE question, caller
     answers, agent asks the next (fencing: style → height
     → gates → corners → terrain → footage LAST), numbers
     read back, THEN the range assembles. Never stack
     questions; never show a price after one question.
     TRANSCRIPT LANGUAGE: the agent greets with business
     name + its own name ("Ridgeline Fence, this is Nova —
     how can I help?") — never "this is the operator" or
     "the AI" or any role label; and it never says "price
     book" or any internal term to a caller — the range is
     the business's prices ("here's your range"). Applies
     to every sample transcript on the site.
   Live voice demo (3.2): two agent cards (Miles/Nova),
     mic opens on button press only, waveform + streaming
     transcript, all four cost controls wired:
       1. 10-second silence → sign-off, session closes
       2. 3-minute hard cap → wrap, signup CTA
       3. 2 sessions/IP/hour + env-var concurrent ceiling
       4. Daily budget kill-switch (env var) → high-demand
          message
     Text-chat fallback with the same scoped system prompt.
     Intro copy must NOT invite booking an appointment or
     requesting a quote (the scoped demo agent can do
     neither) and must not script exact words to say —
     invite the visitor to talk about their business and
     how it would help.
   How it works (3.3): exactly 3 steps, no forwarding
     language anywhere; step 3 includes: setup takes about
     15 minutes, then the agent toggles on/off in one click.
   QuoteDone showcase (3.4): framed explicitly as the
     embeddable QUOTE WIDGET that lives on the owner's OWN
     website — a separate text/on-screen surface from the
     phone agent (visitor must grasp they get BOTH). Trade
     picker → 3–4 real engine questions the visitor
     actually answers (type/tap; nothing advances on empty
     input) → sample quote range assembles line by line in
     mono font. Label: "Sample pricing for demonstration —
     your quotes use your price book." Completion state in
     WIDGET language only — no "caller", no "reads back",
     no phone phrasing.
   ROI calculator (3.5): visitor enters their own numbers,
     live recalculation. No invented industry stats.
   Comparison strip (3.6): 4 columns, capability rows
     only, no named competitors.
   Objection blocks (3.7): "Straight Answers to Fair
     Questions" — the ONLY Q&A section on the page. All 5
     objections with their specified answers, plus the
     folded-in honest answers from 3.10 (AI disclosure,
     can't-answer behavior, keep your number, pricing
     privacy, and the languages question: 20+ languages
     including French and Spanish, switches mid-
     conversation — capability only, never the word
     "tested"). Each question appears once, no duplicates.
   Industries grid (3.8): all trade cards + "any service
     business" Operator-tier card.
   Pricing page (3.9): Operator $119 / QuoteDone $279 /
     Scale $549, monthly/annual toggle (annual = 2 months
     free), minutes translated to calls, $0.35/min overage
     stated plainly, money-back badge. NO setup fee of any
     kind, NO separate pricing FAQ — recurring
     tiers only; setup framed as self-serve, done in
     minutes. The phrase "missed call" must not appear in
     any tier feature list.
   Footer (3.10): wordmark "Off The Clock AI" in the green
     brand color (not white) — top nav too. NO standalone
     FAQ section anywhere on the page. No placeholder
     trust blocks.
   Mobile-first throughout — primary device is a phone
     (section 12.16).

4. DEMO AGENT SYSTEM PROMPT (section 3.2 exact spec)
   Scope-locked exactly as written: only discusses Off
   The Clock AI, may role-play a brief sample call if
   asked, never gives real dollar figures, honestly
   acknowledges being an AI if asked.

GATE:
- Silence for 10 seconds during demo → agent signs off
  naturally, session closes
- Talk for 3 minutes → agent wraps gracefully
- Open 3 sessions from the same IP within an hour →
  third is blocked
- Set DEMO_DAILY_BUDGET_USD to $0.01, open the demo →
  high-demand message appears
- Ask the demo agent "what's a good price for a new
  roof?" → it declines to give a number and explains why
- Ask the demo agent "are you a real person?" → honest
  answer in one sentence
- Try to steer it off-topic 3 times → each time it
  redirects warmly
- Confirm NO GRADIENTS anywhere on any page
- Update BUILD_STATUS.md

───── END COPY ─────


=======================================================
PHASE 6 — WIDGET, STRIPE BILLING, HARDENING
Goal: the embeddable widget works, billing enforces plan
  limits, and the product is production-ready.
Spec reference: platform_spec_v2.md sections 7, 8, 12
  (all items), 11 (launch checklist).
Gate: the launch checklist in section 11 is completed
  item by item and shown as output.
=======================================================

───── COPY FROM HERE ─────

Read platform_spec_v2.md sections 7, 8, and 12 in full
before writing any code.

Build the following:

1. QUOTEDONE WIDGET (section 7)
   /widget.js served from CDN path. Shadow DOM isolated.
   Floating launcher → service pick → one question per
   screen mobile-first → range + tiers + disclaimer →
   Book it / Talk to us / lead capture. Same engine, same
   sanitization — the widget never receives rates or line
   items. Public key ≠ JWT. Domain allowlist per owner
   enforced server-side. Rate-limited per key.
   Dashboard install page: copy-paste steps for WordPress,
   Wix, Squarespace, Shopify, GoDaddy, Webflow, plain HTML.
   Live "installation detected ✓" checker.

2. STRIPE BILLING (section 8)
   Products: Operator $119/mo, QuoteDone $279/mo,
     Scale $549/mo (all as config, not constants).
   Annual prices (2 months free) as separate Stripe prices.
   Overage: Stripe metered billing at $0.35/min, triggered
     at the end of each billing period from billed minutes.
   NO setup-fee or one-time onboarding product of any kind —
     recurring tiers and overage only.
   Trial: 14 days, card required, 60 voice-minute hard cap
     shown to the user.
   Billing lifecycle per section 12.6: payment_failed
     webhook → retry schedule → 7-day grace → suspend to
     voicemail-capture → restore on resolution.
   Self-serve cancellation including offboarding flow per
     section 12.7.
   Plan gating: every protected route checks plan status
     from the database, not from the JWT (JWTs can be stale).

3. ALL PRODUCTION HARDENING from section 12
   12.1 A2P: admin panel shows registration status field
   12.2 Concurrent calls: per-owner ceiling, platform
        ceiling with admin alert
   12.3 Slot-locking: already built in Phase 3, verify
   12.4 Failure fallback: Gemini failure → TwiML fallback
        capture, no dead ring
   12.5 Minute metering: per-call, spam excluded, never
        terminate a live call at cap
   12.6 Billing lifecycle: already covered above
   12.7 Cancellation/offboarding: un-forwarding
        instructions, 14-day wind-down, data export
   12.8 Timezones: all scheduling in owner timezone,
        timestamps stored UTC
   12.9 Admin panel: populate all sections with real data
   12.10 Auth: already in Phase 0, verify
   12.11 Trial mechanics: day-10 email, day-13 email,
         auto-convert day 14, minutes-exhausted fallback
   12.12 Legal pages: ToS and Privacy Policy placeholders
         marked for attorney review
   12.13 Service-area check: agent confirms address is
         in-area before booking
   12.14 Barge-in: Gemini Live interruption support
   12.15 Repeated-caller throttle: >6 calls in 24h
   12.16 Mobile-first: verified across all views
   12.17 Quote page tokens: signed, unguessable, expiring
         (already in Phase 4, verify)
   12.18 Customer dedupe: phone-number match (E.164)
         (already in Phase 4, verify)
   12.19 Backups: Litestream or equivalent continuous
         replication, nightly snapshot, 30-day retention.
         RESTORE MUST BE TESTED AND DOCUMENTED.
   12.20 Observability: structured logs, error alerts,
         daily admin digest

4. INTEGRATIONS (section 6.10)
   Signed webhooks on: call.completed, lead.created,
     quote.created, appointment.booked, quote.accepted.
   Zapier connection guide page.
   CSV export: calls, leads, quotes, customers.

GATE — go through the section 11 launch checklist item by
item. Show each item and whether it passes. Do not report
this phase complete until every item is addressed. Items
requiring the project owner's action are flagged clearly.
Update BUILD_STATUS.md with the final status.

───── END COPY ─────
