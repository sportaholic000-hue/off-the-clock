# Off The Clock AI — isolated growth work

## Current delivery: named competitor library

The review site now has **15 pages: seven company-named alternatives guides, five head-to-head comparisons and three hubs**. The original V2 acquisition tools remain byte-identical. Nothing is merged or deployed.

- Branch: `growth/public-pages-review`.
- Original base: `ed12dca1253a8790c885b071ab6037e05632bea0` on main.
- Expansion starts at: `063787e5f30a5611f7b0c5b0ecce681861c10767`.
- Tested expansion functional source: `2f610b81ed4c88d4cd98ef9b33cf2cd33ccf4714`; subsequent delivery commits change documentation only.
- Boundary: work below `growth/` only. Do not change either quote engine, price books, onboarding, authentication, app routes, shared app styles, dependencies, workflows, providers, deployment configuration or application specifications.

## Built coverage

Alternatives: **Podium Larry; Sameday AI; Avoca; Jobber Receptionist; Housecall Pro CSR AI; ServiceTitan Voice Agent; Ruby**.

Head-to-head: **Podium Larry vs Sameday AI; Sameday AI vs Avoca; Jobber Receptionist vs Housecall Pro CSR AI; ServiceTitan Voice Agent vs Podium Larry; Smith.ai vs Ruby**.

Hubs: comparison library, company-led alternatives directory, and resources. Every displayed guide card opens a completed page. The wider content map, including quoting/estimating competitors, is not yet fully implemented.

## Repository layout

- `competitors/content.json`: source register, shared vendor facts and explicit article order.
- `competitors/alternatives/`, `competitors/comparisons/`: ten separately editable researched articles.
- `build_competitor_library.py`: expanded builder; reuses the existing renderer without editing it.
- `build_public.py`, `public/assets/`: preserved five-page renderer and isolated styles/search logic.
- `v2/`: unchanged original tools and three Node test suites.
- `tests/check_competitor_library.py`: expanded static/browser verification.
- `research/COMPETITOR_EXPANSION_20260911.md`: source provenance and explicit factual/editorial changes.
- `evidence/COMPETITOR_EXPANSION_VERIFICATION.md`: executed results, development failures and limitations.

Generated HTML, portable review, full logs, source manifests and screenshots are in the delivery ZIP rather than committed as duplicate outputs. Source and verification instructions are committed.

## Build the expanded review

Using the existing Python installation, from repository root:

```sh
python growth/build_competitor_library.py
```

This writes only growth outputs, performs no network requests and installs nothing. Open the generated `growth/Off_The_Clock_Public_Pages_Review.html` for the portable navigator, or `growth/public/START_HERE.html` for separate-page review. Individual articles have separate paths under `public/compare/` and `public/alternatives/`. `public/page-manifest.json` lists all fifteen pages.

The V2 output `public/tools/growth-v2.html` must retain SHA256 `82c65a675d896339f47da2082a9d11dbaf79056c37dd917e296622c2c5dd3b79`; the builder rejects a mismatch.

## Verification

```sh
node --test growth/v2/tests/*.test.cjs
python growth/tests/check_competitor_library.py
```

Actual results: **44/44 V2 tests and 264/264 expanded checks passed**. Browser tests require the audit environment's already-installed Playwright and Chromium. Do not install or reconfigure a user's machine merely to reproduce them without permission. Viewing the portable preview does not require those test tools.

The browser environment blocked direct file navigation; exact final HTML and the portable navigator were exercised in Chromium using `set_content`. All fifteen pages passed width checks at 320, 375, 390, 768, 1024 and 1440 pixels. Direct launch, other browsers and live hosting remain unverified.

The old `build_public.py` plus `tests/check_public.py` pair still reproduces the previous five-page checkpoint. The old test expects two guides and should not be run against the expanded output as if its old counts were still the requirement. The expanded suite covers the new counts and retained relevant behavior.

## Publication is separate

The review remains noindex. Company names appear in titles, H1s, routes and cards; guide links are available without JavaScript. This is not a ranking guarantee, keyword-volume study or a completed SEO launch.

No live signup, demo, pilot enrollment, customer quote, appointment or lead delivery is fabricated. Calls to action resolve to actual local tools. Approve factual adaptations, product claims, live destinations, canonical URLs and final launch settings before publication. Do not weaken isolation or connect this growth work to Codex's engine repairs.
