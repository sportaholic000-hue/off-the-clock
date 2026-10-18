import assert from 'node:assert/strict';
import {ENGINE_VERSION} from '../server/quote-engine-vnext/engine.js';

// Nonbehavioral expectation reconciliation against exact base 56e19419.
// The original everytrade fixture is retained. Never alter prices, quantities,
// customer copy, eligibility, or input scope here: only the private evidence
// representation already approved on the painting/flooring branches differs.
export function integratedBaselineExpectation(row) {
  const result=structuredClone(row.result),type=row.input.serviceType;
  // The frozen v7 evidence stays intact. Only these known live-result metadata
  // paths advance; every price, scope and other assertion still compares fully.
  assert.equal(ENGINE_VERSION,'quote-engine-vnext-accuracy-20261018-v10');
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
  return result;
}
