# Off The Clock AI — quote engine and price-book re-audit

**Read-only inspection of the October 2, 2026 repair state.**

## Result

**Nine confirmed functional findings remain.** R02 and R09 each contain two related failure modes, described separately below. Several other findings have more than one reproduction. This is a count of findings, not a claim that there are nine arithmetic errors.

The most consequential findings are an AI service that cannot recover after an approved field/tier is removed, a tax-mode transition that blocks every service using the business defaults, and a tier editor action that silently overwrites another price. The other findings reject legitimate configurations or let the interview capture configurations the downstream price book rejects.

**I did not find a new arithmetic miscalculation in the tested valid configurations.** The additional audit matrix passed 409 checks across all 20 service types, including 288 combinations of financial rules. That result does not establish 100% accuracy for every possible configuration. The reproduced failures below prevent an unconditional launch sign-off.

No application source, price policy, rounding behavior, GitHub branch, pull request, or deployment was changed. All mutation-based experiments used isolated synthetic records. No subagents were used.

## Exact source reviewed

The review used the local combination of these two repair heads:

| Component | Exact commit |
|---|---|
| PR16 engine/server repairs | `a7dd434fd148c86d093cb46222f539020fba974c` |
| PR17 price-book editor repairs | `4af1a2cd90fc1996a8be1ae96563a8d47ce0dc1a` |
| Common PR15 base | `c2e9efcdcc4aaca4a7b8f610e4cdf792cb135010` |

The PR heads were checked against GitHub at the start. **This combination is local and unmerged.** It is not a claim about the default branch or production. All 300 repository-bound files were compared with the pinned source manifest; the end-of-review check found zero changes to those files. The evidence includes the file hashes and original Git blob hashes.

GitHub references: [PR16](https://github.com/sportaholic000-hue/off-the-clock/pull/16), [PR17](https://github.com/sportaholic000-hue/off-the-clock/pull/17).

## Confirmed findings

| ID | Priority | Functional problem | Observed outcome |
|---|---|---|---|
| R01 | High | Removing an approved AI field or the last tier leaves obsolete approval receipts | Reapproval succeeds, but service remains unable to quote |
| R02 | Medium | Included-price validation does not fully support offering and scope rates | Legitimate bundled pricing is rejected |
| R03 | High | Selecting “No tax line” retains a hidden positive tax rate | Business-wide configuration becomes invalid |
| R04 | Medium | Editor/save precision exceeds the supported precision of many engine rates | Accepted and saved rates cannot generate quotes |
| R05 | Medium | Current tree metadata loses closed key domains | Interview/AI captures unsupported pricing keys |
| R06 | Medium | Cleanup interview rejects a valid zero disposal amount | Owner cannot confirm that valid answer |
| R07 | Medium | Custom-service interview does not use the selected unit when parsing rates | Valid fractional-cent custom rates are rejected |
| R08 | Medium | Interview server omits field-specific money restrictions | Invalid siding and cleanup prices are accepted into drafts |
| R09 | High for overwrite; Low for naming | Tier editor permits destructive override collisions and generates duplicate tier names | Prices are overwritten, or valid tiers become invalid |

Priority describes functional impact, not exploitability. The engine generally fails closed for invalid configurations: it returns review without a customer amount. R09's overwritten prices can instead form a valid configuration and affect a later approved quote.

### R01 — Removing an approved AI field or last tier leaves unrecoverable stale approval keys

**Reproductions:**

1. Create and approve an `AI_INTERVIEW` mowing service with `baggingSurchargePercent: 10`; confirm it is `QUOTING LIVE`.
2. Delete that optional field, save, and explicitly approve every currently required field.
3. Approval reports success, but `confirmedFields.baggingSurchargePercent` and `approvedValues.baggingSurchargePercent` remain. They now refer to a field that is no longer confirmable, so the service becomes `NEEDS PRICING`.
4. Independently, approve an AI service with one tier, remove its last tier through the actual editor, save, and approve all current fields. The same failure occurs for `confirmedFields.tiers` and `approvedValues.tiers`.

**Cause:** Current confirmation fields exclude absent prices and an empty tier list. Approval merges new receipts into old maps instead of pruning deleted fields. The application save path protects/restores the old receipt maps, so simply clearing them in an ordinary save is not a supported recovery route.

**Impact:** Legitimate removal of optional pricing or the final tier disables the whole service, including otherwise valid base requests. Reapproving does not repair it. Restoring the removed configuration or recreating the service can work around it, but neither completes the intended edit.

**Required correction:** Reconcile receipts against the exact current confirmable fields during explicit approval, preserving legitimate identity/audit protections. Test optional-field deletion, final-tier deletion, reapproval, and customer quoting.

**Sources:** [current confirmation fields](https://github.com/sportaholic000-hue/off-the-clock/blob/a7dd434fd148c86d093cb46222f539020fba974c/server/quote-engine-vnext/contracts.js#L1072), [approval merge](https://github.com/sportaholic000-hue/off-the-clock/blob/a7dd434fd148c86d093cb46222f539020fba974c/server/quote-engine-vnext/contracts.js#L1879), [save/approve bridge](https://github.com/sportaholic000-hue/off-the-clock/blob/a7dd434fd148c86d093cb46222f539020fba974c/server/src/quoteDoneBridge.js#L198).

**Evidence:** `reproduction-results.json` cases `deleted-ai-baggingSurchargePercent`, `deleted-ai-tiers`; `browser-ai-removal-retry/public/R01-evidence.json` and screenshot. Browser control starts live and ends with the two stale-tier receipt diagnostics after successful approval.

### R02 — Valid included-price declarations are rejected for newer rate types

**R02a: Configured offering prices are missing from the inclusion-path contract.**

An itemized fence quotes $3,920 before the edit. Set `offeringRates.postMaterialEach` to zero and explicitly declare it included in the positive `offeringRates.fenceMaterialPerLF`. Both are material charges with the same cost basis. The engine rejects the source path as not part of the service price contract. `supportedIncludedPricePath()` recognizes older maps and `scopeRates`, but has no `offeringRates` branch.

This prevents an owner from correctly describing posts already included in the material rate. Charging for them separately would double-charge; marking the whole service free would be false. This is a valid inclusion configuration the existing policy cannot represent.

**R02b: Inclusion validation requires whole cents for scope rates that otherwise support fractional cents.**

For an itemized stair configuration, set `scopeRates.stairs_material` to zero and include it in `scopeRates.stairs_underlayment`. A covering rate of 1,000 cents works and quotes $2,255. Change only that covering rate to 1,000.5 cents: the inclusion validator rejects it, even though scope unit rates support fractional cents. The generic inclusion-price predicate makes only a mowing-rate exception.

**Impact:** Both cases return review rather than an incorrect amount. They block legitimate explicit bundled-price configurations. They are distinct failures inside the same inclusion subsystem.

**Required correction:** Validate inclusion paths and precision against the effective service's actual rate definitions, retaining positive-covering-price, category, basis, identity, and tier checks. Do not remove the zero-price safeguards.

**Sources:** [supported paths and inclusion-price predicate](https://github.com/sportaholic000-hue/off-the-clock/blob/a7dd434fd148c86d093cb46222f539020fba974c/server/quote-engine-vnext/contracts.js#L1968), [scope precision requirements](https://github.com/sportaholic000-hue/off-the-clock/blob/a7dd434fd148c86d093cb46222f539020fba974c/server/quote-engine-vnext/scopePricing.js#L35).

**Evidence:** `included-offering-price`, `included-fractional-scope-price`, and `included-integer-scope-control` in `reproduction-results.json`.

### R03 — “No tax line” leaves an invalid tax rate hidden in the saved book

Start with a live service using `TAX_ALL` and 15%. In the real editor, choose “No tax line.” The action changes only `taxMode`; `taxPercent` remains 15, and the rate input disappears. Save and approve.

**Observed:** The stored defaults are `TAX_NONE` plus `taxPercent: 15`. Validation reports `TAX_NONE requires a zero taxPercent.` Reapproval does not resolve it. Every service using these defaults is affected.

**Cause:** `updateDefault()` updates one field, while the tax-mode control hides the dependent field without transitioning it to the required value.

**Required correction:** Make the no-tax transition explicitly produce the valid no-tax configuration, with any restoration behavior made clear. Verify transitions between all three modes and customer readiness. No tax-law assumption is needed to fix this state inconsistency.

**Sources:** [single-field update](https://github.com/sportaholic000-hue/off-the-clock/blob/4af1a2cd90fc1996a8be1ae96563a8d47ce0dc1a/client/src/pricebook.jsx#L701), [tax controls](https://github.com/sportaholic000-hue/off-the-clock/blob/4af1a2cd90fc1996a8be1ae96563a8d47ce0dc1a/client/src/pricebook.jsx#L1044).

**Evidence:** `tax-mode-to-none`; `browser-run/public/R03-evidence.json` and screenshot.

### R04 — Many fractional-cent unit rates are accepted and saved but rejected by the engine

**Reproduced for:** concrete `laborPerSqft` and standard interior painting `laborPerWallSqftPerCoat`.

Enter **$1.005**. The control marks it valid, the save succeeds, and persistence correctly retains **100.5 cents**. However, the active engine requires integer cents for these fields. A formerly live service becomes `NEEDS PRICING`; preview reports the specific rate invalid even after approval.

The actual browser reproduction covers standard wall labor. This is not a rounding error during save: preservation works. It is a disagreement about which rates are supported.

**Breadth:** The same structural mismatch affects many legacy scalar/map unit-rate fields: metadata/conversion labels them `unit_rate`, while the engine's general money checks require integer cents. Fractional-cent support is explicitly implemented for mowing, custom rates, offering rates, and scope rates. Standard siding labor already has a special whole-cent restriction; most other legacy fields lack that restriction at input/save.

**Required correction:** Define the supported precision once and carry it through metadata, controls, interview, conversion, validation, and calculation. Either reject unsupported precision at entry without changing the text, or deliberately extend the engine contract with tests. This audit does not choose a new pricing-precision policy.

**Sources:** [money-kind and conversion bridge](https://github.com/sportaholic000-hue/off-the-clock/blob/a7dd434fd148c86d093cb46222f539020fba974c/server/src/quoteDoneBridge.js#L39), [input preservation](https://github.com/sportaholic000-hue/off-the-clock/blob/4af1a2cd90fc1996a8be1ae96563a8d47ce0dc1a/client/src/pricebookInputs.jsx#L7), [engine rate-domain split](https://github.com/sportaholic000-hue/off-the-clock/blob/a7dd434fd148c86d093cb46222f539020fba974c/server/quote-engine-vnext/templates.js#L120).

**Evidence:** `fractional-rate-concrete-labor`, `fractional-rate-interior-wall-labor`; `browser-run/public/R04-evidence.json` and screenshot.

### R05 — Closed price-map domains are lost when current tree metadata is used

Current metadata adds `tree: {depth: 1}` to several maps while leaving the closed key list in `shapedKeys.keys`. Both the structured client and server validator prefer `tree`; neither carries those closed keys across when `tree.leafKeys` is absent.

**Reproductions:**

- Enter flooring labor under `unobtainium`. The real interview accepts the key, reads it back, and saves it. The engine rejects it as unsupported. The starter-output validator also accepts it.
- More realistically, planting starter metadata still lists `small`, `medium`, `large`, **and `mixed`**. The AI starter prompt is constructed from that list. The validator accepts a draft containing `mixed`, but the current planting engine only supports the three explicit size keys. A draft that follows the supplied schema can therefore be unquotable.

**Impact:** Unsupported keys can poison the service configuration even when an otherwise supported customer selection is requested. Owners can correct the maps, but the interview/AI should not solicit or confirm values outside the live contract.

**Required correction:** Preserve closed versus owner-defined domains independently from nesting depth. Generate editor controls, interview validation, starter prompts, and server validation from the active contract. Retain the repaired three-level cube support.

**Sources:** [tree metadata assignment](https://github.com/sportaholic000-hue/off-the-clock/blob/a7dd434fd148c86d093cb46222f539020fba974c/server/src/quoteDoneBridge.js#L367), [server domain selection](https://github.com/sportaholic000-hue/off-the-clock/blob/a7dd434fd148c86d093cb46222f539020fba974c/server/src/priceBookAI.js#L43), [client tree preference](https://github.com/sportaholic000-hue/off-the-clock/blob/4af1a2cd90fc1996a8be1ae96563a8d47ce0dc1a/client/src/interviewStructured.jsx#L41), [live planting domains](https://github.com/sportaholic000-hue/off-the-clock/blob/a7dd434fd148c86d093cb46222f539020fba974c/server/quote-engine-vnext/contracts.js#L1519).

**Evidence:** `closed-domain-ignored`, `starter-prompt-planting-mixed-unsupported`; `browser-run/public/R05-evidence.json` and screenshot.

### R06 — Cleanup interview cannot confirm a legitimate $0 disposal amount

Enter cleanup debris rows with a positive labor multiplier and `disposalFlat: 0` for light debris. The server can store this answer and the engine can quote it: the control job produces **$100**. But the browser's structured readback validator rejects the zero with “must be more than zero,” so the owner cannot reach confirmation.

**Cause:** The legacy nested-map client validation applies a strictly-positive test to every leaf, treating a fixed disposal amount like a multiplier. The cleanup map has mixed leaf types and constraints.

**Impact:** A valid no-disposal-charge setup cannot be completed through the interview. This is not a request to allow a zero labor multiplier.

**Required correction:** Validate each leaf's actual type and zero policy. Retain positive multipliers while accepting explicitly allowed zero disposal charges.

**Sources:** [blanket positivity check](https://github.com/sportaholic000-hue/off-the-clock/blob/4af1a2cd90fc1996a8be1ae96563a8d47ce0dc1a/client/src/interviewStructuredValue.js#L102), [engine cleanup requirements](https://github.com/sportaholic000-hue/off-the-clock/blob/a7dd434fd148c86d093cb46222f539020fba974c/server/quote-engine-vnext/contracts.js#L1501), [zero-disposal calculation](https://github.com/sportaholic000-hue/off-the-clock/blob/a7dd434fd148c86d093cb46222f539020fba974c/server/quote-engine-vnext/templates.js#L887).

**Evidence:** `cleanup-interview-leaf-types`, `cleanup-zero-disposal-engine-control`; `browser-run/public/R06-evidence.json` and screenshot.

### R07 — Custom-service interview ignores the already-selected unit for precision

Save `CUSTOM.unit = per_sqft` in an interview, return to the price question, and enter **$0.005 per square foot**. The browser rejects it with “Choose the custom service unit before entering a fractional-cent unit rate,” although the unit is already saved.

The server validator accepts that exact price when given `{unit: 'per_sqft'}`. The engine's supported fractional custom-rate behavior also has positive arithmetic controls.

**Cause:** Application metadata creates the custom price field without the current pricing context, yielding `moneyKind: unresolved_unit`. The interview passes that static kind to the input and scalar parser, instead of resolving it from the draft's selected unit.

**Impact:** Owners cannot enter this supported custom price through the interview. Manual price-book editing has a unit-aware path, so this does not mean the engine cannot price it.

**Required correction:** Resolve custom price/low/high precision from the current draft unit, and refresh the rule when the unit changes. Keep flat-price whole-cent rules intact.

**Sources:** [unit-aware server rule](https://github.com/sportaholic000-hue/off-the-clock/blob/a7dd434fd148c86d093cb46222f539020fba974c/server/src/quoteDoneBridge.js#L39), [static interview input metadata](https://github.com/sportaholic000-hue/off-the-clock/blob/4af1a2cd90fc1996a8be1ae96563a8d47ce0dc1a/client/src/onboarding.jsx#L690), [scalar parser](https://github.com/sportaholic000-hue/off-the-clock/blob/4af1a2cd90fc1996a8be1ae96563a8d47ce0dc1a/client/src/interviewStructuredValue.js#L168).

**Evidence:** `custom-unit-interview`; `browser-run/public/R07-evidence.json` and screenshot, including the saved `per_sqft` answer.

### R08 — Server interview validation skips specific monetary restrictions

Two inputs are accepted and persisted by the actual interview HTTP endpoint:

- `SIDING_REPLACEMENT.laborPerSqft.vinyl = 1.005` dollars, even though this field explicitly declares `wholeCents: true` and price-book conversion rejects fractional cents there.
- `LANDSCAPING_CLEANUP.debrisPricing.light.disposalFlat = 0.005` dollars, even though this is a fixed charge requiring whole cents.

**Cause:** `validateInterviewValue()` uses a field-level money kind. It never applies `def.wholeCents`. For `debrisPricing`, the field-level kind is null, so it never validates the nested fixed-charge leaf as money.

**Impact:** An AI-assisted answer or direct interview update can be accepted as a valid draft answer and fail later when transferred/saved as a price book. This is separate from R04: here existing field-specific restrictions are available but omitted at the interview server boundary. R06 concerns rejection of valid zero; R08 concerns acceptance of invalid precision.

**Required correction:** Apply field and leaf-specific exact-money rules consistently before accepting interpreted/saved answers. Preserve rejected text for correction and do not silently round it.

**Sources:** [interview numeric validator](https://github.com/sportaholic000-hue/off-the-clock/blob/a7dd434fd148c86d093cb46222f539020fba974c/server/src/priceBookAI.js#L32), [strict downstream conversion](https://github.com/sportaholic000-hue/off-the-clock/blob/a7dd434fd148c86d093cb46222f539020fba974c/server/src/quoteDoneBridge.js#L67).

**Evidence:** `siding-whole-cent-ai-guard`, `cleanup-interview-leaf-types`; `browser-run/public/R08-evidence.json` contains the HTTP-persisted answers. No paid model call was needed or made; the actual validator used for model output was exercised directly.

### R09 — Tier editing can silently overwrite prices; automatic naming can invalidate tiers

**R09a: Destructive override-name collision.**

Create a tier with wall labor `$2` and wall material `$0.75`. Change the labor override's field selector to the already-present material field. The editor silently changes the tier from:

```json
{"laborPerWallSqftPerCoat": 2, "materialPerWallSqftPerCoat": 0.75}
```

to:

```json
{"materialPerWallSqftPerCoat": 2}
```

The prior material price is lost; labor now inherits the base rate. The field selector offers already-used fields, and `renameOverride()` overwrites the target key without resolving the collision. The changed tier can be saved and approved because the resulting numbers are structurally valid. For the reproduction's 100 wall square feet and two coats, the entered original tier corresponds to $550; the overwritten/inherited combination corresponds to $600.

**R09b: Duplicate automatic tier names after deletion.**

Start with Good, Better, Best. Remove Good, then click Add tier. The editor generates **Better, Best, Best**, because it chooses the new name from the current array length. Saving produces `tiers.2.name duplicates tiers.1.name` and `NEEDS PRICING`.

**Impact:** R09a can change future approved customer prices without an explicit decision to replace the existing target rate. R09b blocks pricing until the owner manually changes the generated name. These are grouped as one tier-editor finding, with different severity and separate reproductions.

**Required correction:** Disallow or explicitly resolve duplicate override keys while preserving entered values; generate an unused tier name. Test deletion/re-addition and override switching into an occupied field.

**Source:** [tier creation and override renaming](https://github.com/sportaholic000-hue/off-the-clock/blob/4af1a2cd90fc1996a8be1ae96563a8d47ce0dc1a/client/src/pricebook.jsx#L335).

**Evidence:** `browser-run/public/R09-evidence.json`, `browser-tier-name-run/public/R09b-evidence.json`, and screenshots.

## What was inspected and tested

The review followed the active application routes into `quoteDoneBridge`, the vNext contracts/templates/financial engine, persisted books, saved approvals, and customer sanitization. The legacy quote engine was read to establish routing and compatibility boundaries; inactive legacy behavior was not counted as an active defect.

| Area | Coverage |
|---|---|
| All 20 services | Roofing replacement/repair; flat roof replacement/repair; interior/exterior painting; flooring install/replacement; fencing install/replacement; siding replacement/repair; concrete driveway/patio slab; cleanup, mulch, sod, planting, mowing; custom services |
| Measurements and scope | Required/conditional inputs, exact offering identity, measured areas/lengths/counts, repair bands, orthogonal outlines, component exclusions, optional extras |
| Configured work | Installed versus itemized fence/paint, gates, painting products, flooring underlayment and stairs, overlay preparation, siding removal/trim, concrete demolition/finish, commercial insulation/coverboard |
| Shared money pipeline | Exact decimal handling, cent conversion, line rounding, fees and answer ownership, seasonal engine calculation, cost/sell basis, markup versus gross margin, tax modes, pre-tax minima, ranges, tiers, zero/free/included classifications |
| Price-book workflows | Create/save/reload, duplicate representations, draft/live readiness, AI origin and receipts, approval revisions, deletion, input controls, structured interview, starter validation |
| Customer boundary | Sanitized public amounts, private evidence exclusion, malformed/unknown scope refusal, replay verification, partial-job disclosures, request binding and persistence |

Fresh verification results:

- **647 existing relevant tests passed:** 454 engine/contract/configured-scope/price-book/AI tests, plus 193 quote application, persistence, approval/editor repair, explanation, and precision-fixture checks.
- **409 additional audit checks passed:** 43 base/scope arithmetic and customer projection checks across all 20 service types; 288 financial-rule combinations; 6 fee-answer cases; 32 cent/range boundaries; 40 unknown-scope/evidence-tampering checks.
- **9 local browser/HTTP defect scenarios reproduced successfully**, with saved records and screenshots. “Passed” in those reproduction logs means the reported defect occurred, not that the application is correct.
- Additional direct-function reproductions isolate the inclusion defects and input/approval inconsistencies, with valid controls where relevant.

The financial oracle uses integer-ratio arithmetic independently of the production exact-money helper. Base/scope fixtures include existing explicitly calculated controls; the additional matrix expands their use but is not presented as a second independent implementation of every service formula.

Initial harness attempts had a scratch temporary-directory issue, a restricted subprocess-output issue, an unsupported test-runner flag, and an asynchronous browser-control wait. Corrected runs are identified in `EVIDENCE-INDEX.md`. These were not counted as product findings. No full unrelated application suite or live customer traffic was included in the new pass count.

## Pricing decisions kept separate from defects

These were not counted among R01–R09 and were not changed:

- **Customer rounding:** current runtime behavior was tested as implemented; the previously paused cents-versus-whole-dollar decision remains paused.
- **Seasonal application policy:** the bridge explicitly blocks seasonal configurations pending a date-policy decision. The engine's seasonal arithmetic is distinct from that application restriction.
- **Tax treatment of installed bundles:** the implementation follows the owner's selected category/taxability; deciding how a bundled service should be allocated requires an explicit business rule.
- **Scope-specific commercial choices:** already-discussed rules such as siding-removal story adjustments, flooring pattern labor, flat-roof waste, full-perimeter versus formed-edge charging, and confirmed fence post quantities need agreed contracts before behavior is changed. I did not relabel them as newly proven bugs.

## Limits and Claude handoff

This audit establishes reproducible behavior on the pinned combined source and synthetic fixtures. It does not certify production deployment, real owner price books, market prices, physical measurements, or every output a model could generate. Passing tests cannot prove universal correctness over arbitrary inputs.

No website design, general CRM, unrelated voice-system, CI, deployment, or marketing issue was added to the finding count. The editor and interview findings are included only where they affect prices, supported configurations, saved pricing data, or the ability to quote.

Claude should audit the same two commit heads together, independently review R01–R09, and distinguish a code disagreement from an intentional policy decision. In particular, check whether any proposed repair to R04 broadens fractional-rate support: that would be a deliberate engine-contract change, not merely a text-input repair.

The evidence bundle contains the scripts, source bindings, machine-readable results, successful relevant test logs, and public synthetic browser evidence. It excludes local account databases and authentication secrets. **The requested fixes have not been implemented during this audit.**
