// One-time build of corpus-additions-20261105c.json: inputs for Astra's review
// of v19/v20 (prohibited floating combinations with an overlay price, exact
// recognized names, a contradictory carpet classification). Run once; the
// output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261105c.mjs
import {writeFileSync} from 'node:fs';
import {flooring} from '../engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from '../../test/quoteEngineVNextFixtures.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
const over=(name,id,pricing,overlay)=>{const f=flooring('laminate');
 Object.assign(f.ownerPricing.pricing,{scopeDetails:{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'},...(overlay?{floor_overlay:{description:'[SYNTHETIC] Clean only',mode:'itemized',existingFloorType:name,newFlooringType:'laminate',basePriceExcludesPreparation:true}}:{})},...(overlay?{scopeRates:{floor_overlay_prep:100,floor_overlay_material:50}}:{}),...pricing});
 if(!f.ownerPricing.knownOfferings.existingFloorType[name])f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[name]:id};
 f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:name,removalNeeded:false,existingFloorSound:'yes',underlaymentScopeConfirmed:true,...(overlay?{overlayScopeConfirmed:true}:{})});
 f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:name,offeringId:f.ownerPricing.knownOfferings.existingFloorType[name]}};
 return f;};
add('review-v20-20261105:tile-prohibited-with-overlay-price',over('tile','7b3f0e25-4c68-4d90-b1e3-8f2c6d0a4b71',{laminateFloatsOver:{wood:true,resilient_sheet:true,ceramic_stone_tile:false,concrete:true}},true));
add('review-v20-20261105:vct-tile-unclassified',over('vct_tile','7b3f0e25-4c68-4d90-b1e3-8f2c6d0a4b72',{laminateFloatsOver:{wood:false,resilient_sheet:false,ceramic_stone_tile:true,concrete:false}},false));
add('review-v20-20261105:carpet-classified-wood',over('carpet','7b3f0e25-4c68-4d90-b1e3-8f2c6d0a4b73',{existingFloorSubstrate:{carpet:'wood'}},false));
writeFileSync(new URL('./corpus-additions-20261105c.json',import.meta.url),JSON.stringify(rows));
console.log(rows.length+' inputs');
