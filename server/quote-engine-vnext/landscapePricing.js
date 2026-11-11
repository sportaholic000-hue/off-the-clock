// Shared selection rules only. Prices and exact arithmetic stay in the engine.
export const hasFirstMowingVisit=(type,c)=>type==='LANDSCAPING_MOWING'&&['weekly','biweekly','monthly'].includes(c.serviceFrequency)&&c.grassCondition!=='maintained';
export const optionalPricePresent=value=>value!==undefined&&value!==null&&value!=='';
// Yard-cleanup disposal. The debris level's flat charge is the disposal
// minimum; a per-bag or per-load price replaces it only when larger. A count is
// used only in a unit the owner priced. A blank or Not sure count, or a count
// in an unpriced unit, falls back to the yard area and the owner's square feet
// per load when both are set; otherwise the minimum is charged and disposal
// beyond it is left for the site visit. When the owner priced both units, a 0
// next to a positive count in the other unit is an unanswered box, not a second
// answer, and two answered counts conflict. A count in an unpriced unit is
// never read.
const positiveCount=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
export function cleanupCountsVNext(c={},p={}){
  const perBag=optionalPricePresent(p.disposalPerBag),perLoad=optionalPricePresent(p.disposalPerLoad),both=perBag&&perLoad;
  const count=(own,other,priced)=>priced&&typeof c[own]==='number'&&!(both&&c[own]===0&&positiveCount(c[other]))?c[own]:undefined;
  return {bags:count('wasteBags','wasteLoads',perBag),loads:count('wasteLoads','wasteBags',perLoad),both};
}
export function cleanupDisposalPlan(c,p){
  const perBag=optionalPricePresent(p.disposalPerBag),perLoad=optionalPricePresent(p.disposalPerLoad);
  if(!perBag&&!perLoad)return {mode:'flat'};
  const {bags,loads}=cleanupCountsVNext(c,p);
  if(bags!==undefined)return {mode:'bags',quantity:bags,ratePath:'disposalPerBag'};
  if(loads!==undefined)return {mode:'loads',quantity:loads,ratePath:'disposalPerLoad'};
  const coveragePath='debrisPricing.'+c.debrisLevel+'.sqftPerLoad';
  if(perLoad&&optionalPricePresent(p.debrisPricing?.[c.debrisLevel]?.sqftPerLoad))return {mode:'area',ratePath:'disposalPerLoad',coveragePath};
  return {mode:'minimum'};
}
export const CLEANUP_DISPOSAL_SITE_LABEL='Debris disposal beyond the minimum charge';

