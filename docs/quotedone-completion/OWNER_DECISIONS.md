# Remaining owner decisions — application completion

The accepted 19-file engine tree is unchanged. This ledger carries forward its business decisions; it does not reopen accepted arithmetic or claim that review-only scopes quote. All rows apply to the customer route, authenticated calculation and owner preview when that scope is selected. Customer submissions requiring review are durably saved; owner preview remains read-only.

## Decisions still required to extend the accepted pricing contracts

| Affected service and path | Current behavior / consequence | Why existing specifications do not settle it | Smallest owner ruling |
|---|---|---|---|
| ROOFING_REPLACEMENT underlayment; FLOORING_INSTALL and FLOORING_REPLACEMENT underlayment; painting material cost paths | Supported installed-area selling prices retain their meaning. Unsupported purchase-cost paths review; no package quantities or prices are invented. | Coverage, package size, yield and purchase rounding are absent. | What coverage and purchasable-package rounding rule applies to each cost-priced product? |
| FLOORING_INSTALL and FLOORING_REPLACEMENT: hardwood, laminate and carpet underlayment | Unsupported selections review; vinyl pricing is not reused. | The product-specific inclusion and price basis are undefined. | What underlayment inclusion rule and price basis applies to each product? |
| Both flooring services: stairs | Selected stairs review; the entire request becomes a lead. | The per-step scalar does not identify all included components. | Exactly which labor, material, removal, underlayment and disposal components does the stair package include? |
| Both flooring services: average area exactly at roomSizeThresholds.smallMaxSqft / mediumMaxSqft | Equality reviews; the neighboring supported bands retain accepted behavior. | Threshold prose does not assign equality. | Which adjacent band owns equality at each threshold? |
| FENCING_INSTALL and FENCING_REPLACEMENT: all layouts | Every request reviews. No post quantity is derived. | Length does not establish end, corner and gate-post geometry. | Which measured layout facts establish the billable post count? |
| Both fencing services: concretePerPost | Every request reviews; the mixed charge is not divided automatically. | Footing scope and labor/material allocation are unspecified. | What included footing scope and labor/material allocation does this charge represent? |
| Both fencing services: gatePrice and gateWidthTotalLF | Gates review; opening width is not silently ignored. | Installed gate price lacks a supported width contract. | Which measured opening widths does each gate price cover? |
| SIDING_REPLACEMENT: trimIncluded | Selected trim reviews; supported base siding still quotes. | The trim charge lacks a labor/material classification or allocation. | Is the trim charge labor, material, or an explicit split? |
| SIDING_REPLACEMENT: oldSidingRemoval | Selected removal reviews. New siding facts are not reused for old material. | Existing material, removal area and price scope are unspecified. | What existing-material and measured removal-area contract does the removal price cover? |
| CONCRETE_DRIVEWAY and CONCRETE_PATIO_SLAB: demolition | Selected demolition reviews. New slab measurements cannot establish old slab scope. | Existing thickness, reinforcement, access and removal scope lack a contract. | Which existing-slab facts and prices define a supported demolition offering? |
| Both concrete services: exposed aggregate | Selected finish reviews; supported other finishes retain their accepted paths. | Exposed-aggregate material inclusion is unspecified. | What material charge or explicitly all-inclusive price covers this finish? |
| FLAT_ROOF_REPLACEMENT: commercial insulation / coverboard | This scope reviews; building type alone does not establish insulation. | Confirmed system and measured coverage are absent. | Which system and measured insulation/coverboard scope does each price cover? |
| EXTERIOR_PAINTING: every request, including poor-condition primer | Every request reviews. No substrate/coating/preparation or primer package is invented. | Current measured contract does not define supported complete offerings. | What substrate, coating and preparation/primer scope does each offering include? |
| CUSTOM: every unit, fixed/range and charge path | Every request reviews; there is no invented financial category. | A unit/rate/range does not establish category or mixed allocation. | What charge category or explicit allocation applies to each custom service? |
| INTERIOR_PAINTING: fair / poor preparation | These selected conditions review; the good-condition control quotes. | Old floor-area preparation factors cannot be reused for measured walls. | What preparation price applies to each measured fair/poor scope? |
| INTERIOR_PAINTING: mixed height/access/coat zones | Unsupported mixed zones review. A single factor does not represent multiple zones. | There is no approved representation of separately measured zones. | What measured-zone representation should be supported? |
| Painting: first and additional finish coats | Supported interior quotes use the accepted explicit uniform per-coat rate for each coat; exterior remains review-only. Different first/subsequent-coat pricing is a pricing-model extension concern, not a blocker for that current contract. | Different first/subsequent-coat productivity is not expressed in the accepted fields. | Does the same labor rate apply to every finish coat in the owner's offering? |
| INTERIOR_PAINTING: independent primer scope | No independent primer contract is enabled. Preparation concerns review. | Triggering facts and price inclusion are unspecified. | Under which measured conditions is primer required and included in the entered price? |
| INTERIOR_PAINTING: wallHeight / wallHeightLaborMultiplier | Supported named selections apply the owner's factor; the application does not certify site facts. | Named heights do not supply measured classification thresholds. | What measured criteria define standard, high and vaulted height? |
| Planting size; cleanup debris/slope; mowing grass condition; roof/concrete/sod access; sod slope; roofing pitch/complexity; fencing terrain | Supplied allowed category values select the owner's factors. Missing, unknown or unsupported inputs review. Required offering confirmations are checked where the contract requires them; the application does not independently establish site facts. | Enums do not establish observable classification criteria. Fencing is separately review-only. | What observable measurement criteria establish each named category? |
| All services with configured positive seasonal surcharge and peak months | Application eligibility remains review-only for seasonal configurations; no quote-date/work-date choice is silently made. | Current documents do not reconcile work month with quote month. | Should seasonal pricing use the scheduled work month or quote month? |

These rows have no independently established universal dollar impact. For review-only scope, the operational consequence is owner follow-up and no released customer price. Where current categories or per-coat rules affect a supported quote, the amount depends on that owner's confirmed prices and project facts.

## Current application decisions supplied explicitly by the owner

- Each category's cost versus final selling price, taxability, markup applicability and each fee mode is entered in the owner interface and included in the exact saved-configuration approval. There is no category migration guess.
- Owner-selected fee booleans come from the authenticated owner's saved configuration and are included in that approval. Customer-selected fee booleans come from that request. The customer cannot supply owner authorization. Changing a saved owner fee choice invalidates the configuration approval.
- Interior painting requires the accepted measured wall/ceiling, per-coat fields. Old floor-area rates and legacy factors remain saved and disclosed, and cannot satisfy the new rate requirements. Approving retained legacy settings does not convert their units.
- Complete declared factor maps remain visible/preserved; the application does not infer which dormant products should be deleted or hidden.
- Exactly one supported partial-scope representation remains the accepted contract. Supplying both representations still reviews; no reconciliation tolerance has been added.
- TAX_MATERIALS continues to use the accepted explicit taxabilityByCategory map. The UI explains that meaning beside the existing mandated label. No alternative tax policy was invented.

## Requirements settled by this authorization

Owner authentication and tenant authorization, approval protection, durable complete review storage before acknowledgement, failed-save errors, duplicate retry handling and owner visibility are implemented and exercised here. They are not outstanding business questions. Existing synthetic books are retained without destructive migration; no live customer book or database has been changed.

The zero-price classifications, outward range display, uncapped mathematically valid markup and margin below 100 percent remain settled rules. They require no further ruling.

New control labels in this non-production candidate are proposed for owner review in APPLICATION_REPORT.md. Production release, real-data migration and provider work remain outside this authorization.
