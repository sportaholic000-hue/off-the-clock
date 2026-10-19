import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {roof} from '../verification/qe-roof-zero-adjustments-20261018/fixture.mjs';
import {vNextServiceStatus,generateQuoteVNext,ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {activationScenarios} from '../server/quote-engine-vnext/priceBook.js';
function catalog(n){
 const f=roof({pitchBand:'up_to_six'}),p=f.ownerPricing.pricing;
 for(let i=1;i<n;i++){
  const key='synthetic_roof_'+i;p.laborPerSquare[key]=20000;p.tearOffPerSquare[key]=6000;
  for(const field of ['replacementRoofType','existingRoofType'])f.ownerPricing.knownOfferings[field][key]=randomUUID();
 }
 return f;
}
const absent={unknown:p=>delete p.unknownPitchBand,install:p=>delete p.pitchInstallationAdderOverTwelve,removal:p=>delete p.pitchRemovalAdderOverTwelve,both:p=>{delete p.pitchInstallationAdderOverTwelve;delete p.pitchRemovalAdderOverTwelve;},unknownIncomplete:p=>{p.unknownPitchBand='over_twelve';delete p.pitchRemovalAdderOverTwelve;}};
for(const n of [1,2,11])for(const [policy,edit] of Object.entries(absent))for(const quick of [false,true])test('AP01/AP02 complete lower-pitch product remains live: '+n+' catalog '+policy+' quick='+quick,()=>{
 const f=catalog(n);edit(f.ownerPricing.pricing);const before=structuredClone(f);
 const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:quick});assert.equal(status.status,'QUOTING LIVE',JSON.stringify(status));
 assert.equal(generateQuoteVNext(f).midEstimate,3910);assert.deepEqual(f,before);
});
for(const n of [1,11])for(const [name,mutate] of [
 ['null over12',f=>f.ownerPricing.pricing.pitchRemovalAdderOverTwelve=null],
 ['negative over12',f=>f.ownerPricing.pricing.pitchInstallationAdderOverTwelve=-.1],
 ['malformed unknown band',f=>f.ownerPricing.pricing.unknownPitchBand='made_up'],
 ['malformed sibling price',f=>f.ownerPricing.pricing.materialCostPerSquare.synthetic_broken='100'],
 ['invalid shared fee',f=>f.ownerPricing.feeRules.travel='made_up'],
 ['unsafe maximum-area arithmetic',f=>f.ownerPricing.pricing.laborPerSquare.asphalt_shingle=1e12]
])test('AP01/AP02 retains global/boundary safeguards: '+n+' '+name,()=>{
 const f=catalog(n);delete f.ownerPricing.pricing.unknownPitchBand;delete f.ownerPricing.pricing.pitchRemovalAdderOverTwelve;mutate(f);
 for(const quick of [false,true])assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:quick}).status,'NEEDS PRICING');
 if(name==='unsafe maximum-area arithmetic')assert.equal(generateQuoteVNext(f).resultType,'INSTANT_ESTIMATE_READY','One small supported quote cannot replace comprehensive boundary checks');
});
test('AP01/AP02 retains all standard pitch and large boundary probes, plus complete optional pitches',()=>{
 const f=roof({pitchBand:'up_to_six'});
 for(const complete of [true,false]){
  if(!complete){delete f.ownerPricing.pricing.unknownPitchBand;delete f.ownerPricing.pricing.pitchRemovalAdderOverTwelve;}
  const scenarios=activationScenarios(f.ownerPricing);
  for(const band of ['up_to_six','seven_to_nine','ten_to_twelve'])assert.ok(scenarios.some(c=>c.roofSizeInput===1e6&&c.existingLayers===10&&c.pitchMethod==='whole_roof'&&c.pitchBand===band));
  assert.ok(scenarios.some(c=>c.pitchMethod==='area_by_pitch'&&c.pitchAreaUpTo6Sqft===500000&&c.pitchArea7To9Sqft===500000));
  assert.ok(scenarios.some(c=>c.roofSizeMethod==='footprint'&&c.pitchRisePer12===8&&c.roofSizeInput===500000));
  assert.equal(scenarios.some(c=>c.pitchBand==='over_twelve'),complete);assert.equal(scenarios.some(c=>c.pitchMethod==='not_sure'),complete);
 }
 assert.equal(ENGINE_VERSION,'quote-engine-vnext-geometry-20261019-v12');
});

for(const n of [1,11])test('AP01/AP02 still probes complete optional steep arithmetic at its maximum: '+n,()=>{
 const f=catalog(n),p=f.ownerPricing.pricing;delete p.unknownPitchBand;
 p.laborPerSquare.asphalt_shingle=2e11;p.pitchInstallationAdderOverTwelve=5;
 for(const quick of [false,true])assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:quick}).status,'NEEDS PRICING');
 delete p.pitchRemovalAdderOverTwelve;
 for(const quick of [false,true])assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:quick}).status,'QUOTING LIVE');
});
