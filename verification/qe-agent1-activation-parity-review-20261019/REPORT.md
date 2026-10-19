# Activation/contract parity review — 20 services

**Two confirmed roofing activation defects remain.** This is an evidence-only
branch; no production repair is included. All20 registered services were exercised.
Final matrix: **161 cases,157 matched expectations,4 failed comparisons** (two
known-pitch failures and their two unsupported-pitch controls). Existing focused
regressions: **303/303 pass**, zero failures/skips/cancellations/TODOs. The separate
intentional reproducer has **2 passing controls and2 failing availability assertions**.

Production base: `c743f6febdf9b758fea87545d2b930731cfb9b70`.
Branch: `codex/qe-agent1-activation-parity-review-20261019`.
The published evidence commit has that exact single parent. Execution bindings
record the unchanged production base; this is not a claim of a hosted release gate.
Only this verification directory changes. No subagents, integration/main writes,
deployment, price/policy/version changes, real customers or provider messages.
F2's below-one signed-adjustment policy remains unresolved and outside this audit.

## Confirmed defects

### AP01 — unknown-pitch allowance blocks a known-pitch roof

`findings/AP01.json.gz` preserves the exact genuinely saved/confirmed/approved
book, receipt, request, owner validation, real HTTP wire, widget receipt and voice
response. No receipt was synthesized or renewed by quoting.

- Price inputs in cents: asphalt labor20000/square, material10000/square,
  first-layer removal6000/square, installed-area underlayment100/square,
  disposal2000/square.10% field-material waste; fees/tax/markup/minimum all0.
  `unknownPitchBand` is absent. Both over12 adjustments are explicitly present.
- Request:1000 measured roof sq ft, whole roof, `pitchBand=up_to_six`, one story,
  one existing layer, simple shape, full scope, asphalt replacement.
- Independent expected total:200000+110000+60000+1000+20000 = **391000 cents**.
  Known pitch uses no unknown-pitch allowance. The service should be available
  for this supported request; an unknown pitch must still require review.
- Actual owner approval is current; structural diagnostics are empty, but
  status is `NEEDS PRICING`, missing `unknownPitchBand`. Public catalog is empty.
  Actual widget submission is saved as `ESTIMATE_REQUIRES_REVIEW` without amount.
  Actual voice `matchService` returns `needs_clarification`, so `getQuote` is
  unreachable through the published service handle. No fabricated voice quote.
- A diagnostic direct-engine selection, with the exact projected saved pricing,
  returns **391000**. Its `active=true` diagnostic does not alter the durable book
  or represent a customer-accessible quote; the real channels above remain blocked.
- Business impact: an owner who prices known pitches but has not chosen an
  allowance for an unknown pitch loses all published roof quoting, including
  fully measured low-pitch jobs. No incorrect charged amount was observed.

Source: `priceBook.js` baseActivationScenarios lines300–303 unconditionally adds
`pitchMethod=not_sure`; evaluateActivationVariant lines859–879 groups by material
pair and requires every probe within that pair. `templates.js` lines579–581 uses
and requires unknownPitchBand only for not_sure. `priceBookCopy.js` line96 also
explicitly says it is required before an **unknown** pitch can quote.

### AP02 — one unpriced over12 adjustment blocks priced low pitches

`findings/AP02.json.gz` retains the same complete evidence categories. Same
1000sqft low-pitch request and independent **391000-cent** expected quote.
`unknownPitchBand=seven_to_nine` is present; installation over12 adjustment0.5 is
present, removal over12 adjustment is absent. No missing value is interpreted as0.

Actual approval is current and structural diagnostics are empty, but owner status
is `NEEDS PRICING`, missing `pitchRemovalAdderOverTwelve`; catalog empty, saved
widget review, actual voice service match unavailable. Selection-only low-pitch
engine calculation still returns391000. Selecting over12 correctly requires
review. Missing pricing for that unsupported band must not invent an adjustment
or suppress the unrelated complete low-pitch scope.

Source: `priceBook.js` lines297–300 adds an over12 activation probe when **either**
adjustment exists, then the same all-probes-per-material readiness check applies.
`templates.js` lines584–589 requires both adjustments only when positive area
occupies that band. Impact: partially configuring an additional pitch band removes
otherwise supported roof quoting from both delivery channels.

These are two settings reaching the same readiness design problem. No repair
assignment or policy is invented. An inherited tier and a tier that supplies the
unknown allowance both quote391000 for the known pitch once any complete tier
keeps the service published (`tier-completes-unknown-pitch-policy` passes).

Existing `quoteRoofing20261016.spec.mjs` checks selected unknown/over12 requests
require their settings. It does not test save/approval/catalog availability of a
known low pitch while those unrelated settings are absent. Existing engine-only
activation-parity tests compare calculators, not these publication transitions.

## Honest coverage matrix

All rows include real new-service save, explicit starting-value confirmation,
explicit saved-configuration approval, pre/post-approval public catalog, saved
widget HTTP prepare/submit, actual voice dispatcher/runtime, and inherited versus
explicitly equivalent tier settings. “Selected missing” is evaluated according to
the service contract: required scope reviews; optional extras may retain a quote
with exclusion. Counts are final-run cases, not individual assertions.

| Service | Cases matched/total | Base cents | Optional work selected/unselected + tier completion | Absence/constraint coverage |
|---|---:|---:|---|---|
| ROOFING_REPLACEMENT |7/11|391000|Confirmed decking; complete tier survives missing sheet price|Unknown allowance and over12 pair: AP01/AP02; known/unknown/over12 controls|
| ROOFING_REPAIR |4/4|24000|No separate trade add-on in selected band contract|Absent large limit is known global gate; explicit exceeded bound|
| FLAT_ROOF_REPLACEMENT |11/11|1470000|Measured insulation; complete tier|Absent/material-only/installed deck basis; explicit labor share|
| FLAT_ROOF_REPAIR |8/8|36000|Ponding treatment; excluded missing add-on; complete tier|Absent large limit known gate; explicit exceeded bound|
| INTERIOR_PAINTING |13/13|300000|Ceilings; minimal wall-only prices; complete tier|Absent/matching/contradictory trim constraints; absent baseline height; itemized absent details and unpriced condition|
| EXTERIOR_PAINTING |10/10|300000|Doors; F18 partial envelope; complete tier|Absent baseline stories; contradictory installed coats; itemized absent details and unpriced condition|
| FLOORING_INSTALL |9/9|178000|Installed transitions; complete tier|Absent furniture unit when unused; explicit flat/per-room units|
| FLOORING_REPLACEMENT |9/9|178000|Installed transitions; complete tier|Same furniture units; removal/subfloor explicitly unselected|
| FENCING_INSTALL |9/9|400000|Walk gates; minimal no-gate price book; complete tier|Absent baseline terrain; unoffered type rejected|
| FENCING_REPLACEMENT |9/9|400000|Walk gates; minimal no-gate/no-removal book; complete tier|Absent baseline terrain; unoffered type rejected|
| SIDING_REPLACEMENT |7/7|1170000|Measured installed trim; complete tier|Absent/explicit area convention with direct area, no openings|
| SIDING_REPAIR |4/4|25000|No separate trade add-on in selected band contract|Absent large limit known global gate; explicit exceeded bound|
| CONCRETE_DRIVEWAY |9/9|318889|Combined base prep; complete tier|Absent/matching/contradictory thickness range; alternate tier survives|
| CONCRETE_PATIO_SLAB |9/9|318889|Same base prep; complete tier|Same thickness-range controls|
| LANDSCAPING_CLEANUP |7/7|15000|Separate haul-away; complete tier|Absent bag price versus explicit10-bag disposal above minimum|
| LANDSCAPING_MULCH |7/7|21875|Measured edging; complete tier|Derived area/depth overage versus stated yards without overage|
| LANDSCAPING_SOD |9/9|203750|Combined prep; complete tier|Complete topsoil pricing unused/stated/unknown depth; no invented prep lines|
| LANDSCAPING_PLANTING |6/6|10500|Stated mulch yards; complete tier|Default size vocabulary retained, optional mulch config absent/explicit|
| LANDSCAPING_MOWING |7/7|10000|Bagging; excluded missing add-on; complete tier|Absent versus explicit fixed visit charge|
| CUSTOM |3/3|12500|No trade add-on in this fixed service; N/A|Fixed flat definition versus contradictory hourly input|

The base is minimally scoped. Interior/fence have separate minimally priced
configurations. Roofing's minimal-known-pitch variants expose the blockers above.
Every service has at least one approved, publicly available base quote at the
independent expected cents; all20 base cases agree across widget and voice.

## Actual execution and limits

Final run `run-06-final`:
- 161/161 current explicit approvals;161/161 hidden before approval.
- 161/161 durable books/receipts unchanged by quotation; zero email-provider sends.
- 2244 actual HTTP responses:2083 status200 and161 saved widget submissions status201.
- 154 visible services,7 blocked:4 AP cases plus3 deliberately documented missing
  large-limit gate cases.161 actual voice match calls,154 matched services,
 158 actual getQuote calls including scope-confirmation follow-ups.
- Widget results:129 instant,1 partial,31 review; voice:130 quoted,24 needs_details,
 7 unavailable service matches. Widget/voice amounts agree for every accessible
 priced case. All161 widget submissions have durable receipts.

The large-repair gate is **not a new finding**: `auditFixes20261003.spec.mjs` M03
explicitly expects NEEDS PRICING without the large bound. Selection-level small
repairs remain calculable, but the established publication rule is unchanged.
This audit does not turn that asymmetry into a policy repair.

Coverage is not exhaustive. Untested in this workflow matrix: every product and
material permutation, custom plant-size vocabularies, repair unit-price modes,
carpet roll/room variants, fence height rows/layouts, every painting/siding extra,
all demolition/overlay/underlayment scope definitions, every fee/tax/seasonal
combination, malformed/null/zero sweeps, browser rendering/click interactions,
telephony/audio transport and live providers. Some have existing regressions;
those do not make them new workflow coverage here. Full/strict/browser/build/
Docker/dependency hosted gates were not run or claimed for this read-only audit.

Preliminary failed runs are preserved, with fixture/harness corrections explained
in `TRIAGE.md`. Final production defects are not “fixed” by changing expectations.
`cases.mjs` contains independent formulas; each run's expectation manifest was
written and hashed before comparisons. `EXPECTED.md` records the initial oracle
and transparent corrections. Run01/02 fixture failures are not product findings.

## Evidence and reproduction

Each run has its binding, pre-execution expectations, actual results, summary and
`evidence.tar.gz`. The archive contains full per-case JSON, including exact saved
configuration, approval receipt, requests, all HTTP wire, direct application result,
saved widget receipt and actual voice-tool responses. `evidence-index.json` hashes
each uncompressed member. Packing verifies byte-for-byte preservation before
removing redundant individual gzip wrappers. The two findings are also available
as standalone gzip JSON files. Provider identifiers and addresses are synthetic.

Use Node22 with installed project dependencies:

```sh
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs verification/qe-agent1-activation-parity-review-20261019/run.mjs run-new
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test verification/qe-agent1-activation-parity-review-20261019/reproduce-findings.spec.mjs
tar -xOzf verification/qe-agent1-activation-parity-review-20261019/run-06-final/evidence.tar.gz ROOFING_REPLACEMENT--absent-unknown-pitch-policy-known-request.json
```

The matrix and dedicated reproducer intentionally exit1 while defects remain.
They live entirely outside existing test discovery; no suite selection, skips or
expectations in existing tests were edited. See `COMMANDS.md` for executed commands.
