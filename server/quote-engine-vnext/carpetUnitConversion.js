// Exact carpet price conversion between square feet and square yards
// (9 sq ft = 1 sq yd). Pure: the price book editor adds its own save-and-
// reload money check, and the tier merge uses it as is.
const UNITS = ['square_foot', 'square_yard'];
export const carpetUnitOf = value => value === 'square_yard' ? 'square_yard' : 'square_foot';
function exactParts(value) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(JSON.stringify(value));
  if (!match) return null;
  const fraction = match[3] || '';
  return { negative: match[1] === '-', digits: BigInt(match[2] + fraction), exponent: Number(match[4] || 0) - fraction.length };
}
// The converted price, or null when it has no exact decimal value.
export function exactCarpetConversion(value, before, after) {
  if (!UNITS.includes(before) || !UNITS.includes(after) || before === after || typeof value !== 'number' || !Number.isFinite(value)) return value;
  if (value === 0) return 0;
  const parts = exactParts(value);
  if (!parts) return null;
  if (after === 'square_foot' && parts.digits % 9n !== 0n) return null;
  const digits = after === 'square_yard' ? parts.digits * 9n : parts.digits / 9n;
  const result = Number((parts.negative ? '-' : '') + digits.toString() + 'e' + parts.exponent);
  const back = exactParts(result);
  if (!back || back.digits * 10n ** BigInt(Math.max(0, back.exponent - parts.exponent)) !== digits * 10n ** BigInt(Math.max(0, parts.exponent - back.exponent))) return null;
  return result;
}
