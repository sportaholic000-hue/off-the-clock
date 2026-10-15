# Voice quote flows — historical specification retired October 15, 2026

This document supersedes the historical guidance previously at this path by
retiring it. It is an authority map, not an executable questionnaire or a new
pricing, measurement, booking, or delivery policy. Do not implement the old
trade examples. The preserved historical text is in
[voice_quote_flows_legacy_v2.md](history/voice_quote_flows_legacy_v2.md) for
historical reference only; it must not direct current repairs.

## Current authority

Read the following sources together, applying their dated owner amendments:

- [quote_engine_v2.md](quote_engine_v2.md), including its October amendments,
  governs financial calculations and customer disclosure.
- [QUOTE_TRADE_DECISIONS_20261003.md](QUOTE_TRADE_DECISIONS_20261003.md) governs
  the listed measured contracts, fence heights, configured scopes, and fees.
- [QUOTE_AUDIT_DECISIONS_20261004.md](QUOTE_AUDIT_DECISIONS_20261004.md) governs
  measured layers, exact scope matching, precision, and units.
- [QUOTE_LAUNCH_DECISIONS_20261005.md](QUOTE_LAUNCH_DECISIONS_20261005.md) and
  [QUOTE_REAUDIT_REPAIRS_20261006.md](QUOTE_REAUDIT_REPAIRS_20261006.md) govern
  their listed refinements. Later owner instructions still take precedence.
- [server/quote-engine-vnext/contracts.js](../server/quote-engine-vnext/contracts.js)
  supplies active measurement contracts. Configured offerings and selected
  scope metadata extend them; the historical getRequiredFields field inventory
  is not the active application contract.
- [server/src/voice/voiceQuoteContract.js](../server/src/voice/voiceQuoteContract.js)
  projects the current question contract and binds caller confirmations.
- [server/src/voice/receptionistGuide.md](../server/src/voice/receptionistGuide.md)
  is the separately pinned runtime conversation guide.
  [voicePromptCompiler.js](../server/src/voice/voicePromptCompiler.js) adds the
  current tool, measurement, confirmation, historical receipt, and communication
  authority rules. Use the guide and compiler together; do not copy isolated
  historical examples over their authority rules.

## Retired discrepancies and current behavior

These discrepancies were documentation-only in this file at the repair
baseline. Retiring them changes no production calculation or conversation rule.

| Historical guidance | Current authority and behavior |
| --- | --- |
| Operator conversions between caller and engine units | Ask for the contract's unit; the operator does not convert units. The current tool contract and compiler govern any supported calculation tool. |
| Operator-supplied approximate dimensions, size categories, floor area, room counts, or assumed widths as substitutes for measured scope | Gather the requested measurement from the caller. A caller's own approximate numeric measurement may be used only after the current read-back and confirmation requirements, with its estimated status disclosed. Missing numbers require measurement or review. |
| Unknown product substituted by an average, owner default, or similar product | Bind the caller's identified, confirmed ordinary product name to the owner's registered offering. Unknown or unoffered products need clarification/review. |
| Assumed roof layers or building type selecting insulation | Obtain the stated existing layer count. Flat-roof insulation and coverboard are independent explicit selections, each with its own measured area when selected. Building type does not select either. |
| Paint coats inferred from colors, basic assumptions about wall/floor area, or fixed fence-height menus | Follow the current service's measured fields and configured offering, including supported coat, height, terrain and scope rules. Do not infer new quantities from old examples. |
| A generic gate count without the configured opening and installation scope | Select the returned stable gate choice and its complete description for the measured opening, preserving the caller's selected counts. |
| Extra assumed uncertainty widening the configured range | Use the engine's returned range and the current range/display rules. Voice presentation never adjusts financial amounts. |
| Automatic written confirmations, caller text messages, default deadlines, or unsupported booking promises | Follow the compiler's current communication rule: booking details verbally on the call; requested quote email only after saved quote and current email read-back confirmation. A queued email is not confirmed delivery. Promise a deadline only when explicitly set by the owner. |
| Condensed price presentation that could omit partial scope or option qualifications | Preserve returned scope, exclusions, unit, currency, tax, option notices, and written qualifications. A partial estimate excludes separate work and supplies no total for all requested work. Saved receipts retain saved prices and qualifications; they are not repriced. |

## Consumers and maintenance

At the pinned repair baseline, productionVoiceRuntime.js loads
server/src/voice/receptionistGuide.md. onboardingService.js uses that same
runtime guide when validating the compiled instructions. Neither loads this
specification at runtime. Its retirement therefore does not alter the pinned
runtime guide or its digest.

Repository instructions, build guidance, and historical verification records
link to this path, so leaving obsolete instructions here could misdirect a
future implementation. They now reach this retirement notice and authority map.
Historical source-binding checks that pin the former Git blob describe their
original checkpoint; they do not establish current policy. No historical
verification record, runtime prompt, pricing contract, or immutable saved
receipt is changed by this documentation repair.
