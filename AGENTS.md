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
- Every query touching tenant data filters by tenantOwnerId,
  no exceptions. Authentication, registration, migrations,
  admin, and platform-metrics queries are explicit exceptions.
  Tenant reads/writes go through the ownerQuery helper.
- UI labels: use spec labels verbatim where given; where a
  required field has no specced label, propose one in the
  phase gate output for owner approval — never ship
  unapproved labels silently.

## Honesty
State broken or incomplete work plainly at the top of every
response. No self-ratings. No realistic-looking fake data —
marked [PLACEHOLDER] blocks only (dev/internal scaffolding;
the public site carries no placeholder proof blocks — see
Phase 5).
