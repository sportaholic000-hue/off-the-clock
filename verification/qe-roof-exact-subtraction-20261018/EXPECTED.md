# Independent expectations — written before execution or production edits

Synthetic inputs, no recommended owner prices. Per-line positive half cents round up. Rates below are cents per roofing square. Material waste is10%; underlayment uses installed area; disposal scales with all removed layers. Story and shape additions stack separately, not multiplicatively.

- One square, installation10, removal10, material1, underlayment1, disposal1, story1.15: 10+round(1.5)+round(1.1)+10+round(1.5)+1+1 = **27c**. Reported base25c is a defect.
- Same, neutral story and shape1.15: 10+round(1.5)+1+10+1+1 = **25c**. Reported base24c is a defect.
- Installation1, removal2, story1.5 and shape1.5: 1+round(.5)+round(.5)+1+2+round(1)+1+1 = **9c**. Combining the installation lines would make8c and is prohibited.
- Three layers, additional factor.5, story1.15: 10+2+1+10+10+2+2+1+3 = **41c**; all three story adjustments must independently round1.5 to2.
- Both story and shape1.15:10+2+2+1+10+2+1+1 = **29c**.

`prepare-expectations.py` independently uses Python Fraction from decimal strings; it imports no application code. `expected-cases.json` fixes every line's unrounded fraction and rounded cents before engine execution. It covers neighboring half-cent values, neutral factors, fractional rates and areas, measured/percentage partial scope, mixed pitch areas, extra layers, opt-in zeros and positive controls. Exact story/shape evidence must equal the original decimal minus1, even when that leaves the cents unchanged. Below-one policy and metadata/readiness are excluded; rejection behavior stays unchanged.

History: capture actual v9 widget submissions and voice dispatcher receipts on pinned base21f0ccf9 before edits. Preserve the full synthetic stored rows and public wording. On v10 replay these frozen responses before/after ordinary save and explicit reapproval; newly authorized requests use independently expected cents. No rewritten historic calculation or migration.
