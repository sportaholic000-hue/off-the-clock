# Agreed quote-engine audit fixes — October 2, 2026

The agreed repair set is implemented on top of PR #14. This is a scoped repair checkpoint, **not a claim of 100% accuracy or launch readiness**. The full CI test command still has the repository's nine recorded voice failures. Disputed claims, pricing-policy decisions and findings unique to the independent audit remain for discussion.

## Source and scope

Base: `25fca4812bbc0eb905b1d91124c2aa53aced791a`, branch `codex/quote-readiness-20261002` (PR #14), itself based on PR #12. The other Codex's changes are preserved. The new application delta addresses Claude findings **m1–m6** only. No subagents were used. No deployment, merge, live-data migration, dependency change or real provider request was performed.

The source manifest records the exact application/test bytes used in verification. Each pre-edit baseline was checked against the base commit's Git blob SHA. Repository source/test files were compared with the same tree; only the listed source changes remain. A pre-existing local newline difference in an unrelated persistence test was restored to the remote bytes before the final full-suite run.

| Audit item | Disposition in this checkpoint |
| --- | --- |
| B1 — roof minimum currency boundary | Inherited from PR #14 and rechecked through real save/reload and all three quote paths. |
| B2 / M1 — catalog/readiness and optional work | Inherited from PR #14; rechecked with base concrete and walls-only painting. The reconciliation did not establish an approval bypass. |
| M2 — exterior/fence setup path | Preserve PR #14's configured-offering editor and existing prices; do not invent offerings from legacy fields. |
| M3 — obsolete AI starter catalog | Preserve the current catalog from PR #12/#14. This does not promise complete or market-accurate AI-generated books. |
| M4 — obsolete interview fields | Preserve the current interview catalog. Separate structured-control and three-level repair-map findings remain outside this agreed subset. |
| M5 — flat-roof Average instructions | Preserve PR #14's corrected help; unknown systems remain review-only. |
| M6 — missing paint-product diagnostics | Preserve PR #14's exact missing-product diagnostics and scope-aware readiness. |
| M7 — interior-painting measurement specification | Preserve PR #14's measured-wall-area correction. |
| m1 — unsupported fractional-cent siding labor | Fixed in this delta: editor feedback and server save rejection, without rounding. |
| m2 — absent AI currency/region | Fixed in this delta: saved tenant country/region and explicit CAD/USD in starter requests. |
| m3 — joined scope sentences | Fixed in this delta: add terminal punctuation when the description has none. |
| m4 — redundant component labels | Fixed in this delta: “Existing siding removal labor” and “Existing slab demolition labor.” Rate keys, categories and amounts are unchanged. |
| m5 — unsupported accessories percentage | Fixed in this delta: remove the unsourced 20–30% advice; preserve the inclusion list. |
| m6 — stale integration README | Fixed in this delta: describe the application bridge and clearly mark the original isolated-candidate notes as historical. Deployment remains unverified. |

## Behavior and limits of the new fixes

**Siding precision:** Standard `SIDING_REPLACEMENT.laborPerSqft` requires whole cents under its existing engine contract. `$2.555` now remains visible with an actionable editor error, and a save returns HTTP 400 without changing the saved book or revision. `$2.55` is accepted. Root, nested and tier overrides share the check. Historical 255.5-cent values remain readable as `$2.555` for correction; they are never silently rounded. Valid fractional-cent mowing/custom rates are preserved. This is not a global change to unit-rate precision.

**AI market context:** The authenticated starter route uses the tenant's saved business profile, not country/region supplied in the request body. CA sends CAD; US sends USD, with the saved two-letter region when available. A missing/unsupported country returns HTTP 422 before a provider request, with instructions to complete onboarding or enter prices manually. Suggestions remain inactive, unapproved drafts. No exchange-rate conversion or pricing default was added. Mocked provider responses verify prompt construction and routing, not the accuracy of a live model's prices.

**Presentation:** Scope descriptions retain their content and receive a sentence separator when needed. Label changes do not alter removal categories, multipliers or prices. No other pricing formulas, tax rules, minimum policies or rounding rules were changed.

## Verification

Runtime: Node 22.23.2. All data used by the HTTP/browser harnesses is synthetic. Counts below overlap; do not add them together.

| Check | Result | Evidence |
| --- | --- | --- |
| New regression cases on the pre-fix source | 1 passed, 9 failed | `followup-before.tap` |
| Same 10 cases after repairs | 10 passed | `followup-after.tap` |
| Readiness + AI + prior Opus repairs + new regressions | 126 passed | `focused.tap` |
| Exact CI test command, including browser specs | 1,146 records: 1,135 passed, 9 known failures, 2 skipped | `full-suite.tap` |
| Existing known-failure checker | Exit 0; 9/9 recorded failures, no new failure | `full-check.txt` |
| Owner application and widget builds | Both passed | `build.txt` |
| Real local application HTTP harness | 32 requests completed, with save/readback/quote/AI assertions | `http.json`, `http.mjs` |
| Actual React editor in Chromium | Invalid text retained, error displayed, correction accepted; no page errors | `browser.json`, `browser.mjs` |

The HTTP harness verifies a `$2,500` roof minimum persists as **250,000 cents** and reloads as `$2,500`. With 15% tax and the existing range rules, public submission, authenticated owner submission and owner preview return **$2,875 / $2,875 / $3,163**. All 20 service minimum converters map `$2,500` to 250,000 cents; roof root/nested/tier and shared minimum locations also preserve the conversion. This rechecks the other Codex's repair; this delta does not implement it again.

Base concrete, walls-only painting and siding are listed in the customer catalog and return ready results through all three paths. Changing shared tax settings without reapproval still produces review. The authenticated route was exercised as an owner, not as a separate staff account. The browser harness renders the actual editor with mocked API transport; the separate HTTP harness exercises the real server and isolated database.

The two currency cases deliberately submit a conflicting country in the request body: the provider receives the saved tenant's CA/NS/CAD or US/MA/USD context. An unknown saved country yields 422 with no third provider request. All provider responses are intercepted fixtures; unexpected external HTTP requests are blocked.

Initial verification attempts that lacked local test assets/build outputs, used restricted process isolation, or used bare `node --test` discovery were not used as the final gate. The final result above uses the repository's explicit CI glob after restoring exact test assets and configuring Chromium. The nine remaining failures concern the voice adapter/compiler/WebSocket fixtures, voice persistence and voice security schemas; they match the existing repository list. They were not edited or hidden.

## Reproduction

Use Node 22 and install dependencies from the repository lockfile. Install Playwright/Chromium as in the existing CI. `PRICEBOOK_BROWSER_MODULE` may point to an external Playwright package directory and `PRICEBOOK_BROWSER_EXECUTABLE` to Chromium.

```sh
npm --prefix client run build
node --test test/quoteReadinessRepairs.spec.mjs test/priceBookAI.spec.mjs test/opusQuoteRepairs.spec.mjs test/agreedAuditFollowup.spec.mjs
node --test test/*.spec.js test/*.spec.mjs > full-suite.tap 2>&1
node .github/scripts/check-test-results.mjs full-suite.tap
node verification/agreed-audit-followup/http.mjs /absolute/scratch/http-output
node verification/agreed-audit-followup/browser.mjs /absolute/scratch/browser-output
```

The HTTP harness uses loopback port 4503, creates a new synthetic database under its output directory, supplies fixture credentials, blocks unexpected external fetches and closes the server/database. Do not point its output at live storage. The full suite intentionally exits nonzero while the nine known failures remain; the checker separately distinguishes new failures.

## Left for discussion

R1–R5 remain unchanged: tax treatment of bundled installed prices; siding-removal height-rate interpretation; shared-default reapproval UX; patterned-flooring labor policy; and consolidation of older display/rounding language. Existing approval invalidation and minimum protection remain intact.

Findings unique to the independent audit also remain unchanged, including the concrete finish-labor access multiplier and three-level repair-map validation. AI draft completeness, production configuration, live market-price accuracy and the broader voice/launch gaps are not certified by this repair. Historical ambiguous roof minimum records still require the explicit owner recheck introduced by PR #14; no guessed migration is appropriate.
