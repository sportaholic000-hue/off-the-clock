# Independent expectations — written before calculation

Base: `1857b7779b83b70f7753b41b72c3677270cd4ffc`.
Reference: `befc00358dfc82a864eaffeb229db7c386045051`, positive-rate
`roof-adopted-upper-pitch` fixture, with `pitchBand: up_to_six`.
Every fixture is synthetic. No production data or provider is used.

## Literal anchors

The roof has 1,000 sq ft = 10 squares. Installation is 20,000 cents per
square; first-layer removal 6,000; disposal 2,000; field material 10,000
with 10% waste; installed underlay 100. Tax, markup, fees, minimum and
range buffer are zero. Material plus underlay is 111,000 cents.

The adopted formula, before cents rounding, is:

* installation: `Q * L * (1 + (S - 1) + (C - 1))`, plus each pitch area's
  independent `Q_band * L * installationAddition_band`;
* first-layer and additional-layer tear-off: `Q * T * S * (1 + (N-1)*A)`;
  the implementation itemizes the base, additional-layer, story and
  additional-layer-story terms and rounds each independently;
* steep removal: `Q_band * (T + D) * removalAddition_band`;
* disposal: `Q * N * D`, without story/shape multiplication.

This is a sum, not multiplication of story and shape. The table is the
formal algebra of the existing formula, not an authorization to issue a
negative charge or a free job.

| Story S | Shape C | Pitch | Layers | Installation | Tear-off | Other | Formal total cents |
|---:|---:|---|---:|---:|---:|---:|---:|
|1|1|up_to_six|1|200000|60000|131000|391000|
|0.5|1|up_to_six|1|100000|30000|131000|261000|
|1|0.5|up_to_six|1|100000|60000|131000|291000|
|0.5|0.6|up_to_six|1|20000|30000|131000|181000|
|0.5|1.6|up_to_six|1|220000|30000|131000|381000|
|0.5|0.5|up_to_six|1|0|30000|131000|161000|
|0.4|0.4|up_to_six|1|-40000|24000|131000|115000|
|0.1|0.215|up_to_six|1|-137000|6000|131000|0|
|0.1|0.214995|up_to_six|1|-137001|6000|131000|-1|
|0.1|0.215005|up_to_six|1|-136999|6000|131000|1|
|0.1|0.1|up_to_six|1|-160000|6000|131000|-23000|
|0.5|0.5|ten_to_twelve|1|62000|30000|163800|255800|
|0.5|1|up_to_six|3|100000|72000|171000|343000|

The two coordinator cases must be accepted by factor validation and fail
the current calculator's negative-delta guard. Standalone regression
assertions will nevertheless demand READY and the literal 261000/291000
amounts, preserving the implementation mismatch as failing evidence.

## Boundaries and combined domain

Both factor definitions have inclusive 0.1–5 finite-number bounds. Test
negative, zero, 0.099999, 0.1, 0.100001, 0.5, 0.999999, 1,
1.000001, 1.2, 5, 5.000001, numeric text, null, missing, NaN and infinity.
Draft validation is weaker: it checks finite nonnegative numeric leaves,
not these Class-2 min/max bounds. A draft save is not proof of readiness.

For accepted factors, any selected S or C below one produces a negative
individual adjustment today, even when their sum is positive. Combined
zero/negative installation, zero/negative overall totals, and a positive
overall total containing negative installation must be recorded without
declaring a new policy. Current nonnegative line/receipt guards should
refuse them; no clamp, multiplier product or factor minimum is assumed.
An 81-case grid S,C in {0.1,0.4,0.5,0.6,0.9,1,1.1,1.2,5}
will separate positive/zero/negative component and overall results.

Legacy mode keeps multiplicative pitch/story and ignores the newly
introduced shape labor factor. The story-0.5 legacy control is 261000c;
the shape-0.5 legacy control is 391000c.

## Readiness and actual application

Read the status probe inputs as well as calling them. With only story[1]
or shape.simple below one, higher story entries and the highest-waste
shape should hide the failed selection from the current activation
probes. Supply `unknownPitchBand: up_to_six` explicitly in application
fixtures so an unrelated unknown-pitch omission cannot mask this issue.
The save/approve operations must be real, on disposable synthetic storage.
Record, rather than presume, their result, receipt, status, matching quote
outcome, preview, and public customer projection. No provider is called.
Also test all story values/all shape values below one so readiness must
encounter a negative delta. Save/approval acceptance does not establish
calculation validity. Reapproval after editing and engine-version mismatch
must follow the current receipt predicate, without changing it.

## Rounding expectations

Exact decimal factors must be subtracted as exact decimals. With one
square, L=T=10c, S=1.15, C=1, material/underlay/disposal each 1c and
10% field waste, the two 1.5c story adjustments each round to 2c.
Expected total: 10+2+10+2+1+1+1 = **27c**. With S=1, C=1.15,
only installation adds 2c: expected **25c**. The code's native `factor-1`
may turn 0.15 into 0.1499999999999999; preserve any resulting mismatch.

Rounding-placement counterexample: one square, L=1c, S=C=1.5,
T=2c, other three lines each 1c. Existing separate positive lines give
installation 1+1+1=3c and total **9c**. Rounding the summed installation
once gives 2c and total **8c**. Therefore an indiscriminate merged-line
repair changes already-working positive quotes by 1c. Negative half-cent
rounding is not supported by `exactRound` or existing line evidence; do
not invent a signed tie rule in a production recommendation.

The sweep preparation imports no production calculation or validation.
It writes exact rational working, literal anchors and the complete input
matrix before the separate runner executes any engine calls.
