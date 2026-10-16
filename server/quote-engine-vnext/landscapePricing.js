// Shared selection rules only. Prices and exact arithmetic stay in the engine.
export const hasFirstMowingVisit=(type,c)=>type==='LANDSCAPING_MOWING'&&['weekly','biweekly','monthly'].includes(c.serviceFrequency)&&c.grassCondition!=='maintained';
export const optionalPricePresent=value=>value!==undefined&&value!==null&&value!=='';
export function cleanupDisposalPlan(c,p){
  if(!['disposalPerBag','disposalPerLoad'].some(key=>optionalPricePresent(p[key])))return {mode:'flat'};
  if(typeof c.wasteBags==='number')return {mode:'bags',quantity:c.wasteBags,ratePath:'disposalPerBag'};
  if(typeof c.wasteLoads==='number')return {mode:'loads',quantity:c.wasteLoads,ratePath:'disposalPerLoad'};
  return {mode:'area',ratePath:'disposalPerLoad',coveragePath:'debrisPricing.'+c.debrisLevel+'.sqftPerLoad'};
}

