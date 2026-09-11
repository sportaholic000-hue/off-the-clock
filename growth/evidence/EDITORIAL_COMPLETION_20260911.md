# Existing sales pages — editorial completion

## Completed scope

This pass completes the specific editorial corrections identified in the review of `8fe8dd75f3cc903b0711374c52c97ad4cf1f5f04`. It revises all twelve existing guides and all three hubs. It adds no new article targets, product features, engine code, integrations or live destinations.

The work remains under `growth/` on `growth/public-pages-review`. It is not a merge or deployment. The private-preview notice and noindex setting remain because publication has not been authorized.

## Corrections implemented

1. **Developed comparisons instead of repeated pitches.** Each structured article now has its own substantive sections on the relevant purchase: platform bundle, incremental add-on, call coaching, external staffing, native context, configured fee or measured project price. Repeated shared vendor-card paragraphs and generic test-the-vendor sections were removed. Smith.ai/Ruby now has one developed Off The Clock argument and one distinct closing recommendation.
2. **The complete Off The Clock offer is visible.** Every guide includes QuoteDone at $279/month with 1,200 minutes, the operator and website quote widget, $0.35 additional minutes and no setup fee. This is the owner's established product offer shown in a review build, not certification of deployed services. The pages do not substitute an outsourced-human or full-FSM promise.
3. **Each page earns its search result.** Company names, distinct descriptions, comparison tables and related paths are retained. Every new article has a unique card description. The hubs direct visitors to named-company pages without manufacturing an unbuilt destination.
4. **Actions accurately describe the result.** Links to the local Challenge say “Prepare my job brief” or equivalent brief wording. They do not imply an engine-backed quote, live evaluation or submitted application. The adjacent copy explains that the brief can be saved or printed locally.
5. **Resources lead with usefulness.** The calculator explains the job-pricing decision it helps with; the Challenge explains the brief the contractor gets; the hosted-link concept remains clearly identified as collection-only. Existing tools are unchanged.

Every opening and conclusion was read together with its page body. No incumbent-first default recommendation was restored. Real competitor capabilities and relevant limitations remain; making the sales case does not authorize inventing a missing competitor feature or a native integration.

## Research and factual changes

Official sources were rechecked for the pricing and distinctions used in this rewrite. The source register remains in `competitors/content.json` and the original two guides retain their inline official links.

- Sameday: published $449/500-minute and $789/1,000-minute starting packages, location differences and product range. The stated package deltas versus QuoteDone are independently checked: $170/$510 and 700/200 minutes. They are not customer savings forecasts or currency conversions.
- Jobber: current official Receptionist documentation includes website-chat settings and appointment actions as well as calls and texts. The revised comparison acknowledges that instead of making “no website channel” an advantage for Off The Clock.
- Housecall Pro: service-price communication, descriptions/inclusions and website chat are acknowledged. Its numerical CSR AI add-on price remains unestablished in the reviewed official material.
- Podium and Avoca: retained their actual platform, pricing-information, coaching and trained-human distinctions. No numerical price was invented where product pages did not publish one.
- ServiceTitan: corrected the settings source URL to its working canonical documentation path. The $2.75/call public offer remains explicitly attributed to the official search-indexed page; its direct page body was not fully retrievable.
- Smith.ai, Ruby, Rosie, Goodcall and AnswerConnect: checked their official pricing sources for the stated model and plan amounts. The separate human Smith.ai offer remains distinct from its AI offer. Canadian AnswerConnect figures remain explicitly labeled.
- Dialzara: direct retrieval remained unsuccessful. Its existing official indexed figures remain visibly source-limited reference prices, not presented as freshly confirmed quotes.

Illustrative service scenarios explain scope differences; they are not reported customer results or claims of hands-on competitor testing. Original Library drafts are not overwritten.

## Executed verification

| Command | Final result |
|---|---|
| `python growth/build_competitor_library.py` | Exit 0; 15 pages and 12 guides |
| `node --test growth/v2/tests/*.test.cjs` | 44/44 passed, zero failed/skipped |
| `python growth/tests/check_competitor_library.py` | 264/264 passed, zero failed |
| `python growth/tests/check_editorial.py` | 60/60 passed, zero failed |

The 264 checks include all fifteen pages at six widths, named links, tables, citations, search/filtering, local downloads, the portable navigator and the unchanged calculator. The 60 editorial assertions check specific requirements and numerical comparisons; they do not assign a persuasion score or guarantee search performance.

The first browser run stopped on an obsolete search-count expectation: the revised Jobber card descriptions correctly yielded one dedicated alternatives match rather than three cards mentioning Jobber incidentally. Only that content-dependent count and its test label were changed. The search implementation was not changed and no result was suppressed. Subsequent complete runs passed. The failed run and final logs are retained in the package.

The exact final HTML was rendered and exercised in the environment's existing Chromium using `set_content` because direct file navigation was blocked by administrator policy. Final desktop and mobile captures were visually inspected. Direct double-click launch, other browser engines and live hosting are not claimed as tested.

## Source integrity

The thirteen modified page-generation/content files were verified against remote Git blob hashes at staged root tree `5f326e7c7981dffd3a7f1e1b50ef30e173fba741`. The two verification scripts and delivery documentation are included in the final commit. The delivery manifest records their final hashes and exact commit.

Original V2 source, tests, and generated HTML remain unchanged. Generated V2 SHA256: `82c65a675d896339f47da2082a9d11dbaf79056c37dd917e296622c2c5dd3b79`.

No source outside `growth/` is changed. No production phase, engine correctness, live submission or publication is approved by these marketing checks.
