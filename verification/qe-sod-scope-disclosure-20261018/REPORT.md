# QE sod scope disclosure verification — 2026-10-18

## Scope and baseline

- Base and parent: `550728daea4058c37f13952ab78785929bab39b0`.
- Review branch: `codex/qe-sod-scope-disclosure-20261018`.
- The branch does not change the quote-engine version, prices, formulas,
  readiness, result types, approvals, or selection behavior.
- Production changes are confined to the sod preparation label in
  `contracts.js` and disclosure assembly inside `calculateSod` in
  `templates.js`.

## Reproduction before the repair

The new regression was written from `EXPECTED.md` and run against the base
before production code changed. Result: 7 tests, 1 pass, 6 fail, 0 skipped,
cancelled, or TODO.

The arithmetic controls passed. Split topsoil-only and grading-only quotes
still exposed the broad price driver `Existing-ground preparation included`,
with no identification of the missing preparation components. The same claim
crossed the saved widget/application response and real voice tool. The
structured customer fact was labelled `Ground preparation included`.

## Repaired disclosure

For split preparation only:

- the request fact and price driver say `Ground preparation requested`;
- every configured split rate, including an explicitly approved zero/included
  rate, appears under `Included ground preparation`;
- every absent split rate appears under `Excluded ground preparation`, followed
  by the separate on-site-estimate sentence;
- configured topsoil with a confirmed zero depth deficit says
  `No imported topsoil is needed for the supplied depth.` and is not treated as
  an unpriced exclusion; and
- an unclassified numeric zero remains invalid and cannot authorize free work.

Component order and names are fixed as old-lawn removal and disposal, grading,
and imported topsoil. Legacy combined preparation and no-preparation output are
unchanged. Separate project-debris disposal remains a distinct scope.

## Independent money controls

| Scenario | Expected | Observed |
|---|---:|---:|
| No preparation | 205,000 cents | 205,000 cents |
| Legacy combined preparation | 355,000 cents | 355,000 cents |
| Topsoil only | 214,259 cents | 214,259 cents |
| Grading only | 295,000 cents | 295,000 cents |
| All three split components | 404,259 cents | 404,259 cents |
| Unknown depth, two-inch allowance | 223,519 cents | 223,519 cents |
| Confirmed zero topsoil deficit | 205,000 cents | 205,000 cents |
| Three approved zero/included split rates | 205,000 cents | 205,000 cents |
| Grading plus separate debris disposal | 305,000 cents | 305,000 cents |

## Behavioral coverage

The focused regression covers direct engine calculation and complete customer
sanitization; saved book, reload, approval, application preparation and widget
submission; real voice tool projection; exact replay of a frozen historical
customer response; no-preparation and legacy combined behavior; partial and
full split preparation; missing, approved-zero and unclassified-zero rates;
zero topsoil deficit and unknown-depth allowance; and separate project-debris
disposal. Sanitized widget and voice assertions reject private rate paths and
raw owner prices.

## Local verification

- `npm ci`: passed; 328 packages installed from the lockfile.
- `npm run build`: passed; owner build 1,669 modules and widget build 1,624
  modules. Generated `client/dist` changes were not retained.
- Focused regression: 7 tests, 7 pass, 0 fail, 0 skipped/cancelled/TODO.
- Neighboring quote regressions: 172 tests, 172 pass, 0 fail, 0
  skipped/cancelled/TODO.
- `npm run test:quote`: 4,904 tests, 4,781 pass, 123 fail, 0
  skipped/cancelled/TODO. Its 121 direct failures were Chromium browser cases
  after the local Chromium process exited with `SIGTRAP`; two aggregate gate
  failures followed. All completed non-browser tests passed.
- `npm test`: 5,886 tests, 5,762 pass, 124 fail, 0
  skipped/cancelled/TODO. Its 122 direct failures were browser cases affected
  by the same local Chromium `SIGTRAP`; two aggregate gate failures followed.
  The seven new sod regressions passed in this full selection.

Hosted CI on the exact pushed commit is the required browser evidence and is
reported in the delivery response. No local Chromium pass is claimed.
