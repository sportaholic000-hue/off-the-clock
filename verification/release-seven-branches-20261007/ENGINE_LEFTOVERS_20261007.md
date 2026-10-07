# Engine leftovers — owner instruction, October 7, 2026

Branch `fix/engine-leftovers` starts at the verified
`codex/audit-small-repairs-20261007` commit
`4db13a2945193762bbc4b85f9ab616a00e1dd067`. This records the owner's four requested
repairs. No engine formula, main merge, deployment or live data is authorized.

1. The phone resolves scope questions from the selected customer inputs through
   the same presentation rules as customer and owner forms. It presents every
   applicable description, including tier-specific descriptions. A confirmation
   of one description cannot authorize another: the server binds the affirmative
   answer to the resolved description, service, owner, call and book revision.
   Missing answers return the current question before a quote is calculated.
   Confirmation identity also participates in quote-request replay identity.
   Existing frozen receipts remain historical receipts, never new approvals.
2. Returning-caller context preserves the frozen customer receipt's currency,
   unit, tax treatment, exclusions, allowances, written qualifications, option
   qualifications, priced scope and separately unpriced work. Partial quotes
   have no whole-job total. Never recalculate history from current configuration.
   If complete material qualifications exceed the transport budget or are
   malformed, withhold that receipt's amounts and request review; do not truncate
   qualifications to keep an amount.
3. Website drafts include only literal prices whose visibility can be established.
   Apply inline, embedded and same-host linked stylesheet hiding rules to the
   element and its ancestors. Class, ID, tag, compound, attribute, descendant and
   child selectors are supported. Unresolved CSS, conditional rules, unsupported
   hiding selectors, unmodeled style properties/contrast or unavailable stylesheets omit that page's prices and
   explicitly disclose incomplete visibility coverage. This conservative static
   check can omit visible prices; it must not guess that hidden prices are visible.
   No JavaScript is executed and no model receives website content.

   This narrowly amends the embedded-resource prohibition and HTML/text-only
   response types in `WEBSITE_PRICE_IMPORT_20261006.md`: same-host linked CSS
   may be read as `text/css`, under the same DNS validation, connection pinning,
   redirect, time, byte and request budgets. Off-host CSS, CSS imports and all
   other embedded resources remain unfetched. Calls still never browse; an
   import remains a draft until owner review and save.
4. The receptionist may request exactly one saved listed unit price multiplied
   by a caller-confirmed quantity expressed in the listing's unit. The server
   reads the current owner's saved complete listing, including conditions; the
   caller/model never supplies a unit rate. Match exactly one saved paragraph
   with exactly one literal currency amount and an explicit per-unit label.
   Ambiguous, nonlinear, stale, draft, foreign or unsupported listings require
   review. There is no new general calculator or quote-engine pricing mode.

   Multiply decimal coefficients with integer arithmetic and return the exact
   decimal product as text, including fractional cents. Do not round, convert
   units, combine items, compute tax/fees/discounts or perform other arithmetic.
   Retain the full original conditions and identify the result as the extension
   of that one listed unit price, with no other charges added. The receptionist
   speaks the successful server `voiceSummary`; she never multiplies herself.
   Inputs permit up to twelve whole digits and six fractional digits; a product
   exceeding twelve whole digits is refused. This replaces the previous prompt's
   permission for model multiplication. Fixed listed prices can still be repeated
   literally without multiplication.

All verification uses synthetic data and temporary storage. Dollar expectations
were written before execution in
[`verification/engine-leftovers/EXPECTATIONS.md`](../engine-leftovers/EXPECTATIONS.md).
