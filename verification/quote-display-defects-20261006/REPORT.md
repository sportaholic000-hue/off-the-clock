# Quote display defects — verification in progress

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
| Money and punctuation | Base customer and owner list showed `$172.5`; preview showed `$172.5` twice; phone said `172.5 CAD. per visit. Includes applicable tax..` | One shared formatter adds separators and consistent cents across displayed options. Equal preview endpoints collapse. Phone currency and unit stay with the price and sentences have one closing period. |

The synthetic mowing calculation is $100 before the $150 minimum, then $22.50
tax: $172.50. The minimum-bound 10% range collapses under the existing approved
rule. The synthetic roof remains $2,520.00 ($2,520 under the whole-dollar display
rule). No price formulas or stored quotes were changed.

## Verification checkpoint

- Initial dependency install succeeded.
- Focused regressions: **21 passed, 0 failed, 0 skipped**.
- Three browser acceptance tests added, covering all 15 product fields, the
  roofing example, production dashboard/preview labels and all four money surfaces.
- Cold `npm ci` and `npm run build` succeeded. Full local gates are running.
- This runner's Chromium process exits with SIGTRAP before opening a page.
  Local browser failures are environmental; hosted browser verification is pending.
- CI push trigger includes only the newly requested branch in addition to its
  prior entries; test selection, assertions and strict gates remain unchanged.

Only synthetic fixtures and disposable stores were used. No subagents, merge,
deployment or live-data operations. Hosted green checks remain required.
