# October 5 engine launch repair verification

- Repository: sportaholic000-hue/off-the-clock
- Branch: `codex/engine-launch-fixes-20261005`
- Verified starting branch: `codex/quote-audit-repairs-20261005`
- Verified starting commit: `e830ca88ec7f2cd630c497d31b0e32322ed2feef`
- Tested source/test commit: **`1066f5fe28feab678c55bc2d0ac94ff04fe3ec3d`**
- Tested tree: `4c5d43e80286358c7f6f34614e66239fd01ee779`
- Engine: `quote-engine-vnext-launch-fixes-20261005-v6`
- [Hosted CI run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37318343541)
- [Completed job](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37318343541/job/111790696083)

## Results

| Check | Result |
| --- | --- |
| Cold hosted lockfile installation | Passed |
| Cold hosted owner app and widget builds | Both passed |
| Hosted `npm run test:quote` | **1,603 passed; 0 failed; 0 skipped** |
| New launch regression cases | **35/35 passed** |
| Local `npm run build` with previous output moved aside | Passed |
| Local non-browser cases within `npm run test:quote` | **1,534/1,534 passed** |
| Local Chromium checks | 35 launch failures before page creation; hosted checks passed |

The strict gate ran with its existing automatic test selection and no failure
allowance. No tests were removed or skipped to obtain this result. Its hosted
step completed at 2026-10-05T13:42:33Z. The existing workflow also ran its broader
suite automatically: 1,992 total, 1,981 passed, nine previously allowed failures,
two skips; its existing known-failure check passed without expanding the list.
Those other features were not audited or changed in this task.

## Source binding

All 35 uploaded source/test/specification files were read back through GitHub's
recursive tree and matched their local Git blob hashes before the commit was
created. The tree also confirmed both retired production calculator paths were
absent. The branch reference was then read back at the tested commit.
Subsequent documentation updates record this verified source SHA; they do not
change the tested implementation or tests.

## Requested cases

Expected values and policy authority were written in
[the launch decisions](../../specs/QUOTE_LAUNCH_DECISIONS_20261005.md).
The new test file is `test/engineLaunchFixes20261005.spec.mjs`.

- Basic paint: $1,440 labor for 800 sq ft x2 coats at $0.90; fair and poor walls
  explain itemized preparation. The real owner notice and scope editor render
  the new behavior. Existing 10% paint waste gives $352 materials, $1,792 total.
- Flat roof: omitted, residential and commercial building types each produce
  $14,700 for the specified EPDM-to-TPO job without added layers.
- Interview names normalize through the same function as the editor. Normalized
  collisions reject; scope aliases remain intact; explicit registrations persist.
- Real peak controls render the optional/off explanation and twelve month names.
- Missing first approval reports the new reason before identity checks; a genuinely
  conflicting active-service identity still fails validation.
- A 3-inch slab below the sole >4-through-6 demolition band reports only thickness;
  a real access mismatch still reports access.
- Insulation and coverboard disclosures capitalize their prefixes, preserving the
  $16,900 fixture total for both itemized and installed layer prices.
- Production no longer imports retired calculators or exposes their legacy status
  functions. Existing regression cases execute archived test-only copies.
- Combined peak labor $100.05+$100.05 at 10% gives $20.01, split $10.01 regular /
  $10.00 installed. Unequal portions, both rounding directions, installed-price
  markup exclusion, off months, zero surcharge and tampered receipts are checked.
- 450 sq ft /3 rooms is small: $1,620 labor at $3 x1.20. The medium maximum is
  also inclusive. Previous approvals become stale; explicit reapproval restores
  customer quoting under v6.

No merge, deployment, live customer-data change or subagent work was performed.
