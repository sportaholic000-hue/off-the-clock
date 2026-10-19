# Proposed cross-owner patches — not applied

The assignment permits verification-directory edits only. These production/shared-test changes are explicit proposals for the responsible owners.

## Public widget dependent-value clearing

Target: `client/src/quoteDoneControls.jsx`, inside `CustomerMeasurements.update`.

- When `inputMethod` changes, clear both `mulchArea` and `mulchDepth` before accepting the new unit-specific quantity. This prevents a prior square-foot number from temporarily becoming cubic yards.
- When `dimensionMethod` changes, clear `length`, `width`, `areaSqft`, `perimeterLF`, and `outlinePoints`; require the newly visible geometry to be entered again.
- When `subfloorIssues` becomes anything other than `true`, clear `subfloorRepairAreaSqft`.
- When `mulchNeeded` becomes anything other than `true`, clear `mulchYards`, `mulchType`, and `confirmedFacts.mulchType`; remove an empty `confirmedFacts` object.
- When `edgingIncluded` becomes anything other than `true`, clear `edgingLengthLF`.

Do not relax the server contradictions. They are the working fail-closed control.

## Installed interior activation contract

Targets require core quote-contract ownership and are intentionally not edited here.

- Reconcile installed-offering activation scenarios with the modern surface contract so configured trim inputs `trimCoats` and `trimSurfaceCondition` are accepted when trim is offered and required by the configured offering.
- Add a new-service activation regression with wall, ceiling, and trim rates, confirmed `painting_coats_20261017` starting values, current saved approval, `QUOTING LIVE` validation, and public-catalog presence.
- Preserve historical receipt immutability and do not bypass starting-value confirmation.

## Shared rendered regressions

After production ownership approves the fixes, add real Playwright tests for all five hidden-field transitions and the installed-interior catalog case. Assertions should inspect the actual prepare body, verify ready/needs-details state, complete corrected saved paths, and retain the current monetary controls. JSDOM tests alone should not close the browser coverage gap.
