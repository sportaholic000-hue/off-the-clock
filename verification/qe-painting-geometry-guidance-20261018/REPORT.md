# Painting geometry guidance — 2026-10-18

Prepared personally by Codex (GPT-6), without delegation.

## Scope and source

Base: `1857b7779b83b70f7753b41b72c3677270cd4ffc`.
Review branch: `codex/qe-painting-geometry-guidance-20261018`.

The sole production change is customer help/details in
`server/quote-engine-vnext/surfacePricing.js`. The owner's exact Oct 18 text
is added to the interior measurement-method selector and room-entry field:

> Room dimensions assume a rectangular room, one wall height and a flat ceiling. For sloped ceilings, irregular rooms or walls with different heights, enter the measured wall and ceiling surface areas directly.

The existing method-change/gable guidance is retained verbatim. Exterior and
siding help is unchanged. There are no calculator, price, input-validation,
engine-version, voice implementation, contract implementation, dependency,
workflow, specification or receipt implementation changes. Generated
`client/dist/index.html` differences from the build were recorded and restored.

## Requirements read and applicability

Read AGENTS.md, BUILD_STATUS.md, the interior-painting sections of
`quote_engine_v2.md`, applicable `QUOTE_TRADE_DECISIONS_20261003.md` and
launch/audit amendments, relevant platform/voice sections, and the Oct 10/11
owner-ruling/wording approvals. The existing Oct 16 surface implementation
and its regressions establish the current room/opening method. Earlier
direct-measurement-only wording is already superseded by that method; this
change clarifies its eligibility under the owner's exact Oct 18 instruction.
No additional specification departure or policy change is introduced. In
particular, the existing vaulted category remains a labor-height treatment,
not evidence of a sloped ceiling, and no pitch multiplier or new refusal is
introduced. No phase gate or specification update is claimed.

## Independent verification

`EXPECTED.md` was written before execution, with arithmetic calculated
independently of the implementation. The new regression file verifies:

- rectangular gross walls 384, flat ceiling 144 and net wall paint 334 sqft;
- equivalent eligible direct inputs: equal quantities and 110,652 cents;
- each room's own dimensions and owner height bands: 119,750 cents;
- explicitly measured ceiling 180 sqft via direct input: 113,604 cents;
- vaulted labor category retaining flat dimensional ceiling144: 132,012 cents;
- existing contradictory-input refusal;
- actual React widget help rendered at selection and entry, and direct entry;
- the real voice runtime's matchService question contract, including guidance,
  choices and row fields without private rates;
- unchanged synthetic persisted receipt replay after changing current prices.

A Chromium test additionally checks visibility and direct-entry interaction
using the same actual widget components. It uses the repository's existing
hosted Playwright setup. Its local attempt failed at missing Playwright;
browser assertions are NOT RUN locally. Hosted execution is required.
JSDOM checks are described as JSDOM, not as browser-launch evidence.

## Local checkpoint

Runtime: Node 22.23.3, npm 11.9.0, Git 2.51.1, Linux.
All commands ran from the repository root. Node22's bin directory was
prepended to PATH. No live provider was configured or contacted.

| Command | Outcome |
| --- | --- |
| `npm ci` | Exit0; added328 packages; complete output in npm-ci.log |
| `npm run build` | Exit0; owner app and widget production build; build.log |
| New file, first execution | Exit1 before loading tests: `/tmp` absent; pass0/fail1/skipped0; original source and output retained |
| New file with explicit scratch TMPDIR | Exit0; tests10/pass10/fail0/cancelled0/skipped0/todo0; new-tests-tmpdir.tap |
| Focused five-file regression run | Exit0; tests82/pass82/fail0/cancelled0/skipped0/todo0; focused.tap |
| Later five-file check including new Chromium/quantity assertions | Exit1; tests83/pass81/fail2/cancelled0/skipped0/todo0; focused-final.tap; complete source retained |
| Corrected quantity assertion, affected test only | Exit0; tests1/pass1/fail0/cancelled0/skipped0/todo0; quantity-correction.tap |

The first command was:

```
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/qePaintingGeometryGuidance20261018.spec.mjs
```

It failed at fixture initialization with ENOENT creating
`/tmp/otc-pricebook-test-XXXXXX`; no application assertion ran. The affected
command was rerun with
`TMPDIR=/workspace/scratch/63b8cb6aa9ed/guidance-tmp`. No source/assertion
change was made to resolve that environment failure. `new-tests-first.source.mjs`
and `production-first.diff` preserve the executed source and production diff.
The later quantity assertion initially expected material coat quantities
before waste (668 and144), while the actual receipt correctly records
waste-adjusted quantities (734.8 and158.4). This was an invalid new assertion,
not an application defect. Its first output and executed source are retained
in `focused-final.tap` and `focused-final.source.mjs`. Only that newly added
assertion is corrected. All physical area and monetary expectations remain
unchanged. The same command's negative name filter matched the parent file
and did not exclude Chromium; that case failed to import missing Playwright
before any browser launched. Neither failed command is described as passing.

Focused command (same explicit TMPDIR):

```
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap --test-concurrency=1 test/qePaintingGeometryGuidance20261018.spec.mjs test/surfacePricing20261016.spec.mjs test/surfacePricingLaneCFixes20261016.spec.mjs test/surfacePricing20261016.dom.spec.mjs test/voiceSurfacePricing20261016.spec.mjs
```

The 82-test run preceded addition of the separate Chromium case. The
affected corrected quantity check is recorded in `quantity-correction.tap`.
Full/strict local suites are not claimed. Exact-commit hosted `npm run test:quote` and
`npm test`, including the new Chromium case, must be inspected before final
delivery. Their run URL, SHA, counts and outcome are returned directly in the
final chat; this committed document records the pre-publication checkpoint.
Conditional release-candidate-only steps do not count as passing checks for
this review branch. Existing regression execution is not represented as
independent reconstruction of every historical defect.

## Limits

Help text explains eligibility. It does not detect actual customer geometry,
verify measurements, infer a ceiling's slope from a height category, prove
speech recognition, or automatically change scope. Voice verification tests
the actual tool question/quote contract with synthetic text, not live audio.
Synthetic receipt replay plus unchanged receipt/engine source does not claim
inspection of customer production records. No historical restore campaign,
live provider operation, deployment, merge or tag is part of this task.

Complete first outputs are retained as plain files, not a new evidence archive.
`source-identity.json` records source hashes against the base; `SHA256SUMS`
inventories the checkpoint evidence. Hosted logs remain separately available
from GitHub Actions on the published commit.
