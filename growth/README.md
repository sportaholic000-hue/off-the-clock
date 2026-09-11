# Off The Clock AI — isolated growth work

## Current delivery

The existing **15-page library: 12 guides and three hubs** has a completed editorial pass. The guides make the case for Off The Clock's complete operator and QuoteDone with developed competitor-specific comparisons, visible offer details and accurate local-brief actions. The original V2 tools remain byte-identical.

- Branch: `growth/public-pages-review`.
- Original main base: `ed12dca1253a8790c885b071ab6037e05632bea0`.
- This editorial pass starts at `8fe8dd75f3cc903b0711374c52c97ad4cf1f5f04`.
- Boundary: files under `growth/` only. Do not change the engines, price books, onboarding, authentication, app routes, shared app styles, dependencies, providers, workflows, deployment settings or application specifications.
- Nothing is merged or deployed. Review pages remain noindex.

## Coverage

Alternatives: Podium Larry, Sameday AI, Avoca, Jobber Receptionist, Housecall Pro CSR AI, ServiceTitan Voice Agent, Ruby.

Head-to-head: Podium Larry vs Sameday AI; Sameday AI vs Avoca; Jobber Receptionist vs Housecall Pro CSR AI; ServiceTitan Voice Agent vs Podium Larry; Smith.ai vs Ruby.

Hubs: comparison directory, company-led alternatives directory and resources. Every displayed guide link opens a delivered article. This is the completed existing page set, not a claim that the wider content map has all been built.

## Build and verify

Using the existing Python and Node installations from the repository root:

```sh
python growth/build_competitor_library.py
node --test growth/v2/tests/*.test.cjs
python growth/tests/check_competitor_library.py
python growth/tests/check_editorial.py
```

The builder installs nothing, performs no network requests and writes only growth outputs. Browser verification uses the audit environment's existing Playwright and Chromium; installing or changing a user's tools requires separate permission.

Open the generated `growth/Off_The_Clock_Public_Pages_Review.html` for the portable navigator or `growth/public/START_HERE.html` for individual pages. `growth/public/page-manifest.json` lists all 15 routes. The V2 output must retain SHA256 `82c65a675d896339f47da2082a9d11dbaf79056c37dd917e296622c2c5dd3b79`; the builder rejects a mismatch.

Final results: **44/44 V2 tests, 264/264 static/browser checks, 60/60 editorial assertions**. Details and retained failure history: `evidence/EDITORIAL_COMPLETION_20260911.md`. The exact HTML was tested inside Chromium; direct file navigation was blocked by environment policy. Direct launch, other browsers and live hosting are not claimed as verified.

## Source layout

- `competitors/`: source register and ten independently editable article JSON files.
- `build_competitor_library.py`: complete 15-page builder using the shared renderer.
- `build_public.py`: shared frames, the original two guides, resource page and portable navigator.
- `public/assets/`: unchanged standalone page styles and search behavior.
- `v2/`: unchanged calculator, Challenge and collection-only link preview.
- `tests/`: functional and editorial requirements checks.
- `research/` and `evidence/`: source provenance, factual changes, verification and earlier checkpoints.

The download package includes generated pages, current screenshots, logs and exact-source manifests. Duplicate generated HTML and screenshots are not required for rebuilding the committed source.

## Commercial and publication boundaries

The pages describe the owner's product offer; they are not proof that live runtime features have passed acceptance. Competitor facts are linked and source limitations remain visible. No native connection, outsourced-human staffing, guaranteed saving or universal job support is fabricated.

Challenge links prepare a local brief; they do not issue a quote or submit an application. The calculator is standalone and does not read a price book. Publication, live CTA destinations and any production integration remain separate authorized actions.
