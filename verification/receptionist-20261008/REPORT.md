# Receptionist repairs — 2026-10-08

Base: `c68b9bc754e8d95cc3aab8c26f286d4a94f57204` (`claude/pricebook-conflict-recovery-20261008`). Working branch: `fix/receptionist-20261008`.

Work performed by one agent, with synthetic tenants, signed synthetic HTTP/WebSocket calls and fake providers. No deployment, main merge, live call, or live customer data. Nothing under `specs/` or `server/quote-engine-vnext/` changed.

| Item | Change | Regression names |
| --- | --- | --- |
| 1 | Production loads the digest-pinned guide from `server/src/voice/receptionistGuide.md`. CI builds the actual Docker image and probes health with voice enabled, synthetic credentials and Docker networking disabled. | `receptionist 1 production runtime-stage layout starts voice on without specs and returns health 200`; `receptionist 1 CI builds and probes the network-isolated Docker runtime` |
| 2 | All twenty guide flows use the current measured-input rules. Painting and siding ask measured wall area, painting asks coats, fence height is open-ended, unknown membranes go to review, and no assumed sizes, dimensions, prices or deadlines are offered. The original guide in specs is untouched. | `receptionist 2 all twenty live flows use measured inputs and open fence height`; existing compiler digest and all-twenty communication-policy tests |
| 3 | One helper rewrites contact phrases for both prompt facts and listed-price matching. It preserves financial sentences and ordinary uses such as text engraving, and removes only positively identified communication offers. It applies to hours, policies and the other knowledge fields. | `receptionist 3 shared communication rewrite preserves prices tax and ordinary text`; `receptionist 3 sentence rewriting removes only communication offers and preserves financial qualifications` |
| 4 | Listed arithmetic accepts one complete flat-rate sentence plus only tax/contact qualifications. It rejects unclassified conditions, uses exact decimal multiplication with half-up cent rounding, announces rounding when needed and joins sentences without doubled periods. Existing fractional-cent/pickup fixtures now reflect the owner's stricter ruling. | Twelve `receptionist 4 flat listed price …` vectors; fourteen `receptionist 4 unclassified listing requires review …` vectors; `receptionist 4 zero quantity refused and speech joins with one period`; existing dispatched listed-price and tenant tests |
| 5 | Identity names allow currency symbols, numbers and cost/rate words while retaining length/control limits. Saves reject invalid service/product labels, oversized knowledge and product catalogs. Approval and activation enforce the live-service ceiling. Compilation failures queue a durable owner alert naming the setting, shown in the dashboard and emailed through the existing retry worker. Bulk status checks reuse one book digest rather than hashing the entire thousand-service book once per service; no engine arithmetic changed. | `receptionist 5 save identity and signed call: …`; six `receptionist 5 … 20000 accepted, 20001 rejected, signed call keeps saved knowledge` cases; never-say 200/201 and line-length cases; service/product label cases; 1000/1001 product and live-service cases; `receptionist 5 compilation failure names the setting in durable dashboard and email alerts, isolated by tenant` |

The product-catalog test checks a saved unapproved thousand-product catalog, the compiler's thousand-offering boundary, and a signed call after the accepted save. The live-service test uses verified synthetic historical approval receipts and exercises real save/approval operations plus a signed call containing 1,000 live services. No provider is contacted.

The initial focused regression run on the pinned base recorded 34 cases: 7 passed, 27 failed. After repair, the new regression files contain 55 tests, all passing with zero failures, cancellations, skips or TODOs. Final command results are recorded in `results.json`.

The route-source fingerprint was reviewed and updated only for the existing production voice runtime; no routes or authorization rules were added or removed. The known-failures file remains empty.

Publication remains subject to the owner's requirement that all four local commands be green before pushing. This workspace has no Docker executable. Chromium installation fails on its cache lock, and the downloaded browser exits with SIGSEGV on launch. The image CI job is added, but its actual Docker execution is not claimed as verified locally.

## Final local verification

- Cold `npm ci`: passed (328 packages).
- `npm run build`: passed; tracked `client/dist` restored before committing.
- New regressions: **55/55 passed**, zero failures or skips. Final shared-text and compiler check: **63/63 passed**.
- `npm test`: **3,949 tests; 3,892 passed; 57 failed; zero skipped/cancelled/TODO**.
- `npm run test:quote`: **2,795 tests; 2,738 passed; 57 failed; zero skipped/cancelled/TODO**. Architecture check passed.
- Every failure in both complete suites is a browser-launch failure. No other failure was recorded. The final ordinary-text refinement also passed its dedicated compiler/rewrite check.
- Actual Docker execution and hosted CI are unfinished. The production runtime-layout health test passed locally.
- **Not pushed:** the explicit requirement for green local commands before pushing is not met. No merge or deployment occurred.
