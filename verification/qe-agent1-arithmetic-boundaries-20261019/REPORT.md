# Arithmetic boundary audit — confirmed defects remain unfixed

Audited exact published checkpoint **abc2becff9cd252a63ff30258e9950a07af2c020**.
Branch: **codex/qe-agent1-arithmetic-boundaries-20261019**.
Only this new verification directory changes. No production code, existing test,
fixture, price, policy, version, workflow, selector or dependency manifest changes.
No subagents, integration/main writes, deployment, real customer data or providers.

Two distinct defects reproduce. These are observations and exact reproductions,
not a repair assignment or an owner-policy change. Both reach current approved
saved widget results and the actual voice-tool result.

## AB1 — footprint quantity half-ties round down, sometimes dropping a package

Cause: `templates.js:542`, `scopePricing.js:130`, `contracts.js:1348` use native
`Math.round(footprint * Math.sqrt(1 + (rise / 12) ** 2) * 100) / 100`.
At5:12, the mathematical factor is exactly13/12. Native evaluation can fall
below an exact .005-square-foot tie before the authorized .01sqft rounding.
The downstream exact cent/package arithmetic receives an already-wrong area.

Reproduce with `roof-package-0280` (complete synthetic input in direct-final.json.gz):
- Footprint2584.62sqft, rise5, whole roof/up-to-six pitch,1story,1existing layer,
  simple shape, adopted rules, zero waste/fees/seasonal/markup/minimum/tax/buffer.
- Labor10000c/square; field material, tear-off and disposal each100c/square.
- Underlayment cost purchase:400sqft/roll,15000c/roll, zero waste; scope confirmed.
- Exact surface2584.62 x13/12 =2800.005 -> **2800.01sqft**.
- Expected labor280001c; material2800c; removal2800c; disposal2800c;
  ceil(2800.01/400)=8rolls x15000=120000c. **Total408401c ($4084.01)**.
- Actual surface2800.00; labor280000c;7rolls105000c; **393400c ($3934.00)**.
- **Underquote15001c ($150.01)**. This uses a two-decimal footprint and ordinary
  whole package coverage, not machine-epsilon customer measurements.
- Below2584.619999: expected/actual393400c. Above2584.620001:
  expected/actual408401c. At the tie, the quote should already be at the latter.

Additional installed-underlayment controls: footprint600.06/1200.06/12000.06
at5:12 each underquotes by1c;600.059999 and600.060001 match. Another proposed
amplification at1384.62/500sqft happens to round correctly in binary and passes;
it is not a defect. All nine package probes and24 footprint probes are retained
(including6 correctly rejected below-minimum roof inputs).

This differs from repaired F1: subtraction factors and separate-line rounding
are unchanged. Existing roof-underlayment tests cover12:12 conversion and coarse
package neighbors707.105/707.111, not this5:12 exact tie. No matching reproduction
was found in the checkpoint tests/reports. Existing exact-roof tests still pass.

## AB2 — square-root rounding hides a required concrete joint span

Cause: `concreteLandscapePricing.js:62` converts area to a Number and takes
`Math.sqrt` before deciding `ceil(side / spacing)`. The root of an area strictly
above100 can round to exactly10. The later exact ceiling cannot recover that
side-of-boundary information. The configured span policy itself is unchanged.

Reproduce `concrete-square-joint-0047`, for patio or driveway (complete input in
JSON): measured area/perimeter, area100.00000000000001sqft, perimeter100LF,
4in thickness, broom, easy access, no base/demolition/reinforcement/adjoining
edges; no order increment/waste/fees/markup/minimum/tax/buffer. Labor1c/sqft,
concrete324c/yd, formwork100c/LF. Control joints excluded, spacing10ft,
saw-cut100c/LF.

Mathematically sqrt(area)>10, so one cut in each direction is required:
2*sqrt(area) rounds to20.00LF by the approved .01LF allowance rule.
Expected saw cuts2000c; base500c plus formwork10000c => **12500c**.
Actual root10, no cuts, **10500c**. **Underquote2000c ($20)**.
At400.00000000000006sqft the allowance should80LF but is40LF:
expected20000c, actual16000c, **$40 underquote**. Both trades reproduce.

Business limitation: these are immediately adjacent representable numbers with
unusually fine measurement precision. Ordinary100.0001sqft and rectangular
10.0001ft controls pass. The supported API/voice-tool inputs accept the finer
values and both paths preserve them, but no normal homeowner measuring practice
or browser-entry frequency is asserted. This is an arithmetic boundary defect,
not a request to change the authorized spacing limit, square approximation or
quantity rounding rule. Existing600sqft square-allowance and rectangular tests
pass; they do not exercise this immediate-above threshold.

## Verification and reproducibility

- **287 independent comparisons:279 matched,8 mismatched** across all20 registered
  trades. The279 include6 intentional below-minimum roof review controls;273 are
  successful matching quotes.8 mismatches comprise4 AB1 and4 AB2 manifestations.
- **14/14 delivery-observation tests**:8 defects +6 adjacent controls. These tests
  verify propagation of the observed amounts, not correctness of defective prices.
  All8 retain the same mismatch through direct engine, saved widget submit and
  actual voice matchService/getQuote dispatcher. No private rates leak in the
  public results; no messages sent. Synthetic books/approvals remain identical;
  receipts survive idempotent replay and later unrelated book/quote writes.
- Existing regressions first run: **278/279**, one SQLITE_CORRUPT error in the
  underlayment historical-replay test. Whole unchanged22-test file rerun in a
  fresh process: **22/22**, including that test. First failed output retained.
- Additional existing regressions: **176/176**, no failures/skips/cancellations/
  TODOs. Includes shared seasonal rounding, minimum ordering, surface/height
  conversion and landscape quantities. Counts overlap; do not sum reruns.
- Genuine v10 historical widget/voice replay and explicit v11 reapproval tests,
  v9 exact-subtraction historical receipt tests and all136 roof-zero regressions
  were run unchanged. Frozen source/fixtures remain byte-identical to abc2.
- First comparison208/272 and second comparison268/287 are retained with exact
  fixture sources. FIRST_RUN_TRIAGE.md identifies harness mistakes and the one
  nonrepresentable decimal oracle mistake; no observed engine amounts were used
  to redefine business expectations. Initial oracle was committed before tests.
- Node22.23.3 cold npm ci passed. No local full/strict/browser/build/Docker audit
  gate is claimed. This verification-only branch changes no production source.
  Hosted branch CI, if reported, is separately identified by exact published SHA.

Run from repository root with Node22 and writable TMPDIR:

```sh
python verification/qe-agent1-arithmetic-boundaries-20261019/prepare-expectations.py
python verification/qe-agent1-arithmetic-boundaries-20261019/prepare-followup.py
node --import ./test/pricebookTestEnv.mjs verification/qe-agent1-arithmetic-boundaries-20261019/compare.mjs direct-final.json.gz
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap verification/qe-agent1-arithmetic-boundaries-20261019/delivery.spec.mjs
```

The comparison emits mismatches as data; its process exit does not mean prices
passed. The delivery test intentionally confirms observed propagation. See
INVENTORY.md for reviewed paths, existing test references and precise untested
areas. F2 remains the already-documented unresolved policy question; it is not a
new defect and no policy is inferred here. A2/Agent3 work stays with those owners.
