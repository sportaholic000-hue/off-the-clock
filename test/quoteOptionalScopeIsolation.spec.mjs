import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';

process.env.PRICEBOOK_PATH=fs.mkdtempSync(path.join(os.tmpdir(),'otc-scope-isolation-'));
const store=await import('../server/priceBookService.js'),bridge=await import('../server/src/quoteDoneBridge.js');

// Independently calculated base totals, before any optional scope charge:
// tile: 200*300*1.1 + 200*500*1.12 = 178000 cents;
// siding: 1000*400 + 1000*700*1.1 = 1170000 cents;
// slab: 200*600 labor + round(200*4/324*1.1*18000) concrete +
//       60*2500 formwork + 200*175 base preparation = 353889 cents;
// membrane: 1000*500 + 1000*700*1.1 + 1000*200 = 1470000 cents.
const requests=[
 ['stairs','stairs',178000,{stairSteps:0},['stairWidthLF','stairRemovalNeeded','stairDisposalNeeded','floorAreaExcludesStairs','stairScopeConfirmed']],
 ['overlay','floor_overlay',178000,{existingFloorType:'none'},['overlayScopeConfirmed']],
 ['siding-trim','siding_trim',1170000,{trimIncluded:false},['trimLengthLF','sidingTrimScopeConfirmed']],
 ['siding-removal','siding_removal',1170000,{oldSidingRemoval:false},['existingSidingType','sidingRemovalAreaSqft','sidingRemovalStories','sidingRemovalScopeConfirmed']],
 ['demolition','demolition',353889,{demolitionNeeded:false},['demolitionAreaSqft','demolitionThickness','demolitionReinforcement','demolitionAccessDifficulty','demolitionScopeConfirmed']],
 ['exposed','exposed_aggregate',353889,{finishType:'broom'},['exposedAggregateScopeConfirmed']],
 ['commercial','insulation',1470000,{buildingType:'residential'},['insulationAreaSqft','coverboardAreaSqft','insulationScopeConfirmed']]
];
const cents=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;
function ready(f,expected){const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(cents(q),expected);return q;}
function review(f){const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');const publicQuote=sanitizeForCustomerVNext(q);for(const field of ['midEstimate','lowEstimate','highEstimate','options','subtotalCents'])assert.equal(publicQuote[field],undefined);return q;}
for(const [id,key,baseTotal,changes,remove] of requests)for(const mode of ['installed','itemized']){
 const name=id+'-'+mode;
 const fixture=()=>structuredClone(measuredScopeCases().find(row=>row.id===name));
 const base=f=>{const value=structuredClone(f);Object.assign(value.customerInputs,changes);for(const field of remove)delete value.customerInputs[field];if(id==='overlay')delete value.customerInputs.confirmedFacts.existingFloorType;return value;};
 test('Optional scope '+name+': missing price or description isolates only selected work',()=>{
  const {input:f,expected}=fixture(),rate=Object.keys(f.ownerPricing.pricing.scopeRates)[0];
  ready(f,expected.cents);ready(base(f),baseTotal);
  for(const missing of [...Object.keys(f.ownerPricing.pricing.scopeRates),'description']){
   const draft=structuredClone(f);if(missing!=='description')delete draft.ownerPricing.pricing.scopeRates[missing];else delete draft.ownerPricing.pricing.scopeDetails[key].description;
   const before=JSON.stringify(draft);review(draft);ready(base(draft),baseTotal);
   const status=vNextServiceStatus(draft.ownerPricing,draft.businessDefaults);
   assert.equal(status.status,'QUOTING LIVE');assert.equal(status.scopeCoverage.find(row=>row.key===key).configurationComplete,false);
   assert.match(status.scopeCoverage.find(row=>row.key===key).message,/leads/);assert.equal(JSON.stringify(draft),before);
  }
  // Malformed money is distinct from an unfinished optional price, and remains
  // fail-closed even when that scope is unselected.
  f.ownerPricing.pricing.scopeRates[rate]=0;review(f);ready(base(f),baseTotal);
  f.ownerPricing.pricing.scopeRates[rate]=-1;review(base(f));assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'NEEDS PRICING');
 });
 test('Optional scope '+name+': saved approval and tier completion preserve the boundary',()=>{
  const {input:f,expected}=fixture(),rate=Object.keys(f.ownerPricing.pricing.scopeRates)[0],price=f.ownerPricing.pricing.scopeRates[rate];
  delete f.ownerPricing.pricing.scopeRates[rate];
  f.ownerPricing.tiers=[{name:'Good',overrides:{}},{name:'Best',overrides:{scopeRates:{[rate]:price}}}];
  const owner='synthetic-scope-'+randomUUID(),raw=structuredClone(f.ownerPricing);delete raw.origin;
  store.savePricebook(owner,{services:[raw],defaults:{currency:'CAD',...f.businessDefaults}});
  const initial=store.loadPricebook(owner);assert.equal(bridge.approveApplicationService(owner,raw.id,{revision:bridge.bookRevision(initial),confirmConfiguration:true,confirmLegacySettings:true}).success,true);
  const book=store.loadPricebook(owner),service=book.services[0],status=bridge.applicationStatus(service,book);
  assert.equal(status.status,'QUOTING LIVE');assert.equal(status.approvalCurrent,true);
  const coverage=status.scopeCoverage.find(row=>row.key===key);assert.equal(coverage.configurationComplete,true);
  assert.deepEqual(coverage.variants.map(row=>[row.tierName,row.configurationComplete]),[['Good',false],['Best',true]]);
  const quote=inputs=>bridge.calculateApplicationQuote(book,service,{serviceId:service.id,customerInputs:inputs},{ownerId:owner}).internalResult;
  const main=quote(base(f).customerInputs);assert.deepEqual(main.options.map(row=>row.tierName),['Good','Best']);assert.deepEqual(main.options.map(row=>row.calculationRecord.scenarios.mid.finalTotalCents),[baseTotal,baseTotal]);
  const selected=quote(f.customerInputs);assert.deepEqual(selected.options.map(row=>row.tierName),['Best']);assert.equal(cents(selected),expected.cents);
 });
}
