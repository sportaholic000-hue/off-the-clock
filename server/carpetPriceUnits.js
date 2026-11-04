// Carpet labor and material can be priced per square foot or per square yard
// (9 sq ft = 1 sq yd). A conversion is exact or refused: carpet prices are
// measured rates, so fractional cents are kept when the converted dollars
// survive the same save-and-reload check every saved measured rate passes.
import {dollarAmountToCents} from './priceBookMoney.js';

export class CarpetUnitError extends Error {}
function exactParts(value) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(JSON.stringify(value));
  if (!match) throw new CarpetUnitError();
  const fraction = match[3] || '';
  return { negative: match[1] === '-', digits: BigInt(match[2] + fraction), exponent: Number(match[4] || 0) - fraction.length };
}
export function convertCarpetPrice(value, before, after) {
  if (before === after || typeof value !== 'number' || !Number.isFinite(value)) return value;
  if (value === 0) return 0;
  const parts = exactParts(value);
  if (after === 'square_foot' && parts.digits % 9n !== 0n) throw new CarpetUnitError();
  const digits = after === 'square_yard' ? parts.digits * 9n : parts.digits / 9n;
  const result = Number((parts.negative ? '-' : '') + digits.toString() + 'e' + parts.exponent);
  // The converted dollars must equal the exact product or quotient and survive
  // the cent conversion every saved measured rate passes.
  const back = exactParts(result);
  if (back.digits * 10n ** BigInt(Math.max(0, back.exponent - parts.exponent)) !== digits * 10n ** BigInt(Math.max(0, parts.exponent - back.exponent))) throw new CarpetUnitError();
  try { dollarAmountToCents(result, { kind: 'unit_rate' }); } catch { throw new CarpetUnitError(); }
  return result;
}
export const CARPET_PRICE_UNITS = Object.freeze(['square_foot', 'square_yard']);
