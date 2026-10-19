import {exactAdd,exactDivide,exactMultiply,exactSqrtRound,exactToNumber} from './exactMath.js';

// Round surface to 0.01 sqft BEFORE partial scope, waste or package ceilings.
// Squaring nonnegative dimensions lets us decide every half-hundredth exactly,
// including irrational pitch factors. All callers share this conversion.
export function roofSurfaceAreaSqft(footprintSqft, risePer12) {
  const squaredHundredths = exactDivide(
    exactMultiply(footprintSqft, footprintSqft, exactAdd(144, exactMultiply(risePer12, risePer12)), 10000),
    144
  );
  return exactToNumber(exactDivide(exactSqrtRound(squaredHundredths), 100));
}
