# Quote display defects — hosted checks passed

Branch: `fix/quote-display-defects-20261006`.
Verified base: `6e6cd5b10e0558477cfe32d255a6ad58907988c2` on
`codex/quote-reaudit-fixes-20261006`.

## Changes and reproductions

All three failures were reproduced before production changes. The initial
regression run failed 3/3 tests. Expected amounts were handwritten first in
`specs/QUOTE_DISPLAY_DEFECTS_20261006.md`; `before.json` and `after.json` retain
actual component output, production bridge responses and phone output.

| Defect | Source and baseline execution | Correction |
| --- | --- | --- |
| Product choices and typed names | Base `client/src/quoteDoneControls.jsx:71` emitted `asphalt_shingle` and withheld the confirmation checkbox for `Asphalt shingle`. The phone binder accepted that name and calculated $2,520.00. | Human-name choice lists for all 15 registered-product fields. The browser and `bindVoiceQuoteInputs` share `registeredProductKey`; edits clear confirmation and only explicit confirmation binds the current offering ID. |
| Missing-price labels | Base `server/src/quoteDoneBridge.js:118–126` returned engine diagnostics without labels; preview did likewise. Production status and preview returned `materialPerSqft.tile` without a parallel label. | Editor label logic lives in `server/priceBookLabels.js`; the production bridge applies it to status, preview, tier and product diagnostics. The product coverage list uses the same labels. |
| Money and punctuation | Base customer and owner list showed `$172.5`; preview showed `$172.5` twice; phone said `172.5 CAD. per visit. Includes applicable tax..` | One shared formatter adds separators and consistent cents across displayed options. Equal preview endpoints collapse and the redundant midpoint is hidden for exact totals. Phone currency and unit stay with the price and sentences have one closing period. |

The synthetic mowing calculation is $100 before the $150 minimum, then $22.50
tax: $172.50. The minimum-bound 10% range collapses under the existing approved
rule. The synthetic roof remains $2,520.00 ($2,520 under the whole-dollar display
rule). No price formulas or stored quotes were changed.

## Verified tests and publication

Tested source/test revision: **`4ac36b44bf27c3e2a67d39fde86c24f0a6c44021`**.
[Hosted cold run 37525141520](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37525141520)
completed successfully on this exact revision. Each published source tree was
compared with the corresponding local Git tree after fetching it from GitHub.
This report and its evidence are a documentation-only follow-up to that revision.

| Check | Result |
| --- | --- |
| Cold `npm ci` | Passed |
| `npm run build` (owner app and widget) | Passed |
| `npm run test:quote` | **2,120/2,120 passed**, 98 files, 0 failures, 0 skips, 0 cancellations, 0 TODOs |
| `npm test` | **2,498/2,498 passed**, 140 files, 0 failures, 0 skips, 0 cancellations, 0 TODOs |
| Production dependency audit | Passed, 0 vulnerabilities |
| New regressions included above | **24**: 21 Node/component tests and 3 browser acceptance tests |
| Separate focused phone regressions | **27/27 passed**, 0 failures, 0 skips |

The full suite includes the quote suite; these counts must not be added as
independent tests. New coverage includes all 15 registered-product fields,
accent folding, unknown products, changed/retired confirmations, typing a name
that starts with another registered name, the $2,520 roof, production bridge
labels (including product/tier rows), dashboard/preview rendering, all four
$172.50 surfaces, equal totals, mixed whole/cents options, separators, malformed
amount rejection, partial quotes and unchanged numeric receipts.

A prior browser test run timed out because the test switched React forms without
waiting for the new mount before typing into an identically labelled field.
The harness now flushes each mount and checks the typed state; the complete
browser acceptance test subsequently passed in both strict and full hosted gates.
Its original failure excerpt is retained. No application assertions or gates were
removed. The final exact-price preview is also asserted to contain $172.50 once.

## Local environment and remaining work

The local cold install and build passed. Local Chromium exited with SIGTRAP
before opening a page. The local suite attempts did not produce final summaries:
quote output recorded 2,063 passes and 41 browser-startup failures; full output
recorded 1,110 passes and 31 browser-startup failures before interruption. These
are incomplete local observations, not passing gates. Every recorded local
failure was a browser launch failure. The complete cold acceptance results above
come from GitHub's browser-equipped runner, including every existing browser test.
The local Chromium limitation remains; no application work remains for these
three defects.

Evidence: `before.json`, `after.json`, `before-tests.tap.gz`, focused/phone logs,
local environment logs and the complete `hosted-cold-gates.log.gz`.
`evidence-manifest.json` records their SHA-256 hashes. Expected amounts remain in
`specs/QUOTE_DISPLAY_DEFECTS_20261006.md`, written before initial execution.

Only synthetic fixtures and disposable stores were used. No subagents, main
merge, deployment or live-data operations. CI's existing strict gates were kept;
the only workflow change adds the exact requested branch to the push trigger.
