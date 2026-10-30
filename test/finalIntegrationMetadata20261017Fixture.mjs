import assert from 'node:assert/strict';
import {ENGINE_VERSION} from '../server/quote-engine-vnext/engine.js';
import {CONCRETE_OWNER_DECISIONS} from './ownerDecisionsFixture.mjs';
import {PACKAGE_PURCHASE_TYPES} from '../server/quote-engine-vnext/packagePurchasing.js';
import {REMOVAL_AGE_TYPES} from '../server/quote-engine-vnext/buildingAgeRules.js';

// Nonbehavioral expectation reconciliation against exact base 56e19419.
// The original everytrade fixture is retained. Never alter prices, quantities,
// customer copy, eligibility, or input scope here: only the private evidence
// representation already approved on the painting/flooring branches differs.
export function integratedBaselineExpectation(row) {
  const result=structuredClone(row.result),type=row.input.serviceType;
  // The frozen v7 evidence stays intact. Only these known live-result metadata
  // paths advance; every price, scope and other assertion still compares fully.
  assert.equal(ENGINE_VERSION,'quote-engine-vnext-accuracy-20261029-v14');
  const advanceVersion=record=>{
    assert.equal(record.engineVersion,'quote-engine-vnext-date-context-20261006-v7');
    record.engineVersion=ENGINE_VERSION;
  };
  advanceVersion(result);
  if(result.calculationRecord)advanceVersion(result.calculationRecord);
  if(!result.options)return result;
  for(const option of result.options)advanceVersion(option.calculationRecord);
  for(const record of result.calculationRecord.options)advanceVersion(record);
  const records=[...result.options.map(o=>o.calculationRecord),...result.calculationRecord.options];
  if(type.startsWith('FLOORING_'))for(const record of records){
    assert.equal(row.input.customerInputs.layoutPattern,'straight');
    const at=record.quantityDerivations.findIndex(d=>d.name==='averageRoomSqft');
    assert.ok(at>=0);
    record.quantityDerivations.splice(at,0,{evidenceVariant:'derived_quantity',name:'flooringPatternLaborAdjustment',formula:'selected owner pattern labor adjustment',inputs:{factorPath:'layoutLaborMultiplier.straight'},result:1,exactResult:{numerator:'1',denominator:'1'},unit:'multiplier',usedBy:['Flooring labor']});
  }
  if(type==='INTERIOR_PAINTING'||type==='EXTERIOR_PAINTING'){
    const mode=row.input.ownerPricing.pricing.offeringMode;
    const lines=[...result.lineItems,...result.options.flatMap(o=>o.lineItems),...records.flatMap(r=>[...r.lineItems,...Object.values(r.scenarios).flatMap(s=>s.lineItems)])];
    if(mode==='installed'&&type==='INTERIOR_PAINTING')for(const line of lines)if(['offeringRates.installedWallPerSqft','offeringRates.installedCeilingPerSqft'].includes(line.calculation.ratePath))line.surfaceHeightBand='standard';
    if(mode==='itemized'){
      for(const line of lines)for(const factor of line.calculation.multipliers||[])if(/^offeringRates\.(wallLabor|primerLabor|ceilingLabor|ceilingPrimerLabor)PerSqftPerCoat$/.test(line.calculation.ratePath)&&factor.path==='wallHeightLaborMultiplier.standard'){
        assert.equal(factor.name,'Labor adjustment');assert.equal(factor.value,1);factor.name='Wall-height labor';
      }
      for(const record of records){
        const labor=record.quantityDerivations.filter(d=>/^(wallLabor|primerLabor|ceilingLabor|ceilingPrimerLabor)PerSqftPerCoatQuantity$/.test(d.name));
        for(const d of labor)assert.equal(d.formula,'measuredAreaSqft * definedCoats');
        record.measurements=[...labor.map(d=>({name:d.name.replace(/Quantity$/,''),value:d.result,unit:d.unit,source:'confirmed_offering_scope'})),...record.measurements];
        record.quantityDerivations=record.quantityDerivations.filter(d=>!labor.includes(d));
      }
    }
  }
  // Waste-adjusted quantity labels (October 27, 2026 audit fix): only the unit
  // text of lines whose recorded derivation applied an owner waste factor, and
  // of that derivation, advances. Quantities and amounts still compare fully.
  const wasteUnit=unit=>'waste-adjusted '+unit.replace(/^measured /,'');
  const wasted=new Set(records.flatMap(record=>(record.quantityDerivations||[]).filter(d=>d.formula==='measured quantity * (1 + owner material waste)'&&d.inputs?.wastePath).map(d=>{d.unit=wasteUnit(d.unit);return d.usedBy[0];})));
  const allLines=[...(result.lineItems||[]),...result.options.flatMap(o=>o.lineItems||[]),...records.flatMap(r=>[...(r.lineItems||[]),...Object.values(r.scenarios||{}).flatMap(s=>s.lineItems||[])])];
  for(const line of allLines)if(wasted.has(line.name)&&typeof line.calculation?.unit==='string')line.calculation.unit=wasteUnit(line.calculation.unit);
  // Fence post formula text (October 28, 2026): the printed total-length
  // formula now states the count the engine uses. The count is unchanged.
  const fenceFormula='ceil(total length / spacing) - 1 + 2 * open runs + corners + 2 * gates without included posts';
  const walk=value=>{if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){if(k==='formula'&&v==='ceil(total length / spacing) + 1 + corners + separate gate posts + 2 * (runs - 1)')value[k]=fenceFormula;else walk(v);}};
  if(type.startsWith('FENCING_'))walk(result);
  // Flat-roof detail disclosure (October 29, 2026 audit fix): a flat-roof
  // replacement now names the roof details its price leaves out. These pinned
  // books price none of them, so every detail is listed. Prices are unchanged.
  if(type==='FLAT_ROOF_REPLACEMENT'){
    const notice='Not included; confirmed and priced on site: perimeter edge metal or coping, wall and parapet base flashing, pipe flashings and other penetrations, curbs, drains, deck replacement.';
    const add=value=>{if(Array.isArray(value))value.forEach(add);else if(value&&typeof value==='object'){
      if(Array.isArray(value.disclosures)){assert.deepEqual(value.disclosures,[]);value.disclosures=[notice];}
      if(typeof value.disclaimer==='string'){assert.ok(value.disclaimer.endsWith(' No tax added.'));value.disclaimer=value.disclaimer.replace(/ No tax added\.$/,' '+notice+' No tax added.');}
      for(const [k,v] of Object.entries(value))if(k!=='disclosures')add(v);
    }};
    add(result);
  }
  // Concrete owner decisions (October 29, 2026): the pinned book quotes with
  // the thickness range, forming and isolation choices that keep its pricing;
  // the internal record echoes them. Prices are unchanged.
  if(type.startsWith('CONCRETE_')){
    const echo=value=>{if(Array.isArray(value))value.forEach(echo);else if(value&&typeof value==='object'){if(value.ownerConfiguration?.pricing)Object.assign(value.ownerConfiguration.pricing,CONCRETE_OWNER_DECISIONS);for(const v of Object.values(value))echo(v);}};
    echo(result);
    // A blank chute answer is priced and disclosed as Not sure (October 29, 2026).
    if(row.input.customerInputs.chuteAccess===undefined&&result.resultType==='INSTANT_ESTIMATE_READY'){
      const note='Placement other than the truck chute would be extra and will be confirmed on site.';
      const add=value=>{if(Array.isArray(value))value.forEach(add);else if(value&&typeof value==='object'){
        if(Array.isArray(value.disclosures)){assert.deepEqual(value.disclosures,[]);value.disclosures=[note];}
        if(typeof value.disclaimer==='string'){assert.ok(value.disclaimer.endsWith(' No tax added.'));value.disclaimer=value.disclaimer.replace(/ No tax added\.$/,' '+note+' No tax added.');}
        for(const [k,v] of Object.entries(value))if(k!=='disclosures')add(v);
      }};
      add(result);
    }
  }
  // Re-audit fixes (October 30, 2026). The pinned books quote with the owner
  // choices that keep their pricing (exact quantity for materials bought in
  // packages; removal quoted with testing excluded), and the internal record
  // echoes them. Prices are unchanged.
  const echoPricing=fields=>{const walk=value=>{if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object'){if(value.ownerConfiguration?.pricing)Object.assign(value.ownerConfiguration.pricing,fields);for(const v of Object.values(value))walk(v);}};walk(result);};
  if(PACKAGE_PURCHASE_TYPES.includes(type))echoPricing({partialPackagePricing:'exact_quantity'});
  if(REMOVAL_AGE_TYPES.includes(type))echoPricing({olderMaterialRemoval:'exclude'});
  // A concrete quote states the owner's mix, before the finish.
  if(type.startsWith('CONCRETE_')&&result.resultType==='INSTANT_ESTIMATE_READY'){
    const walk=value=>{if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object'){
      if(Array.isArray(value.priceDrivers)){const at=value.priceDrivers.indexOf('broom finish');assert.ok(at>=0);value.priceDrivers.splice(at,0,'Concrete mix: '+CONCRETE_OWNER_DECISIONS.concreteMixDescription);}
      for(const [k,v] of Object.entries(value))if(k!=='priceDrivers')walk(v);
    }};
    walk(result);
  }
  // Flat-roof details priced on site make the quote partial: each is a
  // skipped add-on with its applied rule. The disclosure is unchanged.
  if(type==='FLAT_ROOF_REPLACEMENT'){
    const labels=['Perimeter edge metal or coping','Wall and parapet base flashing','Pipe flashings and other penetrations','Curbs','Drains','Deck replacement'];
    for(const option of result.options){assert.deepEqual(option.skippedAddons,[]);option.skippedAddons=[...labels];}
    for(const record of records){assert.deepEqual(record.customerProjection.skippedAddons,[]);record.customerProjection.skippedAddons=[...labels];}
    assert.deepEqual(result.appliedRules,[]);result.appliedRules=labels.map(label=>label+' excluded: confirmed and priced on site');
  }
  // Painting year-built question (October 29, 2026): the pinned books quote
  // with prices that cover lead-safe work, and the internal record echoes that
  // choice. Prices are unchanged.
  if(type==='INTERIOR_PAINTING'||type==='EXTERIOR_PAINTING'){
    const echo=value=>{if(Array.isArray(value))value.forEach(echo);else if(value&&typeof value==='object'){if(value.ownerConfiguration?.pricing)value.ownerConfiguration.pricing={leadSafePainting:'included',...value.ownerConfiguration.pricing};for(const v of Object.values(value))echo(v);}};
    echo(result);
  }
  return result;
}
