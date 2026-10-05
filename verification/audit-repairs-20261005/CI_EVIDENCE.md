# Hosted verification — October 5 repairs

## Final source/test checkpoint

- Commit: `b01b7ddde3546bf2aed2c5f8a7b27c9d0ad56e67`.
- Production source is byte-identical to `9361844bcf877a7a6c864513f0195885d5e4a1cb`; subsequent commits only correct/strengthen the new browser and financial test fixtures.
- [Final workflow run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37310052807), job `111762955141`.
- Fresh lockfile installation, both production builds, and the strict quote/price-book gate passed. Final strict gate completed at 2026-10-05 12:35:12 UTC.
- Final strict quote/price-book result: **1,568 passed, zero failed, zero skipped**, across **63 files**. The rendered tier-only hardwood preview test passed and returned $1,960.
- Final broader-suite result: **1,957 records, 1,946 passes, 9 existing failures, 2 skips**. The unchanged no-new-failures check passed; the failure allowance was not expanded.
- The complete workflow and production dependency audit passed. `hosted-summary.txt` contains the relevant timestamped log excerpts.

## Earlier successful hosted checkpoint

- Commit: `486fa0a2c5e6aa7514bffb4fa437c7755084a493`.
- [Workflow run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37309272996), job `111760410456`, overall success.
- Strict quote/price-book gate: **1,568 passed, zero failed, zero skipped**, across **63 files**.
- The rendered owner-measurement regression collected tier-only hardwood underlayment confirmation and returned **$1,960**.
- Broader suite: **1,957 records, 1,946 passes, 9 existing failures, 2 skips**; the unchanged no-new-failures check passed.
- Both production builds passed. The production dependency audit also passed.

## Failed intermediate test fixture — disclosed, not counted as a product repair

[Run 37308448042](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37308448042), at the initial production-code commit `9361844b`, passed 1,567/1,568 strict checks. The new browser fixture skipped the normal approval step, leaving a synthetic service without its required creation receipt. The fixture was corrected to reproduce the audited saved-and-approved setup; no production code changed for this failure. Subsequent assertions wait for the completed preview response and report its actual review reason instead of timing out on an expected result string.

The later taxable-markup fixture originally named an unsupported tax enum. The final test revision uses supported TAX_ALL, explicitly taxable categories, and the hand-calculated 2,102,192-cent control. All 70 tests in that file passed locally before its hosted run.

## Scope and remaining policy

No failure allowlist, package lockfile, test-selection gate, or workflow was changed. The original four defects have direct acceptance checks. These checks do not resolve the separate peak-rounding policy conflict and do not constitute whole-product launch approval. Fresh v5 approval is required for new quotes; saved historical receipts remain unchanged.
