# Nine coordinator variants — expectations before execution

Base: `d71f8e506293714e2630ceb07ae4f947c1e1bb97`. Continue only the existing `codex/qe-agent4-import-condition-boundaries-20261019` branch, personally. All products, sites, notes, tenants and providers below are synthetic; none is an Off the Clock business policy.

## Exact baseline: nine inputs, thirteen runs

R1 landing HTML is exactly `<html><body><p>NOTE</p><a href="/prices">Prices</a></body></html>`. `/prices` is exactly `<html><body><p>Widget $10 each</p></body></html>`. Both return 200 text/html. Each note is a separate default-limit run:

1. `Site-wide: customers must prepay before delivery`
2. `Site-wide: customers must prepay in full`
3. `Site-wide: weather permitting for every job`
4. `Site-wide: online orders must be prepaid`
5. `Site-wide: payment must be made in advance`

R2 landing is exactly `<html><body><p>Widget $10 each</p><a href="/qualified">Next</a></body></html>`. Preserve **Next**. Each of these four strings is served separately at `/qualified`, both as 200 text/plain and inside exactly `<html><body><p>LISTING</p></body></html>` as 200 text/html:

1. `Widget $10 each: Available to members`
2. `Widget $10 each, Available to members`
3. `Widget $10 each (Available to members)`
4. `Widget $10 each — Only available to members`

Every exact run must record both fetches, draft flags, saved prices, delivered provider facts, direct parser output and real dispatcher output **before** assertions on the repaired outcome. Calculate exact saved selection `Widget $10 each`, quantity `"3"`, confirmed `true`. Hand expectation: unconditional $10 × 3 = $30.00; these qualified cases must instead return `needs_review` with no extended amount. Do not change the expected result to preserve a failing implementation.

Expected R1: copy the visible note verbatim into the affected paragraph, or omit the affected listing safely. Expected R2: withhold the conflicting bare copy and retain the exact qualified wording (or withhold it if the complete paragraph cannot fit). Never infer eligibility. Expected safe output may remain partial and require review, but cannot expose an unconditional saved-price workaround.

## Additional controls and boundaries

- Cover each R1 clause in HTML/plain extraction, late discovery, entry cap 1 and text budgets that fit only the bare paragraph. Cover both R2 formats in reverse discovery order and entry/character budgets, including an exact-fit qualified paragraph. Reverse plain discovery needs an HTML index; it is distinct from the thirteen exact two-page runs.
- Punctuation may separate the same clause words. Preserve clause text rather than rewriting it. Recognition stays bounded to supported obligation/payment/weather clause forms and their explicit modifiers; no unrestricted language understanding claim.
- Keep unrelated website descriptions and product names independent. Examples: online-orders guides, weather newsletters, payment terminals and optional prepayment descriptions must not become applicable price restrictions. Product punctuation and digits within amounts must not be stripped into a different identity.
- A parenthesized qualification at the end can establish a qualified duplicate. A parenthesized phrase followed by a genuine product description cannot justify erasing that description from identity.
- Hidden notes and instruction-like text remain excluded. Visibility, page/section association, tax/contact behavior, exact decimals/currencies, saved identity and tenant/private-data boundaries retain their existing assertions.
- Actual draft must not modify saved knowledge. Owner save and delivered provider facts must retain exact reviewed text; dispatcher must use saved facts without website fetching. Synthetic foreign owner body fields cannot redirect writes.

Preserve all 1,030 existing cases and every prior evidence file. Add only a new voice-prefixed regression and this owned evidence directory; production changes are confined to `websitePriceExtraction.js` / `websitePriceImport.js` if needed. Do not change runtime, H1/H2 policy, A2's branch, arithmetic, selectors, workflows, specs, dependencies, engines, main, integration, tags or deployment. Keep the already-approved 45-minute CI budget unchanged.

Capture the unchanged-base failing baseline before production edits, then focused/new, retained 1,030, combined and build results. Publish the exact final commit, verify remote parent/tree/history, require all exact-head hosted gates, and match every retained/new test name in complete passing full-suite output. Store final hosted attestation externally so it does not change the tested head.
