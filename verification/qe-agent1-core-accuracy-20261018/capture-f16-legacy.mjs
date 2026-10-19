// Run only against the recorded pre-fix bridge. These are synthetic receipts
// issued by that endpoint, not reconstructed approval hashes.
import '../../test/pricebookTestEnv.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {fixture} from '../engine-independent/fixtures.mjs';
import * as bridge from '../../server/src/quoteDoneBridge.js';
import {loadPricebook,savePricebook} from '../../server/priceBookService.js';

const cases=[];
for(const field of ['deckingPerSheet','pipeJackEach'])for(const location of ['base','tier'])for(const source of ['MANUAL','AI_SUGGESTED']){
  const owner=`synthetic-agent1-f16-${field}-${location}-${source}`;
  const f=fixture('ROOFING_REPLACEMENT',{
    laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:10000},
    tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:100},
    underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},
    disposalPerSquare:2000,accessoryPricingMode:'per_square_allin',minimumJob:0,
    [field]:location==='base'?100.5:100,dripEdgePerLF:100.5
  },{});
  f.ownerPricing.source=source;f.ownerPricing.origin.source=source;f.ownerPricing.origin.ownerId=owner;
  for(const key of ['pitchInstallationAdder','pitchRemovalAdder','complexityLaborMultiplier','additionalLayerRemovalFactor'])delete f.ownerPricing.pricing[key];
  f.ownerPricing.service='[SYNTHETIC] F16 legacy approval';
  if(location==='tier')f.ownerPricing.tiers=[{name:'[SYNTHETIC] Premium',overrides:{[field]:100.5,dripEdgePerLF:100.5}}];
  savePricebook(owner,{services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}});
  const before=loadPricebook(owner);
  bridge.approveApplicationService(owner,f.ownerPricing.id,{
    revision:bridge.bookRevision(before),confirmConfiguration:true,confirmLegacySettings:true,
    fields:bridge.applicationStatus(before.services[0],before).confirmationFields
  });
  const book=loadPricebook(owner);
  assert.equal(bridge.applicationStatus(book.services[0],book).approvalCurrent,true);
  cases.push({field,location,source,book});
}
writeFileSync(new URL('./f16-legacy-approvals.json',import.meta.url),JSON.stringify({
  agent1Source:'3b1e4b32c1cf31260ba2344fbf3bbdf418c81b5c',
  agent2Source:'7e9dfcedc6f11f80b45b8ca0554aa5b83935d15b',cases
},null,2)+'\n');
console.log(JSON.stringify({captured:cases.length,receiptEngine:bridge.ENGINE_VERSION}));
