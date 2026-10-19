# Public widget intake audit report

Target: pending integration checkpoint `28c1c331e841878cce8edb1f235523e001ca0b25`. This is not a release-approval statement.

## Actionable reproductions

### PI-00 — approved installed interior offering is absent from the public catalog

1. Save a new synthetic installed `INTERIOR_PAINTING` offering with configured wall, ceiling, and trim rates.
2. Explicitly confirm the `painting_coats_20261017` starting values and approve the exact saved configuration.
3. Validate the saved book and fetch `GET /api/public/quote/:publicKey`.

Observed: owner approval is current, but activation reports `customerInputs.trimCoats` and `customerInputs.trimSurfaceCondition` as invalid, leaves the service `NEEDS PRICING`, and omits it from the public catalog. Evidence: `activation-evidence/finding.json`. The 20-service matrix therefore uses a disclosed wall-only installed interior control; it does not forge an adoption receipt or hide this availability defect.

### PI-01 through PI-05 — widget hides dependent values without removing them

The actual `CustomerMeasurements` React component was interacted with in JSDOM. This is DOM evidence, not real-browser coverage.

| ID | Service and visible correction | Hidden state retained | Public-handler result |
|---|---|---|---|
| PI-01 | Mulch: bed area/depth → cubic yards | `mulchDepth` | `needs_details`; no priced receipt |
| PI-02 | Concrete driveway: length/width → measured area/perimeter | `length`, `width` | contradictory geometry rejected; no priced receipt |
| PI-03 | Flooring replacement: subfloor issues yes → no | `subfloorRepairAreaSqft` | `needs_details`; no priced receipt; corrected request is 305,280 cents |
| PI-04 | Planting: mulch included yes → no | `mulchYards`, `mulchType`, `confirmedFacts.mulchType` | `needs_details`; no priced receipt; corrected request is 12,500 cents |
| PI-05 | Mowing: edging yes → no | `edgingLengthLF` | `needs_details`; no priced receipt; corrected request is 11,000 cents |

These are customer-blocking UI defects, not pricing-integrity failures: the public server rejects each contradictory shape and never creates a priced receipt from it. Exact before/after component state is in `dom-evidence/cases.json`; public requests and responses are in `http-evidence/public-wire.json`.

## HTTP result

- 20/20 registered services accepted one valid public prepare/final submission.
- 20/20 services exercised one correction or invalid-input case.
- Every accepted body preserved its submitted scalar quantities/units through the immutable receipt, saved quote inputs, normalized calculation evidence, and sanitized customer output.
- Every stale signed proof returned 409 and every prepare-only invalid case created no quote, lead, request, or priced submission receipt.
- Exact retries returned the historical response without changing saved receipt, quote, lead, amount, or scope identity.
- Public catalog and customer responses were scanned for owner-only calculation/pricing fields; none were exposed.
- Added/changed/removed separate work preserved the 36,000-cent flat-roof repair, produced partial output only while separate work existed, and never fabricated a full-job total.
- A proof prepared before a saved-book revision was rejected after the revision and fresh approval; an older saved optional-work receipt remained exactly replayable.

The exact service matrix is in `COVERAGE.md` and `http-evidence/coverage-matrix.json`.

## Browser result

Real-browser coverage is **0/20 and unexecuted**, not passing. Chromium, Firefox, and WebKit could not open a page because the local sandbox has no `/proc` or `/sys`; the separate cloud browser cannot reach the isolated server. `BROWSER-BLOCKER.md` enumerates all untested services and the exact runtime failures. The executable `browser-audit.mjs` is retained for a normal hosted browser environment, but no result from it is claimed here.

## Existing defects and scope boundaries

- A1's closed-fence geometry and carpet measurement contradictions were treated as known controls and are not rediscovered or relabeled here.
- A4's approved F18 repair is present in the checkpoint; the separate-work control passed and is not reported as a new F18 defect.
- No live providers, deployment, pricing/default change, engine-version change, F2 change, selector change, or ASR-accuracy claim occurred.
- This branch changes only this owned verification directory. Proposed production and shared-test changes are recorded in `PROPOSED-PATCHES.md`; none were applied.
