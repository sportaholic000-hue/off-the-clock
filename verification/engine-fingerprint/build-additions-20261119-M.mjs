// One-time build of corpus-additions-20261119-M.json (fixes made while merging
// the five November 19 lanes): inputs no frozen input exercised for the retired
// permit-required answer (ignored), insulation and cover board waste needed
// only for itemized insulation or cover board material, a 0% service tax rate
// in a ZIP tax zone, outside the zones and in another province, trim coats with
// trim left out, openings that leave no wall area, and a room measurement that
// does not work out. Each input is built from a fixture an existing test already
// checks. Results are recorded as the engine computes them; the ones worked by
// hand are in test/qeMergeV37_20261119.spec.mjs. Run once; the output file is
// never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261119-M.mjs [out.json]
import {writeFileSync} from 'node:fs';
import {fixture,mowing} from '../engine-independent/fixtures.mjs';

const rows=[];const add=(id,input)=>rows.push({id:'merge-20261119:'+id,input:structuredClone(input)});

// --- The retired permit-required answer is ignored.
for(const answer of [true,false]){const f=mowing();f.customerInputs.permitRequired=answer;add('mow-permit-required-'+answer,f);}

// --- Insulation and cover board waste only for itemized insulation or cover board material.
const FLAT_ON_SITE={flatRoofEdgeMetalPerLF:'priced_on_site',flatRoofWallFlashingPerLF:'priced_on_site',flatRoofPenetrationEach:'priced_on_site',flatRoofCurbEach:'priced_on_site',flatRoofDrainEach:'priced_on_site'};
const flat=(pricing={},inputs={})=>fixture('FLAT_ROOF_REPLACEMENT',{laborPerSqft:{epdm:500},membraneCostPerSqft:{epdm:700},tearOffPerSqft:{epdm:200},insulationPerSqft:250,minimumJob:0,flatRoofItemBasis:{...FLAT_ON_SITE},...pricing},
  {roofSqft:1000,sqftMethod:'exact',membraneType:'epdm',replacementMembraneType:'epdm',existingLayers:1,accessDifficulty:'easy',serviceScope:'full',buildingType:'residential',...inputs});
const insulated=mode=>flat({scopeDetails:{insulation:{description:'[SYNTHETIC] Explicitly defined insulation',mode,...(mode==='installed'?{category:'material'}:{}),insulationSystem:'[SYNTHETIC] Defined insulation thickness',coverboardSystem:'[SYNTHETIC] Defined coverboard thickness',baseRoofLaborExcludesInstallation:true}},
  scopeRates:mode==='itemized'?{insulation_labor:50,insulation_material:150,coverboard_labor:25,coverboard_material:75}:{insulation_installed:200,coverboard_installed:100}},
  {buildingType:'commercial',insulationNeeded:true,coverboardNeeded:true,insulationAreaSqft:800,coverboardAreaSqft:600,insulationScopeConfirmed:true});
const withoutWaste=f=>{delete f.ownerPricing.pricing.insulationWasteFactor;return f;};
add('flat-no-insulation-no-waste-setting',withoutWaste(flat()));
add('flat-installed-insulation-no-waste-setting',withoutWaste(insulated('installed')));
add('flat-itemized-insulation-no-waste-setting',withoutWaste(insulated('itemized')));
add('flat-itemized-insulation-waste-7',insulated('itemized'));

// --- A 0% service tax rate means no tax on that service wherever the job is.
const taxed=(defaults,serviceRate,postalCode)=>{const f=mowing();Object.assign(f.businessDefaults,defaults);if(serviceRate!==undefined)f.ownerPricing.taxPercent=serviceRate;if(postalCode!==undefined)f.customerInputs.postalCode=postalCode;return f;};
const US_ZONES={taxMode:'TAX_ALL',taxPercent:8,businessCountry:'US',currency:'USD',taxByJobLocation:true,taxZones:[{name:'[SYNTHETIC] Nassau',codes:['11550'],percent:10}]};
const ON={taxMode:'TAX_ALL',taxPercent:13,businessCountry:'CA',businessProvince:'ON',currency:'CAD'};
for(const [id,rate] of [['blank',undefined],['0',0],['4',4]])add('us-zone-service-rate-'+id,taxed(US_ZONES,rate,'11550'));
for(const [id,rate] of [['blank',undefined],['0',0]])add('us-outside-zones-service-rate-'+id,taxed(US_ZONES,rate,'10001'));
for(const [id,rate] of [['blank',undefined],['0',0]])add('on-alberta-job-service-rate-'+id,taxed(ON,rate,'T5J 0N3'));
for(const [id,rate] of [['blank',undefined],['0',0]])add('on-location-bc-no-rate-service-rate-'+id,taxed({...ON,taxByJobLocation:true},rate,'V6B 1A1'));
{const f=taxed({...US_ZONES,taxMode:'TAX_MATERIALS'},0,'11550');add('us-zone-materials-service-rate-0',f);}

// --- Interior painting: trim coats with trim left out, openings, rooms.
const basic=(customer={})=>{const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0,trimLaborPerLF:150,trimMaterialPerLF:10},
  {areaInputMethod:'wall_sqft',wallAreaSqft:800,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false,...customer});
  f.ownerPricing.priceBasisByCategory.material='sell_price';return f;};
const rooms=(f,list)=>{const c=f.customerInputs;for(const k of ['wallAreaSqft','wallScopeUniform'])delete c[k];Object.assign(c,{areaInputMethod:'room_dimensions',rooms:list});return f;};
add('painting-trim-excluded-trim-coats-2',basic({trimCoats:2}));
add('painting-trim-included-trim-coats-2',basic({trimIncluded:true,trimLengthLF:200,trimCoats:2}));
add('painting-openings-exceed-wall-area',basic({wallAreaSqft:100,doorCount:10}));
add('painting-openings-within-wall-area',basic({doorCount:2,windowCount:2}));
add('painting-room-openings-exceed-room',rooms(basic(),[{lengthFeet:2,widthFeet:2,heightFeet:8,doorCount:3,windowCount:3}]));
add('painting-room-without-height',rooms(basic(),[{lengthFeet:12,widthFeet:14,doorCount:1,windowCount:2}]));
add('painting-room-valid',rooms(basic(),[{lengthFeet:12,widthFeet:14,heightFeet:8,doorCount:1,windowCount:2}]));

const out=process.argv[2]?new URL(process.argv[2],'file://'+process.cwd()+'/'):new URL('./corpus-additions-20261119-M.json',import.meta.url);
writeFileSync(out,JSON.stringify(rows,null,1)+'\n');
console.log(rows.length+' inputs written');
