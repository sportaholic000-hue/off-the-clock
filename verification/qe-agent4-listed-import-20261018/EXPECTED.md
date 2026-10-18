# Agent 4 expectations recorded before production edits

Base: c58ca997e9cf63739d399939bcdade83e97874d2.
Ordered parents: 235eb5c978f847c2d47379ae3cf03b52c1f9104c,
4f6152413a650085a7fe6002dfd077a542f9c0c2.
Required bundle base: c1817621f6eccb31822979bf994efc4902682d34.
Branch: codex/qe-agent4-listed-import-20261018.

All fixtures are synthetic. These are expected outcomes, not execution claims.

## F7

With quantity `"3"` and customerConfirmed `true`, both the direct parser and
real dispatcher must return the existing exact needs_review fallback, without
extendedAmount or voiceSummary, for each of these new failures:

- Widgets/on collection $10 each
- Widgets.by arrangement $10 each
- Widgets-on collection $10 each
- Weather permitting $10 each
- Online orders $10 each

Punctuation adjoining a condition (slash, period, hyphen, colon, brackets,
parentheses, apostrophe, Unicode punctuation/spacing) must not make it flat.
Weather-permitting and online-order qualification phrases are review-only.
Board-on-board panel, Nail-in anchor and Plug-in adapter remain calculated.
Genuine names Weather station, Online training manual, Onyx tile, Inline filter,
Standby lamp and Porcelain basin remain calculated at $10 x 3 = $30.00.

Arithmetic controls: CAD 0.035 x 3 = CAD 0.11 (half-up cent rounding);
US$1,234.50 x 2 = US$2,469.00; EUR 2.50 x 3.333 = EUR 8.33.
Saved identity and caller confirmation remain required. No caller-supplied rate,
foreign/draft/partial/edited listing, private rate or customer eligibility may
be inferred or exposed. Existing fallback wording and stored text stay exact.
The original five conditions remain refused. All 305 original tests and every
existing regression/evidence artifact remain byte-identical.

## F8

For `<html><body><p>QUALIFICATION</p><div><h2>Widget</h2><p>$10 each</p></div></body></html>`, each of the following must be preserved literally with the
listing (or the listing withheld if binding is ambiguous):

- Available exclusively to members
- Available to account holders
- Payment by cash
- Eligible customers: account holders

The existing control `Prices apply to cash payments` remains retained.
Clear page/section/card conditions apply to every listing in that scope.
A condition from one named section must not silently disappear or be assigned
to another. Ambiguous standalone notes or plain-text boundaries with no unique
binding withhold affected listings and set conditionsUnverified/limited true.
Inline markup, entity-decoded text and whitespace preserve visible wording.
Unrelated business descriptions are not invented as payment/eligibility rules.
Hidden text, scripts, comments and instruction-like content remain excluded;
uncertain stylesheet visibility remains fail-closed.

HTML and plain-text import -> draft -> actual owner save -> real dispatcher:
existing saved prices remain unchanged before explicit save; saved conditions
remain literal afterwards; quantity confirmation never confirms eligibility;
conditional saved listings yield needs_review without an extended amount.
Unconditional `Widget $10 each` remains $30.00 for quantity 3.

## Required verification

Run the retained 305 tests, new voiceAgent4 tests, neighboring website extraction,
visibility, import and runtime tests, build, unchanged strict/full gates and
exact-final hosted CI (including browser, dependency and Docker gates).
Targeted/local passes alone are not completion. Record failures explicitly.
