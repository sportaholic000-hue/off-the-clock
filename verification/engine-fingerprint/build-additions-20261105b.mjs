// One-time build of corpus-additions-20261105b.json: inputs for the November 5,
// 2026 reconciliation (floating floors over owner-classified substrates). Run
// once; the output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261105b.mjs
import {writeFileSync} from 'node:fs';
import {flooring} from '../engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from '../../test/quoteEngineVNextFixtures.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
const over=(name,id,pricing)=>{const f=flooring('laminate');
 Object.assign(f.ownerPricing.pricing,{scopeDetails:{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}},...pricing});
 f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[name]:id};
 f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:name,removalNeeded:false,existingFloorSound:'yes',underlaymentScopeConfirmed:true});
 f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:name,offeringId:id}};
 return f;};
add('reconcile-20261105:laminate-over-classified-pine',over('pine','6a2e9d14-3b57-4c8f-a0d2-7e1b5c9f3a61',{existingFloorSubstrate:{pine:'wood'}}));
add('reconcile-20261105:laminate-not-permitted-over-tile',over('tile','6a2e9d14-3b57-4c8f-a0d2-7e1b5c9f3a62',{laminateFloatsOver:{wood:true,resilient_sheet:true,ceramic_stone_tile:false,concrete:true}}));
writeFileSync(new URL('./corpus-additions-20261105b.json',import.meta.url),JSON.stringify(rows));
console.log(rows.length+' inputs');
