# Competitor-library expansion — verification

## Source boundary

Starting growth SHA: `063787e5f30a5611f7b0c5b0ecce681861c10767`.
Tested functional source SHA: `2f610b81ed4c88d4cd98ef9b33cf2cd33ccf4714`.
Later delivery commits contain research/verification documentation and README changes only.

Thirteen added functional files comprise the catalog, ten articles, renderer and test. Their locally calculated Git blob hashes match the remote files read back at the functional SHA. Existing V2 source/tests, legacy renderer, public CSS/JavaScript and existing test source are unchanged. No engine tests were needed or claimed for this isolated marketing-only change.

## Executed checks

| Command / checkpoint | Result |
|---|---|
| Prior five-page builder and `python growth/tests/check_public.py` before expansion | 82/82 passed |
| `node --test growth/v2/tests/*.test.cjs` before expansion | 44/44 passed |
| `python growth/build_competitor_library.py` | Exit 0; 15 pages, 12 guides |
| `python growth/tests/check_competitor_library.py` on expanded output | 264/264 passed; zero failures |
| Original V2 Node suites after expansion | 44/44 passed; zero failed/skipped |
| Preserved V2 HTML hash | `82c65a675d896339f47da2082a9d11dbaf79056c37dd917e296622c2c5dd3b79` |

The expanded suite includes unique titles/H1s, descriptions/social metadata, review noindex, source references, semantic tables, local links/fragments, named four-option shortlists, and source-isolation checks. Browser interactions cover company search, combined filters, empty states, reset/focus, keyboard activation, escaped search input, all ten new article links, citation/related navigation, the seven-brand alternatives hub, unchanged checklist downloads and both V2 calculator modes.

Every one of the 15 pages was rendered at 320, 375, 390, 768, 1024 and 1440 pixels: 90 viewport checks within the 264 total. Tables scroll within their labeled region without widening the page. All twelve guide links remain visible without JavaScript. No JavaScript errors or automatic external requests were observed. Counts overlap with baseline coverage and are not summed as unique cases.

## Failures found and retained

1. The first development test expected a Jobber alternatives search to match one card. Three guides legitimately mention Jobber. The expected count was corrected to three and the dedicated Jobber guide was separately required. No search result was hidden to satisfy the test. That interrupted run is not represented as a complete pass.
2. The next run found a 320-pixel horizontal overflow caused by the article grid's minimum content width around a wide comparison table. A progress update initially suspected the long breadcrumb; DOM inspection identified the grid constraint. Supplemental growth-only CSS sets the relevant grid items' minimum width to zero. The comparison table remains horizontally scrollable and keyboard operable. The final full suite passed after correction.
3. The test wrapper now records an uncaught execution failure as a failure, so a partial sequence cannot end with a misleading all-green summary.

Development logs, final per-check JSON, exact-source manifest, downloaded samples and screenshots are included in the delivery package. They are not fabricated CI results.

## Browser method and limits

The environment's existing Chromium rejected direct `file://` navigation with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. Tests therefore rendered the exact generated documents with Playwright `set_content`, and exercised the portable navigator's actual `srcdoc` pages, internal navigation and local downloads. The direct-launch failure is recorded separately; double-click launch and live hosting are not claimed as verified.

Desktop and mobile captures were visually inspected, including company-led hubs, an alternatives shortlist and a long ServiceTitan article heading. This does not certify all screen-reader behavior, other browser engines, physical printing, contractor usability, search indexing or conversion.

No dependencies were installed. No production integration, branch merge, deployment, live submission or engine-phase approval occurred. Final branch readback and comparison belong to the delivery summary.
