# Off The Clock AI — verified repairs and project state

**The confirmed audit defects are repaired and verified in the local application. The candidate is ready for independent repository review; this is not a certification of 100% real-world quote accuracy or public-launch readiness.**

Repository: sportaholic000-hue/off-the-clock. Review branch: `codex/quotedone-audit-repairs-20260927`. Review/browser commit: `d218c85c491a33cb301816d52e593b4f913a363c`. Runtime, application and regression groups ran at `f96c14a049f68c1d32d54420d514d2e088fe722e`, from accepted completion `9670fdb5c55f35a0ccddcd397f2d188b5c811844`. Those commits have identical application, engine and ordinary-test bytes; their sole difference is a Country-control selector in the new browser harness. The complete browser group was rerun at the review commit after that test fix. Later delivery-only documentation/evidence commits contain identical application and test code. Accepted engine tree: `dcd481193b10c3cfc667cb23d22fb41b16322cff` (all 19 files unchanged).

## Verified repairs

| Finding | Current behavior | Direct acceptance evidence |
|---|---|---|
| Incomplete or contradictory request released a subtotal | Declared unknowns, additional context, differing service descriptions and unsupported envelope fields require whole-request review. Public submission, authenticated calculation and owner preview agree. Complete measured $50 controls still quote. | audit-repairs-http; audit-repairs-browser; all-adapters; access-retry-workflow |
| Raw decimal changed before validation | Wire decimals that would change value reject before saving. Strings are not misread as numbers; escaped duplicate keys reject; UTF-8 BOM cannot bypass validation. Representable large amounts, 0.1, fractional unit rates and high valid markup remain supported. | audit-repairs-http/wire-results.json; quoteApplicationBoundary.spec.mjs; money-workflow |
| Additional tax-writer precision defect | Actual pre-repair POST accepted text 1.0000000000000001 and stored 1. The owner form now transmits the original text and the server validates exact decimal preservation. Rejection writes nothing; correction to 7.5 saves exactly. | development/tax-text-before/result.json; audit-repairs-http; audit-repairs-browser/tax-browser.json |
| No callback contact | Following the owner's ruling, every new submitted estimate requires an email or telephone with valid syntax, including instant estimates. Missing/name-only/blank/malformed contact gets 422 before any quote, lead or request row is saved. Details remain editable across reload. | contact-workflow; audit-repairs-browser 422 corrections |
| Partial tier notice disappeared | Available estimates display the engine's safe option-availability notice. All valid options show their expected prices; all-review configurations show no price. | audit-repairs-browser partial/all-valid/all-review cases |
| Failed requests trapped the user in retry | Real 400/409/413/422 responses restore the original fields; correction uses a new UUID. A local size check prevents new oversized submissions. Network/server uncertainty preserves the exact pending request, including across reload. Restored textarea labels stay accessible. | audit-repairs-browser, actual SQLite abort and dropped upstream responses |
| Operator CRM denied | Lead list/detail/status updates work for authenticated existing owner/staff roles on Operator. Another tenant cannot read/change them; staff do not receive owner-only calculations. Quote/pricing plan restrictions remain. | audit-repairs-http role/tenant matrix |
| Same-origin quote form failed | Allowed same-origin browser GETs can use same-origin Fetch Metadata plus Referer when Origin is absent. Cross-origin flow works; wrong/null/missing origin controls still deny. Explicit empty API URL is supported; production default is same-origin. | audit-repairs-http origin matrix; real Chromium through same-origin forwarding proxy |
| Conflicting project records | Current voice collection rules no longer direct guessed measurements. The old flow is preserved as history. Floor-overlay guard is in the decision ledger, original >=300 threshold provenance is corrected, and main's recorded master-toggle rule is reconciled. | REPAIR_CONTRACT_20260927.md, OWNER_DECISIONS.md and current specs |

No owner rate, measurement, product identity, charge allocation, tax policy or unsupported service formula was invented. Review-gated requests retain the complete original submission and saved-book snapshot. The application marks an early scope review as an application decision; it does not pretend the arithmetic engine ran.

## Verification completed

All final runs use a fresh isolated store and the unchanged locked dependencies under portable Node 22.23.2, Windows x64 / ABI 127. The canonical worktree is bound to Git blobs; individual runtime, HTTP and browser runs record executed file hashes.

| Check | Result |
|---|---|
| Native runtime | Real SQLite create/commit/rollback/reopen/integrity, bcrypt, registration/login and authorization pass. |
| Application group | 8 workflows pass: all adapters, money, access/retry, legacy approval, identity ambiguity, audit repairs, contact and synthetic schema upgrade. |
| Service adapters | 20 independently specified service fixtures plus 20 missing-measurement controls; 16 quote-capable ordinary controls and 4 intentional review-only types. |
| Financial application controls | 65 pass, including fractional rates, fixed cents, high markup, margin, fees, tax, minimums, ranges, zero classifications and conditional review guards. |
| Browser group | 5 real browser workflows pass: full owner/customer/review/restart journey, configuration/privacy, reordered preview responses/editor integrity, structured measurements, and the new audit repairs including the real tax-entry form. |
| Ordinary regression | 430/430 pass. |
| VNext suite | 311/311 pass. |
| Phase 1 engine suite | 46/46 pass. |
| Original independent precision cases | 22/22 pass, original fixture unchanged. |
| Focused suite | 30/30 pass: previous 25 editor/store/fixture controls plus 5 new boundary tests. |
| Instrumented replay | 35/35 pass. |
| Integration boundary | Sole authorized bridge and frozen 19-file engine verified; no legacy fallback. |
| Client build | Existing locked Vite entrypoint builds successfully. |

Counts overlap and must not be added together as unique scenarios. The unchanged historical no-application-import gate exits 1 because it rejects the now-authorized quoteDoneBridge.js; the runner expects that precise rejection. It is **not** reported as a passing isolation gate. The separate current integration-boundary check passes.

Earlier attempts are retained, including failures. They include a restored-textarea label defect fixed in the implementation, Chrome automatically recovering a dropped response before the first fault-injection harness expected it, a harness assertion racing catalog loading, and a Country-control locator mismatch in the expanded tax UI test. In the archive, final/browser-01 is the failed locator attempt; accepted/browser-01 is its successful complete five-workflow rerun. The accepted runtime, application and regression groups are under final/. HTTP/browser tests use real servers, auth and SQLite; a synthetic SQLite abort and a real dropped response exercise failure behavior. Existing component tests remain component tests.

## Current project state and remaining release gates

The repository contains a React/Vite owner/customer interface, Express application, SQLite accounts/quotes/leads and per-owner JSON price books. A single application bridge calls the accepted VNext engine. Owner configuration approval, enabled status and revisions gate customer quotes; quote-or-review persistence commits before acknowledgement. Exact retries recover the saved historical receipt, not a newly priced offer.

The owner now explicitly requires callback contact for every estimate. An email or phone alone is sufficient; syntax checks do not prove ownership, consent or deliverability. Untriaged notes currently require review even when they appear to concern harmless logistics. This deliberately avoids guessing their pricing significance.

**Still review-only:** FENCING_INSTALL, FENCING_REPLACEMENT, EXTERIOR_PAINTING and CUSTOM. Conditional guards also remain for unresolved scopes such as flooring overlay/stairs/product underlayment/exact thresholds, purchase-package material costs, fair/poor or mixed-zone interior paint, siding trim/removal, concrete demolition/exposed aggregate, commercial flat-roof insulation and seasonal date policy. OWNER_DECISIONS.md records the specific missing contracts. These guards were preserved and verified, not relabeled as completed instant-quote capabilities.

**Still unverified:** actual deployed commit/proxy/runtime; production traffic and limiter behavior; multi-process file-book compare-and-swap; backup restoration and live legacy-data migration; contractor-specific rates, quantities, category definitions, material identity and applicable tax choices; exhaustive scope/fee combinations; quote expiry/offer-validity policy. The tests establish declared synthetic calculations, not the accuracy of external facts supplied by a customer or contractor.

The public-page branch remains a separate review library; the sales-demo branch still lacks real Gemini/microphone acceptance. Voice, messaging, booking, billing, widget publication and other unfinished platform phases are not made launch-ready by this repair. BUILD_STATUS keeps the broader Phase 2–6 gates open. No protected branch merge, production deployment, paid provider call, phone provisioning, external message or real-data migration was performed.

Independent review should check this branch and its evidence first. A public release still needs the deployed candidate identified, supported offerings/owner rules accepted, production smoke tests and the applicable operational/provider gates completed. Enabling unresolved services requires explicit pricing contracts; removing review guards would not establish accuracy.

## Reproduce and inspect

Use the existing REPRODUCE.md runtime instructions and committed run-completion.mjs groups: runtime, application, browser and regression. Supply fresh evidence directories, the compatible locked native runtime, the existing browser/esbuild paths, a candidate Git checkout and the preserved synthetic prior database for schema-upgrade verification. Do not run these fixtures against live stores. New regressions are committed in verification/quotedone/ and test/quoteApplicationBoundary.spec.mjs.

The accompanying evidence archive contains exact commands/exits, final source hashes, safe synthetic HTTP results, screenshots, original development attempts, the extra tax defect reproduction and a read-only inspector. It excludes databases, credentials, runtime binaries and dependency trees. After extraction, set QUOTEDONE_GIT to an available Git executable and run: `node inspect-repair-evidence.cjs <extracted-directory> <repository>`. The inspector validates every archived payload hash, source-to-Git binding, execution group and targeted acceptance result.

## Disposition of all 73 audit rows

| ID | Current disposition | Evidence-based state |
|---|---|---|
| A01 | Verified candidate | Repair branch codex/quotedone-audit-repairs-20260927; review commit d218c85c491a33cb301816d52e593b4f913a363c. Application/runtime/regression commit f96c14a049f68c1d32d54420d514d2e088fe722e; application bytes are identical. The accepted completion/main branches are preserved. |
| A02 | Verified unchanged | All 19 accepted engine files retain tree dcd481193b10c3cfc667cb23d22fb41b16322cff. |
| A03 | Verified execution | Fresh committed-source runtime, application, browser, full regression and build completed; exact logs/exits and source bindings are packaged. |
| A04 | Coverage improved; not exhaustive | Positive fixtures no longer declare unresolved notes/unknowns. Whole-request negatives, all 20 adapters and prior suites pass; arbitrary combinations are not proved. |
| A05 | Unverified | No running production build identity or deployment topology established. |
| A06 | Partly verified | Inspected all four registered local worktrees and preserved them; cannot attest to other machines or agents. |
| A07 | Fixed documentation | Added floor-overlay decision, corrected original >=300 provenance, reconciled main master-toggle rule, and made current no-assumption voice rules explicit. |
| B01 | Verified controls | Existing exact arithmetic controls pass; wire-token fidelity now prevents loss before route validation. |
| B02 | Verified fixed | Lossy raw HTTP decimals reject before any write, including BOM-prefixed JSON, nested maps/tiers/factors and customer measurements. Valid 200.01 and 90071992547409.90 persist and quote unchanged. |
| B03 | Verified controls | .0049/.0050/.0051 dollar rates produce $49/$50/$51, through real HTTP and persistence. |
| B04 | Verified controls | Invalid fractional-cent fixed amounts reject; unit rates retain their separate precision contract. |
| B05 | Unverified breadth | No exhaustive field-by-consumer monetary classification proof; repair only demonstrated mismatches. |
| B06 | Verified controls | 1200% markup on $100 yields $1300; no arbitrary commercial cap warranted. |
| B07 | Verified controls | Markup and true margin remain distinct; invalid margin reviews. |
| B08 | Business meaning unresolved | Eligible-cost margin is not automatically whole-job/net-profit margin. |
| B09 | Verified controls | Final selling-price categories are not marked up again in tested cases. |
| B10 | Confirmed intended limits | Other bounds exist; this is not itself evidence of a defect or authority to remove them. |
| B11 | Verified controls | TAX_MATERIALS follows the explicit taxability map, including taxable labor. |
| B12 | Unverified external facts | Arithmetic tests do not validate a contractor's jurisdictional tax choices. |
| B13 | Verified controls | Mode-specific minimum/tax/range ordering survives the financial and application controls. |
| B14 | Verified fixed boundary | Structured missing facts and explicit external unknowns review; all original details are retained. |
| B15 | Verified controls | Selected unpriced bagging reviews; zero, missing and fee applicability remain distinct. |
| B16 | Confirmed omission fixed; breadth remains bounded | Unknown/additional scope cannot release the selected-service subtotal. Existing selected-fee/add-on controls pass; no universal combination claim. |
| C01 | Verified fixed | Array, text and object unknowns block instant estimates on public, authenticated and preview paths. |
| C02 | Verified fixed | Untriaged context, differing serviceRequest and unsupported envelope fields require complete-request review. |
| C03 | Verified fixed | Text asking for bagging/removal cannot be ignored when structured inputs say No; it triggers review. |
| C04 | Safely restricted | No unproven scope/logistics classifier was added. Nonempty notes, including benign access notes, currently require review. |
| C05 | Unverified external facts | Exact/customer-measured labels are customer declarations, not independent measurements. |
| C06 | Unverified external facts | Offering identity matching does not establish the customer's actual material or repair condition. |
| C07 | Business contract incomplete | Several price-affecting category labels lack observable owner-approved thresholds. |
| C08 | Verified intended behavior | Class 2 defaults exist; they do not invent Class 1 owner rates. Preserve visible approved effective values. |
| C09 | Unverified external facts | Default/owner factors define a pricing rule, not independently proven consumption or effort. |
| C10 | Business contract incomplete | Repair allowances/hours need a bounded offering; no empirical completeness proof supplied. |
| C11 | Verified supported boundary | Real browser measured outline succeeds; invalid closure reviews. Other shapes remain unsupported. |
| C12 | Verified controls | Declared units and measured-scope contracts retained; no floor-to-wall or total-to-partial substitution justified. |
| D01 | Intended review-only scope | Purchase-cost roofing underlayment needs a coverage/package contract; retain guard. |
| D02 | Intended review-only scope | Cost-priced paint needs coverage, yield, coats and purchasable packaging; retain guard. |
| D03 | Intended review-only scope | Hardwood/laminate/carpet underlayment cannot inherit the vinyl scalar. |
| D04 | Intended review-only scope | Selected stairs require a complete priced package, not just a step rate. |
| D05 | Verified guard; ledger fixed | Floor overlay remains review-only; its preparation/compatibility/pricing decision is now recorded. |
| D06 | Intentional accepted restriction | Exact configured room thresholds still review. No wrong numeric quote was demonstrated; no custom equality policy invented. |
| D07 | Fixed provenance | Original default >=300 ->1.00 is explicitly acknowledged. Later accepted all-threshold equality guard remains; historical engine documents are identified as checkpoint records. |
| D08 | Intended review-only scope | Both fencing types review in real HTTP controls; approved post geometry is absent. |
| D09 | Intended review-only scope | Mixed footing labor/material allocation remains undefined. |
| D10 | Intended review-only scope | Gate prices require an approved width and included-scope contract. |
| D11 | Intended review-only scope | Siding trim requires explicit category/allocation; base siding has a passing positive control. |
| D12 | Intended review-only scope | Old-siding removal cannot be inferred from replacement material/area. |
| D13 | Intended review-only scope | Concrete demolition needs old-slab facts and priced removal/disposal scope. |
| D14 | Intended review-only scope | Exposed aggregate needs material inclusion or an explicit all-inclusive offering. |
| D15 | Intended review-only scope | Commercial flat-roof insulation/coverboard requires an identified system and measured scope. |
| D16 | Intended review-only scope | Every exterior-painting request remains review-only in the current contract and HTTP control. |
| D17 | Intended review-only scope | CUSTOM remains review-only; browser preserves custom description in the stored lead. |
| D18 | Intended review-only scope | Interior fair/poor preparation and independent primer need approved measured offerings. |
| D19 | Contract limitation | Uniform per-coat offering is supported; mixed zones/different coat pricing need explicit contracts. |
| D20 | Intended application guard | Configured seasonal surcharge is blocked pending trusted work-date versus quote-date policy. |
| D21 | Business meaning unresolved | Installed selling quantity, ordered quantity and actual consumption are not interchangeable. |
| E01 | Verified controls | Real approval, stale revision, invalidation, identity and disabled-service checks pass. |
| E02 | Additional defect reproduced and fixed | Jurisdiction text 1.0000000000000001 previously saved as 1. Exact validation and raw UI text now prevent that. Jurisdiction edits invalidate approval/revision; interview routes remain draft-only. |
| E03 | Verified controls | Real SQLite abort/rollback and successful retry prove commit-before-ack behavior for tested paths. |
| E04 | Unverified operational concern | Multi-process file races, power-loss durability and backup restoration not established. |
| E05 | Verified and extended | Actual 400/409/413/422 browser recovery, real 500 rollback and lost-response retries; concurrency, tenant isolation and restart also pass. |
| E06 | Historical receipt rule preserved; expiry policy unresolved | Exact retry is immutable, including after tax/rate edits. Expiry and offer-validity policy remain a separate business decision. |
| E07 | Verified fixed per owner ruling | Every new estimate submission requires email or phone syntax, including instant quotes. Missing/blank/malformed contact rejects before writes; editable correction survives reload. Reachability is not asserted. |
| E08 | Verified fixed | Customer renders optionAvailabilityNotice; mixed tiers show it, all valid tiers omit it, all-review tiers release no price. |
| E09 | Verified fixed | Definitive 400/409/413/422 rejections restore details and allow correction with a new UUID. Uncertain failures keep the immutable retry payload. Restored textarea labels remain stable. |
| E10 | Verified fixed | Operator owners and existing authorized staff can list/read/update their tenant leads; price/calculation access stays gated. No additional seats are provisioned. |
| E11 | Verified fixed in tested topologies | Real cross-origin and same-origin browser catalog/submission work, preserving exact allowlist denial cases. Deployed topology remains unverified. |
| E12 | Verified subset; broader concern unverified | Existing owner/staff/customer/tenant/privacy controls pass; not a proof for every future/legacy projection or owner-authored text. |
| E13 | Unverified operational concern | No production-rate/proxy/multi-instance/storage-growth guarantee follows from the per-process limiter. |
| E14 | Verified synthetic subset only | Old synthetic database upgrade passes with original rows intact; real legacy-data migration remains unverified. |
| F01 | Fixed current specification | Current voice document forbids paced/guessed/substituted measurements and retains unknowns; old scripts are archived as history. Live voice execution is still a separate gate. |
| F02 | Unverified full alignment | Growth remains a 15-page review library; demo explicitly lacks real-provider acceptance. Full launch-copy/rendered-site alignment not established. |
| F03 | Confirmed defects closed; launch acceptance outstanding | This repair candidate is ready for independent review. Unsupported pricing contracts and unverified deployment/provider/live-data gates still prevent a universal public-launch certification. |
