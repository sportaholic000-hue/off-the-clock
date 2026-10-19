# AB1 / AB2 geometry boundary repair

Branch: codex/qe-agent1-geometry-boundary-repair-20261019. Exact starting parent: f4978665167538917732dcd061a18a4099f090d8. No subagents used.

## Corrected behavior

AB1 uses roofGeometry.js for the exact same footprint conversion in validation, roof calculation and underlayment scope calculation. Decimal inputs are rational; squared surface hundredths are rounded by an exact midpoint comparison. The result is quantized to 0.01 sqft before partial scope, waste, bundles or rolls. All supported pitches use this formula. Within the supported 1,000,000 sqft / 100:12 bounds, the hundredth-quantized output round-trips through Number without losing a decimal hundredth.

AB2 determines the square-equivalent span count from exact area / spacing squared. It rounds the final joint allowance to 0.01 LF by an exact squared-midpoint comparison. Approximate square-root side lengths remain display evidence only. Rectangles retain their original exact dimension formula. Spacing bands, minimums and tax/seasonal policies are unchanged.

Shared exactMath helpers use BigInt integer Newton iteration for the floor of the square root. The rational remainder remains available for exact ceiling and half-up decisions. No input is truncated, no epsilon is used, and no dependency changes are required. Unsafe integer outputs are rejected.

| Audit case | v11 cents | Correct v12 cents | Change |
| --- | ---: | ---: | ---: |
| roof-footprint-0154 | 67606 | 67607 | 1 |
| roof-footprint-0157 | 135206 | 135207 | 1 |
| roof-footprint-0163 | 1352006 | 1352007 | 1 |
| roof-package-0280 | 393400 | 408401 | 15001 |
| concrete-square-joint-0047 / 0064 | 10500 | 12500 | 2000 each |
| concrete-square-joint-0051 / 0068 | 16000 | 20000 | 4000 each |

The package case now buys eight 400-sqft rolls for the rounded 2800.01-sqft surface. Square allowances immediately above 100 / 400 sqft now retain 20 / 80 LF instead of losing a whole set of cuts.

## Version and history

Next unused version at inspection: quote-engine-vnext-geometry-20261019-v12. Both production literals advance together. The observed remote QE branch versions are recorded in version-inventory.json.

Before any production edits, capture-v11.mjs executed on the unchanged audit head and saved genuine widget and actual voice-tool receipts for all eight failures. capture-proof.json records the source SHA, empty production diff and original receipt hashes. historical-v11.json.gz is immutable; its uncompressed SHA256 is 3acd933e18c65b3e75249d6f0229955eb4fc2d36fc6c4a505c358c6e37453a30. No outcomes were fabricated or regenerated on v12.

The new historical tests replay each original widget response and voice result using both original and new tool IDs, compare durable rows and wording byte-for-byte, keep v11 receipts stale across ordinary saves, refuse fresh estimates before reapproval, require explicit confirmation, then verify corrected v12 widget and voice amounts without changing prices or historical rows. Older authentic v7/v8/v9/v10 history tests and the 9-cent separate-line / accepted-zero controls remain in the focused regression run. Existing test edits advance current-version assertions only; frozen fixtures and dollar expectations are untouched.

## Verification at publication

- Frozen audit oracle: all 287 comparisons pass, covering all 20 registered trades, including the original eight failures and six intentional review controls. Audit artifacts were not edited.
- Independent additional oracle: 203 cases (153 roof, 50 concrete), including pitches 0, 1, 2.5, 3, 6, 7, 9, 12, 16, 35 and 100; 5/9/16:12 and flat ties, adjacent decimals, full/50%/33.3% scopes, exact partial agreement and refusal of contradictions, waste then package/bundle boundaries, both concrete services, rectangle controls, spacing 10/12.5/15 and half-hundredth LF ties.
- Saved widget / actual voice correctness: 25 cases; no real provider calls. Pricebook and saved receipt preservation are asserted.
- Genuine v11 history and reapproval: 8 cases pass.
- Final delivery-only rerun after removing an unused observation field: 25/25 pass; delivery-final.tap.gz.
- Focused compatibility run: 822 tests passed, 0 failed/cancelled/skipped/TODO, including the new 525 checks. Output: focused-final.tap.gz.
- Build: npm run build exited 0; build.log.gz. Generated client build output was restored.
- First expanded run: 520/527 passed, 7 failed. Retained in geometry-first.tap.gz with original oracle and assertions; FIRST_RUN_TRIAGE.md explains the two harness mistakes and corrections. No production changes were made in response.
- Exact-head hosted strict/full/browser/build/Docker/checker/dependency-audit gates must finish on the published SHA. This prepublication report does not assert their completion. The final delivery names the exact verified SHA and hosted run.

Only the existing test job timeout changes from 30 to the explicitly authorized 45 minutes, because the previous complete workload exceeded 30 minutes. No suite selection, exclusion, skip, assertion weakening, spec, price, dependency, selector or deployment change is included.

F2's below-one signed-adjustment policy remains explicitly unresolved. This repair does not choose a policy or change F2 behavior. No other repair assignment or integration write is made.
