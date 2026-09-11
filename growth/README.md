# Off The Clock AI — isolated growth work

## Delivered for review

The standalone V2 acquisition source is preserved unchanged. A separate five-page comparison and resources site is built from the source in this folder. Nothing is merged or deployed.

- Branch: `growth/public-pages-review`.
- Base: `ed12dca1253a8790c885b071ab6037e05632bea0` on main.
- Tested functional source checkpoint: `b3124a03b8b9c4014ae2b6fad7bf9118dff3c9f4`; subsequent delivery commits add documentation only.
- Change boundary: additions under `growth/` only. Do not change either quote engine, saved price books, onboarding, authentication, application routes, shared styles, dependencies, workflows, providers or deployment settings.

## Saved in the repository

- `v2/`: six original V2 source files and all three Node test suites. The guided challenge, calculator and collection-only intake are not rewritten.
- `build_public.py`: complete content, page templates and standard-library builder for the new review site.
- `public/assets/`: isolated public-page styles and progressive search/filter behavior.
- `tests/check_public.py`: repeatable static-document and Chromium interaction checks.
- `research/RESEARCH_AND_CHANGES.md`: original-draft provenance, official sources, factual corrections, editorial adaptations and publication limits.
- `evidence/VERIFICATION.md`: exact-source results, method, retained development failures and limitations.

Generated HTML, the ready-to-open single-file review, raw execution logs, screenshots, per-check JSON and unmodified source drafts are supplied in the downloadable review package. They are reproducible from this source but are not committed as duplicate generated pages or binary screenshots.

## Build the independent review

From the repository root, using an existing Python installation:

```sh
python growth/build_public.py
```

No dependencies are installed, and only growth outputs are written. The builder generates:

| Output | Purpose |
|---|---|
| `Off_The_Clock_Public_Pages_Review.html` | Portable single-file review navigator |
| `public/START_HERE.html` | Separate-page review launcher |
| `public/compare/index.html` | Searchable comparison hub |
| `public/alternatives/index.html` | Alternatives hub |
| `public/compare/smith-ai-vs-ruby/index.html` | Full head-to-head buying guide |
| `public/alternatives/ruby/index.html` | Six-option alternatives guide |
| `public/resources/index.html` | Tools, guides and concept directory |
| `public/resources/five-call-checklist.txt` | Downloadable evaluation worksheet |
| `public/tools/growth-v2.html` | Byte-identical original V2 tool |

The generated V2 HTML must match SHA256 `82c65a675d896339f47da2082a9d11dbaf79056c37dd917e296622c2c5dd3b79`; the builder rejects a mismatch.

## Verification

44/44 original V2 Node tests and 82/82 new static/browser checks passed. Source files were compared with GitHub blob hashes. All five new pages were exercised at 320, 375, 390, 768, 1024 and 1440 pixels without horizontal overflow.

The exact generated HTML was rendered and exercised in Chromium. The audit browser blocked direct file/URL navigation, so tests used `set_content`; direct launch/hosting is not claimed as verified. See `evidence/VERIFICATION.md` for commands and limitations. The source test uses the audit environment's existing Playwright/Chromium; viewing the delivered HTML does not require those test tools.

## Publication remains a separate decision

All pages are noindex private review builds. Internal links resolve only to delivered pages and functioning local tools. No signup, live demo, pilot enrollment, account, hosted quote, QR destination or lead delivery is fabricated. Existing homepage design and production routes are unchanged.

Approve the content adaptations and actual live destinations before publication. Reconfirm vendor facts, especially the explicitly limited Dialzara search snapshot. Then assign hosting, canonical URLs, social images and live calls to action separately. Do not silently connect these pages to Codex's engine work or use them as evidence that a production phase is complete.
