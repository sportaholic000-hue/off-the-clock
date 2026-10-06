# Quote engine and price book: audit entry point

Audit one pinned commit on `codex/quote-release-candidate-20261006`.
The candidate combines engine core v7, the voice quote path and website price
drafts. `main` is a separate historical branch. This document does not identify
the deployed commit or authorize deployment.

Start with [current verification](../specs/BUILD_STATUS.md) and the
[pinned inputs, decisions and expected amounts](../specs/QUOTE_RELEASE_CANDIDATE_20261006.md).
The engine version is `quote-engine-vnext-date-context-20261006-v7`.

## Production paths

- Measured owner/customer/widget requests enter `server/src/quoteDoneRoutes.js`.
  Voice uses the adapters in `server/src/voice/voiceToolRuntime.js`. Both use
  `server/src/quoteDoneBridge.js` for saved identity, dollar/cent conversion,
  current owner approval, date context, readiness and sanitized output.
- The bridge calls the single measured engine in `server/quote-engine-vnext/`.
  Its `engine.js` orchestrates calculations; `templates.js` supplies service
  formulas; `contracts.js` validates measurements and configuration;
  `priceBook.js` computes readiness; `exactMath.js` implements exact arithmetic.
- `server/priceBookService.js` owns persistence and durable writes.
  `priceBookStructure.js` checks storage containers and service UUID syntax.
  Pricing readiness stays in the engine: incomplete drafts remain editable.
- Shared scope/price schemas live in `server/scopeConfiguration.js`,
  `installedPriceConfiguration.js`, `priceBookMoney.js`, `pricePrecision.js`,
  `priceBookCopy.js` and `interviewConfiguration.js`. Owner controls live in
  `client/src/pricebook*`, `quoteDoneControls.jsx`, `scopeEditor.jsx` and
  `offeringEditor.jsx`.
- Fixed owner-entered or website-listed prices are saved knowledge, not another
  arithmetic engine. `server/src/websitePriceImport.js` fetches only during an
  explicit owner draft request. `knowledgeDraftRoutes.js` never persists a draft;
  the owner must save. Calls use saved facts and never browse the website.

There are no production `server/quoteEngine.js` or `server/quoteTemplates.js`
files. Their historical copies under `test/legacy/` exist only for regression
tests. Do not count historical fixture behavior as the active engine's behavior.
The strict gate rejects production legacy imports or direct engine calls outside
the bridge. The approved fence-height display helper is its sole non-calculating
engine-import exception.

## Rules and evidence

The engine specification and dated owner amendments remain authoritative;
this map adds no pricing policy. Begin with `specs/quote_engine_v2.md`, follow its
amendments, then the October 5 launch decisions, core repair expectations and
October 6 date-context decisions linked in the release record. Fresh v7 approval
is required where older arithmetic approvals are stale. Never auto-approve or
fill missing owner prices to make a service live.

Use Node 22 and the committed lockfile:

```sh
npm ci
npm run build
npm install --no-save --no-audit --no-fund playwright@1.56.0
npx playwright install --with-deps chromium
npm run test:quote
npm test
```

`scripts/testSelection.mjs` selects tests, including the nested engine tests.
The strict gate requires every selected file and test to complete, with zero
failures, cancellations, skips or TODOs. The broader suite has an empty
known-failure allowance. Read the actual counts and tested SHA in BUILD_STATUS;
reports attached to other SHAs remain historical evidence.

Targeted release regressions are `test/quoteReleaseStorage.spec.mjs` and
`server/quote-engine-vnext/tests/releaseDiagnostics.spec.mjs`, plus
`test/voiceQuoteDateIntegration.spec.mjs`. Website and voice
acceptance tests remain in `test/websitePrice*` and
`test/voiceQuotePathRegression20261005.spec.mjs`. No tests use live business data.
