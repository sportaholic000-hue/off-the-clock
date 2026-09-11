/* Standalone profit-checker arithmetic. Not QuoteDone's quote engine.
 * Decimal strings stay exact. Each entered cost line is quantity × rate,
 * rounded once to the nearest cent (positive half-cent ties round up).
 * Percentages are rounded for display only; monetary totals use integer cents.
 */
(function(root) {
  'use strict';
  const INPUT_CHAR_BUDGET = 256; // Resource budget, not a monetary/markup ceiling.
  function decimal(text, label = 'Value') {
    if (typeof text !== 'string') throw new TypeError(`${label}: enter a decimal as text.`);
    const raw = text.trim();
    if (!raw) throw new TypeError(`${label} is missing. Enter 0 explicitly when it is zero.`);
    if (raw.length > INPUT_CHAR_BUDGET) throw new RangeError(`${label}: input exceeds the 256-character technical budget. It has not been changed.`);
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) throw new TypeError(`${label}: use a non-negative decimal with a dot, without commas or currency symbols.`);
    const [whole = '0', frac = ''] = raw.split('.');
    return { n: BigInt((whole || '0') + frac), d: 10n ** BigInt(frac.length) };
  }
  function round(n, d) {
    if (typeof n !== 'bigint' || typeof d !== 'bigint' || d <= 0n) throw new TypeError('Invalid exact ratio.');
    const sign = n < 0n ? -1n : 1n, a = n < 0n ? -n : n;
    return sign * (a / d + (2n * (a % d) >= d ? 1n : 0n));
  }
  function enteredMoney(text, label) {
    const v = decimal(text, label);
    if ((v.n * 100n) % v.d !== 0n) throw new TypeError(`${label}: a selling amount must resolve to whole cents. Unit cost rates may contain fractional cents.`);
    return v.n * 100n / v.d;
  }
  function costLine(line, i) {
    const label = String(line.label || `Cost ${i + 1}`), q = decimal(line.quantity, `${label} quantity`), r = decimal(line.rate, `${label} unit cost`);
    return { label, quantity: line.quantity, rate: line.rate, cents: round(q.n * r.n * 100n, q.d * r.d) };
  }
  function fixed(scaled, digits) {
    const negative = scaled < 0n, a = negative ? -scaled : scaled;
    const s = a.toString().padStart(digits + 1, '0');
    return (negative ? '-' : '') + (digits ? s.slice(0, -digits) + '.' + s.slice(-digits) : s);
  }
  function money(cents) {
    if (typeof cents !== 'bigint') throw new TypeError('Money requires integer cents.');
    const [whole, fract] = fixed(cents, 2).split('.');
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fract;
  }
  function percentage(numerator, denominator) {
    if (denominator === 0n) return null;
    return fixed(round(numerator * 10000n, denominator), 2);
  }
  function calculate({ price, lines }) {
    const priceCents = enteredMoney(price, 'Selling price');
    if (!Array.isArray(lines) || !lines.length) throw new TypeError('Add at least one cost line; enter zero explicitly for a known zero cost.');
    const rows = lines.map(costLine);
    const costCents = rows.reduce((s, r) => s + r.cents, 0n);
    const leftCents = priceCents - costCents;
    return { priceCents, costCents, leftCents, rows,
      markup: percentage(leftCents, costCents),
      margin: percentage(leftCents, priceCents) };
  }
  // Target mode is a separate operation. Do not reuse a displayed percentage.
  // Round the required selling price UP to the first whole cent so the entered
  // markup is met, rather than potentially undershot at a half-cent boundary.
  function forMarkup({ markup, lines }) {
    const target = decimal(markup, 'Your markup');
    const costs = calculate({ price: '0', lines });
    const numerator = costs.costCents * (100n * target.d + target.n);
    const denominator = 100n * target.d;
    const priceCents = (numerator + denominator - 1n) / denominator;
    const result = calculate({ price: fixed(priceCents, 2), lines });
    return { ...result, requestedMarkup: markup,
      roundedUp: numerator % denominator !== 0n,
      targetMet: costs.costCents > 0n ?
        (result.leftCents * 100n * target.d >= costs.costCents * target.n) : null };
  }
  const api = Object.freeze({ decimal, round, enteredMoney, costLine, money, percentage, calculate, forMarkup });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OTCProfitMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
