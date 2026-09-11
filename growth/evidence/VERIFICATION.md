# Isolated growth verification

Executed September 11, 2026 against local source matched to the GitHub blobs at source checkpoint `b3124a03b8b9c4014ae2b6fad7bf9118dff3c9f4`. Later delivery commits add documentation only.

## Actual results

| Check | Result |
|---|---|
| Standalone public builder | Passed; five content pages, review launcher, checklist and preserved V2 output |
| Original V2 Node suites | 44 passed; 0 failed, cancelled, skipped or todo |
| New static/browser suite | 82 passed; 0 failed |
| Preserved V2 source | Six source files match the original package and their GitHub blob hashes |
| Preserved V2 HTML | SHA256 82c65a675d896339f47da2082a9d11dbaf79056c37dd917e296622c2c5dd3b79 |

The 82 checks mix static-document assertions and actual Chromium interactions. They are not 82 unique end-to-end production journeys. They cover guide search/filter combinations, clear/reset, empty results, keyboard activation, safe search input, internal page navigation, article anchors, checklist download bytes, links into the unchanged V2 tools, metadata, local links/fragments, unique IDs and no-JavaScript readability.

All five new pages were checked at widths 320, 375, 390, 768, 1024 and 1440 pixels without horizontal overflow. No JavaScript errors or automatic external resource requests were observed in the exercised flows. Desktop and mobile screenshots were captured and reviewed.

## Commands

From the repository root, using existing tools only:

```sh
python growth/build_public.py
node --test growth/v2/tests/profit-math.test.cjs growth/v2/tests/markup-target.test.cjs growth/v2/tests/intake-model.test.cjs
python growth/tests/check_public.py
```

The builder uses Python's standard library. The browser test uses an already installed Playwright and Chromium in the audit environment; no tools or dependencies were installed. The browser executable in the test is environment-specific, not a requirement for viewing the delivered HTML.

## Browser method and limitations

The audit browser's administrative policy blocked direct file/URL navigation. Testing loaded the exact generated self-contained review runner and pages using Playwright `set_content` in Chromium, then exercised real DOM interactions and the runner's embedded-page navigation. Separate generated file links were validated against real files on disk.

Direct double-click launch, live hosting, browser Back/history semantics, Safari/Firefox, physical printing, exhaustive accessibility, product signup/submission paths, and contractor conversion were not verified. No production readiness or quote-engine correctness is claimed.

## Failures retained

An initial run found an in-page anchor problem in the standalone review runner: srcdoc navigation inherited its parent base. The runner now handles local fragments explicitly; the test was rerun successfully. A separate failure was an exact-label test locator omitting the visible arrow; the locator was corrected, not the product assertion removed.

A one-byte local/remote builder difference was an extra blank line. Local source was matched to the committed bytes and the build and both final suites rerun before this report. No V2 behavior changed.

## Source identity

| File | Git blob SHA |
|---|---|
| build_public.py | 0d5eeaced1eea66bd03bdd802abb8d820ed5f265 |
| public/assets/site.css | 0af1726c7b580f853054b51375605b49dc677732 |
| public/assets/site.js | 3d823f0d5cc274e379f0a98ef2d519d599153e8d |
| tests/check_public.py | 4df06c42859938be74285a81e0e442208eea6f93 |
| v2/tests/profit-math.test.cjs | f4c7b48b45a673ed7c07cd4c6a1157f9ddf5fdf3 |
| v2/tests/markup-target.test.cjs | 85c1ad41462d6d39a9a2a7ad4fca80046d4733dc |
| v2/tests/intake-model.test.cjs | 9b362b0c1234a8e2e3f5f4a87dfd104cd06080d8 |

Source, builders, repeatable tests and this summary are committed. Ready-to-open generated HTML, full logs, per-check JSON, screenshots, source hashes and unchanged Library drafts are included in the downloadable delivery package. Those binary/generated attachments are not claimed to be committed separately.

No writes were made to the application, either quote engine, main, Codex's branch, live data, dependencies, providers or deployment configuration. No merge or deployment was performed.
