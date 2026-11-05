// One-time build of corpus-additions-20261105.json: inputs for the November 5,
// 2026 fixes (demolition larger than twice the new slab, a wall that is all
// doors and windows, a floating floor over a sound slate floor). Run once; the
// output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261105.mjs
import {writeFileSync} from 'node:fs';
import {fixture,flooring} from '../engine-independent/fixtures.mjs';
import {measuredScopeCases} from '../../test/measuredScopeFixtures.mjs';
import {confirmedFixtureInputs} from '../../test/quoteEngineVNextFixtures.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
{const f=structuredClone(measuredScopeCases().find(x=>x.id==='demolition-installed').input);f.customerInputs.demolitionAreaSqft=401;add('audit-20261105:demolition-over-twice-slab',f);}
{const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0},{areaInputMethod:'room_dimensions',rooms:[{lengthFeet:2.5,widthFeet:1,heightFeet:5,doorCount:1,windowCount:1}],wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false});f.ownerPricing.priceBasisByCategory.material='sell_price';add('audit-20261105:wall-all-openings',f);}
{const f=flooring('laminate'),id='5d1f0c6e-2a43-4b8e-9c71-3e6f8a2b9d40';
 f.ownerPricing.pricing.scopeDetails={floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}};
 f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,slate:id};
 f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:'slate',removalNeeded:false,existingFloorSound:'yes',underlaymentScopeConfirmed:true});
 f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:'slate',offeringId:id}};
 add('audit-20261105:laminate-over-sound-slate',f);}
writeFileSync(new URL('./corpus-additions-20261105.json',import.meta.url),JSON.stringify(rows));
console.log(rows.length+' inputs');
