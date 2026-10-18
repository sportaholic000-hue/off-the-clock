# Parenthesized F7 follow-up: expectations before production edits

Starting commit: 101f0ae01b7d47fbc74782aec1c49b66088b9b13.
Branch: codex/qe-agent4-listed-import-20261018.

The following synthetic listings, with quantity "3" and customerConfirmed true,
must return the existing exact needs_review fallback through both the direct
parser and real dispatcher. Neither extendedAmount nor voiceSummary may exist:

- Weather (permitting) $10 each
- Online (orders) $10 each

Spacing, parentheses around either word, brackets and quotes must not hide the
same bounded weather/channel qualifications. Previously supported hyphen/slash
spellings inside parentheses remain review-only.

Genuine names Weather (station), Online (training manual), Widget (Weather station),
Manual (Online training), Weatherproof (sensor), Online ordering manual,
Board-on-board (panel), Nail-in (anchor), and Plug-in (adapter), each at $10,
remain calculated at exactly $30.00 for quantity 3 through both paths. Saved
listing spelling remains exact, including parentheses. Altered listing text is
rejected. Compiled owner facts retain the original qualifications verbatim.

All prior assertions, including the entire 722-test selection, remain unchanged.
Exact arithmetic/currency, private-data protections and F8 import behavior must
remain covered by that retained selection. Only the owned listed-price parser
needs a production change; extraction, selectors, dependencies, workflows,
specs and engine versions stay unchanged. Both restored histories remain ancestors.

These are bounded phrase/punctuation checks, not a claim of general natural-
language understanding. Capture the new failing tests before changing production,
then rerun the exact 722-test selection and that selection plus the new file.
Publish the exact resulting commit before checking hosted cold install, browser,
build, strict/full/checker, audit and Docker gates. A blocked publication or
missing hosted result is incomplete verification, regardless of local passes.

Before production edits, two proposed positive controls beginning with an opening
parenthesis were corrected: the existing price grammar already refuses that
shape. The replacement controls above exercise admitted product names without
expanding grammar. The initial test source, expectations and run are preserved
separately; only the corrected baseline is counted as the behavioral baseline.
