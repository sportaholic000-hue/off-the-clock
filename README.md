# Off The Clock AI

AI phone operator and QuoteDone quoting platform for home-service businesses.

## Start here

1. Read [AGENTS.md](AGENTS.md) and the current summary at the top of
   [BUILD_STATUS.md](specs/BUILD_STATUS.md).
2. Use the [repository map](#repository-map) below to locate active source and tests.
3. Use the [documentation index](docs/README.md) for specifications and dated
   records, and the [verification index](verification/README.md) for evidence.

**Branch warning:** `main` and the October repair candidate are different
checkpoints. A passing historical report does not establish that the current
checkout or deployment has passed. Confirm the branch and commit before auditing.

## Repository map

| Location | Purpose |
| --- | --- |
| [specs/](specs/) | Governing specifications, recorded owner amendments, build plan and checkpoint history. |
| [server/quote-engine-vnext/](server/quote-engine-vnext/) | Active measured quote engine, contracts, exact arithmetic, readiness and scope pricing. |
| [server/src/quoteDoneBridge.js](server/src/quoteDoneBridge.js) | Application boundary for owner pricing, saved approvals, customer definitions and quote calculations. |
| [server/src/quoteDoneRoutes.js](server/src/quoteDoneRoutes.js) | Quote/price-book HTTP routes and quote/lead submission persistence. |
| [server/](server/) | Price-book persistence, money conversion and shared pricing metadata; also retained legacy engine modules. |
| [server/src/](server/src/) | Application services and runtime entry point. |
| [client/src/](client/src/) | Owner app, price-book editor, quote controls and widget entry points. |
| [test/](test/) | Automated regression tests. Quote gate selection is defined in [scripts/testSelection.mjs](scripts/testSelection.mjs). |
| [verification/](verification/) | Dated reports, independent reproductions, logs and immutable source bindings. |
| [docs/](docs/) | Navigation, review handoffs and historical evidence. |
| [design-reference/](design-reference/) | Design references; these are not the running application source. |
| [site/](site/) and [deployment/](deployment/) | Site assets and deployment support. Their presence does not establish deployment acceptance. |

## Local verification

Use Node 22, matching the existing [CI workflow](.github/workflows/ci.yml), and
install the committed lockfile:

```sh
npm ci
npm run build
```

The existing browser tests require Playwright and Chromium. CI installs them
without changing the project's dependency lockfile:

```sh
npm install --no-save --no-audit --no-fund playwright@1.56.0
npx playwright install --with-deps chromium
npm run test:quote
npm test
```

`test:quote` requires zero failures. `npm test` runs the broader suite and its
existing known-failure checker; a successful checker is not a claim of zero raw
test failures. Read the actual summary and the dated evidence.

The five original audit findings and their added boundary controls are also
available as one focused run (these 35 cases are included in `test:quote`):

```sh
node --test verification/independent-followup-20261004/verify.mjs
```

It preserves the original missing-minimum performance case and valid tier
controls. See the [follow-up result](verification/independent-followup-20261004/README.md)
for before/after evidence. No launch or deployment approval is implied.
