> **September 28 correction: customer quoting is still unfinished.** The owner did not authorize replacing the detailed voice guide or making ordinary names, addresses and timing information prevent a quote. The original 459-line voice guide and original engine-specification text are restored exactly. The earlier blanket refusals and the test changes that accepted them are not product requirements. The application code in the published PR is still the 808d723 implementation; its ordinary-customer regression is open. An unpublished local candidate at `6da69f6c2b4cd50d600fc937e201b8870228cf95` restores normal customer controls but still fails additional-work/uncertainty cases inside name/address text. A checked summary alone does not resolve that gap. No whole-flow acceptance or launch gate has passed. The 19-file arithmetic engine and verified precision, callback, retry, privacy, approval and persistence repairs remain unchanged. Restoring the original documents does not implement voice, booking, messaging or change the engine. The reports below are historical evidence for their stated commits, not new owner decisions.

# Historical application checkpoint

This report records implementation `e936370`. For the current September 27 repair candidate, verified fixes, remaining limits and evidence, read [REPAIR_REPORT_20260927.md](REPAIR_REPORT_20260927.md). The earlier report remains unchanged below as historical evidence.

---

# QuoteDone application completion evidence

**The authorized non-production owner → approved book → customer quote OR durable review lead → owner/staff view workflow passed its committed-candidate verification.** See status.json for every required acceptance row.

## Scope and source

- Starting local branch: codex/quotedone-application-completion.
- Starting SHA: c9404b586b1b43170514d931902ce6dc656645f6; clean worktree. This includes the preserved earlier application prerequisite work.
- Tested implementation SHA: e936370165cb23bbb0087d245ecd64bc82178fe0.
- Frozen engine tree: dcd481193b10c3cfc667cb23d22fb41b16322cff (19 files), unchanged.
- Final delivery adds documentation and the evidence package. No implementation changes are hidden in the delivery commit.

This is the authorized non-production application integration. It intentionally supersedes the former no-application-import checkpoint. It is not a production merge, deployment or universal correctness claim.

## Working customer workflows

1. **Owner entry and approval:** genuine login; exact manual dollar/rate input; protected service UUID/source; root/nested field retention; saved revision; explicit complete-configuration review; individual AI confirmations; explicit enable choice. Preview does not save, approve or enable.
2. **Customer quote:** a scoped public key resolves the tenant, the saved service ID selects the record, approved configuration crosses one trusted adapter into frozen VNext, and only the engine's customer allowlist is returned. All 20 types are exercised; 16 supported ordinary controls have independently derived prices and four types intentionally remain review-only.
3. **Customer review lead:** incomplete pricing, missing measurements, unsupported types/scope, unknown saved service and disabled/unapproved configuration retain the original submission, selected scope, explicit unknowns, contact, location, urgency, complete book snapshot and available internal engine evidence. One real SQLite transaction commits all related rows before acknowledgement.
4. **Owner and staff follow-up:** owners see complete internal records; staff see the permitted customer/project details without pricing evidence. The correct tenant can dismiss/reopen a lead. Another tenant cannot read or change it.
5. **Failures and restart:** real SQLite abort rolls back all rows and returns failure; exact retries recover the same stored customer response; changed content under an existing request ID is rejected; concurrent retries and dropped response bodies do not duplicate a lead. Actual server restart and fresh login preserve book meaning, approvals, enabled choices, quote/lead records and retry records.

## Unfinished work found and completed

The initial native precondition was still blocked under the earlier runtime restriction. At c9404b5 the actual application had no QuoteDone public access endpoint (authenticated baseline returned 404), still used legacy calculation routes, and lacked the complete trusted VNext submission/approval/lead workflow. Earlier component fixes did not establish application acceptance. This pass supplied the authorized application bridge, protected approval/revision operations, customer form, complete durable submission transaction, owner/staff retrieval and actions, and real browser/HTTP verification.

| Proven application defect / gap | Responsible source and bounded correction | Regression / independent evidence |
|---|---|---|
| No real application could load the locked native dependencies with the prior runtime setup | Disposable official Node 22.23.2 x64 plus exact locked maintainer SQLite/bcrypt artifacts; no canonical dependency edit | runtime-preflight: actual SQLite commit/rollback/reopen; bcrypt correct/wrong password; actual registration/login |
| Application quote routes did not call the accepted engine through trusted saved identity | server/src/quoteDoneBridge.js and quoteDoneRoutes.js bind authenticated/public-key tenant and saved service; no legacy fallback | all-adapters: all 20 types and one-field missing-measurement controls; access-retry: forged caller/owner and tenant controls |
| Complete quote/review persistence and retry semantics were absent | submitQuote uses one immediate SQLite transaction for quote OR lead, request record and tenant-scoped immutable submission | access-retry: actual abort trigger, rollback, eight concurrent duplicates, lost body, changed-content conflict, cross-tenant retry, restart |
| Owner configuration could not express the accepted measured contract and approvals | Application metadata, exact conversion, structured trees, basis/tax/fee controls, saved approval operations and current revision checks | browser-workflow, all-adapters, money-workflow, editor-integrity; independent rates .0049/.005/.0051 yield $49/$50/$51 |
| Same-path sign-out retained the authenticated root view | client/src/main.jsx rerenders navigation state and keys the authentication view | browser-workflow-06 original failure; final genuine sign-out/login after restart, plus staff sign-in |
| Dormant generic JSON fallback retained old data on parse failure (source hardening) | client/src/pricebook.jsx propagates the invalid draft; active VNext metadata uses structured controls instead | No current metadata field renders this fallback. This change is source-traced only; no execution-coverage claim is made for the dormant control. Active invalid-text/save paths are exercised separately. |
| Current AI approval was blocked by a retained known legacy trimRatio confirmation | projection excludes only known unsupported legacy confirmations from the measured engine request; stored originals remain, disclosed and acknowledged; current receipts are merged | legacy-approval-before returned review with confirmedFields.trimRatio; corrected $5300 = 1000×$2 + 1100×$3; .23 root factor retained; unknown confirmation still reviews |
| Clearing taxability or markup applicability invented false | client/src/quoteDoneControls.jsx preserves missing when Choose is selected | configuration-before full returned books reproduced both failures; final real UI clear/explicit No/explicit Yes controls pass |
| Public catalog returned malformed raw offering data from a private draft | customerCatalogService permits only declared customer selectors, slug keys and UUID values; public name/fee projection is bounded | configuration-before exposed privateOwnerPricing; corrected catalog is empty for it; all-adapters verifies genuine registrations survive |
| Legacy duplicate saved UUIDs could select the first service | Shared case-insensitive identity matching now requires exactly one record for calculation, approval, preview and ready status | identity-before reproduced released quote and 200 approval/preview; corrected review lead, 409 conflicts and not-ready statuses; unique/restored $50 controls pass |
| Customer form treated measured outlines, explicit unknown layer counts and custom descriptions as ordinary numbers | client/src/quoteDoneControls.jsx adds signed measured-point entry without guessed closure, a metadata-bounded integer/unknown selector and a text control; customer fields have explicit labels | structured-before-02 proves all three controls absent while the backend quotes $3538.89; structured-measurements-workflow proves the corrected browser path, one-coordinate invalid closure, invalid exact decimal, unknown/known layers, layer boundaries and retained custom text |
| Two historical static tests assumed the replaced inline legacy route | test/phase2.spec.js traces the new route module and trusted eligibility/sanitization bridge; actual HTTP regressions independently prove behavior | Initial ordinary run 428/430; final ordinary run recorded below. No accepted engine assertion changed. |

The npm workspace build wrapper at ef31393 exited 1 with `'vite' is not recognized as an internal or external command`. The copied dependency set lacks its Windows command launcher. No package, launcher or environment repair was made: the final runner invokes the same locked `node_modules/vite/bin/vite.js build` entrypoint directly with portable Node and the client working directory. That actual command/result is recorded below.

The earlier 3a1c8b9 ordinary suite passed 430/430, but its subsequent standalone VNext run was deliberately stopped when the duplicate-identity reproduction required a new implementation commit. Its results are development evidence, not the final candidate pass.

Development failures also included a cold-server startup timeout, browser locator/script errors, a relay OPTIONS empty-body parser error and one missing copied verification helper. They were test/harness issues, not evidence of arithmetic defects or a new environment prerequisite. The initial monetary replay had two incorrect expectations: TAX_MATERIALS honors explicit category taxability, including labor if true; an explicit free designation with a remaining positive core charge reviews. Those expectations were corrected against the frozen source; no engine rule changed.

## Evidence interpretation

Final application/browser paths use real authentication, HTTP and SQLite. A separate response/evidence inspection checked 299 recorded customer objects and ten executed source bindings against the 101-file Git/disposable manifest. Owner previews are identified by their recorded routes and checked separately through the authorization matrix. All fixtures identify synthetic data; there are no live accounts or stores. The timing relay forwards the actual server response without alteration and delays only delivery. A synthetic SQLite ABORT trigger and explicitly marked legacy-file setup are targeted fault/legacy controls. Existing component tests with controlled fetch and the instrumented engine replay are supplemental, not application acceptance substitutes.

Complete response bodies and internal persisted outcomes are included. The independent expected arithmetic is in adapter-cases.mjs and money-workflow.mjs. Source manifests record Git blobs, actual executable-file hashes and any CRLF/LF-only difference; they do not normalize prices, IDs, approvals, units or statuses. Generated identities and timestamps remain in captured objects and their relationships are asserted.

The public API preserves frozen numeric JSON display: exact cents internally; accepted outward ranges and minimum/sub-dollar protections; exact single prices may retain cents. No arbitrary markup cap is added. $100 at 1200% markup yields $1300; gross margins 90%, 99% and 99.9% follow the accepted formula, while 100% and above review. Selected unpriced extras review rather than disappear. See the final monetary result objects for every exact input and result.

## Final verification results

| Command / workflow | Observed result | Exit |
|---|---|---|
| runtime-preflight | Passed; full objects/logs included | 0 |
| all-adapters | 20 types + 20 missing-measurement controls | 0 |
| money-workflow | 65 controls | 0 |
| access-retry-workflow | Passed; full objects/logs included | 0 |
| legacy-approval-workflow | Passed; full objects/logs included | 0 |
| identity-ambiguity-workflow | Passed; full objects/logs included | 0 |
| schema-upgrade-workflow | Passed; full objects/logs included | 0 |
| browser-workflow | Passed; full objects/logs included | 0 |
| configuration-privacy-workflow | Passed; full objects/logs included | 0 |
| editor-integrity-workflow | Passed; full objects/logs included | 0 |
| structured-measurements-workflow | Passed; full objects/logs included | 0 |
| ordinary | 430/430 tests | 0 |
| vnext | 311/311 tests | 0 |
| quote-engine | 46/46 tests | 0 |
| original-precision | 22/22 tests | 0 |
| focused | 25/25 tests | 0 |
| instrumented-replay | 35/35 tests | 0 |
| historical-isolation | Expected original no-import rejection; not a passing isolation gate | 1 |
| integration-boundary | Passed; full objects/logs included | 0 |
| client-build | Production client bundle built in disposable copy | 0 |

All expected commands completed. No test remained blocked by the environment. The historical isolation gate exited 1 intentionally because this branch is authorized to integrate through one bridge; it was not weakened or reported as passing. The separate integration boundary passed. The evidence ZIP is evidence/quotedone-e936370-application-evidence.zip.

## Remaining business decisions and limits

See OWNER_DECISIONS.md for each affected service/scope, current behavior, operational consequence, source gap and narrow owner ruling. Review-only scope is correct lead behavior, not an unfinished arithmetic repair. Current owner category/basis/tax/fee choices must be explicit and approved; customer statements are not proof of real-world conditions.

Independent external audit, actual-world measurement truth, live saved-data migration, load/abuse testing at production scale, multi-instance storage coordination, production deployment and provider/telephony flows remain unverified. No live provider, SMS, billing or booking flow was exercised. Existing supplemental provider mocks are not provider acceptance. These are not claims that the non-production workflow tests covered future release work.

## Proposed new control labels

Existing mandated price labels remain. These additional labels are proposed for this non-production owner workflow: Customer quote link; Allowed website origins; Save quote-link access; Quote configuration; Apply markup / margin; Owner approval; Review saved configuration; Confirm saved configuration; Original pricing source; Explicit free offerings and included required prices; Included zero price path; Covering positive price path; Register offering; Retained legacy settings; Owner-only calculation and request evidence; Dismiss; Reopen for review. Customer additions include Add measured point, Remove point, signed X/Y measurements in feet, Unknown — requires review, Request an estimate, Submit estimate request, Request saved for review and Retry saved request. The configuration snapshot and help text state the exact saved scope of approval. No public release of these controls is authorized here.

## Exact implementation and test files changed from the starting SHA

- client/src/main.jsx
- client/src/onboarding.jsx
- client/src/pricebook.jsx
- client/src/pricebookEditing.js
- client/src/quoteDoneControls.jsx
- client/src/quotedone.jsx
- client/src/ui.jsx
- docs/quotedone-completion/RUNTIME_EXCEPTION_20260914.md
- server/src/quoteDoneBridge.js
- server/src/quoteDoneRoutes.js
- server/src/schema.js
- server/src/server.js
- test/phase2.spec.js
- verification/quotedone/access-retry-workflow.mjs
- verification/quotedone/adapter-cases.mjs
- verification/quotedone/all-adapters.mjs
- verification/quotedone/application-harness.mjs
- verification/quotedone/browser-workflow.mjs
- verification/quotedone/configuration-privacy-workflow.mjs
- verification/quotedone/editor-integrity-workflow.mjs
- verification/quotedone/first-workflow.mjs
- verification/quotedone/identity-ambiguity-workflow.mjs
- verification/quotedone/integration-boundary.mjs
- verification/quotedone/legacy-approval-workflow.mjs
- verification/quotedone/money-workflow.mjs
- verification/quotedone/run-command.mjs
- verification/quotedone/run-completion.mjs
- verification/quotedone/runtime-preflight.mjs
- verification/quotedone/schema-upgrade-workflow.mjs
- verification/quotedone/structured-measurements-workflow.mjs

The delivery additionally adds docs/quotedone-completion/APPLICATION_REPORT.md, CONTRACT_TRACE.md, EVIDENCE_INDEX.json, OWNER_DECISIONS.md, REPRODUCE.md and evidence/quotedone-e936370-application-evidence.zip, and updates status.json. The Git diff is the authoritative complete inventory. CONTRACT_TRACE.md maps the governing requirements to source entrypoints and execution evidence.

## Boundaries preserved

The 19-file engine, legacy engine implementation, package manifests/lockfile, tracked dependencies, GitHub Actions and protected branches remain unchanged. Application routes and the bounded UI on this completion branch intentionally changed under START_HERE.md. Existing telephony routes/configuration were not changed or called. No machine-wide installer, persistent PATH/settings change, compiler installation, paid provider operation, live data, merge or deployment occurred. The only native/runtime restoration happened in the disposable verification copy with the explicitly authorized official artifacts. RUNTIME_ARTIFACT_RECHECK.json independently rehashes all four downloaded files, all 2,034 extracted files, and the unchanged canonical native binaries. EXISTING_BUILD_RUNTIME.json binds the already available Windows esbuild executable to the unchanged resolved/locked 0.25.12 version.
