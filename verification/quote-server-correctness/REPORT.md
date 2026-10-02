# Quote engine and price-book server repairs — October 2, 2026

This checkpoint completes five assigned correctness findings: **F01, F02, F03, F14 and F27**. The other six editor/interview findings (**F04, F05, F07, F08, F11, F13**) are assigned to the separate Codex task in [CODEX_PROMPT.md](CODEX_PROMPT.md). This report is limited to the quote engine and price book. Test counts are verification results, not counts of product defects.

Base: PR #15, `c2e9efcdcc4aaca4a7b8f610e4cdf792cb135010`, `codex/agreed-quote-followup-20261002`. PR #12/#14/#15 changes are preserved. No client files, dependencies, provider settings or live records were modified. No subagents, merge or deployment were used. The source manifest records the tested application/spec/test bytes for independent checkpoint verification. No full-phase or 100%-accuracy claim is made.

## Repairs

| Finding | Repair | Verified outcome |
| --- | --- | --- |
| F01 — configured concrete finishing labor misses access | Apply the existing configured access multiplier once to `exposed_aggregate_labor` in itemized mode. Preserve exact quantity/rate arithmetic and final cent rounding. | For 200 sqft at $1.50 and difficult access 1.25, finishing labor is **$375**, not $300. Complete test quote is **$4,613.89**. Base material and formwork charges are unchanged. |
| F02 — preview uses saved fee choices instead of the draft | Pass `draftRaw.ownerFeeSelections` to the preview calculation. Preserve explicit false and invalid/missing states. | $100 mowing plus a $50 travel fee previews $150 for draft Yes and $100 for draft No, matching the result after save/reapproval. Preview does not save or approve the change. |
| F03 — readiness invents required owner fee choices | Application readiness supplies the actual saved owner choices to the existing activation pipeline. Customer choices remain synthetic capacity probes and are collected per request. | Missing, malformed and stale owner selections produce NEEDS PRICING with an exact owner-field diagnostic. Explicit Yes and No both work. Customer-selected fees do not require a saved owner answer. |
| F14 — repair-map validator rejects correct depth and admits wrong depth | Current `tree` metadata takes precedence over obsolete `shapedKeys`; require leaves at the exact declared depth and all declared leaf keys. Preserve enum/boolean leaf checks and legacy two-level maps. | All six repair hour/allowance fields accept valid material → repair → small/medium/large maps. Shallower, deeper, incomplete and extra-key rows reject without overwriting saved drafts. |
| F27 — Alaska setup silently saves zero tax | Alaska now enters the existing explicit owner tax-confirmation flow. Align the old specification's Alaska exception with this requested correction. | Country/region alone returns 400 without changing book or profile. Explicit TAX_NONE, TAX_MATERIALS and TAX_ALL selections remain supported; no local rate is selected automatically. |

The Alaska change concerns setup confirmation only. The [Alaska Office of the State Assessor](https://www.commerce.alaska.gov/web/dcra/OfficeoftheStateAssessor/AlaskaSalesTaxInformation.aspx), checked October 2, states that lack of state sales tax does not eliminate municipal sales tax. This repair does not determine whether a particular business/job owes tax, resolve tax from job addresses or migrate existing owner choices. Other jurisdiction prefills are unchanged.

## Boundaries preserved

- The October 1 concrete all-labor access rule supplies F01's expected result. Installed finish packages retain their existing price basis; flat-roof insulation and other unresolved multiplier policies are untouched.
- Both concrete service types, exact rectangle and measured-outline inputs, all three access levels, owner factor overrides, fractional rate/area rounding, tier rates, markup, TAX_NONE/TAX_ALL/TAX_MATERIALS and minimum interactions were checked. The existing area/perimeter-only geometry-review gate remains intact.
- F03 uses the same existing engine fee validation as requests, including scope-replaced fees. Engine-only readiness callers that do not supply saved owner decisions retain their existing synthetic per-request probes. The application explicitly supplies its saved decisions.
- Saving a price book still does not approve it. A changed choice requires reapproval before the customer quote changes. The fee-mode editor cleanup and customer-fee preview controls are owned by the other Codex task.
- Interview validation does not invent material/repair keys or require a complete live book merely to save an otherwise valid draft. It rejects malformed field shapes. Explicit zero allowances and valid fractional mowing rates remain supported. The richer interview controls and raw-decimal editor handling are owned by the other Codex task.

## Evidence

Runtime: Node 22.23.2. All verification data is synthetic; no live provider response or user record was used. Counts overlap.

| Verification | Result | Evidence |
| --- | --- | --- |
| Final new regressions against unchanged base | 7 control cases pass; 39 fail | `before.tap` |
| Final new regressions after repair | 46/46 pass | `regressions.tap` |
| Targeted existing/new engine and price-book suites | 584/584 pass | `focused.tap` |
| Full repository regression command | 1,192 records: 1,181 pass, 9 existing failures, 2 skip; no new failures | `full-suite.tap`, `full-check.txt` |
| Owner app and widget builds | Both pass | `build.txt` |
| Real local API, isolated database and fresh synthetic owner | 52 HTTP requests completed with assertions for all five findings | `http.json`, `http.mjs` |

The full-suite baseline failures are unrelated existing tests and are not counted as additional quote-engine findings. Neither those files nor the allowlist were changed. The targeted 584-test run includes the original hand-calculated quote tests, VNext ordinary/adversarial/repair suites, measured scopes, AI validation, prior roof/readiness and agreed follow-up repairs. The final 46-test run also checks the added material-tax/minimum expectations; application bytes were unchanged between these runs and the final full-suite run.

Hand calculations were written before execution. For the difficult-access concrete fixture, other lines total 273,889 cents; base plus finishing labor is `(120,000 + 30,000) × 1.25 = 187,500` cents, giving 461,389 cents. At 10% markup, the selling subtotal is 507,528 cents. At 15% TAX_ALL the total is 583,657 cents. With only material taxable, the marked-up material base is 262,778 cents and tax is 39,417 cents, giving 546,945 cents. A 600,000-cent pre-tax minimum produces 690,000 cents with TAX_ALL and 639,417 cents with that material-tax setup.

The HTTP harness verifies:

- Concrete returns $4,613.89 through public submission, authenticated owner submission and saved preview, with $375 internal finishing labor and no private lines in the customer response.
- Both directions of a travel-fee change produce the correct draft preview without changing stored data. Customers retain the old saved price until save and reapproval; the interim unapproved configuration returns review.
- A missing saved owner travel choice prevents live status and catalog inclusion; a direct quote request returns review without a price.
- A valid repair-hours cube and a cube with zero/fractional-dollar material allowances survive save, reload and review handoff. Three malformed replacements return 422 and leave the saved draft unchanged.
- Alaska setup without an explicit choice returns 400 and preserves both old book and business profile. Explicit synthetic tax choices save exactly; invalid taxable rates reject without mutation.

Two harness/expectation corrections were made during development: area/perimeter-only concrete inputs were changed from an assumed positive case to the existing geometry-review negative control, and the HTTP harness was corrected to read readiness statuses from the approval response rather than the book GET response. These did not change application policy or suppress a product failure. The retained final before/after results use the corrected expectations.

## Reproduce and integrate

Use Node 22, the repository lockfile and the existing CI's browser setup. For an external installation, `PRICEBOOK_BROWSER_MODULE` names the Playwright directory and `PRICEBOOK_BROWSER_EXECUTABLE` names Chromium.

```sh
npm --prefix client run build
node --test test/quoteServerCorrectness.spec.mjs test/priceBookAI.spec.mjs test/quoteReadinessRepairs.spec.mjs test/agreedAuditFollowup.spec.mjs test/opusQuoteRepairs.spec.mjs test/measuredScopes.spec.mjs test/quoteEngineVNext.spec.js test/quoteEngineVNextAdversarial.spec.js test/quoteEngineVNextRepairs.spec.js test/quoteEngine.spec.js test/tenantAddon.spec.js
node --test test/*.spec.js test/*.spec.mjs > full-suite.tap 2>&1
node .github/scripts/check-test-results.mjs full-suite.tap
node verification/quote-server-correctness/http.mjs /absolute/scratch/output
```

The HTTP harness uses port 4513 and a newly created synthetic store under its output directory. It disables provider writes, blocks external fetches and closes the server/database. The full suite exits nonzero for its existing baseline failures; the checker separately detects new failures.

Both this server branch and the editor branch start from c2e9efc. Combine them without replacing either side, then verify the complete editor/interview → save → approval → preview/customer flow. F11 depends on this branch's F14 validation fix. The six assigned editor findings remain open until their own changes and combined verification are available.
