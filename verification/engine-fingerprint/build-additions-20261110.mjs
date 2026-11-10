// One-time build of corpus-additions-20261110.json: inputs for Astra's review of
// v23 and her refinements (engine v24). The successor case repeats the job of
// s08-v22-review:wood-on-concrete-blank-map with the current setting and
// question; the others reach the three wood conditions, the concrete wording,
// a tier that receives an answer only another tier asks, and painting prices
// the pricing method does not read. Run once; the output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261110.mjs
import {writeFileSync} from 'node:fs';
import {flooring} from '../engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from '../../test/quoteEngineVNextFixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
const L={laminateInstallInstructions:'[SYNTHETIC] Laminate X, instructions rev. 2025'};
let n=0;const id=()=>'4c2f7a10-3b6d-4e8a-9f51-7d20c6e8b'+String(100+(n++)).padStart(3,'0');
const over=(name,pricing,answers={},tiers)=>{const f=flooring('laminate');
 Object.assign(f.ownerPricing.pricing,{scopeDetails:{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}},...pricing});
 if(!f.ownerPricing.knownOfferings.existingFloorType[name])f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[name]:id()};
 if(tiers)f.ownerPricing.tiers=tiers;
 f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:name,removalNeeded:false,existingFloorSound:'yes',underlaymentScopeConfirmed:true,...answers});
 f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:name,offeringId:f.ownerPricing.knownOfferings.existingFloorType[name]}};
 return f;};
// Successor to s08-v22-review:wood-on-concrete-blank-map: glued to concrete, blank list.
add('v24:successor-wood-glued-to-concrete-blank-map',over('hardwood',{...L,laminateFloatConditions:{wood_not_glued_to_concrete:true}},{woodFloorAssembly:'glued_to_concrete'}));
// Astra's plywood case under the broad restriction, and the suspended floor it must not catch.
add('v24:plywood-fastened-over-concrete',over('plywood',{...L,existingFloorSubstrate:{plywood:'wood'},laminateFloatsOver:{wood:true},laminateFloatConditions:{wood_not_directly_over_concrete:true}},{woodFloorAssembly:'direct_on_concrete'}));
add('v24:plywood-on-joists',over('plywood',{...L,existingFloorSubstrate:{plywood:'wood'},laminateFloatsOver:{wood:true},laminateFloatConditions:{wood_not_directly_over_concrete:true}},{woodFloorAssembly:'joists'}));
add('v24:sleepers-under-direct-condition',over('oak',{...L,laminateFloatsOver:{wood:true},laminateFloatConditions:{wood_not_directly_over_concrete:true}},{woodFloorAssembly:'sleepers'}));
add('v24:sleepers-prohibited',over('oak',{...L,laminateFloatsOver:{wood:true},laminateFloatConditions:{no_sleeper_construction:true}},{woodFloorAssembly:'sleepers'}));
add('v24:earlier-glue-answer-under-broad-condition',over('oak',{...L,laminateFloatsOver:{wood:true},laminateFloatConditions:{wood_not_directly_over_concrete:true}},{woodAdheredToConcrete:'no'}));
// Concrete: a No asks for surface preparation to be confirmed.
add('v24:concrete-surface-no',over('slab_floor',{...L,existingFloorSubstrate:{slab_floor:'concrete'},laminateFloatsOver:{concrete:true}},{existingFloorSound:'no'}));
// A tier that does not ask the wood question receives its answer.
add('v24:wood-answer-only-one-tier-asks',over('hardwood',{...L,laminateFloatsOver:{wood:true}},{woodFloorAssembly:'direct_on_concrete'},[{name:'Good',overrides:{}},{name:'Best',overrides:{laminateFloatConditions:{wood_not_directly_over_concrete:true}}}]));
// Painting prices the pricing method does not read.
const installed=offeringFixture('INTERIOR_PAINTING','installed');Object.assign(installed.customerInputs,{ceilingCoats:2,ceilingSurfaceCondition:'good',trimCoats:1,trimSurfaceCondition:'good'});
Object.assign(installed.ownerPricing.pricing,{paintingRates:{primerMaterialPerSqftPerCoat:2000,trimMaterialPerLFPerCoat:5000},paintWasteFactor:0.5});
add('v24:installed-painting-retained-component-prices',installed);
const exterior=offeringFixture('EXTERIOR_PAINTING','itemized');Object.assign(exterior.ownerPricing.pricing,{paintingRates:{trimMaterialPerLFPerCoat:5000,primerMaterialPerSqftPerCoat:2000},paintWasteFactor:0.5,primerWasteFactor:0.5,prepMaterialWasteFactor:0.5});
add('v24:exterior-itemized-retained-component-prices',exterior);
writeFileSync(new URL('./corpus-additions-20261110.json',import.meta.url),JSON.stringify(rows));
console.log(rows.length+' inputs');
