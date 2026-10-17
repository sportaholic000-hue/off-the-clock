# QE metrics scaling: expected results written before implementation

Base and parent: `046f9d905435495cab31f5abb02cce1413645e54`.
All fixtures are synthetic. Monetary inputs below are integer cents. Percentage
means are the arithmetic mean of each eligible job's own
`gapCents * 100 / midpointCents`; they are not ratios of aggregate totals.

## Exact rounding cases

- A `+1` cent gap over a `20,000` cent midpoint is exactly `+0.005%` and
  must display `+0.01%`. The corresponding `-1` cent gap is exactly
  `-0.005%` and must display `-0.01%` (half away from zero).
- A `+1` cent gap over `19,999` cents is approximately `+0.0050002500%`
  and must display `+0.01%`; over `20,001` cents it is approximately
  `+0.0049997500%` and must display `0.00%`. Negating each gap produces
  `-0.01%` and `0.00%`, respectively.
- For `(gap, midpoint)` cents
  `(1,19999), (-1,20011), (7,65537), (-5,32749), (3,10007),
  (-2,99991)`, the exact signed percentage mean in hundredth-percent units is
  `1005362991291397152998645000 / 2578384841181597196928761827`, so the
  displayed mean is `0.00%`. The exact absolute mean is
  `2918960573070729955851865000 / 2578384841181597196928761827`, so the
  displayed mean is `0.01%`. The signed money-gap mean is exactly half a cent
  and displays `$0.01`; the absolute money-gap mean is `19/6` cents and
  displays `$0.03`.
- Two signed money gaps of `0` and `-1` cent average exactly `-0.5` cent and
  must display `-$0.01`.
- A midpoint of `9,007,199,254,740,990` cents and invoice one cent higher are
  accepted safe integers. The money gap displays `$0.01`; its percentage
  displays `0.00%` without overflow or scientific-notation substitution.

## Existing output and exclusions

- Preserve the existing three-invoiced-job example: original-scope invoices
  `105000`, `210000`, and `140000` cents; all three inside range; signed gap
  `$16.67` / `1.11%`; absolute gap `$83.33` / `5.56%`; one eligible realized
  margin `33.33%`; labor estimate/actual/gap `$300/$400/$100`; materials
  `$200/$300/$100`; and labor hours `8.50`. A fourth job without an invoice
  remains in `jobs` and records but is excluded from those metrics.
- A positive approved change is subtracted from the final invoice. A negative
  approved change (credit) is signed and therefore increases the reconstructed
  original-scope invoice. Corrupt change JSON excludes the job from accuracy;
  it is never treated as zero changes.
- Missing values do not count. Explicit zero labor cost, material cost, and
  hours do count where their metric otherwise qualifies. A zero invoice remains
  excluded from realized margin. Ambiguous options remain excluded; an exact
  selected option remains eligible. Currency, price unit, and tax treatment
  continue to form separate groups.

## Scaling dataset

For iteration `i = 0..N-1`, the saved midpoint is `10000+i` dollars. The saved
low/high customer endpoints are `floor(0.9 * midpoint)` and
`ceil(1.1 * midpoint)` dollars, the final invoice is `(10001+i)*100` cents,
and there are no change orders. Every original-scope invoice is exactly `$1`
above its saved midpoint and remains inside its range.

Expected for each benchmark size:

| Records | Signed/absolute money gap | Inside range | Signed/absolute percentage |
|---:|---:|---:|---:|
| 2,000 | `$1.00` | 2,000/2,000 | `0.01%` |
| 10,000 | `$1.00` | 10,000/10,000 | `0.01%` |
| 100,000 | `$1.00` | 100,000/100,000 | `0.00%` |

Dataset construction time and metric calculation time are measured separately.
Each benchmark runs in a fresh child process with a watchdog. Runtime and RSS are
environment observations only, not production timing claims.
