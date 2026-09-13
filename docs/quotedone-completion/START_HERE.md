# Authorized assignment: finish the QuoteDone application workflow

**Owner authorization granted September 13, 2026.** This is an implementation assignment, not a proposal awaiting another approval. The owner approved the complete, isolated, non-production quote-or-lead workflow and the bounded environment work below.

## Outcome and responsibility

Complete the real application journey: owner signs in, configures and approves their pricing, saves and reopens it, and a submitted customer inquiry produces either an accurate customer-safe quote from the accepted engine or a complete, durably saved review lead visible to the correct owner. Prove the same saved state survives an application restart.

Codex implements and runs the actual application. Independent review evaluates the same final candidate and its executable evidence. Continue correcting reproduced defects within this scope, rerunning the affected workflow and regressions, rather than stopping after each repair for another owner-forwarded prompt. No green unit-test count substitutes for the real workflow.

This written record does not claim implementation, environment repair, or application acceptance has already happened.

## Starting state and one candidate

Repository: `sportaholic000-hue/off-the-clock`.

Use **`codex/quotedone-application-completion`**, created from the accepted editor checkpoint `eb79953faad059314071ae5f364770e41838a05a`. The first commit on this branch records this authorization and adds verification assets; it does not change application behavior. Inspect actual HEAD/worktree before work and preserve legitimate later work. Do not reset, discard, stash or overwrite other work to match an old SHA.

Keep these existing branches unchanged: `main`, `codex/pricebook-integrity-20260912`, `codex/quote-engine-vnext-audit`, `demo/website-live-sales`, and `growth/public-pages-review`.

The accepted engine implementation is frozen at the 19-file Git tree **`dcd481193b10c3cfc667cb23d22fb41b16322cff`**, from `7c0292f7bea82ea8da890ae4241812ec21433c48`. Its numeric-output repair and the editor's D1/D2 repairs remain accepted. Do not reopen them based only on old audit wording or an environment error.

## Instructions superseded by this authorization

For this assignment ONLY, this supersedes earlier instructions to stop after a narrow repair, exclude all application integration, obtain approval for each reproduced in-scope application defect, or perform dependency-only verification without application changes. It also authorizes the necessary quote/lead parts of the build phases identified below; their former phase-order exclusions must not block this explicitly selected scope.

It does NOT supersede pricing requirements, privacy rules, accepted engine behavior, actual-evidence requirements, or the exclusions at the end of this document. Historical reports remain evidence of their own commits, not current stop commands.

Read the repository's `AGENTS.md`, `specs/BUILD_STATUS.md`, relevant sections of `specs/build_guide.md`, `specs/platform_spec_v2.md`, `specs/quote_engine_v2.md`, and `specs/voice_quote_flows.md` before implementing the affected behavior. Relevant platform obligations include price-book approval and editing, owner/staff roles, quotes, leads and privacy. Read the current VNext contracts, entrypoints and outstanding-path records. Use their exact meanings; do not build an adapter from a guessed schema.

Main's accepted master-toggle ruling remains ON = AI answers every call, OFF = business line. Do not restore coverage-hours gating from stale branch prose. This task does not implement telephony.

## 1. Make the real application runnable first

Diagnose the reported `better_sqlite3.node` load failure against the actual Node executable, architecture, module ABI, locked package version and binary. Preserve the original error and hashes. Prefer an already-approved compatible environment.

**Authorized:** restore or rebuild the existing locked SQLite dependency as necessary, using already installed approved tooling, in an external disposable verification copy. Keep the canonical project and its dependency artifacts untouched. Do not copy an incompatible binary into the verification environment. Record the resolved package/runtime and every changed runtime artifact. Machine-specific binaries must not be committed, including through tracked `node_modules`.

No runtime/package-version change, new global tool, blanket dependency reinstall, lockfile regeneration, unrelated cache deletion or canonical project move is authorized. If a missing prerequisite genuinely lies outside this permission, identify that exact prerequisite and continue other unblocked in-scope work; do not repeatedly retry the known broken setup or fabricate an acceptance backend.

Once runnable, use real application authentication, HTTP and browser transport with isolated temporary stores. Synthetic accounts and explicitly labeled test records are allowed. Mocks may supplement targeted fault injection but cannot replace the normal acceptance path.

## 2. Complete the existing quote-or-lead integration

Application changes necessary to deliver this workflow are authorized on the completion branch: price-book/editor compatibility, trusted server adapters and request handling, revision/approval/activation handling, customer-safe responses, review-lead persistence and owner visibility, retry handling, preview ordering, and their regression/acceptance tests. Implement against actual source; this document does not prescribe a guessed patch or architecture.

- Bind tenant, selected service record and response permissions to verified server context. Ignore caller-supplied attempts to elevate identity or select an owner response. Preserve service IDs even when multiple records share a type.
- Carry owner-entered rates and their units without silent conversion changes. Do not turn a floor-area field into wall area because both use square feet. Cost versus selling-price basis, fees, taxability and approvals must have real owner-approved meaning, not values imported from test helpers.
- Preserve valid saved settings, locations, IDs, disabled intent and approvals. An unambiguous existing configuration may be adapted without changing its meaning. Where the old book lacks a required decision or has contradictory values, retain it non-destructively and expose the exact owner confirmation needed. Preview cannot approve or enable a service. Do not fabricate approved identity/evidence objects just to get a ready result.
- Connect customer calculation to the accepted engine through the trusted application path. Do not silently fall back to the legacy engine on review, validation failure or unsupported scope. An unpriced selected extra is not omitted or treated as free.
- Finish a real owner-facing review path. Preserve supplied contact/location, service request, selected scope, measurements, explicit unknowns, urgency and relevant context. Keep internal pricing/evidence private. Commit the request before claiming it was received. Failed persistence must not return a successful lead acknowledgement.
- Make retries idempotent within the correct tenant. A lost response followed by retry must not create a second lead; concurrent duplicate submissions must be handled. Reusing an identifier for changed content must not return an unrelated old result or silently replace an accepted record.
- Keep preview tied to the current service, inputs and revision. Delayed successes, errors and loading completions from earlier requests must not overwrite the current view. Invalid or newly edited inputs must not retain an old ready result as though it describes the current draft.
- Use the existing owner interface to make the saved lead accessible and actionable. Implement only the lead-management actions required here; do not expand into a complete future CRM, SMS or booking provider build.

Necessary schema evolution may be exercised on disposable synthetic stores with before/after integrity checks. No real owner book/database migration or destructive rewriting is authorized.

## 3. Locked product and mathematical requirements

No arbitrary markup cap, maximum profit policy, replacement owner prices, hidden estimation inside a range or new pricing formulas. Markup and true gross margin are not interchangeable. Preserve their approved meanings without silently reinterpreting existing settings.

Every released quote must account for the entire selected supported scope exactly once using the correct approved book, confirmed measurement meaning, rates, cost/sell-price basis, fees, markup, tax, minimums and range rules. Numeric JSON amounts must preserve the accepted display contract exactly. Private owner pricing and calculation evidence must not be exposed to customers or unauthorized staff.

The accepted engine already distinguishes supported quoting from review-only paths. Do not attempt to unlock every trade by inventing a contract. Incomplete or unsupported jobs must become complete saved leads, while supported positive controls must still quote. An adapter that makes all inquiries review has not completed this task.

Known acceptance controls include the $0.0049/$0.0050/$0.0051 rate sequence; $49/$50/$51 neutral 10,000-square-foot bases; the $200.01 minimum display; 1,200% markup on $100 eligible cost yielding $1,300; root-only trimRatio 0.23; conflicting $14.01/$14.00 copies; explicit resolution/reconfirmation; unchanged focus/blur; and same-type service switches. Retain maps, tiers, explicit optional zero, missing/invalid distinctions and relevant tax/basis controls.

## 4. One workflow checklist and evidence set

`ACCEPTANCE.md` defines the required outcomes. `status.json` is the completion ledger. All workflow rows start `pending`: prior component acceptance is recorded above, but it is not a new authenticated integration pass.

Write independent expected results before changing the behavior under test. Retain the failing input and original result, implement the bounded correction, then rerun the affected real workflow and regression tests. Continue until the checklist passes or a specific outside-scope prerequisite prevents further progress. There is no requirement to stop after every correction.

Use one evidence directory per tested commit. Keep exact commands, exits, browser/server logs, full request/response bodies, persisted records, restart proof and relevant screenshots. Use synthetic data and omit secrets. Tie results to the actual tested code; after an implementation change rerun affected acceptance and the final regression/build suite. Never normalize away prices, IDs, units, approvals, scope or statuses. Name any generated IDs/timestamps normalized for a comparison and verify their relationships separately.

Run the original independent precision suite now present in the repository:

```sh
node verification/quotedone/run-precision.mjs .
```

The wrapper verifies and decompresses the original case file to temporary storage, runs the original script unchanged, and removes only its own temporary directory. No download, dependency installation or pricing implementation is involved. These 22 cases are regression controls, not a substitute for authenticated application acceptance.

Preserve the original isolation gate and historical results. On this new branch, an authorized adapter importing VNext is intentional: add a separate integration-boundary verification that allows only the intended bridge, verifies the frozen engine and rejects legacy fallback/private-output leakage. Do not weaken the old engine branch's gate, disable safety assertions, or mislabel an expected old no-import failure as a passing integration gate. Run independent numerical suites in either case. Package/workflow versions and GitHub Actions configuration remain unchanged.

## 5. Delivery and stopping rules

Report completed customer workflows first, with the exact candidate SHA and evidence for each. Attach one complete evidence ZIP or provide an actually accessible repository artifact; a Windows-only path is not a reviewer download. Commit executable regressions and update this checklist as work is verified. Preserve exact independent fixtures. The final report must distinguish actual application flows from component, mock-provider and pure-function tests.

Successful completion means the agreed non-production workflow is demonstrably working, not that all later telephony, billing, marketing and public-release phases are finished. Record an accurate scoped acceptance result; do not mark an entire unrelated phase passed or claim universal correctness from a test count.

Escalate only an actual owner business decision not resolved by the source, a prerequisite outside these permissions, a proven need to alter the frozen engine, or production release approval. Record the smallest specific decision; continue independent unblocked work. Do not ask whether already-required tenant isolation, durable leads or exact owner pricing should be implemented.

**Exclusions:** engine implementation/formula changes; arbitrary pricing caps; unrelated features/redesigns/refactors; runtime or package-version changes; global installations; paid provider calls; external messages; phone provisioning; live customer data or migrations; edits to protected existing branches; merging to main; deployment. No production release is authorized. All implemented product facts must remain truthful.
