# Confirmed rendered-intake correction defects

Authority: approved A3 base `1f8b1a20e1b910c7787a05dd820814894b01a961`. First reproduced in real Chromium 141.0.7390.37 at published `0e2648930ab2f3ce64e92e9578e981dcdfa3522b`, hosted run 39284239659 / test job 118165547578. Production is identical to that base. No client or server repair is included.

Both findings are recorded separately in `hosted-checkpoint-01/failed-requests.json`, with exact submitted customer inputs, service IDs, response bodies and history receipts. `approved-book.json.gz` is the exact saved/confirmed/approved configuration. The complete source-bound diagnostic bundle preserves every original JSON file and both failure screenshots; its SHA256 manifest was checked after complete 555/555 chunk recovery and successful gzip CRC validation.

## A1-R12-01: old-fence removal turned off leaves a hidden length

1. Restore the documented configured FENCING_REPLACEMENT draft: 100 LF of six-foot wood fence, flat terrain, two walk gates, removal selected for 50 LF. Its original valid quote is 490000 cents.
2. Change the rendered “Old fence removal included” select to No.
3. Submit the estimate request through the rendered button.

Expected: `oldFenceRemoval:false`, no `removalLengthLF`, and a ready confirmation leading to **450000 cents**:100×4000 +2×25000. The 40000-cent removal line must be absent.

Actual: the real POSTprepare body contains both `oldFenceRemoval:false` and `removalLengthLF:50`. HTTP200 returns `status:"needs_details"`, with “Check Measured old fence length to remove.” The review summary displays removal No and 50 LF together. No priced result is produced and prepare creates no durable rows.

Business impact: a customer who corrects the removal choice is blocked from obtaining a valid estimate and asked to correct a field hidden by that choice. This is not an engine arithmetic or rounding defect.

Source: `client/src/quoteDoneControls.jsx`, CustomerMeasurements.update (lines96–113 at the approved base) has dependency cleanup for other controlling choices but none for oldFenceRemoval. The existing server contradiction check is `server/quote-engine-vnext/configuredOfferings.js:204`; it correctly rejects retained removal length when removal is excluded.

## A1-R12-02: partial-to-full flat-roof scope leaves hidden partial area

1. Restore the documented FLAT_ROOF_REPLACEMENT draft with roofSqft 1000, EPDM, two existing layers, moderate access, serviceScope partial and partialAreaSqft 500.
2. Change the rendered Replacement scope select to Full.
3. Submit the estimate request through the rendered button.

Expected: `serviceScope:"full"`, no partialAreaSqft/partialPercent, and a ready confirmation leading to **1805000 cents**:575000 labor +770000 materials +460000 removal.

Actual: the real POSTprepare body retains `partialAreaSqft:500` with full scope. HTTP200 returns `status:"needs_details"`, with “Check Measured affected roof area.” The review summary displays Full and 500 affected sqft together. No priced result is produced and prepare creates no durable rows.

Business impact: a customer expanding the job to the full roof is blocked from the valid full-roof estimate by a hidden partial-scope value. Server validation must remain intact.

Source: the same CustomerMeasurements.update path lacks serviceScope dependency cleanup. The existing full-scope diagnostics are in `server/quote-engine-vnext/contracts.js:234–235`.

A3 already has a direct API invalid/cleared fence-removal fixture (`audit-fixtures.mjs:61`). This review adds the previously uncovered rendered Yes→No transition; it does not relabel that existing server contradiction control as a new server defect. The flat-roof A3 correction fixture covers zero partial area, rather than the rendered partial→full transition.

## Independent reproduction and controls

A second normally selected test invokes the audit with `--dependency-reproduction` in a fresh application/database/book. It repeats only these two transitions and independently submits clean fence-removal-off/full-flat-roof scopes with the previously written 450000/1805000 expectations. It requires correct behavior; unfixed defects remain failing assertions. The original 88-case test and its assertions remain unchanged.

```sh
node verification/qe-agent1-remaining-public-intake-20261019/browser-audit.mjs . <new-directory> --dependency-reproduction
node --test test/qeAgent1RemainingDependenciesReproduction20261019.browser.spec.mjs
```

To extract every exact original file from a preserved complete bundle:

```sh
python3 verification/qe-agent1-remaining-public-intake-20261019/extract-hosted-evidence.py verification/qe-agent1-remaining-public-intake-20261019/hosted-checkpoint-01/complete-evidence-bundle.json.gz <new-directory>
```

This review does not change policy, prices, engine versions, approvals or historical fixtures. F2 remains outside scope.
