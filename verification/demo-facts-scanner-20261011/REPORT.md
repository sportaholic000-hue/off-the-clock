Local Chromium cannot launch: browser checks are NOT RUN locally. All 81 new tests pass locally, and hosted CI for the source commit passes every required gate.

# Public demo facts and owner-query scanner — 2026-10-11

## Base, scope and publication

`git ls-remote` confirmed `refs/heads/claude/release-candidate-20261011h` at
`c5487b1eab00d4944dd3a53a7264898adb758cde` before creating
`fix/demo-facts-scanner-20261011`. The candidate branch was not merged or changed.

Read first: `AGENTS.md`, `specs/BUILD_STATUS.md`, the Starter and staff-login
verification directories dated 2026-10-09, and
`verification/forwarding-on-off-20261009/REPORT.md`. No specs or public website
pages were edited. All fixtures and provider responses used for verification
were synthetic. No subagents were used.

The demo checkpoint was published first as
`a6c4581a7f4a40e6707141b3f29cb3d9176e643d`, after its focused tests passed.
The scanner checkpoint followed as
`00268ddf2a2d8641c440b2277738314a5dd8d9c2`, after all 80 coverage cases passed.
Final review then reproduced shadowed computed-key bypasses and published their
fix as `c722778902bd1132d3c78575c091cc522414f229`, after 88/88 scanner tests passed.
All checkpoints were independently confirmed using `git ls-remote` and fetched
tree comparisons. Shell `git push` could not authenticate (`could not read Username
for 'https://github.com': No such device or address`), so publication used the
connected GitHub Git API. Each remote tree matched the local Git index exactly,
and the local branch was aligned to the fetched remote commit.

The sole workflow change adds this exact branch to the existing CI push filter
(`.github/workflows/ci.yml:4`), so the requested hosted gates run on it. No gate,
assertion, route inventory or exception allowance was removed or relaxed.

## Demo facts shipped: before → after

The complete approved wording is also recorded in
`verification/owner-wording-approval-20261011-demo.md`.

### Answering control — `server/src/demo/demoInstructions.js:35`

Before: “After forwarding is set up, the dashboard master toggle controls whether
the receptionist answers: on means the receptionist answers; off means the
business handles its calls. Carrier forwarding settings are separate from this
toggle.”

After: “To stop answering, the owner turns off call forwarding on their phone.
There is no on/off switch in the dashboard.”

All other setup instructions remain unchanged.

### Starter — `server/src/demo/demoInstructions.js:29`

Before: no Starter plan line.

After, verbatim:

> - Starter plan, $69 per month, 150 included minutes: 24/7 answering, transcripts and lead capture, owner alerts in the dashboard and by email, owner-managed spam filtering, one number and one owner login. Starter does not include booking, live transfer, the Price Book, the website quote widget or quoting by phone.

### Operator — `server/src/demo/demoInstructions.js:30`

Before: “one seat”; no Price Book or website quote widget in its feature list.

After, verbatim; the rest of the previous line is retained:

> - Operator plan, $119 per month, 300 included minutes: 24/7 answering and booking, calendar connection and customer records, transcripts and lead capture, owner alerts in the dashboard and by email, live transfer, owner-managed spam filtering, one number, an owner login plus one office-staff login, a quote-request counter, webhooks and CSV support, the Price Book and a quote widget for their website.

### QuoteDone — `server/src/demo/demoInstructions.js:31`

Before: everything in Operator plus phone quoting **and** a website quote widget.

After, verbatim:

> - QuoteDone plan, $279 per month, 1,200 included minutes: everything in Operator, plus quoting by phone from the owner's own prices.

### Annual billing — `server/src/demo/demoInstructions.js:32`

Before: “both plans”; only Operator $1,190/year and QuoteDone $2,790/year.

After, verbatim:

> - Annual billing is available on all three plans and costs ten times the monthly price, which is two months free: Starter $690 per year, Operator $1,190 per year, QuoteDone $2,790 per year.

### Trial — `server/src/demo/demoInstructions.js:33`

Before: “A trial is available.”

After: “A 14-day trial with 60 included minutes is available.”

The 35-cent overage, cancellation, paid-period and no-money-back-guarantee
sentences are unchanged.

## Feature availability and other demo facts

**Nothing was omitted.** Each listed Starter/Operator feature is supported by the
current plan gates and services. No additional feature was added.

| Facts checked | Source evidence and behavior |
|---|---|
| Starter $69/month, $690/year, 150 minutes; Operator $119/month, $1,190/year, 300 minutes; QuoteDone $279/month, $2,790/year, 1,200 minutes | `server/src/billingUsagePolicy.js:3` defines the exact integer-cent prices and included allowances. |
| Answering, transcripts and lead capture on Starter and Operator | `server/src/planAccess.js:132` permits the receptionist on both; `server/src/voice/voicePlanAccess.js:8` retains common tools. The signed voice-session regressions test all three plans, persisted lead capture, and answering with the obsolete stored switch off. |
| Dashboard/email owner alerts and owner-managed spam filtering | `server/src/ownerAlertRoutes.js:1`, `ownerAlertService.js:127`, and `ownerCallRoutes.js:5` expose owner alerts, email dispatch and spam controls without an Operator-only gate; routes are installed at `server/src/server.js:221`. Focused voice-limit tests exercise persisted blocklists, tenant/role checks and fake email delivery. |
| One number and owner login; Operator adds one office-staff login | `server/src/server.js:338` provisions the owner's number through account access, including Starter; the business profile stores one number. `server/src/staffSeats.js:1` reserves the owner login separately and grants zero extra Starter seats or one Operator/QuoteDone staff seat. Existing staff acceptance, seat limits, downgrade and revocation tests pass. |
| Operator booking and calendar connection; Starter excluded | `server/src/server.js:162` and `:351`, `server/src/ownerCalendarRoutes.js:2`, and `server/src/voice/voicePlanAccess.js:3` use Operator access. Route/voice regressions test direct denials, downgrade and restoration. |
| Operator customer records | `server/src/staffRoutes.js:25` installs owner/staff customer reads with tenant scoping; existing staff HTTP tests verify the correct business's customers and reject foreign/unauthenticated access. |
| Operator live transfer; Starter excluded | `server/src/server.js:377` gates transfer configuration; `server/src/voice/voicePlanAccess.js:11` gates the tool. Voice regressions reject a pending transfer after downgrade. |
| Operator Price Book and website quote widget; Starter excluded | `server/src/planAccess.js:136`/`:140`, `server/src/server.js:153`, and `server/src/quoteDoneRoutes.js:251`/`:273` gate owner and public paths. Direct HTTP regression covers Starter blocking and restored Operator access. |
| Operator quote-request counter, webhooks and CSV | `server/src/server.js:457` returns the persisted quote-request count; `server/src/ownerIntegrationRoutes.js:7` exposes CSV and `:14` gates webhook configuration; `server/src/outboundWebhookService.js:174`/`:200` rechecks Operator access before delivery. |
| Phone Price Book quotes only on QuoteDone | `server/src/planAccess.js:149` and `server/src/voice/voicePlanAccess.js:4`/`:12`. The separately permitted `calculateListedPrice` tool is unchanged and remains allowed on all three plans. |
| 14-day trial, 60-minute cap and 35-cent overage | `server/src/billingRoutes.js:703`, `server/src/planAccess.js:15`, and `server/src/billingUsagePolicy.js:8`. |

Searched every file in `server/src/demo/` for plan, seat/login, answering
switch/toggle, widget, annual and trial facts. **No other stale fact was found.**
The unchanged fixed-listed-price guidance at `demoInstructions.js:26` matches the
owner's permission for listed-price arithmetic. The “switch” mentions in the
language instruction concern language changes, not answering. `liveDemo.js`
contains no competing plan/seat/answering/widget entitlement claims.

A byte comparison reconstructed the final instruction file from the base using
only the six approved fact replacements. Every other instruction matched.
See `scope-check.json`.

## Actual demo-session tests

`test/voiceLimits20261007.spec.mjs:93` now requires the exact forwarding wording
and rejects dashboard-toggle/switch claims, excluding the approved negative
sentence itself. The old affirmative master-toggle assertion is removed.

Ten new tests at `:116` each POST to the actual installed `/api/demo/session`
route, capture its synthetic provider request, and inspect
`bidiGenerateContentSetup.systemInstruction.parts[0].text`. They verify the
Starter, Operator, QuoteDone, annual and trial facts separately for **both Nova
and Miles**, the selected agent/greeting, and the forwarding/no-switch wording.
The route uses `lockedSetup` at `server/src/demo/liveDemo.js:52` and `:112`.
Three additional tests at `:129` compare literal plan prices, allowances, seats,
trial cap and allowed/blocked voice tools with production entitlement functions.

Before production wording changed, the selected demo facts/entitlement run had
**15 tests: 3 passed, 12 failed** (`demo-before.tap`). After the fix, the demo,
Starter route/voice and staff regression group had **90 passed, 0 failed**
(`demo-after.tap`).

## Scanner change and reproduction

`test/helpers/ownerQueryScan.mjs:152` resolves static, quoted and computed property
names; `:158` recognizes nested database binding context; `:173` recursively
inspects assignment targets; `:192` covers declaration, parameter and catch
bindings plus assignment/loop patterns. Shorthand, renamed, nested and defaulted
`exec`/`prepare` extractions are forbidden at extraction time, covering later
direct, `.call`, `.apply` and `.bind` invocations. Defaults' right-hand values and
ordinary object literals are not treated as extraction targets. A `WeakSet` at
`:143` prevents counting nested assignment targets twice.

| Synthetic reproduction | Base scanner | Fixed scanner |
|---|---:|---:|
| `const {exec: run} = database; run.call(database,"DELETE FROM customers")` | 0 findings — missed | 1 forbidden finding |
| `const {exec} = database` | 0 findings — missed | 1 forbidden finding |

The finalized 88-case coverage suite was run against the unchanged base scanner,
then against the fix: **23 passed / 65 failed → 88 passed / 0 failed**. The
original 20 cases pass on both. The 68 additions cover both methods, 23 binding
and assignment forms, invocation variants, nested dynamic keys, attempts to
allowlist forbidden extractions, safe metadata/defaults, duplicate counting,
and computed keys shadowed by destructured bindings. New tests
require forbidden extraction findings; they do not discard the legacy scanner's
additional lexical `prepare` references. Before/after TAP is committed in
`scanner-before.tap` and `scanner-after.tap`.

Full inventory: **289 entries = 246 SQL exceptions + 30 non-query uses + 13 safe
RegExp `exec` uses; zero unlisted, zero unused SQL exceptions, zero unused
non-query allowances, zero forbidden production extractions.**
`server/src/ownerQueryExceptions.js` is unchanged. See `scanner-inventory.json`.

The final review also reproduced `const key="close"; function work({key}) {
const {[key]:run}=database; run.call(database,"DELETE FROM customers"); }
work({key:"exec"});` and its assignment variant. The initial scanner fix returned
zero findings. `test/helpers/ownerQueryScan.mjs:113` now treats destructured local
names as potentially shadowing outer constants. Eight dedicated regressions
cover shorthand/defaulted parameters, nested catch bindings and nested variable
bindings with both declaration and assignment extraction. All eight failed
before this correction (`scanner-shadow-before.tap`) and pass in the final
88-case run.

## Test commands and results

### Local commands

Commands ran in the isolated clone. The build was plain `npm run build` (twice;
both invocations passed, including the final source). For test commands, the
local Node 24.19.0 runtime used the following environment:

```sh
export TMPDIR=/workspace/scratch/25507090f1e7/audit-tmp
export NODE_OPTIONS='--require=/workspace/scratch/25507090f1e7/platform-retain-sqlite.cjs'
export PLAYWRIGHT_BROWSERS_PATH=/workspace/scratch/25507090f1e7/audit-browsers
```

The external SQLite preload retains genuine native handles to avoid this host's
Node 24 cleanup-hook failure. It changes no SQL, results, assertions, transactions
or explicit close calls and is not shipped. Hosted CI used its clean Node 22
runtime, fresh `npm ci` and Chromium, without that preload. Nine CPUs were
available locally. The full suite and quote gate ran sequentially.

```sh
# Demo baseline: new assertions, before the production wording correction.
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs \
  --test --test-reporter=tap --test-name-pattern='demo facts|demo approved' \
  test/voiceLimits20261007.spec.mjs

# Corrected demo plus plan, route, voice and staff regressions.
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs \
  --test-concurrency=1 --test --test-reporter=tap \
  test/voiceLimits20261007.spec.mjs test/starterPlan20261009.spec.mjs \
  test/starterPlanRoutes20261009.spec.mjs test/voiceStarterPlan20261009.spec.mjs \
  test/staffLogin20261009.spec.mjs

# Scanner: same final tests against the base helper, then the fixed helper.
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs \
  --test-concurrency=1 --test --test-reporter=tap \
  test/ownerQueryCoverage20261009.spec.mjs

# Shadowed-key reproduction before the final one-line correction.
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs \
  --test --test-reporter=tap \
  --test-name-pattern='scan destructuring 20261011: shadowed key' \
  test/ownerQueryCoverage20261009.spec.mjs

# Final source: after the plain npm run build described above.
TEST_RESULTS_FILE=verification/demo-facts-scanner-20261011/full.tap npm test
npm run test:quote
```

| Local check | Passed | Failed | Result / evidence |
|---|---:|---:|---|
| `npm run build` | — | — | PASS, exit 0; owner app and widget built. Build emitted a chunk-size warning. Tracked `client/dist` restored and `git diff --exit-code -- client/dist` passed. |
| Demo baseline | 3 | 12 | Expected reproduction failures; 15 tests, `demo-before.tap`. |
| Corrected demo/plan/route/voice/staff group | 90 | 0 | PASS, `demo-after.tap`; no skips, cancellations or TODOs. |
| Final 88 scanner cases against base helper | 23 | 65 | Expected reproduction failures; original 20 pass, `scanner-before.tap`. |
| Shadowed-key cases against initial scanner fix | 0 | 8 | Expected reproduction failures, `scanner-shadow-before.tap`. |
| Final scanner | 88 | 0 | PASS, `scanner-after.tap`; original 20 plus 68 additions, no skips/cancellations/TODOs. |
| Initial `npm test`, superseded | 3,570 | 58 | Partial **top-level** outcomes only; interrupted after no further progress following a Chromium failure. No final test summary; the remaining checks in this invocation are NOT RUN. `checkpoint-full-summary.json`. |
| Final `npm test` | 4,847 | 60 | 4,907 registered tests, exit 1. Every failure was Chromium launch; affected browser checks are **NOT RUN**, not passes. No other failures. `local-full-summary.json`. |
| Final `npm run test:quote` | 4,125 | 60 | 4,185 registered tests across 198 selected files, exit 1. Architecture checks passed. Every failure was Chromium launch; affected browser checks are **NOT RUN**. No other failures. `local-quote-summary.json`. |
| Isolated browser launch/test diagnosis | 0 | 1 | `quoteReauditEditor20261006.browser.spec.mjs` failed its Chromium before-hook, exited in 0.7 seconds and did not hang in isolation; browser assertion **NOT RUN**. `browser-stall-probe.tap`. |
| Complete server query inventory | — | — | 289 entries; zero unlisted and zero unused allowances. `scanner-inventory.json`. |

Both final local full-gate summaries report zero skipped, cancelled or TODO
cases. These runner values do **not** mean the browser assertions executed:
60 registered cases failed at launch, and 14 nested browser tests could not
register because their parents failed first. All 74 are **NOT RUN locally**.
The two local JSON summaries name the failed cases and the 14 missing children,
verified against the hosted full-suite log. No timing assertion failed, so no
isolated timing rerun was needed.

The separate Chromium probe tried Playwright's default executable and the
available full Chromium binary. The default headless shell was missing at
`chromium_headless_shell-1194/chrome-linux/headless_shell`; the full binary
`chromium-1194/chrome-linux/chrome` exited with `SIGSEGV` even with
`--no-sandbox`. See `chromium-probe.log`. The isolated browser command was:

```sh
timeout --signal=INT --kill-after=5s 20s \
  node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs \
  --test --test-reporter=tap test/quoteReauditEditor20261006.browser.spec.mjs
```

### Hosted CI independently verified for the source commit

**Run name: CI. Run 38122495059. Conclusion: success.**
Source SHA: `c722778902bd1132d3c78575c091cc522414f229`.
[GitHub Actions run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38122495059).
Counts were read from test job `114419933162`, not inferred from a badge or a
previous candidate's report:

| Hosted command / check | Tests | Passed | Failed | Skipped / cancelled / TODO |
|---|---:|---:|---:|---:|
| `npm run build` | — | PASS | 0 | — |
| `node --test test/ownerAlertsDelivery20261006.browser.spec.mjs test/ownerDashboard20261007.browser.spec.mjs` | 9 | 9 | 0 | 0 / 0 / 0 |
| `npm run test:quote` — 198 files | 4,199 | 4,199 | 0 | 0 / 0 / 0 |
| `npm test` | 4,921 | 4,921 | 0 | 0 / 0 / 0 |

The synthetic `voice-docker-startup` job also succeeded. Production dependency
audit and the unchanged full-suite zero-failure check passed.

**All 81 new names appear as passing tests in the hosted full-suite log:** ten
`demo approved session facts 20261011` cases (five each for nova/miles), three
`demo approved plan entitlements 20261011` cases, and all 68
`scan destructuring 20261011` cases. The quote gate also ran all 68 new scanner
cases. Exact passing names, counts, job ID and missing local browser children
are committed in `hosted-source-commit.json`. In particular, the log contains:

- `scan destructuring 20261011: auditor renamed exec through call`
- `scan destructuring 20261011: auditor shorthand exec`
- all eight `scan destructuring 20261011: shadowed key ...` cases.

The first demo checkpoint independently passed CI run 38121371064: 9/9 browser
regressions, 4,131/4,131 quote-gate tests, and 4,853/4,853 full-suite tests, with
all 13 new demo/entitlement names present (`hosted-demo-checkpoint.json`). The
final source gate's increase to 4,199 quote tests includes the 68 scanner
additions. Counts from different gates overlap and are not summed.

## Remote confirmation and saved evidence

Before adding this report, `git ls-remote` independently returned:

```text
c722778902bd1132d3c78575c091cc522414f229 refs/heads/fix/demo-facts-scanner-20261011
```

This report and its evidence are committed on the same branch in a subsequent
report-only commit. The implementation and test files remain identical to the
source SHA tested above. The delivery response records the report commit's own
final SHA from `git ls-remote` and the independently checked CI run for that
exact final commit.

Saved on GitHub: the demo/scanner fixes and tests, the wording approval, this
report, focused before/after TAP, build/browser diagnostics, inventory/scope
checks, and compact local/hosted result summaries. The focused TAP evidence has
only trailing whitespace normalized for Git; test results are unchanged.

Kept locally only: raw `full.tap`, `quote-gate.tap`, the superseded
`full-checkpoint.tap`, duplicate npm output logs, generated synthetic test
folders, and the external SQLite runtime accommodation. The committed local
summaries include SHA-256 hashes of the final raw TAP logs. No production data
or provider credentials are present in the committed evidence.
