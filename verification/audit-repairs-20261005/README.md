# October 5 quote engine and price-book repairs

The four confirmed defects reported against `217ce1009cbc371c2f7fe1da1ef19dce4950ed22` are repaired in verified-source checkpoint `b01b7ddde3546bf2aed2c5f8a7b27c9d0ad56e67` on `codex/quote-audit-repairs-20261005`. The branch is based on the audited Claude branch, not the older `main`.

**Peak-surcharge rounding remains an unresolved policy question.** Its existing behavior is unchanged. This checkpoint is not launch approval or a claim of zero remaining defects. No subagents, merge, deployment, or live-data changes were used.

## Repaired defects and acceptance evidence

| Finding | Repair | Acceptance result |
| --- | --- | --- |
| QP-01: a remaining named overlay is rejected | The owner-pricing contract finds a matching configured overlay entry, including named aliases, using the same scope matcher as calculation. | Sixteen saved-and-approved cases cover install/replacement, installed/itemized prices, base/tier configuration, and numeric/named aliases. Installed overlays quote **$2,180**; itemized overlays quote **$2,080**. Incompatible existing floors still go to review. |
| QP-02: owner preview omits tier-only questions | Public intake and owner preview use one effective-tier field contract. Existing pure tier-merging functions moved into a shared module without changing merge rules. | Hardwood and carpet tier-only underlayment produce **$1,960** after confirmation; laminate produces **$1,940**. Missing confirmation still requires review. A rendered owner-controls regression checks collecting the answer and previewing $1,960. |
| QP-03: large incomplete catalogs block the public status path | Proven product-specific failures are reported once per affected product before searching candidate pairs. Large-catalog reference checks reuse immutable snapshots and the complete financial pipeline. The Cartesian scenario/output grid is no longer built eagerly. | The identical 320-by-320, 51,743-byte public fixture improves from **6,172 ms to 143 ms cold**, and **484 ms to 2 ms warm**. Coverage shrinks from 102,400 duplicate pair rows to 320 product failures; both revisions correctly return NEEDS PRICING. Additional checks retain the last complete sibling, explicitly free catalogs, pair-dependent overflow review, and invalid included-price allocation review. |
| QP-04: stair-removal arithmetic retains old approvals | Engine approval version advances from October 4 v4 to **quote-engine-vnext-audit-repairs-20261005-v5**. | An old v4 approval is stale and prevents a new customer quote. Explicit owner reapproval restores the **$2,711** quote. A persisted **$2,701** v4 receipt replays unchanged; its stored public/internal JSON stays byte-identical. A changed request cannot reuse that receipt. |

The monetary expectations above were written before the regression tests ran. The reported functional reproductions initially failed **20/20** and passed **20/20** after the repairs. The history test uses isolated synthetic SQLite data. All price-book test writes use the repository's temporary-directory harness.

## Verification and limits

The final [hosted run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37310052807) passed **1,568/1,568** strict quote/price-book checks, both production builds, and the no-new-failures comparison for the broader suite. That broader suite retains 1,946 passes, nine existing failures, and two skips. See `CI_EVIDENCE.md` and `hosted-summary.txt` for the exact source/run bindings.

- Local Node 22 non-browser quote/price-book regressions at `9361844b` (identical production code): **1,499 passed, zero failed**, across 49 files. This includes the earlier October 4/5 regressions; no failure allowance was expanded.
- Prepared financial-pipeline readiness is compared with the ordinary engine across 65 service/scope fixtures, four financial/configuration conditions, and three answer variants per fixture. Immutable-input, immutable-output, unsafe-data, and fabricated-request-flag controls also pass. The final parity test revision uses valid TAX_ALL with explicitly taxable categories and independently asserts 2,102,192 cents for the marked-up/taxed flat-roof control; all 70 tests in that file pass locally (`pipeline-parity-final.tap`).
- The public pricing entry point cannot enable readiness caches through a request flag. Requested customer jobs still go through the ordinary full validation/calculation path. Readiness returns status only, not a reusable customer quote or stored receipt.
- Large-catalog tests cover 320 products on each selector for incomplete, final-pair-live, and explicitly-free catalogs, both full and quick status. These measurements are evidence for those fixtures, not an unlimited-catalog latency guarantee. Pair-dependent candidate validation remains exact; reference coverage never claims an untested pairing is ready.
- An independent baseline comparison also preserves all 65 internal and 65 sanitized customer results, ignoring only generated quote IDs and the intentionally changed engine-version fields (`quote-parity.json`).
- Local Chromium terminates with SIGTRAP before page creation. Hosted browser verification is recorded separately once complete; this local environment failure is not counted as a product regression.
- All **263 materialized files** were compared by Git blob hash against the saved code tree; zero mismatches. The pristine baseline's 256 materialized files also match the audited revision. GitHub readback shows exactly 16 changed/new source and test paths, with no deletions or data-file changes.

The first hosted run passed 1,567/1,568 checks: the new browser fixture had omitted owner approval and therefore lacked its creation receipt. That fixture was corrected through the normal saved-service approval path; production code is byte-identical to `9361844b`. The subsequent hosted strict gate passed. A further test-only revision corrected the tax-mode fixture so it exercises actual taxation rather than an invalid configuration. Final hosted results below bind the final test revision.

The existing test that pinned v4 now pins v5. Earlier tests expecting a duplicated 6,400/19,200-row failure grid now require complete compact per-product diagnostics. Their failure/ready semantics, monetary checks, boundary checks, and time budgets remain enforced.

## Rounding policy left unchanged

The original specification rounds the combined eligible labor amount once. The later amendment separates ordinary labor and installed selling-price labor so markup treatment stays correct, without specifying how that split interacts with surcharge rounding.

At 10%, two $100.05 eligible portions yield $20.02 today versus $20.01 under combined rounding. Two $100.04 portions yield $20.00 today versus $20.01 combined. The recommendation is to round the combined surcharge once and allocate its cents deterministically between the two financial categories, preserving their markup treatment. That policy has not been authorized in this repair session; no arithmetic change was made for it.

Fresh owner approval is required under v5. Existing receipts are historical records and are not recalculated. If the rounding policy subsequently changes arithmetic, it must also advance the approval version and add the corresponding acceptance expectations.

## Files

- `reported-functional-before.tap` and `reported-functional-after.tap`: failing/passing defect reproductions.
- `local-regressions.tap` and `local-test-files.json`: final local regression output and selected files.
- `catalog-comparison.json`: identical-input cold/warm before/after measurements.
- `source-binding.json`: immutable baseline/code hashes and verified materialized files.
- `CI_EVIDENCE.md` and `hosted-summary.txt`: completed hosted results for the exact code checkpoint.
