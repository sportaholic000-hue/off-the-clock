// One-time build of corpus-additions-20261105e.json: inputs for Astra's review of
// v22 (unclassified floors with a preparation price, known condition violations
// with blank product rules, existing laminate as a material). Run once; the
// output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261105e.mjs
import {writeFileSync} from 'node:fs';
import {flooring} from '../engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from '../../test/quoteEngineVNextFixtures.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
const L={laminateInstallInstructions:'[SYNTHETIC] Laminate X, instructions rev. 2025'};
const ALL_FALSE={wood:false,resilient_sheet:false,resilient_tile_plank:false,laminate:false,ceramic_stone_tile:false,concrete:false};
const over=(name,id,pricing,answers={},overlay=false)=>{const f=flooring('laminate');
 Object.assign(f.ownerPricing.pricing,{
  scopeDetails:{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'},
   ...(overlay?{floor_overlay:{description:'[SYNTHETIC] Cleaning only; the existing covering remains',mode:'itemized',existingFloorType:name,newFlooringType:'laminate',basePriceExcludesPreparation:true}}:{})},
  ...(overlay?{scopeRates:{floor_overlay_prep:100,floor_overlay_material:50}}:{}),...pricing});
 if(!f.ownerPricing.knownOfferings.existingFloorType[name])f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[name]:id};
 f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:name,removalNeeded:false,existingFloorSound:'yes',underlaymentScopeConfirmed:true,...(overlay?{overlayScopeConfirmed:true}:{}),...answers});
 f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:name,offeringId:f.ownerPricing.knownOfferings.existingFloorType[name]}};
 return f;};
add('s08-v22-review:unclassified-cleaning-overlay',over('oak_strip','9d5b2e47-6e8a-4fb2-83c5-0b4e8f2c6d91',{},{},true));
add('s08-v22-review:unclassified-all-false-cleaning-overlay',over('oak_strip','9d5b2e47-6e8a-4fb2-83c5-0b4e8f2c6d92',{...L,laminateFloatsOver:ALL_FALSE},{},true));
add('s08-v22-review:sheet-vinyl-two-layers-blank-map',over('sheet_vinyl','9d5b2e47-6e8a-4fb2-83c5-0b4e8f2c6d93',{...L,laminateFloatConditions:{sheet_vinyl_single_layer:true}},{existingFloorLayers:'two_or_more'}));
add('s08-v22-review:wood-on-concrete-blank-map',over('hardwood','9d5b2e47-6e8a-4fb2-83c5-0b4e8f2c6d94',{...L,laminateFloatConditions:{wood_not_on_concrete:true}},{woodAdheredToConcrete:'yes'}));
add('s08-v22-review:existing-laminate-attached',over('laminate','9d5b2e47-6e8a-4fb2-83c5-0b4e8f2c6d95',{...L,laminateFloatsOver:{laminate:true}}));
writeFileSync(new URL('./corpus-additions-20261105e.json',import.meta.url),JSON.stringify(rows));
console.log(rows.length+' inputs');
