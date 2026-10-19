# Flooring arithmetic correction

The original pre-execution ledger omitted the calculator's explicit boundary labor floor even though the source had been inventoried. The first public flooring result exposed that audit-arithmetic mistake. No product finding is assigned to this mismatch.

- Installation: measured area 300 sq ft, one room, average 300. The labor-equivalent area is `max(300 * large 1.0, 1 * medium limit 299 * medium 1.10) = 328.9`. Labor is `328.9 * 300 = 98,670`; material is `300 * 1.08 * 500 = 162,000`; expected total is **260,670 cents**.
- Replacement: measured area 300 sq ft, two rooms, average 150. The labor-equivalent area is `max(300 * medium 1.10, 2 * small limit 149 * small 1.20) = 357.6`. Labor is `357.6 * 300 = 107,280`; material 168,000 + removal 30,000 + subfloor 6,000 gives **311,280 cents**.
- Corrected replacement with subfloor work removed is **305,280 cents**.

These corrected controls are fixed before the next complete HTTP execution.
