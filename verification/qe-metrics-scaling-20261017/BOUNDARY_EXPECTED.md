# QE metrics exact-boundary follow-up: expectations written before implementation

Reviewed starting commit: `2aa54a2f9306bcd0565ea0d2010c7daf07c31d1b`.
All observations are synthetic and remain inside the application's accepted
safe-integer amount limit.

## Adversarial 100,000-observation dataset

Let `p` range over the first 33,333 primes greater than five, in ascending
order. Insert every first-family observation, then every second-family
observation, then every third-family observation, followed by the final tie
observation. Do not interleave the families.

| Family | Midpoint cents | Invoice gap cents | Percentage in hundredth-percent units |
|---|---:|---:|---:|
| 1 | `20,000p` | `p + 2` | `1/2 + 1/p` |
| 2 | `60,000p` | `3p + 2` | `1/2 + 1/(3p)` |
| 3 | `60,000p` | `3p - 8` | `1/2 - 4/(3p)` |
| Final | `20,000` | `1` | `1/2` |

For each prime, the three percentage fractions sum exactly to `3/2`.
Therefore the first 99,999 observations sum to `49,999.5`; the final
observation makes the exact sum `50,000`. Dividing by 100,000 gives exactly
`0.5` hundredth-percent units, or `0.005%`. Half-away-from-zero rounding must
produce `0.01%`. Every gap is positive, so signed and absolute percentage
means are identical.

The first prime is `7`, the last is `393,241`, and their sum is
`6,251,065,493`. The exact total money gap is `43,757,325,120` cents, so the
mean is `437,573.2512` cents and both displayed money-gap means are
`$4,375.73`. All 100,000 original-scope invoices are inside their saved
outward-rounded 10% ranges.

Expected group fields:

- `jobs`: `100000`
- `insideRange`: `{ count: 100000, inside: 100000, percent: "100.00" }`
- `signedGap` and `absoluteGap`: `{ count: 100000, value: "4375.73" }`
- `signedGapPercent` and `absoluteGapPercent`:
  `{ count: 100000, value: "0.01" }`

## Responsiveness and resource behavior

- Boundary arithmetic and full owner metrics must finish under their isolated
  watchdogs and match the exact values above.
- An HTTP owner report must not run metric arithmetic on the server event-loop
  thread. While it is active, a synthetic quote request through the same
  server must remain responsive relative to its no-report control.
- Reporting work is bounded: concurrent requests use a fixed worker limit and
  a bounded queue. Queue overload, timeout, cancellation, worker failure, or
  invalid worker output fails the whole report; no partial report is returned.
- Cancellation or timeout must stop the corresponding worker computation, not
  merely abandon an HTTP response while CPU work continues.
- Existing synchronous report-service callers retain the same complete output;
  the HTTP handler uses the asynchronous bounded path.

## Unchanged correctness controls

The existing exact-oracle cases remain authoritative: positive and negative
half-ties, denominators 19,999 and 20,001, signed cancellation, varied
relatively-prime denominators, large accepted integer amounts, selected versus
ambiguous options, signed changes, missing versus explicit zero, grouping,
coverage counts, margins, costs, and hours. The existing 2,000, 10,000 and
100,000 normal scaling fixtures must retain their prior exact output.
