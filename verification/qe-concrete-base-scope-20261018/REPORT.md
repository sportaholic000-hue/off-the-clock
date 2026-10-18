# Concrete preparation disclosure, October 18

Base: `1857b7779b83b70f7753b41b72c3677270cd4ffc`.
Review branch: `codex/qe-concrete-base-scope-20261018`.
All captured owners, requests, prices and database rows are synthetic.

## Repair and scope

The untouched base was reproduced for both `CONCRETE_DRIVEWAY` and
`CONCRETE_PATIO_SLAB`. A gravel-only preparation quote was 803000 cents, but its
saved customer facts said `Base preparation included: Yes`; its generic voice
projection repeated that fact and the broad preparation-depth sentence.
`before-responses.json` preserves complete sanitized engine, saved widget and
actual voice-tool responses, plus the genuine historical record used for replay.

Only concrete disclosure in `templates.js` and the concrete `baseNeeded`
label/summary in `contracts.js` change. Separate preparation identifies included
and excluded components using the same price-presence predicate already used by
the calculator. Zero counts as present; existing validation and explicit owner
approval still decide whether a zero may quote. Legacy combined preparation and
no-preparation calculations and disclosures stay unchanged.

New customer strings (the label and component sentences are owner-authorized):

- `Base preparation requested`
- `Included base preparation: {components}.`
- `Excluded base preparation: {components}. Any required excluded work needs a separate on-site estimate.`
- `Base gravel material quantity assumes {baseDepthInches} inches of compacted base depth.`

Components are exactly `base gravel material` and
`base excavation and grading labor`, joined by a comma when both are included.
The depth sentence appears only when gravel material is priced; it preserves
the quantity assumption without promising excavation, grading or compaction
labor. There are no new owner fields or labels. Root and per-option disclosure
flow through the existing sanitizer, saved widget response and voice projection.
No voice implementation changed.

## Monetary preservation

Independent expectations were written in `EXPECTED.md` and `fixtures.mjs`
before the base capture ran. `capture-before.mjs` refuses to capture unless HEAD
is the exact base and both owned production files match it. Do not regenerate
the frozen before captures after applying the fix.

The 30 cases compare **every numeric leaf and exact-rational numerator and
denominator**: 14752 internal values and 168 sanitized customer values, as well
as all customer dollar-formatted substrings. Every comparison is unchanged.
Prices below apply independently to both services:

| Preparation / scenario | Before and after, cents |
|---|---:|
| None | 763000 |
| Legacy combined; also blank separate prices | 868000 |
| Gravel only | 803000 |
| Excavation/grading only | 835000 |
| Both | 875000 |
| Approved zero gravel, labor, or both | 763000 |
| Invalid/unclassified zero | Review, no instant price |
| Price options: gravel / both / labor | 803000 / 875000 / 835000 |
| Difficult access, markup and materials-only tax | 1232760 |
| Both plus travel fee | 885000 |
| Owner minimum | 1000000 |

No arithmetic, quantity, depth, compaction allowance, waste, access, tax, fee,
minimum, joint-layout, supplier-load, readiness or approval code changed.
The engine version is unchanged. Historical saved responses replay their
original words and money exactly, with byte-identical stored internal results.
New requests under the same current approval receive corrected disclosure;
saved rates and the approval receipt remain identical.

Frozen evidence SHA-256:

- `before-monetary.json`: `ca64698ce1425f8be94dbdf3ba6ce0e1130e5763e923fe1e532c07f4c35331e9`
- `before-responses.json`: `3b8c0ba2f69ef49bddbcc0026bcd5d5c7ec293f89c710a3d7a294059f50898dc`

## Tests and verification

The new discovered test file has 54 regressions: 30 all-numeric comparisons,
12 saved widget cases, 8 real voice-tool dispatch cases, 2 saved-book zero
approval cases, and 2 genuine pre-change receipt replay cases.
Voice uses the application's real tool dispatch with synthetic sessions; it
does not test live speech recognition or call a provider.

Local Node 22.23.0 results (runs are separate; their counts are not summed):

| Command / evidence | Pass | Fail | Skip |
|---|---:|---:|---:|
| `node --experimental-test-module-mocks --test verification/qe-concrete-base-scope-20261018/capture-before.mjs` | 1 | 0 | 0 |
| Focused command below, `focused.tap` | 147 | 0 | 0 |
| `node --experimental-test-module-mocks --test verification/qe-concrete-base-scope-20261018/capture-after.mjs` | 1 | 0 | 0 |
| `npm run build`, `build.log` | Successful; no test counts | — | — |

```sh
node --experimental-test-module-mocks --test --test-reporter=tap \
  test/qeConcreteBaseScope20261018.spec.mjs \
  test/quoteConcreteLandscape20261016.spec.mjs \
  test/quoteConcreteLandscapeValidation20261016.spec.mjs \
  test/quoteConcreteLandscapeDelivery20261016.spec.mjs \
  test/qeSodScopeDisclosure20261018.spec.mjs \
  test/everytrade20261017.spec.mjs
```

This retains the existing concrete assertions, Agent B's sod tests, and all 43
frozen everytrade comparisons unchanged. No existing test, shared expectation,
fixture, workflow or dependency is edited. Before/after application captures
include the complete customer responses, not only the new sentences.

Local Chromium is unavailable in this environment (previous launch failures are
already disclosed). No successful local browser, strict or full run is claimed.
The existing hosted workflow provides a clean install, build, working Chromium,
browser regressions, strict quote gate and full suite. Its exact source SHA,
run URL and actual results are verified and delivered in chat after publication;
this pre-publication report does not anticipate their outcome.

## Specification and owner amendment

No specification file changes. The existing October 16 amendment already
replaced combined preparation with separately configured material and labor
prices (`verification/qe-concrete-landscape-20261016/REPORT.md` and `WORDING.md`).
This repair makes customer scope accurately reflect that existing arithmetic.

The current owner's explicit wording supersedes the complete-package implication
of `specs/voice_quote_flows.md:314-316` and the patio inheritance at line 324 when
only one separate component is priced. `specs/quote_engine_v2.md:967-969` and
`:1014-1015` describe the legacy combined package: it is preserved when no separate
price is configured, and its previously approved separate-price departure is
unchanged. The blanket depth wording recorded in the October 16 wording report
is narrowed to a material-quantity assumption. There is no new pricing-policy
departure, no additional review gate, and no measured real-world accuracy claim.

No main merge, deployment, engine-version change, live call or customer-data
operation is part of this work.
