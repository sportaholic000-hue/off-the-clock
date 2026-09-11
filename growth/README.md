# Off The Clock AI — isolated growth work

## Current checkpoint: corrected sales positioning

The library contains 12 company-named guides and three hubs. The sales-copy correction replaces incumbent-first recommendations and tentative Off The Clock positioning with the complete operator-and-QuoteDone case. See [the correction record](evidence/SALES_COPY_CORRECTION_20260911.md) for the specific changes and source boundaries. No new pages were added in this correction.

- Branch: growth/public-pages-review.
- Original main base: ed12dca1253a8790c885b071ab6037e05632bea0.
- This correction starts at growth commit 3acba3504e62b1cd51ce84a41d16412fdd38a2d8.
- Work is confined to growth/. Do not change either quote engine, price books, onboarding, authentication, app routes, shared app styles, dependencies, workflows, providers, deployment configuration or application specifications.
- Nothing is merged, deployed or enabled for indexing.

## Built coverage

Alternatives: Podium Larry, Sameday AI, Avoca, Jobber Receptionist, Housecall Pro CSR AI, ServiceTitan Voice Agent, and Ruby.

Head-to-head: Podium Larry vs Sameday AI; Sameday AI vs Avoca; Jobber Receptionist vs Housecall Pro CSR AI; ServiceTitan Voice Agent vs Podium Larry; Smith.ai vs Ruby.

Hubs: comparison library, company-led alternatives directory and resources. Every guide card opens a completed article. The wider content map is not yet fully implemented.

## Source and output

- competitors/content.json: source register, vendor records and article order.
- competitors/alternatives/ and competitors/comparisons/: ten separately editable articles.
- build_competitor_library.py: expanded-library builder.
- build_public.py: base renderer and the original two articles; also corrected in this copy pass.
- public/assets/: unchanged independent page styling and search behavior.
- v2/: original acquisition-tool sources and three Node test suites, unchanged.
- tests/: reproducible static/browser checks, unchanged by the copy correction.
- research/ and evidence/: prior source research and checkpoint-specific verification.

Generated pages, the portable review, raw logs and screenshots are provided in the delivery ZIP. They are reproducible from committed source rather than committed as duplicate outputs. Original Library content is not overwritten.

## Build and check

From the repository root using existing tools:

```sh
python growth/build_competitor_library.py
node --test growth/v2/tests/*.test.cjs
python growth/tests/check_competitor_library.py
```

The builder writes only growth outputs, makes no network requests and installs nothing. Open growth/Off_The_Clock_Public_Pages_Review.html for the portable navigator or growth/public/START_HERE.html for separate-page review. public/page-manifest.json lists the fifteen pages.

Final correction checks: 44/44 V2 tests and 264/264 expanded static/browser checks passed. Tests verify function and layout, not the persuasiveness of sales copy. Chromium tests use the environment’s existing Playwright and set_content because direct file navigation is blocked. Do not install or reconfigure a user’s machine to reproduce them without permission.

The generated V2 tool retains SHA256 82c65a675d896339f47da2082a9d11dbaf79056c37dd917e296622c2c5dd3b79; the builder rejects a mismatch. The old five-page builder/test pair is for the smaller checkpoint; the expanded suite is the applicable check for this library.

## Publication remains separate

Pages remain noindex private review builds. Stronger sales positioning does not establish production availability. Live signup, demo, pilot enrollment, quoting and lead delivery are not connected here. Calls to action use actual local tools and disclose their behavior.

Competitor facts and source limitations were preserved, not newly researched in the copy pass. Reconfirm facts and approve product claims, real destinations, canonical URLs and launch settings before publishing. Keep this growth work separate from Codex’s engine assignment.
