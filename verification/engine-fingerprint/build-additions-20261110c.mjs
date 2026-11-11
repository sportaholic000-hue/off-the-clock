// One-time build of corpus-additions-20261110c.json: inputs for Astra's review of
// v25 (engine v26). They reach the question asking whether the customer knows
// what the floor is laid on (Yes, No, and an earlier detail answer without it),
// a detail answer together with No, and an itemized subfloor repair allowance
// beside an unknown construction. Run once; the output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261110c.mjs
import {writeFileSync} from 'node:fs';
import {flooring} from '../engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from '../../test/quoteEngineVNextFixtures.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
let n=0;const id=()=>'5c83d1e7-9a24-4b60-8f17-3e6a0b2c9'+String(100+(n++)).padStart(3,'0');
const ALL={wood:true,resilient_sheet:true,resilient_tile_plank:true,laminate:true,ceramic_stone_tile:true,concrete:true};
const job=(name,pricing,answers,type='FLOORING_INSTALL')=>{const f=flooring('laminate');f.serviceType=type;f.ownerPricing.serviceType=type;if(f.ownerPricing.origin)f.ownerPricing.origin={...f.ownerPricing.origin,serviceType:type};
 Object.assign(f.ownerPricing.pricing,{scopeDetails:{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}},laminateInstallInstructions:'[SYNTHETIC] Laminate X, instructions rev. 2025',laminateFloatsOver:{...ALL},...pricing});
 if(name!=='none'){f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[name]:id()};f.ownerPricing.pricing.removalPerSqft={...(f.ownerPricing.pricing.removalPerSqft||{}),[name]:100};}
 f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:name,removalNeeded:false,underlaymentScopeConfirmed:true,...(type==='FLOORING_REPLACEMENT'?{subfloorIssues:false}:{}),...answers});
 if(name!=='none')f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:name,offeringId:f.ownerPricing.knownOfferings.existingFloorType[name]}};
 return f;};
const both={laminateFloatConditions:{no_sleeper_construction:true,wood_not_directly_over_concrete:true}};
const stay={removalNeeded:false,existingFloorSound:'yes'},remove={removalNeeded:true,removalAreaSqft:200};
add('v26:tile-kept-knowledge-unanswered',job('ceramic_tile',both,stay));
add('v26:tile-kept-dont-know',job('ceramic_tile',both,{...stay,floorConstructionKnown:'no'}));
add('v26:oak-removed-dont-know',job('oak',both,{...remove,floorConstructionKnown:'no'}));
add('v26:no-floor-dont-know',job('none',both,{removalNeeded:false,floorConstructionKnown:'no'}));
add('v26:tile-removed-knows-sleepers',job('ceramic_tile',both,{...remove,floorConstructionKnown:'yes',floorSupportConstruction:'sleepers'}));
add('v26:tile-removed-knows-unanswered',job('ceramic_tile',both,{...remove,floorConstructionKnown:'yes'}));
add('v26:earlier-draft-sleepers-without-knowledge',job('oak',both,{...remove,woodFloorAssembly:'sleepers'}));
add('v26:dont-know-with-detail-answer',job('ceramic_tile',both,{...stay,floorConstructionKnown:'no',floorSupportConstruction:'sleepers'}));
add('v26:replacement-allowance-dont-know',job('ceramic_tile',{...both,subfloorAllowancePerSqft:400},{...remove,floorConstructionKnown:'no',subfloorIssues:true,subfloorRepairAreaSqft:20},'FLOORING_REPLACEMENT'));
writeFileSync(new URL('./corpus-additions-20261110c.json',import.meta.url),JSON.stringify(rows));
console.log(rows.length+' inputs');
