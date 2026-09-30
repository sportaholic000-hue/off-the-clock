# Draft PR #3 — independent follow-up review

Reviewed GitHub HEAD: `aa81eaa29503a7c3e2ddf464c7462f556839562c`, branch `codex/quotedone-audit-repairs-20260927`. PR #3 remains draft and targets `codex/quotedone-application-completion`, not main. The head was checked again after verification and had not changed.

**Assessment: the Calendar work is a real improvement, but the missing fencing and painting engine pieces have not been implemented in the version currently pushed to GitHub. Keep the PR in draft.** The latest commit adds a verification script and three evidence documents; it does not change runtime pricing.

[PR #3](https://github.com/sportaholic000-hue/off-the-clock/pull/3) · [Engine checkpoint](https://github.com/sportaholic000-hue/off-the-clock/blob/aa81eaa29503a7c3e2ddf464c7462f556839562c/docs/review/engine-completion-20260929/CHECKPOINT.md)

The review was read-only against the project and GitHub. I used no subagents and made no repository, provider, production-data, merge or deployment changes. Executable checks ran in an isolated source copy against synthetic local records. This report and scratch evidence are the only new deliverables.

**What the engine actually does**

The current 19-file engine tree is still `dcd481193b10c3cfc667cb23d22fb41b16322cff`, identical to the earlier inspection. I reproduced the newly published ten-case check through owner preview, authenticated calculation and public submission: 30 responses.

| Tested job | Current behavior |
|---|---|
| Interior painting, good condition | Quotes the independent $1,650 control |
| Interior painting, fair condition | Review; no amount |
| Interior painting, poor condition | Review; no amount |
| Exterior painting, good/fair/poor condition | Review; no amount |
| Fence installation, zero/one gate | Review; no amount |
| Fence replacement, zero/one gate | Review; no amount |

The two submission routes saved two quotes and eighteen review leads; owner preview saved no customer record. A passing characterization check proves these outcomes are reproduced, not that the missing quote paths are finished.

Fencing still has mandatory unresolved decisions about post geometry, concrete/digging allocation and gate width. Its calculator always returns a review error. Exterior painting still has an unconditional unsupported substrate/coating/preparation contract. Interior fair/poor preparation also requires a measured preparation contract. Filling and approving the currently exposed price fields does not resolve these missing representations.

[Fencing decisions](https://github.com/sportaholic000-hue/off-the-clock/blob/aa81eaa29503a7c3e2ddf464c7462f556839562c/server/quote-engine-vnext/contracts.js#L1608) · [Fencing calculator](https://github.com/sportaholic000-hue/off-the-clock/blob/aa81eaa29503a7c3e2ddf464c7462f556839562c/server/quote-engine-vnext/templates.js#L752) · [Exterior restriction](https://github.com/sportaholic000-hue/off-the-clock/blob/aa81eaa29503a7c3e2ddf464c7462f556839562c/server/quote-engine-vnext/contracts.js#L726) · [Interior preparation restriction](https://github.com/sportaholic000-hue/off-the-clock/blob/aa81eaa29503a7c3e2ddf464c7462f556839562c/server/quote-engine-vnext/contracts.js#L225)

**Why the other agent stopped here**

The checkpoint explicitly says engine completion is authorized and supersedes the previous freeze for this work. It records a pending design choice: add complete installed rates alongside itemized pricing, or support itemized pricing alone. No choice has been implemented. The document is candid about that limitation; it is not a completion claim. I cannot assess unpublished local work from this PR.

My recommendation is to support both pricing modes, chosen explicitly for each owner-defined offering. Complete installed rates are a useful option for businesses that already sell jobs that way:

- Fence offerings specify material/style, supported height and conditions, the measured length basis, and exactly which posts/footings/labor/materials the rate includes. Gates use configured type/width prices; removal and disposal have explicit measured scope and inclusions. Gate openings and posts must not be charged twice.
- Painting offerings specify substrate, coating, coat count, measured paintable area and included preparation/primer. Separately priced preparation, trim, ceilings and other components have their own measured scope.
- Itemized offerings remain available for owners who use them. Purchase costs and selling prices retain explicit meanings; existing fields are not silently reinterpreted into new units or marked up twice.
- Incomplete or unsupported individual jobs require review. Complete supported offerings should produce a quote, rather than an entire trade remaining blocked.

This requires engine contracts/calculators, the price-book editor and approval flow, customer intake, persistence and independently calculated price cases. Adding fields to a screen or removing a review guard alone would be incomplete.

**Calendar progress and a remaining booking defect**

The new Calendar route replaces the old onboarding destination. It adds owner availability, timezone, blocked-period and service-duration controls, saved appointment/request visibility, record links and existing Google/Calendly connection controls. The new service scopes reads to the owner and excludes credentials and internal pricing. I independently reran the focused Calendar/admin/form suite: **20 passed, 0 failed**. The published broader browser/build results were inspected but not rerun in this follow-up.

The prior booking-confirmation defect remains in the unchanged booking service. Three isolated adverse probes reproduced these incorrect outcomes:

1. An ambiguous event-create operation followed by recovery of a cancelled event returns and persists CONFIRMED.
2. Recovery of a tentative/pending event also returns and persists CONFIRMED.
3. Polling finds a confirmed provider event on the next day, but returns CONFIRMED for the originally selected day.

[Create recovery](https://github.com/sportaholic000-hue/off-the-clock/blob/aa81eaa29503a7c3e2ddf464c7462f556839562c/server/src/bookingService.js#L879) · [Confirmation polling](https://github.com/sportaholic000-hue/off-the-clock/blob/aa81eaa29503a7c3e2ddf464c7462f556839562c/server/src/bookingService.js#L948)

Both recovery paths need to verify an explicitly confirmed provider status, the expected event identity and exact start/end before confirming the customer appointment. The new Calendar view can otherwise display an incorrect confirmed record. These probes used no real provider calls.

Google acceptance is still synthetic, primary-calendar-only; Calendly remains an external handoff. Those documented boundaries should remain explicit. Voice source/guide and dependency manifests remain unchanged; this PR update does not fix the previously reported phone runtime or production email/release gaps.

**Independent verification**

- Source readback: 299 copied files match their GitHub blob hashes; zero mismatches.
- Quote characterization: ten cases, 30 preview/authenticated/public responses; expected stored records reproduced.
- Focused Calendar/admin/form tests: 20 passed, zero failed.
- Booking recovery: three adverse scenarios reproduced incorrect confirmation.
- GitHub check runs on this head: zero. Published local test reports should not be mistaken for a GitHub CI gate.

The next useful implementation checkpoint should demonstrate positive fencing and exterior/preparation painting prices from owner-approved offerings, alongside negative cases and channel/persistence checks. Calendar confirmation safety also needs repair before customer launch.
