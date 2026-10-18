# Concrete base scope: independent expectations, before execution

Base commit: `1857b7779b83b70f7753b41b72c3677270cd4ffc`.
All owners, requests and prices in this evidence are synthetic.

Both concrete services use a 20 by 30 ft slab, 4 inches thick, broom finish,
easy access, no demolition, no reinforcement, no adjoining edges. Rates:
600c/sqft slab labor, 18000c/yd ready mix, 2500c/LF formwork, 175c/sqft legacy
combined preparation, 4500c/yd gravel and 120c/sqft excavation/grading.

Independent arithmetic:
- Area 600 sqft; perimeter 100 LF.
- Concrete: ceil((600 * 4 / 324 * 1.10) / .5) * .5 = 8.5 yd;
  8.5 * 18000 = 153000c. Slab labor 360000c; formwork 250000c.
- No preparation: 763000c.
- Legacy combined: add 600 * 175 = 105000c; total 868000c.
- Gravel: 600 * 4 / 324 * 1.20 = 80/9 yd; * 4500 = 40000c.
- Excavation/grading: 600 * 120 = 72000c.

| Case | Expected final cents for either service |
|---|---:|
| No prep, even when both separate rates exist | 763000 |
| Legacy combined, or blank separate rates | 868000 |
| Gravel only | 803000 |
| Excavation/grading only | 835000 |
| Both components | 875000 |
| Approved included zero gravel, zero labor, or both zero | 763000 |
| Unapproved zero gravel or labor | Review, no instant price |
| Price options: gravel / both / labor | 803000 / 875000 / 835000 |
| Both plus 10000c always-applied travel fee | 885000 |
| Both with 1000000c owner minimum | 1000000 |
| Both, difficult access, 20% markup, 10% materials-only tax | 1232760 |

Financial case: labor 450000 + 90000, materials 153000 + 250000 + 40000;
subtotal 983000, markup 196600, material tax (443000 * 1.20 * .10) = 53160;
total 1232760c. These values apply before and after this wording-only repair.

The frozen numerical projection records every numeric leaf (including all
root/option estimates, line costs, rates, tax, fee, minimum and scenario values)
and every exact-rational numerator/denominator. The post-change tests must match
it exactly. Customer responses also retain all dollar-formatted substrings.

Only separately priced preparation gains component disclosures. Legacy combined
and no-preparation calculations/disclosures remain unchanged. The customer field
and summary say `Base preparation requested`. Missing separate work is excluded;
valid approved zero work is included; invalid zero stays review-only. A gravel
quantity sentence refers to its compacted-depth assumption, never a complete
excavation/grading/compaction labor package. Joint/supplier policy is untouched.
