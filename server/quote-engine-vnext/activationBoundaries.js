import {exactAdd,exactSubtract,exactToNumber} from './exactMath.js';

// Synthetic measurements only. The hundredth-unit neighbours exercise each
// side of a configured threshold; no production customer answer is inferred.
export function boundaryMeasurements(value) {
  if(typeof value!=='number'||!Number.isFinite(value))return [];
  return [exactToNumber(exactSubtract(value,0.01)),value,exactToNumber(exactAdd(value,0.01))];
}
export function repairBoundaryMeasurements(type,largeMaximum) {
  const limits=type==='ROOFING_REPAIR'?[50,200]:[20,80];
  return [...new Set([...limits,largeMaximum].flatMap(boundaryMeasurements))].filter(n=>n>0).sort((a,b)=>a-b);
}
