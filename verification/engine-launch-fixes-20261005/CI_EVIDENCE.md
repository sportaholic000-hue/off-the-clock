# October 5 follow-up verification

- Branch: `codex/engine-launch-fixes-20261005`
- Verified parent: `a809f567dbcfbfed105fce3aefefb4b249df6279`
- Tested source/test commit: **`baf24c3696357dab7eff25c02ead1e465dd7b747`**
- Tested tree: `37786d717126a09498b9893173d814526d018940`
- Engine: `quote-engine-vnext-launch-fixes-20261005-v6` (arithmetic unchanged)
- [Hosted run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37334504982)
- [Hosted job](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37334504982/job/111845732811)

## Repaired paths

The prior checkpoint normalized registered/offering names but missed ordinary
price maps. The interview now normalizes product names in flat and nested maps,
rejects collisions, and preserves closed choices and exact structural keys.
Starter responses and SQLite interview saves retain the normalized result.
Equivalent manual saves retain existing confirmation; AI assistance remains an
unconfirmed draft. Tests use a synthetic provider boundary and temporary storage.

The basic-paint notice now reads each effective tier configuration. Itemized-only
fair-wall jobs no longer show the basic restriction. Mixed pricing identifies the
basic tier, while failed tiers retain their existing diagnostics. The saved,
approved application quote still totals the handwritten **$2,250** and the real
owner-notice component renders no incorrect warning.

## Results

| Check | Result |
| --- | --- |
| New follow-up regression cases | 20 passed in the hosted strict gate |
| Focused local tests, including existing AI checks | 105/105 passed |
| Local cold owner-app and widget builds | Both passed |
| Local non-browser checks within `npm run test:quote` | 1,554 passed |
| Local browser checks | 35 failures before Chromium could launch |
| Hosted cold lockfile installation and both builds | Passed |
| Hosted strict quote/price-book gate | **1,623 passed; 0 failed; 0 skipped; 65 files** |

The hosted strict step completed successfully at **2026-10-05T15:43:23Z**.
Its browser checks were not excluded. No gate, skip, failure allowance, dependency,
or workflow was changed. The entire hosted job completed successfully. The
automatically run broader suite retained its nine existing allowed failures
(9/9), without expanding the allowance. Other features were not audited.

## Source binding and expected values

All nine changed source/test/specification paths matched their local Git blob
hashes in the uploaded recursive tree. The diff from the verified parent contains
only those paths, and the branch reference was read back at the tested source SHA.
The final documentation checkpoint records this source SHA without changing code
or tests. Expectations, the initial failing reproductions, and fixture corrections
are recorded in [the decisions](../../specs/QUOTE_LAUNCH_DECISIONS_20261005.md).

New coverage includes flat/nested/canonical names, accents, collisions, fixed
field identities, closed domains, numeric and fixed-money validation, the real AI
response, starter return values, SQLite manual/assist saves and collision rollback,
all-basic/mixed/itemized tiers, failed-tier combinations, owner rendering, and the
saved/approved quote path. An older test rejecting spaces was updated to the
approved normalization rule; its invalid-name/domain/size checks remain active.

No merge, deployment, live-data changes, or subagents. These results verify the
specified repairs; they are not a whole-product launch approval.

## Historical verification below — superseded coverage statement

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
