# Comparison conversion review — 2026-10-01

Implemented on an isolated copy of growth/public-pages-review @ 2a6dfd3a6d557d2b153ea737206104256b1cade8. Changes remain under growth/. The core launch-plan/security PR, app, quote engine, price book, calendar, widget and voice runtimes were not edited. No subagents, merge, deployment or dependency installation.

## What was wrong

The 12-guide library existed on a separate growth branch, not main. Its primary CTA directed prospects to prepare a local job brief. That asked for job scope and measurements before they could explore the product; the owner wanted a conversation instead. The guide bodies had useful vendor-specific copy but no consistent answer to all five buying questions. Several prices were source-limited older snapshots. The live sales demo was isolated on another branch and had no verified link from these guides.

## What changed and why

- All 12 existing guides retain their distinct content and now compare approved pricing, calendar booking, website inquiries, setup/phone arrangements and total costs. Native expandable answers keep mobile pages manageable and work without JavaScript.
- Conversation CTAs appear at the guide opening, after the buying answers and at the bottom. The exact main label is “Talk to Off The Clock about your business.” No account or approved-price upload is required to explore the product. A job brief remains optional; its tools are unchanged.
- Current official sources credit competitors' price lookup, booking and chat capabilities. A missing website description is not treated as proof a competitor cannot quote. The pages distinguish configured fees from measured project calculations and request a relevant demonstration.
- Pricing includes both locked Off The Clock launch plans. Scale is not offered. Base subscriptions, required add-ons, different billing units, currency/taxes and phone-related costs are identified; no unsupported all-in savings are claimed.
- Old AnswerConnect Canada and Dialzara numbers were removed because current numeric offers could not be confirmed. ServiceTitan's indexed-only pricing and settings retrieval limits remain marked.
- Demo destination configuration accepts an explicit HTTPS URL, preserving existing query parameters and adding the originating guide path. With no configured URL, the review opens an honest unconnected handoff, including a whitelisted comparison name and return link.
- Windows generated the V2 artifact and downloadable checklist with translated newlines. The builder now writes their original UTF-8 bytes, preserving the approved hash and identical local/portable downloads. No V2 source was edited.

## Journey audit

Screenshots were captured and inspected in Edge's Chromium engine. The in-app browser control timed out; its panel open request was queued and a local preview link was supplied. Browser test results below use the project's own local verification harness.

| Step | Visitor action | Health and evidence |
| --- | --- | --- |
| 1 | Open Ruby alternatives | Improved: the main conversation CTA is visible early on mobile. [Before](comparison-conversion/baseline-ruby-390.png), [after](comparison-conversion/ruby-mobile.png), [desktop](comparison-conversion/ruby-desktop.png). |
| 2 | Assess quoting and calendar booking | Clearer: five buyer questions, named vendors and direct source links; keyboard and no-JS expansion verified. [Booking](comparison-conversion/ruby-booking-mobile.png). |
| 3 | Check routing and comparable costs | Clearer: phone requirements and base/add-on/usage distinctions are explicit; unknown prices are marked. [Routing](comparison-conversion/jobber-housecall-setup.png), [cost](comparison-conversion/ruby-cost-desktop.png). |
| 4 | Talk about the business | Prepared: no account or pricing-input gate; source context and return work. Live conversion is waiting for Opus's demo acceptance and URL. [Current handoff](comparison-conversion/demo-handoff-mobile.png). |

## Exact validation

- Build: python -X utf8 growth/build_competitor_library.py — exit 0; 15 library pages, 12 guides, separate demo handoff and portable runner built.
- Static: GROWTH_STATIC_ONLY=1 python -X utf8 growth/tests/check_competitor_library.py — **127 checks, 127 passed, 0 failed**. [Output](comparison-conversion/static-checks.json).
- Editorial: python -X utf8 growth/tests/check_editorial.py — **60 checks, 60 passed, 0 failed**. [Output](comparison-conversion/editorial-checks.json).
- Browser: node growth/tests/check_conversion.cjs with existing Playwright module and Edge executable — **309 checks, 309 passed, 0 failed**. Covers all 12 guide entry/CTA/context/return paths, citations, keyboard controls, search, downloads, original calculator behavior, unknown-context rejection, no-JS use, direct-file navigation, zero page errors and zero automatic HTTP/provider calls. All 15 library pages and the handoff fit at 320, 375, 390, 768, 1024 and 1440 pixels. [Output](comparison-conversion/conversion-browser.json).
- Demo destination: python -X utf8 growth/tests/test_demo_handoff.py — **7 tests, all passed**. Includes direct connected destination, query preservation, HTML escaping, invalid URL rejection and required source references. [Log](comparison-conversion/handoff-tests.log).
- Preserved tools: node --test growth/v2/tests/intake-model.test.cjs growth/v2/tests/markup-target.test.cjs growth/v2/tests/profit-math.test.cjs — **44 tests, 44 passed, 0 failed**. [Log](comparison-conversion/v2-tests.log).
- All **9 V2 source files** match their original GitHub blob SHAs. Built V2 SHA-256: **82c65a675d896339f47da2082a9d11dbaf79056c37dd917e296622c2c5dd3b79**. [Source-byte proof](comparison-conversion/source-integrity.json).

The Python Playwright package was absent locally, so its legacy browser section was not run. The unchanged static assertions were run in explicit static mode; the Node project harness supplied the browser coverage above. Initial verification failures exposed Windows output newline differences; both were fixed before this final run.

## Remaining work and limits

1. Opus must finish live voice-demo acceptance and supply its verified HTTPS URL. See [the handoff](../DEMO_HANDOFF.md). The current separate sales-demo app does not consume comparison_source; optional page-aware conversation still belongs in that lane.
2. Live quote-to-phone/calendar behavior, carrier arrangements, billing currency and phone-related costs need approval/verification before public release. This comparison UI does not certify those systems. Retaining launch-offer copy requires the actual product to meet it.
3. Pages remain noindex and unpublished. Canonical URLs, production routing, deployed CTA checks and Search Console submission are release work. No production ranking or conversion uplift is claimed.
4. Competitor capabilities and rates are published-source evidence, not account-specific guarantees or hands-on performance results. Retrieval limits are recorded in [the research ledger](../research/BUYING_QUESTIONS_20261001.md).
5. Verification covered Chromium, keyboard interaction and responsive layout. Other browser engines, full screen-reader behavior and real-owner usability were not tested. No analytics collector or tracking cookie was added; conversion measurement is future work.

All source and selected verification evidence are saved to the GitHub review branch. Generated pages can be reproduced from the committed source using Python's standard library.
