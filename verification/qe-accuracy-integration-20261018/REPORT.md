# Accuracy integration verification — 2026-10-18

All records used by these regressions are synthetic. This branch does not
merge to `main` or deploy.

## Exact integration

- Common base: `550728daea4058c37f13952ab78785929bab39b0`
- Roofing parent: `7ac06a8de224d2603d8a31a93ead6263eaac41e7`
- Sod parent: `fed6d8c704d2286a15ff6a63b3d698adc0983c62`
- Merge commit before the integration-only regression commit:
  `27bee76421650aee700d3dba9b2fd26552afb045`
- The merge completed without conflicts. No incoming implementation, test, or
  frozen fixture was edited while merging.
- `server/quote-engine-vnext/engine.js` and `server/src/runtimeConfig.js` both
  retain `quote-engine-vnext-accuracy-20261018-v8`.

The exact parent CI runs were verified successful before the merge:

- Roofing: <https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39095348666>
- Sod: <https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39093891078>

## Genuine v7 sod history

`historical-sod-v7.json` was captured by executing
`capture-sod-v7.mjs` from a detached checkout of the exact common-base commit,
not by modifying a v8 response. The fixture is synthetic and has SHA-256:

`97b96815fdab7a3dadb144196171f23241b381fcb97b95451a9c071878d10b76`

It contains a 214,259-cent response from
`quote-engine-vnext-date-context-20261006-v7` with the original broad
`Existing-ground preparation included` driver. The integration regression
proves that read and unchanged save do not renew its approval, explicit owner
reapproval is required, and retries preserve the original response and stored
outcome exactly before and after that reapproval.

## Integration regressions

Expected cents and wording were recorded in `EXPECTED.md` before execution.
The new file contains four tests:

1. full-footprint roofing: five underlayment rolls, 75,000 cents for that line,
   616,148-cent total, identical through saved widget and voice-tool paths;
2. half-footprint roofing: three rolls, 45,000 cents for that line,
   315,575-cent total, identical through both paths;
3. sod topsoil-only preparation: 214,259 cents with explicit included and
   excluded components through both paths and no private rate leakage;
4. genuine v7 approval staleness, explicit reapproval, and exact historical
   retry replay.

The integration-focused run, including both incoming regression files and
neighboring approval, storage, version, roof, and sod suites, completed:

- 10 files
- 145 tests
- 145 passed
- 0 failed, cancelled, skipped, or TODO

## Local gates

- Node: 22.23.3
- `npm ci`: passed (328 packages)
- `npm run build`: passed (owner and widget production bundles)
- `npm install --no-save --no-audit --no-fund playwright@1.56.0`: passed
- `npm run test:quote`: 4,930 tests; 4,807 passed; 123 failed; 0 cancelled,
  skipped, or TODO. Every failed test belonged to one of the 32 Chromium
  browser files. Chromium and its headless shell both exit with `SIGTRAP`
  before a page opens in this restricted local container. The complete hosted
  run on the final SHA is therefore the acceptance evidence for browser,
  strict, and full-suite gates.

Generated `client/dist` output was restored after the build and is not part of
the integration commit.
