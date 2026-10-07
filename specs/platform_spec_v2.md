# OFF THE CLOCK AI — PLATFORM BUILD SPEC v2 (LAUNCH)
# Supersedes all previous platform specs. Companion documents
# (required, attached separately):
#   1. "QUOTE ENGINE v2" — the quoting brain. Build exactly as
#      written. Where specs overlap, the engine spec wins.
#   2. "VOICE QUOTE FLOWS" — per-trade question flows for the
#      operator. Compiled into system prompts at call time.
# If any instruction is ambiguous or contradictory, STOP and
# ask. Never resolve conflicts silently.

=======================================================
0. POSITIONING (informs every screen and sentence)
=======================================================
CATEGORY WE CREATE: "The AI operator that gives your callers
a price." NOT "AI receptionist" — that shelf is crowded at
$49 and answering+booking is now the category baseline.
The unique, defensible claim — the only sentence competitors
cannot say — is: the caller gets a real number, from the
contractor's OWN price book, while still on the line.

QUOTEDONE is the branded flagship feature. It appears BY NAME
in the hero, the nav, the pricing table (as a tier name), and
the demo. It is never described generically as "quoting."

HERO HEADLINE — default (final, owner-decided):
  "The AI operator that quotes the job faster than you."
Alternates (kept as swappable config only):
  "The AI operator that quotes the job — not just takes
   the message."
  "Answers every call. Quotes the job. Books it on your
   calendar."
  "Your customers call. Your AI gives them a price. Your
   calendar fills."
SUBHEADLINE — default:
  "24/7, from your own price book — real prices and real
   appointments while the caller is still on the line."
RULES: no fear-based copy (no "before your competitor…").
The brand promise is RELIEF — "go be off the clock, it's
handled." No absolute claims ("only," "never," "every job").

CLAIM LANGUAGE BANK — use these exact framings; never the
crossed-out versions:
  ✗ "Every call you forward gets answered" (plumbing-speak —
     forwarding/setup mechanics NEVER appear in public copy;
     that's behind-the-scenes detail for people who've signed
     up, not a selling point)
  ✓ "Never miss another call." / "Every call answered —
     2 a.m. included." (strong 24/7 answering claims are fine;
     the 12.4 fallback engineering is what makes them real)
  ✗ "Quotes every job accurately"
  ✓ "Real quotes from your real price book — in a range you
     set, confirmed before work starts. And when it shouldn't
     quote, it doesn't guess — it flags you."
  ✗ "Books every appointment"
  ✓ "Books jobs straight onto your calendar while you work."
  ✗ "Fully human-sounding"
  ✓ (no text claim — the button says "Hear it yourself" and
     the demo makes the claim)
  ✗ Any revenue/time figure not measured from real data
  ✓ The ROI calculator (visitor's own numbers) and, later,
     real pilot case studies with real names.

ANTI-FABRICATION RULE (all marketing content):
  - No invented statistics. Where a stat would help, insert
    [STAT PLACEHOLDER — needs sourced figure]. Third-party
    industry stats may be used ONLY with visible attribution
    after the project owner verifies the source.
  - No fake testimonials, logos, review counts, star ratings,
    or "trusted by N" claims. No placeholder blocks either —
    the page simply has no testimonial section until real
    proof exists.
  - PROOF SUBSTITUTES (build these; they do the trust job
    honestly at launch):
    (a) 30-day money-back guarantee badge beside EVERY CTA.
    (b) The live voice demo and QuoteDone showcase — the
        product proving itself beats any testimonial.

=======================================================
1. TECH STACK
=======================================================
  Frontend: React + Vite, Tailwind. No component frameworks
    that impose a look.
  Backend: Node + Express (matches engine spec's server.js).
  DB: SQLite (better-sqlite3) for users, calls, leads,
    customers, quotes, quoteRequests, events; JSON price books
    per engine spec. Every table has ownerId; every query
    filters by it — data isolation at the query layer, no
    exceptions. Schema portable to Postgres by config.
  Auth: JWT + bcrypt. Roles: owner | staff (section 6.9).
  Voice: Gemini Live API for demo agents and production
    operator. REQUIRED ENGINEERING NOTES:
    (a) Audio-only Live sessions are capped (~15 min) —
        implement the documented session-resumption pattern
        so long calls survive the cap seamlessly.
    (b) Live API bills per turn on the accumulated session
        context (past tokens re-billed each turn). Keep the
        assembled system prompt LEAN: include only active-
        service flows, compress the KB to structured facts,
        and use a rolling conversation summary instead of
        raw history where the API allows. Log per-call token
        cost in dev mode — effective $/min must be measured,
        not assumed.
  Telephony: Twilio Programmable Voice + Media Streams
    (bidirectional WebSocket to Gemini Live), Twilio SMS.
  Payments: Stripe subscriptions (plans, annual), payment
    links (deposits). No one-time setup or onboarding
    products of any kind — onboarding is self-serve (4.6);
    sections 4.6 and 8 are authoritative.
    [Owner ruling 2026-07-19]
  Calendar: Google Calendar OAuth + Calendly link support.
  Email: Resend or SendGrid transactional.
  Integrations out: generic signed WEBHOOK on events
    (call.completed, lead.created, quote.created,
    appointment.booked) + Zapier app built on those webhooks
    + CSV export of calls/leads/quotes. This is the "I
    already use Jobber/QuickBooks" escape hatch — data flows
    OUT to their system of record; we never demand they
    switch.
  SMS compliance: transactional only, to the inquiring
    caller about their own inquiry; "Reply STOP to opt out"
    honored; no marketing blasts.

=======================================================
2. DESIGN SYSTEM — unchanged rules, strict
=======================================================
COLORS: --black #0A0A0A bg; --black-raised #111411 cards;
--black-line #1E241E borders; --green #00E676 primary accent;
--green-deep #16A34A hover; --white #F2F5F2 text; --gray
#8A948A secondary.
ABSOLUTE RULE: NO GRADIENTS — no gradient buttons, text,
backgrounds, or borders, anywhere, ever. Flat color. Depth =
borders + spacing + ONE soft green glow (box-shadow: 0 0 24px
rgba(0,230,118,.15)) reserved for live/active elements only
(demo mic, operator ON toggle, live-call dot).
TYPE: Space Grotesk headings, Inter body, JetBrains Mono for
ALL data (numbers, timestamps, durations, quote figures,
statuses). The dashboard reads like mission control.
WORDMARK: the "Off The Clock AI" wordmark renders in the
green brand color (--green #00E676), not white — everywhere
it appears (top nav / header corner and footer corner).
MOTION: 150ms ease. Live elements pulse subtly; everything
else is still. Motion = information, never decoration.
BANNED: purple/violet, glassmorphism blur, emoji in UI,
stock 3D robots, pill buttons (2–4px radius max), parallax,
particles.

=======================================================
3. PUBLIC SITE (offtheclockai.com)
=======================================================

3.1 HERO
  Headline + subheadline from section 0 (config-swappable).
  Primary CTA: "Start Live Demo Call" → live demo. The
  label and supporting copy must make clear the demo is an
  interactive, two-way conversation the visitor speaks in
  (not a passive recording), and that they can ask the agent
  anything about how the product works and what it can do for
  their business.
  Secondary CTA: "Start free" → trial. Money-back badge
  beside both.
  Hero visual: live-looping call card built from REAL
  dashboard components (not video, not screenshot): incoming
  call 9:42 PM → streaming transcript lines → QuoteDone
  range assembling → "Booked — Tue 8:00 AM". Mono font,
  green status glyphs. Communicates the whole product in
  15 seconds.
  TRANSCRIPT PACING RULE (applies to the hero call card and
  every demo transcript anywhere on the site): one question
  per turn, always. The transcript shows a real back-and-
  forth — agent asks ONE question, caller answers, agent
  asks the next (e.g. fencing: style → height → gates →
  corners → terrain → total footage LAST), then the agent
  reads the key numbers back, THEN the range assembles.
  Never stack multiple questions in one message; never show
  a price after a single question. A one-line intake looks
  fake — the realism of the exchange is the proof.
  TRANSCRIPT LANGUAGE RULES: the agent greets with the
  business name + ITS OWN NAME ("Ridgeline Fence, this is
  Nova — how can I help?") — NEVER "this is the operator",
  "this is the AI", or any role label. The agent NEVER says
  "price book" or any internal term to the caller — the
  range is presented as the business's prices ("here's your
  range"), not "from the price book". These rules apply to
  every demo/sample transcript anywhere on the site.

3.2 LIVE VOICE DEMO
  Two selectable agents (male/female, distinct Gemini Live
  voices; placeholder names "Miles"/"Nova", owner-editable).
  Scope-locked system prompt: ONLY discusses Off The Clock AI
  (features, QuoteDone, plans, setup, benefits); asks what
  kind of business the visitor runs and explains how it would
  handle calls, quoting, and booking for THAT specific trade;
  may role-play a brief sample customer call on request; never
  gives real dollar quotes (explains quotes come from each
  business's own price book); never actually books an
  appointment (booking requires a real account with a
  connected calendar); honestly acknowledges being Off The
  Clock's AI operator if asked; redirects off-topic warmly in
  one sentence; answers under 3 sentences unless demoing.
  DEMO COPY RULE: the intro must NOT invite the visitor to
  "book an appointment" or "request a quote for a complex
  project" — the scoped demo agent cannot do either. Invite
  the visitor naturally to talk to the agent about their
  business and how it would help; do NOT script the exact
  words they must say.
  COST & ABUSE CONTROLS — all four layers, mandatory:
    1. Silence timeout: 10s → natural sign-off ("Well, I
       guess you're gone — I'll be right here if you come
       back with questions!") → session closes.
    2. Hard session cap: 3 minutes regardless of activity →
       graceful wrap + signup CTA.
    3. Rate limits: 2 sessions/IP/hour + global concurrent
       ceiling (env, default 10).
    4. Daily budget kill-switch (env dollar ceiling) → demo
       UI shows "High demand today — start your free trial
       to talk to your own agent."
  Mic opens only on explicit button press; text-chat
  fallback with the same scoped prompt.

3.3 HOW IT WORKS (relief-framed, 3 steps — NO setup
  mechanics like "forwarding" anywhere in this section)
  1. "Plug in your line" — keep your number; your customers
     notice nothing except that someone always answers.
  2. "Load your brain" — your services, policies, prices.
     It runs YOUR business, not a script.
  3. "Stay off the clock" — calls answered, jobs quoted and
     booked, every conversation logged for you to review.
     Setup takes about 15 minutes; after that, flip your
     agent on or off in one click — on when you're busy, off
     when you want the calls yourself.

3.4 QUOTEDONE SHOWCASE (branded section, top of nav)
  FRAMING: this section presents the embeddable QUOTE WIDGET
  that lives on the business owner's OWN website — the tool
  their customers use to get an instant text quote online,
  WITHOUT calling. It is a distinct surface from the phone
  operator. The section headline and intro must say this
  explicitly (e.g. "The quote widget for your website —
  instant quotes, no phone call needed") so a visitor who
  just used the voice demo understands this is a SEPARATE,
  text/on-screen product surface, not more voice. The goal is
  for the visitor to grasp they get BOTH a phone agent AND a
  website quote widget.
  Interactive: visitor picks a trade → the widget accepts
  their real answers to 3–4 real engine questions (they type
  or tap each one; nothing advances on empty input) → watches
  a SAMPLE quote range assemble line-by-line in mono ("sample
  pricing — your quotes use your price book"). The trust
  weapon still leads ("The AI that never guesses"). Copy
  explains the accuracy machinery AS A FEATURE: quotes are
  ranges the owner controls, anything unpriced or unclear gets
  flagged to the owner instead of invented, and every quote is
  confirmed before work starts. This machinery is a
  differentiator — market it, don't hide it.
  COMPLETION STATE (widget language ONLY — a widget user is a
  site VISITOR, not a caller): the range appears on screen
  instantly, the top cost drivers are shown, and the visitor
  is invited to book a visit or request follow-up. NO
  "caller", NO "reads back", NO phone/voice phrasing anywhere
  in the widget's completion copy.

3.5 ROI CALCULATOR
  Inputs (visitor's own): missed calls/week, average job
  value, close rate. Output: revenue lost to unanswered
  calls monthly/yearly vs plan cost. Mono, live recalc.
  Copy: "Your numbers. Your math." Optional cited third-
  party stat line only per anti-fabrication rule.

3.6 COMPARISON STRIP (honest, capability-only)
  Four columns: Voicemail / Answering service / AI
  receptionist / Off The Clock. Rows: answers 24/7, books
  appointments, answers YOUR business questions, gives the
  caller a PRICE from your price book, flags what it can't
  quote. Only the last column checks the last two rows. No
  named competitors, no invented competitor pricing.

3.7 OBJECTION BLOCKS ("Straight Answers to Fair Questions" —
  ONE section; this is the only Q&A/objection section on the
  page. There is NO separate FAQ. See 3.10.)
  "Won't my customers hate talking to a robot?" → the demo
    + live transfer to you anytime (5.6) + human-sounding
    conversation.
  "My pricing is too complicated for an AI." → it never
    guesses: anything complex gets captured with full detail
    and flagged to you same-day + the AI price-book
    interview does the setup work (4.6).
  "What if it quotes wrong?" → ranges you set, read-backs,
    on-site confirmation, per-service go-live gates.
  "I already use Jobber/QuickBooks." → webhooks/Zapier/CSV:
    everything flows into your system; switch nothing.
  "Another subscription…" → ROI calculator + one saved job
    covers months + 30-day money-back + cancel anytime.

3.8 INDUSTRIES GRID
  Cards per trade group (Roofing, Painting, Flooring,
  Fencing, Concrete, Landscaping, Siding) + "Any service
  business" (CUSTOM + Operator tier). Each: one trade-
  specific outcome line. Operator-tier framing on the last
  card: "Don't need quoting? The operator answers, books,
  and captures every lead for any business."

3.9 PRICING PAGE (see section 8 for tier logic)
  Requirements: monthly/annual toggle (annual = 2 months
  free); minutes translated to human terms under each tier
  ("300 minutes ≈ 80–110 typical calls"); overage rate
  stated in plain sight ($0.35/min); money-back badge. NO
  setup fee or one-time charge of any kind is shown — the
  table lists recurring plan tiers only. Setup is fully
  self-serve (the AI price-book interview, 4.6, plus simple
  written steps to connect the line) and must be framed as
  something the owner completes themselves in minutes.
  NO separate FAQ block under the table — any genuinely
  useful pricing detail (keeping your existing number,
  self-serve cancellation, what counts as a minute, what
  happens at the cap) folds into the single "Straight
  Answers" section (3.7/3.10), not a second Q&A list.

3.10 FOOTER (no standalone FAQ)
  There is NO separate FAQ section on the page. All Q&A lives
  in the single "Straight Answers to Fair Questions" section
  (3.7). Fold these honest answers into THAT section (once
  each, no duplication with existing objection blocks):
  "Will callers know it's AI?" (human-sounding; if asked,
  it's your digital employee — hear the demo) — note: if an
  "is it a robot / will callers know it's AI" question
  already exists in 3.7, keep only ONE, do not repeat it;
  "What happens when it can't answer?" (captures the lead
  with full detail, flags you, never guesses);
  "New phone number?" (no — you keep yours; connecting it
  takes about five minutes, we walk you through it);
  "Is my pricing private?" (per-account isolation, never
  used to train anything);
  "But some of my customers don't speak English?" — answer:
  the agent handles 20+ languages, including French and
  Spanish, and switches naturally mid-conversation. State
  this as a CAPABILITY only. Do NOT use the word "tested",
  do NOT claim any language subset is "tested" or "verified",
  and do NOT imply other languages are untested.
  FOOTER: the "Off The Clock AI" wordmark in the footer
  renders in the green brand color (--green), not white.
  NO placeholder trust blocks, no testimonial-shaped gaps,
  no [PLACEHOLDER] boxes. Trust comes from the working demo,
  the ROI calculator, and the guarantee.

=======================================================
4. SIGNUP & ONBOARDING — PROGRESSIVE ACTIVATION
=======================================================
PRINCIPLE: value on day one, accuracy gates only where
accuracy is at stake. The operator (answer/book/capture)
goes live the same day; QuoteDone activates per-service as
pricing completes. Never hold answering hostage to the
price book.

STEP 1 — Account: email, password, business name, owner
  first name (the agent uses it: "let me have Mike follow
  up"), plan selection (can start on trial of any tier).
STEP 2 — Business type: trade multi-select → maps to engine
  serviceTypes; "something else" → CUSTOM + Operator-tier
  framing. Any business type can run Operator tier — quoting
  is optional, answering is universal.
STEP 3 — Jurisdiction (QuoteDone trials/tier only, else
  deferred until upgrade): country + region → engine's
  /api/business/jurisdiction flow exactly as specced.
STEP 4 — Phone: Twilio number provisioning (area-code
  search, purchase, webhook attach), forwarding instructions
  per major carrier with "codes vary — confirm with your
  carrier" caveat, forward-all vs conditional explained,
  "call my new number now" live test with green LIVE check.
STEP 5 — Knowledge base: structured editor (6.5), AI draft
  from business name + trade + website URL, labeled DRAFT,
  owner reviews before go-live.
STEP 6 — OPERATOR GO-LIVE (first value moment): once number
  + core KB sections + hours exist, the master toggle can
  flip ON. Status line: "OPERATOR LIVE — every call from
  here on is covered." Quoting not required to reach this.
STEP 7 — PRICE BOOK (QuoteDone tier; skippable, resumable):
  three paths, presented in this order:
  (a) AI PRICE-BOOK INTERVIEW (flagship onboarding feature —
      see 4.6), (b) "Suggest a starter book" (engine's
      /api/pricebook/suggest with mandated placeholder
      warning), (c) manual editor (6.3). Per-service quoting
      activates as each service passes the engine's owner-
      field validation — dashboard shows QUOTING LIVE /
      NEEDS PRICING per service with exact missing fields.
STEP 8 — Calendar: Google OAuth or Calendly; skippable
  (agent collects preferred times → lead cards until
  connected).
STEP 9 — Voice & greeting: male/female voice pick, AGENT
  NAME (required — prefilled default matching the chosen
  voice, e.g. "Miles"/"Nova", owner can change anytime in
  Settings; the agent always greets with business name +
  this name per 5.3, so a name must exist before go-live),
  preview reading the owner's own greeting.

4.6 AI PRICE-BOOK INTERVIEW (build this — it is the
  onboarding moat and a marketing moment):
  From the dashboard: "Have your AI build your price book
  with you — takes about 15 minutes." Owner picks phone
  call or in-browser voice session. The agent interviews
  the owner conversationally through the engine's Class 1
  fields for their active services ("What do you charge per
  square for architectural shingles?... And your minimum for
  a repair visit?"), using the engine's exact field
  definitions/labels as the semantic source. SAFETY RULES:
  every number is read back digits-then-words during the
  interview; NOTHING saves as live pricing — the interview
  produces a DRAFT price book the owner must review on
  screen, field by field, and confirm before any service
  activates. Class 2 factors are shown with defaults, not
  asked. The interview can pause/resume. This feature is
  why "my pricing is too complicated" dies as an objection.
  SELF-SERVE SETUP: onboarding is entirely self-serve — the
  price-book interview plus written steps to connect the
  phone line. There is no paid onboarding call and no setup
  fee. Because there is no human backstop, the written setup
  steps must be genuinely idiot-proof and followable with
  zero assistance.

=======================================================
5. VOICE OPERATOR RUNTIME
=======================================================
5.1 CALL PATH
  Inbound → Twilio → webhook → SPAM CHECK (5.2) → if
  masterToggle ON: Media Stream ↔ Gemini Live (the AI answers
  every call while the toggle is ON, no time-of-day gating).
  If masterToggle OFF: the call rings the business's own line
  as it always has, and whoever answers is responsible; the AI
  does not intercept. The toggle is the owner's single control
  over when the AI answers. [Owner rule, authoritative;
  reconciled from main ed12dca on September 27, 2026.]

5.2 SPAM FILTERING (protects owner minutes AND our AI cost)
  Check caller ID against a spam database/blocklist before
  the agent answers; known spam → reject or brief screen.
  Filtered calls DO NOT count against plan minutes and
  appear in a collapsed "filtered" list. Owners can mark any
  number as spam (permanent per-account block). In-call
  robocall heuristics (long monologue, IVR tones) → polite
  early exit, tagged spam, minutes credited.

5.3 SYSTEM PROMPT ASSEMBLY (per call, per owner — lean per
  section 1 cost note)
  Base persona + compressed KB facts + hours/policies +
  calendar availability summary + VOICE QUOTE FLOWS for the
  owner's ACTIVE, QUOTING-LIVE services only (with owner's
  priced type lists injected) + caller memory (6.6) +
  plan/quoting state (5.5) + urgency/escalation rules.
  CALLER-FACING LANGUAGE RULES (base persona, always):
  - The agent answers and refers to itself by ITS NAME
    (owner-set; e.g. "Ridgeline Fence, this is Nova — how
    can I help?"). It NEVER calls itself "the operator",
    "the AI", "an assistant", or any role label in caller-
    facing speech. (Honest disclosure if directly asked
    still applies per 3.2/12.)
  - The agent NEVER says "price book" (or any internal
    tooling term) to a caller. Prices are simply the
    business's prices: "here's your range" / "based on
    [business name]'s pricing". Internal machinery is never
    narrated to callers.
  The agent NEVER sees raw price-book rates — quoting only
  via the getQuote tool's sanitized customer payload
  (architecture-level enforcement of the engine's rule).

5.4 TOOLS (function calling)
  matchService (engine matcher; always voice-confirm the
  match), getQuote (→ /api/quote/calculate, customer
  callerType; plan-gated per 5.5), checkAvailability /
  bookAppointment (explicit date-time confirmation before
  booking), captureLead, logQuoteRequest (5.5), sendSms,
  flagUrgent (immediate owner notification), transferCall
  (5.6), modifyAppointment (13.3), getCustomerContext
  (13.7 — sanitized summaries only, never rates).

5.5 PLAN GATING + QUOTE-REQUEST COUNTER (the honest upsell)
  Quoting is available only on QuoteDone/Scale plans AND
  per-service when QUOTING LIVE. Gate at the ROUTE layer
  (plan check before generateQuote for customer callers) —
  never modify the engine for plans.
  When a caller asks pricing and quoting is unavailable
  (Operator plan, or service not yet priced): the agent
  uses the engine's graceful defer script ("I'd love to get
  you a number on that — let me have [ownerFirstName] reach
  out directly…"), captures the lead, AND calls
  logQuoteRequest({describedService, leadId}).
  DASHBOARD COUNTER (Operator tier, prominent): "Callers
  asked for pricing [N] times this month — an estimated
  $[X] in quote requests waiting on callbacks." X = N ×
  owner-entered average job value (or trade default, source
  shown); ALWAYS labeled "estimate" with the formula
  visible. One-tap: "Turn on QuoteDone." The customer's
  own missed revenue does the selling — no dark patterns
  needed, and none permitted.

5.6 LIVE TRANSFER (must-have)
  Owner sets transfer availability windows + transfer
  number. Caller asks for a human / agent judges escalation
  needed / urgency triggers → warm transfer: agent tells
  the caller "let me get [owner] on the line," dials owner
  with a whisper summary ("fence quote, 120 feet, wants to
  talk scope — press 1 to accept"), bridges on accept. No
  answer / outside window → graceful fallback to lead card
  + "they'll call you within [owner-set promise window]."
  Transfers never dead-end.

5.7 POST-CALL AUTOMATION
  Every call → transcript + summary + outcome (QUOTED /
  BOOKED / LEAD / QUOTE_REQUEST / INFO / TRANSFERRED /
  SPAM) + linked customer, streamed to the dashboard feed.
  If QUOTED → SMS with the branded QUOTE PAGE link (5.9);
  if assumptions were used (engine estimationUsed) →
  include the measurement-confirmation link: mobile page to
  confirm measurements or add photos → system re-runs the
  quote exactly → texts the tightened range.
  If BOOKED → SMS confirmation + calendar invite + optional
  deposit link (owner-set amount/percent) + APPOINTMENT
  REMINDERS: automatic SMS at T-24h and T-2h (owner-
  configurable, on by default). No-shows kill booked-job
  value; reminders protect the metric we sell.
  MISSED/ABANDONED calls (hangup before or mid-answer) →
  instant text-back: "Sorry we missed you — I can get you
  an answer or a quote right now. What's the job?" Replies
  flow into the lead thread.
  Urgent flags bypass digest settings and notify instantly.

5.8 CONDUCT + MULTILINGUAL
  Human-sounding, warm, brisk; one question per turn; the
  VOICE QUOTE FLOWS anti-robotic rules apply globally.
  Never volunteers that it is AI. If asked, it is a digital
  employee of the business. If the caller then asks whether
  that means AI, it says yes. It never denies being AI and
  never names the technology. Never
  guesses prices/policies/availability — capture and flag.
  Transcription notice configurable, DEFAULT ON ("this call
  may be transcribed for quality") — a transcript is still
  a record; consent rules vary by state/province; owner
  note recommends keeping it on and confirming local rules.
  NO CALL RECORDING anywhere in the product — transcripts
  only, no audio stored, no recording capture/playback
  built.
  Multilingual: Gemini Live follows the caller's language
  (20+, mid-sentence). Read-backs ALWAYS confirm numbers
  explicitly in every language. SMS templates: EN/ES/FR at
  launch, else English. QA GATE: full quote flow tested
  end-to-end in Spanish and French before multilingual is
  marketed.

5.9 QUOTE PAGE (the written artifact contractors want)
  Every delivered quote generates a branded mobile page
  (owner logo/colors — flat colors only) + downloadable
  PDF: range, Good/Better/Best cards when present, scope
  summary from collected inputs, disclaimer, validity
  window, ACCEPT button → booking flow + optional deposit,
  and "request changes" → lead thread. This is what makes
  tiers sell — customers compare options visually, not
  from memory of a phone call.

=======================================================
6. OWNER DASHBOARD / CRM
=======================================================
Left rail, dark, mono data. Top bar: MASTER TOGGLE (large,
green glow when ON, "Operator LIVE — [n] calls handled
today") + plan + minutes meter (spam-filtered calls
excluded and shown as savings: "[n] spam calls blocked —
[m] minutes saved").

6.1 HOME
  Real-data counters (mono, ticking): calls answered
  (today/week, after-hours count), quotes delivered +
  total quoted value, appointments booked + booked value,
  quote requests waiting (Operator tier — the 5.5 counter,
  front and center), "time off the clock" (estimated hours
  = calls × avg handle time; labeled estimate, formula on
  hover). Live call feed cards.

6.2 CALLS & CONVERSATIONS
  Transcript (the written record — no audio exists),
  summary, outcome chip, linked customer/quote/lead,
  urgency flag, spam list (collapsed). Search + filters.
  Per-call transcript export (PDF/text).

6.3 PRICE BOOK (QuoteDone/Scale; visible-but-locked teaser
  on Operator with the quote-request counter beside it)
  Per-service status chips (QUOTING LIVE / NEEDS PRICING +
  exact missing fields from the engine). Editors expose the
  engine's owner fields with its EXACT mandated labels (the
  labels are load-bearing — never paraphrase). Class 2
  factors with defaults + reset. Good/Better/Best tier
  builder (≤3, name + overrides, live sample preview).
  Markup/margin toggle with live equivalence ("30% markup =
  23.1% margin"). Tax panel (jurisdiction-aware). "Build it
  with your AI" button → the 4.6 interview. "Suggest a
  starter book" → engine endpoint + placeholder warning.
  QUOTED-vs-INVOICED LOOP: every quote card has a final-
  invoice
  field; per-service drift computed; |drift| ≥ 8% over ≥5
  completed jobs → insight card ("Your fencing quotes run
  12% under your invoices") with one-tap PROPOSED rate
  adjustment — owner confirms, nothing auto-changes.

6.4 QUOTES
  Status pipeline: INSTANT / NEEDS REVIEW / SENT / VIEWED /
  ACCEPTED / INVOICED. Tier chosen, range, drivers, linked
  call, measurement-confirmation status, deposit status,
  quote-page views. NEEDS REVIEW = actionable lead cards
  with all collected inputs prefilled — one-tap "review &
  send": owner adjusts the range if needed and fires the
  quote page by SMS. The review path is a feature.

6.5 KNOWLEDGE BASE
  Structured sections: About & area, Hours, Services,
  Policies (payment/warranty/cancellation), FAQs, "Never
  say" list. "Test my agent" chat panel to interrogate the
  KB before go-live.
  Agent knowledge must also include the owner-confirmed
  review contact's name and role (owner or manager). Reuse
  the signup owner's first name when confirmed; allow the
  owner to designate a manager. Keep this person distinct
  from the business name and the receptionist's own name.
  Use the configured person's name naturally when a
  question or request needs their review. Never invent a
  person, title, answer or response commitment. Unknown
  business answers become captured, flagged questions for
  the designated contact; delivery claims require evidence.
  See NAMED_REVIEW_CONTACT_DECISION_20261006.md.

6.6 CUSTOMERS (caller memory)
  Auto-created from calls; every conversation, quote,
  booking. Returning callers greeted with context. Memory
  strictly per-owner.

6.7 CALENDAR
  Synced view, AI-booked tags, buffers, service durations,
  blackout dates, working hours the agent respects.

6.8 LEADS
  Unified inbox: quote requests, review-path cards,
  voicemail transcripts, missed-call text-back threads,
  widget leads. One-tap actions: call back, send quote,
  book, dismiss. SLA nudge: leads untouched for [owner-set]
  hours get a reminder — speed-to-lead is the whole game.

6.9 TEAM
  Roles: OWNER (everything) and STAFF (calls, leads,
  quotes-send, calendar, customers — NO pricing rates,
  margins, billing, or price book edits). Scale tier:
  unlimited staff; QuoteDone: 2 seats; Operator: 1.

6.10 INTEGRATIONS
  Webhooks (signed, per-event toggles), Zapier connection
  guide, CSV exports, Google Calendar/Calendly management.

6.11 SETTINGS
  Master toggle (the single on/off control; ON answers every
  call, OFF rings the business line), transfer windows +
  number (5.6), voice + greeting with audio preview,
  transcription notice (default ON + legal note),
  multilingual toggle, SMS templates (EN/ES/FR), reminder
  timing, notification rules (urgent always instant),
  widget settings, billing (self-serve cancel — no dark
  patterns).

=======================================================
7. QUOTEDONE WIDGET (QuoteDone/Scale plans)
=======================================================
One script tag, Shadow DOM isolated:
  <script src="https://offtheclockai.com/widget.js"
    data-key="PUBLIC_KEY" async></script>
Floating launcher → service pick → engine's customer
questions one per screen (mobile-first) → range + tiers +
disclaimer → "Book it" / "Talk to us" (click-to-call) +
lead capture. Same engine, same sanitization — the widget
never receives rates or line items. Public key ≠ JWT;
rate-limited; per-owner domain allowlist. Green/black
default; owner accent color (flat only — no-gradient rule
ships in the widget). Dashboard install page: 3-step
copy-paste guides for WordPress, Wix, Squarespace, Shopify,
GoDaddy, Webflow, plain HTML + live "installation
detected ✓" checker.

=======================================================
8. PLANS & BILLING (Stripe; all prices/quotas as CONFIG)
=======================================================
  OPERATOR — $119/mo (annual: 2 months free)
    The 24/7 operator for ANY service business: answers,
    books, calendar sync, full CRM, transcripts, lead
    capture, automatic text follow-ups, reminders, live
    transfer, spam filtering, 1 number, 300 min
    (≈80–110 typical calls), 1 seat, webhooks/CSV.
    + the quote-request counter (5.5).
  QUOTEDONE — $279/mo (annual: 2 months free) ★ flagship,
    named after the feature
    Everything in Operator + QuoteDone phone quoting from
    the owner's price book, Good/Better/Best, quote pages +
    deposit links, quoted-vs-invoiced insights, measurement
    confirmation links, the embeddable widget, AI price-
    book interview, 1,200 min, up to 3 numbers, 2 seats.
  SCALE — $549/mo+ (custom above)
    Multi-location (numbers + price books + calendars per
    location), unlimited seats, 3,000+ min, priority
    support.
  OVERAGE: $0.35/min, stated plainly on the pricing page.
  Meter always visible; dashboard and durable owner email warnings once per
  billing month at 60 minutes left, 30 minutes left, and zero minutes left.
  At zero: "overage at $0.35/min now applies". See
  OVERAGE_MINUTE_RULES_20261006.md for the owner-approved thresholds and nudge.
  TRIAL: 14 days, card required, features of the selected
  plan: Operator trials receive Operator features;
  QuoteDone trials receive QuoteDone features. Trial status
  alone does not grant a higher tier. Hard cap 60 voice
  minutes (clearly shown), with the mid-call rule in 12.11.
  Owner-approved clarification: TRIAL_ENTITLEMENT_DECISION_20261006.md.
  First payment is at trial end, never at signup. Annual plans charge $1,190
  (Operator) or $2,790 (QuoteDone) then for twelve months. Their 300/1,200
  included minutes reset each monthly anniversary of that paid-term start;
  overage is billed monthly. Annual cancellation retains service through the
  paid year, with no partial cancellation refund.
  GUARANTEE: 30-day money-back on the first month, badge at
  every CTA, honored self-serve.
  NO SETUP FEE: onboarding is fully self-serve (4.6); no
  one-time charges of any kind.
  PRICING VALIDATION NOTE (to the project owner, not the
  build agent): these numbers are reasoned defaults, not
  validated prices — build as config, test willingness to
  pay on the first ten real prospects, let data overrule.

=======================================================
9. SECURITY, PRIVACY, HONESTY
=======================================================
Per-owner isolation on every query; price books,
transcripts, customer data never shared or used to train
anything. NO audio recording/storage — transcripts only,
owner-deletable, owner-set retention. Truthful AI
disclosure. Transcription notice default ON. SMS
transactional-only, STOP honored. Self-serve cancellation.
All marketing obeys section 0's anti-fabrication rule and
claim bank. Widget keys domain-allowlisted. Demo protected
by all four cost-control layers.

=======================================================
10. BUILD RULES FOR THE AGENT
=======================================================
1. Build the quote engine from its companion spec EXACTLY,
   including its validation gate and regression tests.
2. NO GRADIENTS anywhere. Re-read section 2.
3. No fabricated stats/testimonials/logos/counts — marked
   placeholders only. Use the claim bank verbatim.
4. Dashboard metrics compute from real stored data;
   estimates say so and show their formula.
5. Plan gating lives at the route layer — never fork the
   quote engine for plans.
6. The agent never sees raw rates; quoting only through the
   sanitized getQuote tool.
7. Demo cost controls (3.2), spam filtering (5.2), widget
   rate limits (7) are v1 requirements, not hardening.
8. The AI price-book interview NEVER writes live pricing —
   draft + on-screen owner confirmation, always.
9. Do not report anything complete/tested/verified without
   naming what was tested and showing results. Engine: the
   hand-calculated suite. Platform: the end-to-end path —
   signup → onboarding → operator live → test call →
   quote request (Operator) and full quote (QuoteDone) →
   booking → reminder fires → dashboard reflects all of it.
10. Conflicts: engine spec wins; ambiguity: STOP and ask.

=======================================================
11. LAUNCH-WEEK CHECKLIST (project owner)
=======================================================
□ START A2P 10DLC REGISTRATION FIRST (12.1) — carrier
  approval has lead time; SMS features depend on it.
□ Pick the hero headline by reading all three to real
  contractors — their face, not your preference.
□ Set real Stripe products for the three tiers + overage.
□ Verify Twilio forwarding on your own phone/carrier.
□ Run the engine's validation suite; keep the output.
□ Make 3 full test calls per active trade playing the
  difficult caller; verify payloads, recaps, transcripts.
□ Multilingual QA (ES + FR full quote flow) or hold the
  multilingual marketing claim until done.
□ Confirm the demo kill-switch env vars are set.
□ Set up SPF/DKIM/DMARC on the sending domain and test
  owner-alert emails to Gmail + Outlook inboxes (13.10).
□ Test the backup RESTORE once (12.19) — a backup you've
  never restored is a hope, not a backup.
□ Line up 3–5 pilot contractors — the only path from 8.5
  to 10 is their real numbers on your site.

=======================================================
12. PRODUCTION ADDENDUM (v2.1) — REQUIRED, NOT OPTIONAL
=======================================================
Details discovered in production-readiness audit. Every item
here is a build requirement with the same force as sections
1–10.

12.1 SMS DELIVERABILITY — A2P 10DLC (operational blocker)
  US application SMS requires carrier A2P 10DLC registration
  (brand + campaign via Twilio) BEFORE reminders, text-backs,
  and quote links deliver reliably; unregistered traffic is
  filtered. REGISTRATION IS PLATFORM-LEVEL: one brand + one
  campaign registered ONCE for Off The Clock AI; every
  customer number provisioned at signup is attached to that
  existing campaign automatically. Do NOT register a brand
  or campaign per customer. Per-number cost (≈$1.15/mo) and
  the single campaign fee are platform costs absorbed by
  tier pricing (tracked in per-account margin, 12.9).
  Build: registration status surfaced in the admin
  panel (12.9); SMS features show "pending carrier
  registration" state gracefully; Canadian numbers follow
  their own carrier rules. NOTE TO PROJECT OWNER: start
  registration on day one — approval has lead time.

12.2 CONCURRENT CALLS
  Multiple simultaneous inbound calls to one owner number
  MUST all be answered (one Gemini session each). Minutes
  bill per call leg. Per-owner concurrency ceiling (config,
  default 5) → beyond it, fallback voicemail-transcript
  capture. Platform-wide concurrency ceiling (env) with
  admin alert at 80%.

12.3 CALENDAR SLOT LOCKING
  bookAppointment acquires a short lock on the slot
  (owner+slot key) before confirming; a concurrent caller
  offered the same slot gets re-offered fresh availability:
  "that one just got snapped up — I've got [next two]."
  Double-bookings attack the product's core promise; this
  is not optional.

12.4 FAILURE FALLBACK (backs the claim bank)
  If the Gemini session fails to open or drops mid-call:
  seamless TwiML fallback — brief apology in the owner's
  greeting voice config, voicemail-transcript capture (no
  audio stored), lead card flagged AI_FALLBACK, owner
  notified. Health check before answering; circuit breaker:
  repeated failures → all calls to fallback + admin alert.
  A dead ring is a churned customer and a one-star review —
  the fallback exists for retention, full stop.

12.5 MINUTE METERING & CAPS
  A "minute" = connected inbound call duration (Twilio leg),
  rounded up per call to the next minute; spam-filtered and
  AI_FALLBACK calls excluded. NEVER terminate a live call at
  the cap — finish the call, bill overage ($0.35/min) via
  Stripe billing using reconciled metered durations. Optional owner hard cap: at cap,
  calls route to fallback capture instead of the agent.
  Meter, 60/30/0-minutes-left dashboard/email warnings, and per-call minutes
  on every call record. Monthly usage invoices are independent of annual
  base-plan invoices; retries cannot create another usage invoice for a month.

12.6 BILLING LIFECYCLE (Stripe webhooks)
  payment_failed → retry schedule (Stripe smart retries),
  dashboard banner + email day 0; grace period 7 days full
  service; unresolved → account SUSPENDED: operator falls
  back to voicemail-transcript capture (never dead ring),
  dashboard read-only except billing. Resolved → instant
  restore. All transitions logged + owner-notified.

12.7 CANCELLATION / OFFBOARDING
  Owner amendment BILLING_LIFECYCLE_20261007.md governs. Dashboard cancellation
  retains service through the verified paid period without partial refunds.
  At service end AI answering, forwarding, quoting and widget availability stop.
  Release the phone 30 days later; retain CSV leads, quotes and call records
  through 90 days, then delete records and application copies. Reactivation
  restores retained resources within their respective windows, with verified
  payment required after termination. Provider uncertainty remains visible.

12.8 TIMEZONES
  Owner timezone set at onboarding (default from region,
  editable). ALL scheduling, reminders, coverage hours,
  peak-month checks, and "after-hours" analytics compute in
  the owner's timezone; timestamps stored UTC, displayed
  owner-local. Reminder sends respect quiet hours (no SMS
  21:00–08:00 caller-local; use area code as caller-local
  heuristic, owner-local fallback).

12.9 ADMIN PANEL (platform owner's cockpit — /admin, role
  ADMIN, separate auth)
  Accounts list: plan, status, minutes used, estimated AI
  cost this month (from logged per-call token costs — 1(b)),
  margin per account; provisioning failures queue; A2P
  status; global kill switches (demo, signups, per-account
  suspend); support impersonation ("view as owner",
  read-only, audit-logged); platform metrics (calls today,
  fallback rate, transfer answer rate, spam filter rate).
  You cannot run a SaaS from the database console.

12.10 AUTH BASICS
  Email verification on signup; password reset via email
  token; session expiry + refresh; rate-limited login and
  all public endpoints; bcrypt cost ≥ 12.

12.11 TRIAL MECHANICS
  Card required at start; usage banner throughout; durable owner email and
  dashboard reminder three days before the first charge, stating plan, exact
  amount/currency/date and dashboard cancel/change links; auto-convert day 14; trial minutes exhausted early → operator falls
  back to capture + upgrade prompt (never dead ring);
  MID-CALL CAP: if the 60-min trial cap is reached DURING a
  live call, the agent finishes the current caller
  gracefully (never hangs up mid-sentence; completes the
  capture/booking in progress, small overrun absorbed) and
  the fallback applies from the NEXT call. The caller must
  never experience the trial ending;
  cancel-during-trial = immediate, no charge.

12.12 LEGAL & SUPPORT
  ToS + Privacy Policy pages (placeholder legal copy marked
  for attorney review — not invented compliance claims);
  cookie notice only if analytics require it; in-app help
  widget + support email routing to admin panel; a11y
  basics (semantic HTML, focus states, contrast — the
  green-on-black palette must pass WCAG AA for text).

12.13 SERVICE-AREA CHECK
  KB service area (list of cities/radius) → before booking,
  the agent confirms the job address is in-area. Out-of-
  area: polite decline script + lead card tagged
  OUT_OF_AREA (owners sometimes take them anyway — their
  call, not the AI's).

12.14 BARGE-IN / INTERRUPTION HANDLING
  Implement Gemini Live's interruption support: caller
  speech stops agent audio immediately; agent resumes
  naturally without repeating the whole sentence. Test with
  the difficult-caller script. Talking over callers is the
  fastest robotic tell there is — voice quality can't save
  an agent that won't shut up.

12.15 REPEATED-CALLER THROTTLE
  Same caller ID > N answered calls (config, default 6) to
  one owner in 24h → subsequent calls get a brief "you've
  reached us several times today" capture flow, minutes
  flagged for owner review; anomaly alert to owner + admin.
  Protects owner minutes from harassment/burn attacks the
  spam DB doesn't know yet.

12.16 MOBILE-FIRST DASHBOARD
  The dashboard's primary device is a phone in a truck.
  Every dashboard view (home, calls, leads, quotes,
  toggle) must be fully usable at 390px width; the master
  toggle, live feed, and lead one-tap actions are designed
  mobile-first and adapted up to desktop, not the reverse.

12.17 QUOTE PAGE & LINK SECURITY
  Quote pages served at unguessable signed-token URLs with
  expiry (= quote validity window; expired → "request a
  fresh quote" flow). Same for measurement-confirmation
  links. No sequential IDs anywhere public.

12.18 CUSTOMER DEDUPE
  Widget leads, callers, and SMS threads merge into one
  customer record on phone-number match (normalized E.164);
  fuzzy-flag near-duplicates for owner merge, never
  auto-merge on name alone.

12.19 BACKUPS & ENVIRONMENTS
  SQLite: continuous replication (Litestream or equivalent)
  to object storage + nightly snapshot, retention 30 days,
  restore procedure DOCUMENTED AND TESTED once before
  launch. Secrets via env only; separate staging + prod
  configs; the /api/quote/test route and demo kill switches
  verified blocked/armed in prod respectively.

12.20 OBSERVABILITY
  Structured logs (per-call: duration, tokens, cost,
  outcome, fallbacks); error alerting to admin email/SMS;
  daily digest to admin: calls, fallback rate, AI spend vs
  revenue. The quoted-vs-invoiced loop needs data; so does
  the founder.

=======================================================
13. THE SECOND CALL — FULL CALL LIFECYCLE (v2.2)
=======================================================
Sections 1–12 perfect the first call (new customer → quote →
booking). Real business phones also carry every call AFTER
that. These flows are v1 requirements: an agent that nails a
new quote but fumbles an existing customer still churns the
owner.

13.1 INTENT ROUTING (first 10 seconds of every call)
  After the greeting, classify the call:
    NEW_INQUIRY → voice quote flows / KB answering (as
      specced everywhere above)
    EXISTING_APPOINTMENT → 13.3
    JOB_ISSUE / COMPLAINT → 13.2
    ASKING_FOR_OWNER → 13.4
    OTHER (vendor, wrong number, personal) → brief, polite,
      message captured if relevant.
  Returning-caller memory (6.6) pre-biases the guess ("Good
  to hear from you — is this about Tuesday's fence install,
  or something new?"). Never force a caller through quote
  questions when they called about an existing job.

13.2 COMPLAINTS & SERVICE ISSUES (highest-stakes call type)
  Tone shift: drop the sales brightness entirely. Flow:
  (1) one genuine empathy line, no groveling; (2) capture
  specifics — what happened, when, job reference; (3) NEVER
  promise remedies, refunds, or fixes the owner hasn't
  pre-authorized in the KB ("Policies" section may authorize
  standard responses, e.g. "we'll always come back to fix a
  warranty issue"); (4) promise a callback deadline only if explicitly owner-set
  in saved policies; otherwise say the business will follow up
  without a time (owner ruling 2026-10-06, no default deadline); (5) flagUrgent — complaints always notify the
  owner immediately, never digest. Lead card type COMPLAINT
  with transcript pinned to the customer record.

13.3 RESCHEDULE / CANCEL (new tool: modifyAppointment)
  Identify the booking by caller number match (confirm name
  + date verbally). Reschedule: offer fresh availability,
  slot-lock per 12.3, update calendar + reminders, SMS new
  confirmation. Cancel: confirm once ("want me to rebook
  you instead?" one attempt, not pushy), cancel event,
  notify owner, tag the customer record. If no booking
  matches the caller: take details → lead card, never argue
  about whether a booking exists.

13.4 "IS MIKE THERE?" (asking for the owner)
  Within transfer windows (5.6) → warm transfer with
  whisper. Outside windows → honest and brief: "He's out on
  jobs right now — I can book you in, get you a quote, or
  have him call you back. What works?" Personal/known
  callers who decline all three → message captured, normal
  notification.

13.5 BOOKING MODE (per-service owner setting)
  bookingMode: 'site_visit_first' (DEFAULT) | 'book_job'
  site_visit_first: what gets scheduled is an estimate/
    site-visit slot (own duration setting, default 45 min);
    NO deposit link (nothing to deposit on); quote page
    ACCEPT button books the visit; agent language: "let's
    get you on the schedule so [owner] can confirm that
    number in person."
  book_job: schedules the job itself (per-service duration);
    deposit link enabled per owner's deposit settings; quote
    page ACCEPT books the job + requests deposit.
  The engine's disclaimer already matches site_visit_first;
  under book_job the agent still states the on-site
  confirmation caveat before taking a deposit.

13.6 MULTI-SERVICE CALLS
  Caller wants two jobs → run flows sequentially ("let's
  price the fence first, then the pad"). Each service =
  its own engine quote/quoteId. Recap both. ONE follow-up
  SMS linking a combined quote page (both quotes as
  sections, one accept flow per section), one customer
  record, one lead thread. Never make the caller feel like
  they're starting over for job #2 — reuse shared answers
  (address, access) across flows.

13.7 RETURNING-CALLER CONTEXT (new tool: getCustomerContext)
  Returns the caller's past quotes (ranges + status), 
  bookings, and open leads. Powers: "How much was that
  again?" → restate the range + resend the quote page link;
  "Did you guys ever send that quote?" → check status,
  resend, flag if it was stuck in review. Rates and line
  items remain invisible to the agent — sanitized summaries
  only, same rule as getQuote.

13.8 PER-SERVICE FUNNEL REPORT (dashboard → Reports)
  Per service, per period: calls → quoted → booked →
  invoiced, with conversion % at each step and total values.
  Real data only. This is where the owner SEES the product
  working, and where you (admin view, aggregated) get pilot
  case-study numbers.

13.9 QUOTE VALIDITY WINDOW
  Owner setting, default 30 days. Drives quote-page expiry
  (12.17) and the agent's phrasing ("that range is good for
  30 days").

13.10 EMAIL DELIVERABILITY
  Transactional email domain configured with SPF, DKIM, and
  DMARC before launch; sending domain verified in the email
  provider; owner-alert emails tested to Gmail and Outlook
  inboxes (not spam). One-time setup; silent failure mode
  if skipped.

13.11 OPTIONAL v1.1 (build only if time allows; label as
  such in the dashboard)
  OWNER-TRIGGERED AI CALLBACK: on any lead card, "Have the
  AI call them back" — outbound call returning the
  customer's own inquiry (their number, their request,
  same-day), runs the same flow they started. Owner-
  triggered only; no automated outbound campaigns of any
  kind.
