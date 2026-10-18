# Roof underlayment footprint correction

Exact parent: `550728daea4058c37f13952ab78785929bab39b0`.
Review branch: `codex/qe-roof-underlayment-20261018`.

## Reproduction and change

Expected values were written in `EXPECTED.md` and the regression before the
production edit. The Node 22 baseline (`before-node22.tap`) has 4 tests,
0 pass / 4 fail / 0 skipped: new and adopted full footprints bought four rolls
instead of five; their half-roof requests bought two instead of three.
The earlier Node 24 reproduction in `before.tap` has the same four failures.

`scopePricing.js` now repeats the existing approved roof replacement conversion
only for `roofing_replacement_20261016` new/adopted footprint inputs. Surface is
rounded to 0.01 sqft before percentage selection. Explicit partial surface area
takes precedence at the scope boundary. The existing request validator still
rejects contradictory partial-area/percentage pairs. Neither scope purchase
waste nor package rounding changes. No contracts import or dependency cycle is
introduced. Measured surface, legacy, installed-area underlayment, owner rates,
declared included zeros and unrelated trade scopes retain their behavior.

At 1500 sqft / 12:12, 2121.32 sqft surface requires 5 rolls / 75000 cents;
half requires 3 rolls / 45000 cents. The same measured-surface requests agree.
Additional controls cover explicit 800 sqft, the 1000.00/1000.01-sqft surface
rounding boundary, markup/material tax, installed-area prices and zero inclusion.

## Approval and historical evidence

Both engine/runtime literals advance to
`quote-engine-vnext-accuracy-20261018-v8`. Existing global approval checks are
unchanged: new customer quotes require explicit owner reapproval after this
arithmetic change. Starting-value adoption and price confirmation rules are not
changed; owner prices are never overwritten or auto-approved.

`historical-v7.json` is a genuine synthetic saved book and widget-route receipt
captured before production edits with `capture-v7.mjs`. The capture script
refuses any version other than v7. The regression inserts that fixture into
isolated test storage, observes stale approval/review, explicitly approves the
saved book, and verifies corrected widget-route and voice-tool amounts. Original
receipt retries and persisted internal outcome/quote JSON remain byte-identical
before and after reapproval. No live business data or provider operation is used.

The new test file is discovered by the existing full and quote runners. No
runner/workflow change is needed. Existing test edits are restricted to the
three authorized live-version expectations; the startup guard additionally
checks that v7 is now refused. Existing dollar assertions and historical v7
fixtures elsewhere remain unchanged.

## Verification at publication

Runtime: Node 22.23.0, matching CI's Node 22 major.

- Clean `npm ci`: success, 328 packages added.
- `npm run build`: success.
- Playwright 1.56.0 package installation: success.
- Chromium install: failed (download/unpack/lock failure); launch probe reports
  a missing headless-shell executable. No local browser pass is claimed.
- Focused six-file run in `focused.tap`: tests 110; suites 0; pass 110;
  fail 0; cancelled 0; skipped 0; todo 0. Includes the new 21 regressions,
  existing roofing/scopes, approval-version checks, production startup and
  backup/restore rehearsal.
- Earlier new-test development runs: `after-first.tap` 21 tests, 8 pass / 13
  fail / 0 skipped; `after-second.tap` 21 tests, 20 pass / 1 fail / 0 skipped.
  Corrections were test plumbing: option-record location, valid scope inputs,
  estimated-caller flag and disabled synthetic booking policy. No expected
  price was changed to accommodate a production result.

Focused command:

```sh
node --experimental-test-module-mocks --test --test-reporter=tap \
  test/qeRoofUnderlaymentAccuracy20261018.spec.mjs \
  test/quoteRoofing20261016.spec.mjs test/measuredScopes.spec.mjs \
  test/quoteReviewFixes.spec.mjs test/releaseProductionEngineGuard.spec.mjs \
  test/backupRestoreRehearsal.spec.mjs
```

Local strict/full runs and exact pushed-commit hosted CI are reported directly
in the delivery message. This file records the checkpoint before those runs
finish; it does not claim they passed. Counts from separate runs must not be added.

## Boundaries

No new customer/owner label, specification change or pricing policy is added.
The owner-authorized footprint calculation and approval-version rule are applied
consistently; no additional spec departure is introduced. `templates.js`,
`contracts.js`, intake/disclosure/voice presentation, dependencies and workflows
are unchanged. No main merge, deployment or live call/data operation.
Voice evidence uses the actual tool dispatcher with synthetic inputs, not speech
recognition or a live model. Passing these tests does not measure job accuracy.
