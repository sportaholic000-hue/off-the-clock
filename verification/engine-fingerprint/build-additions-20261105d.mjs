// One-time build of corpus-additions-20261105d.json: inputs for Astra's S08
// corrections (product conditions, conditional partial estimates, material-only
// names). Run once; the output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261105d.mjs
import {writeFileSync} from 'node:fs';
import {flooring} from '../engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from '../../test/quoteEngineVNextFixtures.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
const L={laminateInstallInstructions:'[SYNTHETIC] Laminate X, instructions rev. 2025'};
const over=(name,id,pricing,answers={})=>{const f=flooring('laminate');
 Object.assign(f.ownerPricing.pricing,{scopeDetails:{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}},...pricing});
 if(!f.ownerPricing.knownOfferings.existingFloorType[name])f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[name]:id};
 f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:name,removalNeeded:false,existingFloorSound:'yes',underlaymentScopeConfirmed:true,...answers});
 f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:name,offeringId:f.ownerPricing.knownOfferings.existingFloorType[name]}};
 return f;};
const sheet={...L,laminateFloatsOver:{resilient_sheet:true},laminateFloatConditions:{sheet_vinyl_single_layer:true}};
add('s08-20261105:sheet-vinyl-two-layers',over('sheet_vinyl','8c4a1f36-5d79-4ea1-b2f4-9a3d7e1b5c81',sheet,{existingFloorLayers:'two_or_more'}));
add('s08-20261105:sheet-vinyl-layers-not-sure',over('sheet_vinyl','8c4a1f36-5d79-4ea1-b2f4-9a3d7e1b5c82',sheet,{existingFloorLayers:'not_sure'}));
add('s08-20261105:tile-blank-product-rules',over('tile','8c4a1f36-5d79-4ea1-b2f4-9a3d7e1b5c83',{}));
add('s08-20261105:engineered-hardwood-attached',over('engineered_hardwood','8c4a1f36-5d79-4ea1-b2f4-9a3d7e1b5c84',{...L,laminateFloatsOver:{wood:true}}));
writeFileSync(new URL('./corpus-additions-20261105d.json',import.meta.url),JSON.stringify(rows));
console.log(rows.length+' inputs');
