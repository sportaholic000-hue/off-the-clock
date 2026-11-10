// One-time build of corpus-additions-20261110b.json: inputs for Astra's review of
// v24 and her refinements (engine v25). They reach the construction conditions
// beneath non-wood floors, after the old floor is removed and with no existing
// floor; a concrete surface; an answer to the other kind of floor's question; a
// tier using the earlier condition name over a base using the current one; the
// vinyl plank install-method decision; and painting quantity assumptions the
// pricing method does not read. Run once; the output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261110b.mjs
import {writeFileSync} from 'node:fs';
import {flooring} from '../engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from '../../test/quoteEngineVNextFixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
const L={laminateInstallInstructions:'[SYNTHETIC] Laminate X, instructions rev. 2025'},V={vinylPlankInstallInstructions:'[SYNTHETIC] Plank Y, instructions rev. 2025',vinylPlankInstallMethod:'floating'};
const ALL={wood:true,resilient_sheet:true,resilient_tile_plank:true,laminate:true,ceramic_stone_tile:true,concrete:true};
let n=0;const id=()=>'7e41b2c9-5d08-4f3a-8b6e-2a9c1d4f6'+String(100+(n++)).padStart(3,'0');
const job=(product,name,pricing,answers={},tiers)=>{const f=flooring(product);
 Object.assign(f.ownerPricing.pricing,{scopeDetails:product==='laminate'?{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}}:{},...pricing});
 if(name!=='none'){
  if(!f.ownerPricing.knownOfferings.existingFloorType[name])f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[name]:id()};
  f.ownerPricing.pricing.removalPerSqft={...(f.ownerPricing.pricing.removalPerSqft||{}),[name]:100};
 }
 if(tiers)f.ownerPricing.tiers=tiers;
 f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:name,removalNeeded:false,...(product==='laminate'?{underlaymentScopeConfirmed:true}:{}),...answers});
 if(name!=='none')f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:name,offeringId:f.ownerPricing.knownOfferings.existingFloorType[name]}};
 return f;};
const stay={removalNeeded:false,existingFloorSound:'yes'},remove={removalNeeded:true,removalAreaSqft:200};
const sleeperL={...L,laminateFloatsOver:{...ALL},laminateFloatConditions:{no_sleeper_construction:true}};
const directV={...V,vinylPlankFloatsOver:{...ALL},vinylPlankFloatConditions:{wood_not_directly_over_concrete:true}};
// Astra's table: kept non-wood coverings over prohibited construction.
add('v25:sheet-vinyl-kept-over-sleepers',job('laminate','sheet_vinyl',sleeperL,{...stay,floorSupportConstruction:'sleepers'}));
add('v25:ceramic-kept-over-wood-on-concrete',job('vinyl_plank','ceramic_tile',directV,{...stay,floorSupportConstruction:'wood_on_concrete'}));
add('v25:ceramic-kept-unanswered',job('laminate','ceramic_tile',sleeperL,stay));
add('v25:ceramic-kept-on-slab',job('vinyl_plank','ceramic_tile',directV,{...stay,floorSupportConstruction:'concrete_slab'}));
// Astra's removal case and its relatives.
add('v25:oak-removed-over-sleepers',job('laminate','oak',sleeperL,{...remove,woodFloorAssembly:'sleepers'}));
add('v25:oak-glued-to-slab-removed',job('vinyl_plank','oak',directV,{...remove,woodFloorAssembly:'glued_to_concrete'}));
add('v25:oak-on-concrete-removed-unresolved',job('vinyl_plank','oak',directV,{...remove,woodFloorAssembly:'direct_on_concrete'}));
add('v25:tile-removed-over-sleepers',job('laminate','ceramic_tile',sleeperL,{...remove,floorSupportConstruction:'sleepers'}));
add('v25:carpet-removed-not-sure',job('laminate','carpet',sleeperL,{...remove,floorSupportConstruction:'not_sure'}));
add('v25:carpet-removed-joists',job('laminate','carpet',sleeperL,{...remove,floorSupportConstruction:'joists'}));
// No existing floor.
add('v25:no-floor-unanswered',job('laminate','none',sleeperL,{removalNeeded:false}));
add('v25:no-floor-over-sleepers',job('laminate','none',sleeperL,{removalNeeded:false,floorSupportConstruction:'sleepers'}));
add('v25:no-floor-on-slab',job('vinyl_plank','none',directV,{removalNeeded:false,floorSupportConstruction:'concrete_slab'}));
// A concrete surface is asked what it is laid on.
add('v25:concrete-surface-over-wood-on-concrete',job('vinyl_plank','concrete',directV,{...stay,floorSupportConstruction:'wood_on_concrete'}));
// An answer to the other kind of floor's question.
add('v25:wood-floor-with-other-question',job('laminate','oak',sleeperL,{...stay,woodFloorAssembly:'joists',floorSupportConstruction:'sleepers'}));
// A tier using the earlier name over a base using the current name.
add('v25:mixed-name-tier-earlier-over-current',job('laminate','oak',{...L,laminateFloatsOver:{wood:true},laminateFloatConditions:{wood_not_glued_to_concrete:false}},{...stay,woodFloorAssembly:'glued_to_concrete'},[{name:'Only',overrides:{laminateFloatConditions:{wood_not_on_concrete:true}}}]));
add('v25:mixed-name-tier-earlier-false',job('vinyl_plank','oak',{...V,vinylPlankFloatsOver:{wood:true},vinylPlankFloatConditions:{wood_not_glued_to_concrete:true}},stay,[{name:'Only',overrides:{vinylPlankFloatConditions:{wood_not_on_concrete:false}}}]));
// The vinyl plank install method left unset.
add('v25:vinyl-install-method-unset',job('vinyl_plank','oak',{vinylPlankInstallInstructions:'[SYNTHETIC] P',vinylPlankFloatsOver:{wood:false}},stay));
// Painting assumptions the pricing method does not read.
const ext=offeringFixture('EXTERIOR_PAINTING','itemized');Object.assign(ext.ownerPricing.pricing,{prepHoursPerSqft:{fair:0.1}});
add('v25:exterior-itemized-prep-hours-unread',ext);
const inst=offeringFixture('EXTERIOR_PAINTING','installed');Object.assign(inst.ownerPricing.pricing,{prepHoursPerSqft:{fair:0.1},paintingSettings:{wallAdditionalCoatRatio:2,ceilingAdditionalCoatRatio:2,trimAdditionalCoatRatio:2},paintWasteFactor:0.5});
add('v25:exterior-installed-unread-assumptions',inst);
writeFileSync(new URL('./corpus-additions-20261110b.json',import.meta.url),JSON.stringify(rows));
console.log(rows.length+' inputs');
