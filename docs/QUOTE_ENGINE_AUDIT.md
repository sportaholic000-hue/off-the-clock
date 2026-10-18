# Quote engine and price book: current audit navigation

This page is the navigation boundary for audits as of **2026-10-18**. It
distinguishes an independently checked integration baseline from later scoped
work and from historical release records. It is not a deployment record and
does not authorize a merge, tag, launch or production change.

## Pinned checked baseline

The current independently checked integration baseline is:

- branch: `codex/qe-accuracy-next-integration-20261018`
- commit: `0b59a401e1d8f2c2c43188c7355abb9939504b9b`
- engine: `quote-engine-vnext-accuracy-20261018-v9`
- hosted run: [39112240027](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39112240027)
- recorded outcome: install, owner/widget build, browser gate, strict quote gate,
  full suite and failure checker passed; the full suite recorded 6,153/6,153
  passes with zero failures, cancellations, skips or TODOs.

That pin says what was checked. It does not say the commit is on `main` or is
deployed. A descendant or side branch needs its own exact-head result.

The restored-service implementation at
`8aae4f4ea90047bc0ea841853a93415f5d2ef232` was independently checked on its
own branch at child commit `d4f9394a0836ad007d50b2c33d6ffe56b4e4ea03`,
hosted run [39157530021](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39157530021): all recorded gates passed and the full suite recorded
6,025/6,025 passes. The child changes only a CI timeout. A scoped branch that
merges the implementation parent but excludes that workflow child must still
qualify its own exact head; the earlier run is restoration evidence, not a
combined-branch result.

Scoped work should keep its evidence under its named `verification/` directory.
For the Agent 3 F6/F14/F18/F19/F25 branch, use
[`verification/qe-agent3-scope-presentation-20261018/`](../verification/qe-agent3-scope-presentation-20261018/).
Until that directory and the remote checks identify a final SHA, the branch is
pending and must not be described as integrated or deployed.

## Active production paths

- Widget and owner quote requests enter `server/src/quoteDoneRoutes.js`; voice
  uses `server/src/voice/voiceToolRuntime.js`. Both reach saved identity,
  approval, date context, readiness and customer sanitization through
  `server/src/quoteDoneBridge.js`.
- The measured engine is `server/quote-engine-vnext/`: `engine.js` orchestrates
  results, `templates.js` supplies service formulas, `contracts.js` validates
  measurements and owner configuration, `priceBook.js` computes readiness, and
  `exactMath.js` supplies exact arithmetic.
- `server/priceBookService.js` owns price-book persistence. Shared configuration
  and presentation boundaries include `server/scopeConfiguration.js`,
  `server/installedPriceConfiguration.js`, `server/priceBookMoney.js`,
  `server/pricePrecision.js`, `server/priceBookCopy.js`,
  `server/src/quoteScopeDisclosure.js` and `server/interviewConfiguration.js`.
  Owner/widget presentation lives under `client/src/`.
- Website-listed or owner-entered prices are saved knowledge, not a second
  calculator. `server/src/websitePriceImport.js` fetches only for an explicit
  owner draft request; the owner must save and approve the result.

There are no production `server/quoteEngine.js` or `server/quoteTemplates.js`
files. Copies under `test/legacy/` are historical regression fixtures. Do not
treat their behavior as the active engine. The strict gate enforces the current
bridge/engine boundary.

## Governing rules and exact-head verification

`specs/quote_engine_v2.md` and its recorded amendments remain authoritative;
this page adds no pricing or approval policy. `specs/BUILD_STATUS.md` is a long
chronology. Its top October 7 heading is a historical checkpoint, not the
October 18 audit pin above. Dated reports support only the SHA they name.

Use Node 22 and the committed lockfile:

```sh
npm ci
npm run build
npm install --no-save --no-audit --no-fund playwright@1.56.0
npx playwright install --with-deps chromium
npm run test:quote
npm test
```

`scripts/testSelection.mjs` selects the strict quote/price-book set, including
nested engine tests and new tests that reach protected sources. The strict gate
requires zero failures, cancellations, skips and TODOs. The broader suite has an
empty known-failure allowance. Acceptance requires the command outcomes and
tested SHA from one exact-head hosted run; a local subset or a passing parent is
not a substitute.

## Historical records

The following remain useful history, but they are not the current audit target:

- October 6 v7 release inputs and decisions:
  [`specs/QUOTE_RELEASE_CANDIDATE_20261006.md`](../specs/QUOTE_RELEASE_CANDIDATE_20261006.md)
- October 6 branch integration record:
  [`specs/RELEASE_BRANCH_INTEGRATION_20261006.md`](../specs/RELEASE_BRANCH_INTEGRATION_20261006.md)
- October 7 release-integration and operational chronology:
  [`specs/BUILD_STATUS.md`](../specs/BUILD_STATUS.md)
- October 18 accuracy evidence:
  [`verification/qe-accuracy-integration-20261018/`](../verification/qe-accuracy-integration-20261018/)

Labels such as “release candidate,” “approved branch integration,” or “hosted
gates passed” inside those dated records apply only to their named branch and
SHA. None establishes current `main`, production deployment, or acceptance of a
pending scope branch.
