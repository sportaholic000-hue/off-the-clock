**QuoteDone contractor-site widget — verified result, October 1, 2026**

The six reproduced widget defects are repaired in [draft PR #10](https://github.com/sportaholic000-hue/off-the-clock/pull/10). The exact tested source is **5080af284e391c0189fb20170e4b6345d752a2d3**, on `codex/widget-embed-20261001`, based on `7a911afd993bc0d5c07c3d20f977c8988f072208`. This evidence branch preserves the records without moving the tested PR head.

**Repairs**

| Reproduced on the unchanged application | Repair and verified result |
| --- | --- |
| An unreachable API displayed “Failed to fetch.” | A customer-facing connection/retry message; recovery succeeds after the API returns. |
| Catalog/submit errors had no alert semantics. | Errors use alert regions. The browser accessibility snapshot identifies the catalog error; rejected contact details stay editable. |
| Retry after a failed module import reused the browser's cached failure. | An explicit retry uses a new module URL and loads without a page reload. |
| A stalled module import stayed on “Loading estimate form…” indefinitely. | A 20-second deadline exposes Retry. A late first attempt cannot mount another form. |
| A supported 120-character business name pushed Close outside a 320px panel; a 40-character launcher label overflowed. | Branding wraps within the viewport and Close stays reachable. |
| An inactive owner's widget displayed “QuoteDone or Scale is required.” | Public quote access failures show a customer-facing unavailable message. Status/code metadata and validation messages remain intact. |

Application edits are limited to `client/public/widget.js`, `client/src/widgetTransport.js`, and two alert wrappers in `client/src/quotedone.jsx`. The entire `server` Git tree is unchanged: `318a1435e2c45e1ce817ef5352d327f80394d24f` at both the starting and tested source. That includes the engine, backend, voice, startup and serving code. Dependencies and lockfile are unchanged.

**Exact verification**

| Command / run | Result |
| --- | --- |
| `node --test test/*.spec.js test/*.spec.mjs` from a cold dependency install | **1,031 tests: 1,020 passed, 9 existing voice failures, 2 skipped, 0 cancelled. No new failures.** |
| `node --test client/test/widget-transport.test.mjs test/widgetEmbed.spec.mjs` | **14 passed, 0 failed.** |
| `npm --prefix client run build` | **Owner Vite build and widget Vite build both passed.** |
| `.portable-runtime/node-v22.23.2-win-x64/node.exe verification/widget-embed/browser.mjs . "$RUNNER_TEMP/widget-evidence"` | **21 browser/application checks passed, 0 failed.** On the Linux runner, that historical fixture path contains the Node 22.23.2 Linux executable. |
| Existing production dependency audit | 0 reported vulnerabilities. |

[Final browser/build/focused-test run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36926875617), [cold full regression and builds](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36926875643), [PR regression run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36926883740). See [exact cold-suite output](evidence/final-cold-suite.txt) for the nine unchanged failure names.

The test opens the real owner dashboard, copies its install textarea verbatim, and inserts that exact async script twice on a separate-origin contractor page. Built assets/API use port 4790, the host uses 4791, and the real application listens on 4792. The bridge between the local asset origin and API is a test fixture; production proxy/static/startup files were not changed. The fixture uses a fresh SQLite database, approved synthetic owner pricing, Node 22.23.2, Playwright 1.56.0 and Chromium 141.0.7390.37. No live provider traffic or live data was used.

At 320, 375, 768 and 1280px, a complete customer submission quotes, matches the customer price/disclosure fields of authenticated owner preview, and matches its stored original request and response. Global resets, `!important` rules, a 48px base font and changed box sizing do not break the widget; the host's own styles stay intact. Controls remain reachable, labels and dialog semantics are present, Escape restores launcher focus, and the host remains usable. Duplicate snippets mount once. A deliberately delayed async snippet does not block HTML parsing or host interaction.

Expected values were written before execution: **10,000 × $0.005 = $50.00**; **125.125 × $0.005 = $0.625625, rounded to $0.63**. Fixture markup, minimum, fees and buffer are zero and tax is TAX_NONE. Separate additional work leaves the priced mowing subtotal at $50 and has no invented full-job total. An unknown main measurement remains unpriced for review. Public responses contain no owner line items or calculation records. The engine and voice source are unchanged; a new live phone flow was not run.

The embedded preferred-time flow saves its customer/site details and REQUESTED record and explicitly says an appointment has not been booked. A lost response after a successful quote save retries the identical request and returns the original record without creating a duplicate. A rejected email creates no quote, stays editable, and quotes after correction. Unavailable owners, unavailable/withdrawn services and unauthorized origins remain closed to unsupported quoting.

**Findings that did not justify product changes**

- The original parity assertion compared private owner calculation records against the intentionally smaller customer response. Actual quote amounts matched. The test now compares the complete customer pricing/disclosure fields recursively while retaining both full responses.
- Withdrawing an already loaded service produces a review path, rather than the HTTP 409 the first test expected. It cannot produce an obsolete customer-ready price; the review request is saved. This correct behavior was preserved.
- Native Chromium dialogs allow Tab to reach browser chrome. The same trace occurs in a plain native dialog, with `document.hasFocus() === false`; focus never reaches the host page behind the modal. The assertion was corrected, with no custom focus trap added.
- Existing Shadow DOM isolation, duplicate-mount protection, async host interaction, origin rejection and preferred-time persistence passed. They were not rewritten.

The initial run reports 6 passes and 12 failures because it includes the two test-assumption problems above. The original results and screenshots are retained; they are not presented as 12 application defects. The subsequent keyboard diagnostic is also retained.

**Screenshots**

| Width | Form | Quoted result |
| --- | --- | --- |
| 320px | [Form](evidence/final/widget-320-form.png) | [Quote](evidence/final/widget-320-quote.png) |
| 375px | [Form](evidence/final/widget-375-form.png) | [Quote](evidence/final/widget-375-quote.png) |
| 768px | [Form](evidence/final/widget-768-form.png) | [Quote](evidence/final/widget-768-quote.png) |
| 1280px | [Form](evidence/final/widget-1280-form.png) | [Quote](evidence/final/widget-1280-quote.png) |

[Long branding at 320px](evidence/final/widget-320-long-branding.png), [saved preferred-time request](evidence/final/widget-320-preferred-time.png), [owner's install snippet](evidence/final/owner-installation.png). The screenshots were visually inspected in addition to geometry and control-reachability assertions.

**Evidence and reproduction**

The checked-in workflow `.github/workflows/widget-embed-verification.yml` contains the cold install, pinned browser install, builds and exact invocation. Re-running the linked GitHub job reproduces the test on its bound source. The browser script retains complete synthetic HTTP requests/responses, quote/lead/preference records, accessibility/focus traces, expected values and source hashes.

`evidence/baseline/` records test-only commit `694ea50895203422a7d2758c8b254f4baf328828` (application still identical to 7a911af). `evidence/final/` records **5080af284e391c0189fb20170e4b6345d752a2d3**. JSON files ending in `.gz` are losslessly compressed, not summaries. Run `node verification/widget-embed/restore-evidence.mjs` on this evidence branch to restore plain JSON files and the split original owner screenshot. The script verifies gzip integrity and does not overwrite differing existing files.

Original [baseline Actions artifact/run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36922553259), [keyboard diagnostic run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36925062814), and [final Actions artifact/run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36926875617) are also available. Permanent copies on this evidence branch avoid depending on the runner artifact's 30-day retention.

**Limits and remaining work**

No reproduced blocker remains in the exercised widget workflows. This verifies a separate local origin and Chromium viewports; Safari, Firefox, physical mobile devices and a human-operated screen reader remain unverified. Production asset serving, deployment, proxy settings and real contractor-site CSP configuration are outside this task. Confirm those when integrating the other agent's serving work. Preferred-time/lead capture is verified here; a new live calendar-provider booking was not exercised. The nine known voice failures remain outside scope. No merge or deployment was performed.
