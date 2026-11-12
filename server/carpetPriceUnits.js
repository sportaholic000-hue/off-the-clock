// Carpet labor and material can be priced per square foot or per square yard
// (9 sq ft = 1 sq yd). A conversion is exact or refused: carpet prices are
// measured rates, so fractional cents are kept when the converted dollars
// survive the same save-and-reload check every saved measured rate passes.
import {dollarAmountToCents} from './priceBookMoney.js';

import {carpetUnitOf,exactCarpetConversion} from './quote-engine-vnext/carpetUnitConversion.js';
export {carpetUnitOf};

export class CarpetUnitError extends Error {}
export function convertCarpetPrice(value, before, after) {
  if (before === after || typeof value !== 'number' || !Number.isFinite(value)) return value;
  const result = exactCarpetConversion(value, before, after);
  if (result === null) throw new CarpetUnitError();
  // The converted dollars must also survive the cent conversion every saved
  // measured rate passes.
  try { dollarAmountToCents(result, { kind: 'unit_rate' }); } catch { throw new CarpetUnitError(); }
  return result;
}
export const CARPET_PRICE_UNITS = Object.freeze(['square_foot', 'square_yard']);
