# Comparison → sales demo handoff for Opus

The owner wants “Talk to Off The Clock about your business” to open a real conversation. No account, job measurements or approved-price upload is required to explore the product.

Current growth review: growth/demo-handoff.json has {"url": null}. Buttons open growth/public/demo/index.html with a source query and a clearly marked unconnected state. There is no fake audio, recorded conversation, microphone action or lead form.

The separate sales-demo implementation was inspected at demo/website-live-sales @ 1a0c002773ec5c6cdf9ddfac4c545490e403e027. Its /sales-demo/ UI checks provider status and requires an explicit action to open the mic. This growth change does not merge or modify that implementation.

## Connect after live acceptance

1. Finish and verify the voice demo in its existing lane. Verify voice/text fallback, scope lock, mic consent and release, disconnected behavior, silence timeout, session/concurrency/IP limits and budget controls against the project spec. A reachable HTML URL alone is not provider acceptance.
2. Put the verified HTTPS demo URL in growth/demo-handoff.json's url field. Do not configure an assumed production destination.
3. Run python -X utf8 growth/build_competitor_library.py. Every conversation CTA then links directly to the configured demo, without the preview handoff page or another intake step. Existing destination query parameters are retained.
4. Run the handoff, editorial and browser checks, then verify one complete comparison-page → real demo session on the actual release build, on phone and desktop. Production publishing and removal of noindex are separate release work.

## Optional page-aware conversation

Connected links add comparison_source, e.g. alternatives/ruby/index.html or compare/jobber-receptionist-vs-housecall-pro-csr-ai/index.html. This is a public guide path, not visitor pricing or customer data. The 12 allowed paths are in growth/competitors/buying-questions.json under pages.

The current sales-demo app does not consume comparison_source. It will not automatically know the prior comparison until Opus implements and verifies that handling. Treat query input as untrusted: map only a known path to a short product topic; do not place arbitrary URL text in a system prompt. Let visitors talk naturally about their own business. Preserve the existing scope lock and cost controls.

The local handoff displays a whitelisted comparison name and a return link; unknown source values fall back to the hub. No analytics collector or cookie is added. Attribution is prepared, not reported as measured conversions.
