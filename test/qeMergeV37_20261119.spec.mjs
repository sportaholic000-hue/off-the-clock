// Fixes made while merging the five November 19 lanes (engine v37). Expected
// values are worked by hand in the comments before the run.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,mowing} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,customerContractForVNext} from '../server/quote-engine-vnext/index.js';
import {offeringContract} from '../server/quote-engine-vnext/configuredOfferings.js';
import {quotedTaxRateAt} from '../server/taxJurisdiction.js';
import {withoutDeselectedDependents} from '../server/scopeConfiguration.js';
import {readFile} from 'node:fs/promises';
import {ENGINE_VERSION} from '../server/quote-engine-vnext/engine.js';
import {EXPECTED_QUOTE_ENGINE_VERSION} from '../server/src/runtimeConfig.js';
import {engineFingerprint,corpusInputs} from '../verification/engine-fingerprint/fingerprint.mjs';

const mid=q=>q.options[0].calculationRecord.scenarios.mid;
const ready=(q,cents,tax)=>{assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);assert.equal(mid(q).finalTotalCents,cents);if(tax!==undefined)assert.equal(mid(q).tax.taxCents,tax);return q;};
const amount=(q,name)=>mid(q).lineItems.find(l=>l.name===name)?.amountCents;

test('v37 version literals agree and the fingerprint is recorded',async()=>{
  assert.equal(ENGINE_VERSION,'quote-engine-vnext-accuracy-20261119-v37');assert.equal(EXPECTED_QUOTE_ENGINE_VERSION,ENGINE_VERSION);
  // 938 earlier inputs + the six November 19 files (37 + 33 + 44 + 53 + 44 + 23) = 1,172.
  assert.equal(corpusInputs().length,1172);
  const history=JSON.parse(await readFile(new URL('../verification/engine-fingerprint/history.json',import.meta.url),'utf8'));
  assert.equal(history[ENGINE_VERSION],engineFingerprint());
});

// ---------------------------------------------------------------- insulation and cover board waste
const FLAT_ON_SITE={flatRoofEdgeMetalPerLF:'priced_on_site',flatRoofWallFlashingPerLF:'priced_on_site',flatRoofPenetrationEach:'priced_on_site',flatRoofCurbEach:'priced_on_site',flatRoofDrainEach:'priced_on_site'};
const flat=(pricing={},inputs={})=>fixture('FLAT_ROOF_REPLACEMENT',{laborPerSqft:{epdm:500},membraneCostPerSqft:{epdm:700},tearOffPerSqft:{epdm:200},insulationPerSqft:250,minimumJob:0,flatRoofItemBasis:{...FLAT_ON_SITE},...pricing},
  {roofSqft:1000,sqftMethod:'exact',membraneType:'epdm',replacementMembraneType:'epdm',existingLayers:1,accessDifficulty:'easy',serviceScope:'full',buildingType:'residential',...inputs});
const insulated=mode=>flat({scopeDetails:{insulation:{description:'[SYNTHETIC] Explicitly defined insulation',mode,...(mode==='installed'?{category:'material'}:{}),insulationSystem:'[SYNTHETIC] Defined insulation thickness',coverboardSystem:'[SYNTHETIC] Defined coverboard thickness',baseRoofLaborExcludesInstallation:true}},
  scopeRates:mode==='itemized'?{insulation_labor:50,insulation_material:150,coverboard_labor:25,coverboard_material:75}:{insulation_installed:200,coverboard_installed:100}},
  {buildingType:'commercial',insulationNeeded:true,coverboardNeeded:true,insulationAreaSqft:800,coverboardAreaSqft:600,insulationScopeConfirmed:true});
const withoutWaste=f=>{delete f.ownerPricing.pricing.insulationWasteFactor;return f;};

test('insulation and cover board waste is needed only where itemized insulation or cover board material is priced',()=>{
  // No insulation: labor 1,000 x 5.00 = 5,000; membrane 1,000 x 1.10 x 7.00 = 7,700;
  // tear-off 1,000 x 2.00 = 2,000; total 14,700, with or without the waste setting.
  ready(generateQuoteVNext(withoutWaste(flat())),1470000);
  ready(generateQuoteVNext(flat()),1470000);
  // Installed insulation 800 x 2.00 = 1,600 and cover board 600 x 1.00 = 600: 14,700 + 2,200 = 16,900.
  ready(generateQuoteVNext(withoutWaste(insulated('installed'))),1690000);
  // Itemized insulation needs the setting: without it the owner is asked for it.
  const q=generateQuoteVNext(withoutWaste(insulated('itemized')));
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(q.missingOwnerFields.includes('insulationWasteFactor'));
  // With it (7%): insulation 800 x 1.07 x 1.50 = 1,284; cover board 600 x 1.07 x 0.75 = 481.50.
  const r=ready(generateQuoteVNext(insulated('itemized')),1701550);
  assert.equal(amount(r,'Insulation material'),128400);assert.equal(amount(r,'Coverboard material'),48150);
});

// ---------------------------------------------------------------- a 0% service tax rate
// The mowing fixture prices 5,000 sq ft at 0.02 = 100.00.
const taxed=(defaults,serviceRate,postalCode)=>{const f=mowing();Object.assign(f.businessDefaults,defaults);if(serviceRate!==undefined)f.ownerPricing.taxPercent=serviceRate;if(postalCode!==undefined)f.customerInputs.postalCode=postalCode;return f;};
const US_ZONES={taxMode:'TAX_ALL',taxPercent:8,businessCountry:'US',currency:'USD',taxByJobLocation:true,taxZones:[{name:'[SYNTHETIC] Nassau',codes:['11550'],percent:10}]};
const ON={taxMode:'TAX_ALL',taxPercent:13,businessCountry:'CA',businessProvince:'ON',currency:'CAD'};

test('a 0% service rate means no tax on that service wherever the job is',()=>{
  // In a ZIP tax zone at 10%: 100.00 + 10.00 = 110.00 on the zone rate; 100.00 at 0%.
  ready(generateQuoteVNext(taxed(US_ZONES,undefined,'11550')),11000,1000);
  ready(generateQuoteVNext(taxed(US_ZONES,0,'11550')),10000,0);
  // A service rate other than 0 still leaves the zone's rate in place: 110.00.
  ready(generateQuoteVNext(taxed(US_ZONES,4,'11550')),11000,1000);
  // Outside the zones the business confirms the tax; at 0% there is none to confirm.
  assert.equal(generateQuoteVNext(taxed(US_ZONES,undefined,'10001')).resultType,'ESTIMATE_REQUIRES_REVIEW');
  ready(generateQuoteVNext(taxed(US_ZONES,0,'10001')),10000,0);
  // Ontario business, tax not by job location, an Alberta job: GST 5% = 105.00; 100.00 at 0%.
  ready(generateQuoteVNext(taxed(ON,undefined,'T5J 0N3')),10500,500);
  ready(generateQuoteVNext(taxed(ON,0,'T5J 0N3')),10000,0);
  // Tax by job location with no British Columbia rate saved: the rate is needed, except at 0%.
  assert.equal(generateQuoteVNext(taxed({...ON,taxByJobLocation:true},undefined,'V6B 1A1')).resultType,'ESTIMATE_REQUIRES_REVIEW');
  ready(generateQuoteVNext(taxed({...ON,taxByJobLocation:true},0,'V6B 1A1')),10000,0);
  // The booking check works the rate out the same way.
  assert.deepEqual(quotedTaxRateAt('11550',US_ZONES,0),{status:'ok',percent:0});
  assert.deepEqual(quotedTaxRateAt('10001',US_ZONES,0),{status:'ok',percent:0});
  assert.deepEqual(quotedTaxRateAt('11550',US_ZONES,4),{status:'ok',percent:10});
  assert.deepEqual(quotedTaxRateAt('T5J 0N3',ON,0),{status:'ok',percent:0});
  assert.deepEqual(quotedTaxRateAt('V6B 1A1',{...ON,taxByJobLocation:true},0),{status:'ok',percent:0});
});

// ---------------------------------------------------------------- interior painting answers
const basic=(customer={})=>{const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0,trimLaborPerLF:150,trimMaterialPerLF:10},
  {areaInputMethod:'wall_sqft',wallAreaSqft:800,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false,...customer});
  f.ownerPricing.priceBasisByCategory.material='sell_price';return f;};
const rooms=(f,list)=>{const c=f.customerInputs;for(const k of ['wallAreaSqft','wallScopeUniform'])delete c[k];Object.assign(c,{areaInputMethod:'room_dimensions',rooms:list});return f;};

test('trim coats are refused with trim left out, and the form drops them like ceiling coats',()=>{
  // Walls only: labor 800 x 2 x 1.00 = 1,600; paint 800 x 2 x 1.10 x 0.30 = 528; total 2,128.
  ready(generateQuoteVNext(basic()),212800);
  const q=generateQuoteVNext(basic({trimCoats:2}));
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(q.invalidCustomerFields,['trimCoats']);
  assert.deepEqual(withoutDeselectedDependents([{name:'trimIncluded'}],{trimIncluded:false,trimCoats:2,coats:2}),{trimIncluded:false,coats:2});
  assert.deepEqual(withoutDeselectedDependents([{name:'trimIncluded'}],{trimIncluded:true,trimCoats:2}),{trimIncluded:true,trimCoats:2});
});

test('openings that leave no wall area are the customer answer, not an owner price',()=>{
  // 10 doors x 20 sq ft = 200 sq ft of openings on a 100 sq ft wall.
  const q=generateQuoteVNext(basic({wallAreaSqft:100,doorCount:10}));
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(q.invalidCustomerFields,['wallAreaSqft']);assert.deepEqual(q.invalidOwnerFields??[],[]);
  // Neighbour: 2 doors and 2 windows = 70 sq ft on 800. Labor stays on 800: 1,600;
  // paint 730 x 2 x 1.10 x 0.30 = 481.80; total 2,081.80.
  ready(generateQuoteVNext(basic({doorCount:2,windowCount:2})),208180);
});

test('a room measurement that does not work out names the room, not an unsupported route',()=>{
  const q=generateQuoteVNext(rooms(basic(),[{lengthFeet:2,widthFeet:2,heightFeet:8,doorCount:3,windowCount:3}]));
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(q.reviewReason,'Project details were invalid or internally inconsistent.');
  assert.deepEqual(q.invalidCustomerFields,['rooms']);
  // Neighbour: a 12 x 14 x 8 room with 1 door and 2 windows: gross 416, paint 366.
  // Labor 416 x 2 x 1.00 = 832; paint 366 x 2 x 1.10 x 0.30 = 241.56; total 1,073.56.
  ready(generateQuoteVNext(rooms(basic(),[{lengthFeet:12,widthFeet:14,heightFeet:8,doorCount:1,windowCount:2}])),107356);
});

test('the wall area question asks for the measured wall area',()=>{
  assert.equal(customerContractForVNext('INTERIOR_PAINTING',{},{}).fields.wallAreaSqft.label,'Measured wall area');
  assert.equal(customerContractForVNext('EXTERIOR_PAINTING',{},{}).fields.exteriorAreaSqft.label,'Measured wall area');
  for(const type of ['INTERIOR_PAINTING','EXTERIOR_PAINTING'])for(const mode of ['installed','itemized']){
    const fields=offeringContract(type,{offeringMode:mode}).fields;
    assert.equal(fields[type==='INTERIOR_PAINTING'?'wallAreaSqft':'exteriorAreaSqft'].label,'Measured wall area',type+' '+mode);
    assert.equal(Object.values(fields).some(f=>/paintable/i.test(f.label||'')),false,type+' '+mode);
  }
});
