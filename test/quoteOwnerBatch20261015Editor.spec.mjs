import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fixture,flooring,concrete} from '../verification/engine-independent/fixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import * as editing from '../client/src/pricebookEditing.js';
import {interviewDefinition} from '../client/src/interviewStructuredValue.js';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';

let offeringModule;
async function offeringExports() {
  if(offeringModule)return offeringModule;
  const output=await build({
    bundle:true,write:false,platform:'node',format:'esm',
    stdin:{contents:"export {offeringTierFields} from './client/src/offeringEditor.jsx';",resolveDir:process.cwd(),loader:'js'}
  });
  offeringModule=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
  return offeringModule;
}

test('QE-011/QE-012: tier metadata is unique, exact, tier-effective, and never substitutes an unrelated editor',async()=>{
  const {offeringTierFields}=await offeringExports();
  const input=structuredClone(measuredScopeCases().find(item=>item.id==='stairs-installed').input);
  const service=input.ownerPricing;
  const p=service.pricing;
  p.installedLaborPercent={'scopeRates.stairs_installed':70};
  p.installedMaterialsPercent={'scopeRates.stairs_installed':30};
  const meta=bridge.applicationMetadata().services.find(item=>item.serviceType===service.serviceType);
  const definitions=offeringTierFields(meta,service,{
    scopeDetails:{stairs:{...p.scopeDetails.stairs,description:'[SYNTHETIC] Tier-complete stairs'}},
    scopeRates:{stairs_installed:17500}
  });
  for(const field of ['installedLaborPercent','installedMaterialsPercent','scopeRates','scopeDetails']) {
    assert.equal(definitions.filter(item=>item.field===field).length,1,field+' must have exactly one definition');
  }
  const labor=definitions.find(item=>item.field==='installedLaborPercent');
  const materials=definitions.find(item=>item.field==='installedMaterialsPercent');
  assert.deepEqual(labor.tree.leafKeys,['scopeRates.stairs_installed']);
  assert.deepEqual(materials.tree.leafKeys,['scopeRates.stairs_installed']);
  assert.equal(definitions.find(item=>item.field==='scopeDetails').type,'preserved_configuration');
  assert.match(definitions.find(item=>item.field==='scopeDetails').help,/retained|structured|scope/i);
  assert.deepEqual(definitions.find(item=>item.field==='scopeRates').tree.leafKeys,['stairs_installed']);
});

test('QE-011: a tier-only installed scope exposes its exact allocation path instead of stale base paths',async()=>{
  const {offeringTierFields}=await offeringExports();
  const service=flooring('tile').ownerPricing;
  const meta=bridge.applicationMetadata().services.find(item=>item.serviceType===service.serviceType);
  const tier={
    scopeDetails:{stairs:{description:'[SYNTHETIC] Tier stairs',mode:'installed',category:'labor',flooringType:'tile',maximumWidthLF:4,underlaymentIncluded:true,removalIncluded:false,disposalIncluded:false}},
    scopeRates:{stairs_installed:12500}
  };
  const fields=offeringTierFields(meta,service,tier);
  assert.deepEqual(fields.find(item=>item.field==='installedLaborPercent').tree.leafKeys,['scopeRates.stairs_installed']);
  assert.deepEqual(fields.find(item=>item.field==='installedMaterialsPercent').tree.leafKeys,['scopeRates.stairs_installed']);
});

test('QE-013: removing base stairs cleans dependent tier fragments but preserves a complete tier offering and unrelated values',()=>{
  assert.equal(typeof editing.removeScopeConfiguration,'function');
  const base=structuredClone(measuredScopeCases().find(item=>item.id==='stairs-installed').input.ownerPricing);
  const complete=structuredClone(base.pricing.scopeDetails.stairs);
  base.pricing.scopeDetails.floor_underlayment_tile={description:'[SYNTHETIC] Unrelated underlayment',mode:'installed_area_sell_price'};
  base.pricing.scopeRates.floor_underlayment_tile=125;
  base.pricing.installedLaborPercent={
    'scopeRates.stairs_installed':70,
    'scopeRates.floor_underlayment_tile':10
  };
  base.pricing.installedMaterialsPercent={
    'scopeRates.stairs_installed':30,
    'scopeRates.floor_underlayment_tile':90
  };
  base.tiers=[
    {name:'Dependent',overrides:{
      scopeDetails:{stairs:{description:'[SYNTHETIC] Only overrides the inherited description'}},
      scopeRates:{stairs_installed:16000},
      installedLaborPercent:{'scopeRates.stairs_installed':60},
      installedMaterialsPercent:{'scopeRates.stairs_installed':40},
      minimumJob:500
    }},
    {name:'Independent',overrides:{
      scopeDetails:{stairs:{...complete,description:'[SYNTHETIC] Complete tier stairs'}},
      scopeRates:{stairs_installed:17500},
      installedLaborPercent:{'scopeRates.stairs_installed':65},
      installedMaterialsPercent:{'scopeRates.stairs_installed':35},
      minimumJob:750
    }}
  ];
  const updated=editing.removeScopeConfiguration(base,'stairs');
  const p=editing.servicePricing(updated);
  assert.equal(p.scopeDetails.stairs,undefined);
  assert.equal(p.scopeRates.stairs_installed,undefined);
  assert.equal(p.installedLaborPercent['scopeRates.stairs_installed'],undefined);
  assert.equal(p.installedMaterialsPercent['scopeRates.stairs_installed'],undefined);
  assert.equal(p.scopeRates.floor_underlayment_tile,125);
  assert.equal(p.installedLaborPercent['scopeRates.floor_underlayment_tile'],10);
  assert.equal(p.installedMaterialsPercent['scopeRates.floor_underlayment_tile'],90);

  const dependent=updated.tiers.find(tier=>tier.name==='Dependent').overrides;
  assert.equal(dependent.scopeDetails?.stairs,undefined);
  assert.equal(dependent.scopeRates?.stairs_installed,undefined);
  assert.equal(dependent.installedLaborPercent?.['scopeRates.stairs_installed'],undefined);
  assert.equal(dependent.installedMaterialsPercent?.['scopeRates.stairs_installed'],undefined);
  assert.equal(dependent.minimumJob,500);

  const independent=updated.tiers.find(tier=>tier.name==='Independent').overrides;
  assert.equal(independent.scopeDetails.stairs.description,'[SYNTHETIC] Complete tier stairs');
  assert.equal(independent.scopeRates.stairs_installed,17500);
  assert.equal(independent.installedLaborPercent['scopeRates.stairs_installed'],65);
  assert.equal(independent.installedMaterialsPercent['scopeRates.stairs_installed'],35);
  assert.equal(independent.minimumJob,750);
});

test('QE-013: retained complete tier stairs remain customer-quotable after base removal',()=>{
  assert.equal(typeof editing.removeScopeConfiguration,'function');
  const input=structuredClone(measuredScopeCases().find(item=>item.id==='stairs-installed').input);
  input.ownerPricing.tiers=[{name:'Premium',overrides:{
    scopeDetails:{stairs:structuredClone(input.ownerPricing.pricing.scopeDetails.stairs)},
    scopeRates:{stairs_installed:17500}
  }}];
  input.ownerPricing=editing.removeScopeConfiguration(input.ownerPricing,'stairs');
  const quote=generateQuoteVNext(input);
  assert.equal(quote.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(quote));
  assert.deepEqual(quote.options.map(option=>option.tierName),['Premium']);
  // Base flooring 178,000 + five steps * 17,500 = 265,500 cents.
  assert.equal(quote.options[0].calculationRecord.scenarios.mid.finalTotalCents,265500);
});

test('QE-018: metadata matches percent-entry controls while true fraction fields remain fractions',()=>{
  const metadata=bridge.applicationMetadata().services;
  const field=(type,name)=>metadata.find(item=>item.serviceType===type).class2Fields.find(item=>item.field===name);
  for(const [type,name,entered,saved] of [
    ['CONCRETE_DRIVEWAY','concreteWasteFactor',10,'0.10'],
    ['LANDSCAPING_SOD','sodWasteFactor',5,'0.05'],
    ['ROOFING_REPLACEMENT','accessoryWasteFactor',10,'0.10'],
    ['INTERIOR_PAINTING','paintWasteFactor',10,'0.10']
  ]) {
    const definition=field(type,name);
    assert.equal(definition.ownerInputUnit,'percent',type+' '+name);
    assert.equal(definition.unit,'decimal fraction');
    assert.match(definition.help,new RegExp('Enter '+entered+'(?:\\.0+)? for '+entered+'%','i'));
    assert.match(definition.help,new RegExp('saved.*'+saved.replace('.','\\.'),'i'));
  }
  for(const [type,name] of [
    ['ROOFING_REPLACEMENT','wasteFactorByComplexity'],
    ['FLOORING_INSTALL','wasteFactorByType'],
    ['FLOORING_INSTALL','patternWasteAdder'],
    ['SIDING_REPLACEMENT','wasteFactorByType']
  ]) {
    const definition=field(type,name);
    assert.equal(definition.ownerInputUnit,'fraction',type+' '+name);
    assert.match(definition.unit,/fraction|decimal/i);
    assert.doesNotMatch(definition.help||'',/Enter 10 for 10%/i);
  }
});

test('QE-018: a stored 0.10 concrete waste factor preserves independently calculated quantity and price',()=>{
  const input=concrete();
  input.ownerPricing.pricing.concreteWasteFactor=0.10;
  // 200 sqft * 4in / 324 = 2.4691358 yd3; *1.10 = 2.7160494 yd3.
  // Ready mix round(2.7160494 * 18,000)=48,889 cents. Total remains
  // labor120,000 + concrete48,889 + formwork150,000 + prep35,000 =353,889.
  const quote=generateQuoteVNext(input);
  assert.equal(quote.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(quote));
  assert.equal(quote.options[0].calculationRecord.scenarios.mid.finalTotalCents,353889);
});

test('QE-019: roof material metadata supplies complete copy for both accessory modes',()=>{
  const definition=bridge.applicationMetadata().services.find(item=>item.serviceType==='ROOFING_REPLACEMENT').fields.find(item=>item.field==='materialCostPerSquare');
  assert.equal(definition.copyByAccessoryPricingMode.per_square_allin.label,'Your all-in installed material price per square, INCLUDING starter, drip edge, ridge cap, flashing, and vents.');
  assert.match(definition.copyByAccessoryPricingMode.itemized.title,/base roofing material/i);
  assert.match(definition.copyByAccessoryPricingMode.itemized.label,/EXCLUD(?:E|ING).*starter.*drip edge.*ridge cap/i);
  assert.match(definition.copyByAccessoryPricingMode.itemized.label,/flashing.*vents/i);
  assert.doesNotMatch(definition.copyByAccessoryPricingMode.itemized.label,/INCLUDING starter/i);
  assert.match(interviewDefinition(definition,{accessoryPricingMode:'per_square_allin'}).label,/INCLUDING starter/i);
  assert.match(interviewDefinition(definition,{accessoryPricingMode:'itemized'}).label,/EXCLUD(?:E|ING).*starter/i);
});
