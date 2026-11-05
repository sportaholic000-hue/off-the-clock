import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {fixture,flooring} from '../verification/engine-independent/fixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {applicationMetadata} from '../server/src/quoteDoneBridge.js';
import {hardOverlayBase} from '../server/scopeConfiguration.js';

// November 5, 2026: independent audit at 4ad192f. Expected values worked out by
// hand before the run.
const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);return q;};
const line=(q,name)=>q.options[0].lineItems.find(l=>l.name===name);

test('demolition larger than twice the new slab is priced on its own measured area',()=>{
  // 20 x 10 ft slab quotes 3,538.89 before demolition (labor 1,200.00, concrete
  // 2.716 yd3 x 180 = 488.89, forms 60 LF x 25 = 1,500.00, base 200 x 1.75 =
  // 350.00). Demolition at 5.00/sq ft: 401 sq ft = 2,005.00; 1,000 sq ft = 5,000.00.
  const base=measuredScopeCases().find(x=>x.id==='demolition-installed').input;
  for(const [area,demolition,total] of [[400,200000,5538.89],[401,200500,5543.89],[1000,500000,8538.89]]){
    const f=structuredClone(base);f.customerInputs.demolitionAreaSqft=area;
    const q=ready(f);
    assert.equal(line(q,'Existing slab demolition complete installed price').amountCents,demolition,area+' sq ft');
    assert.equal(q.options[0].midEstimate,total,area+' sq ft');
  }
});

test('a wall that is all doors and windows quotes paint material at zero, with or without waste',()=>{
  // Room 2.5 x 1 ft x 5 ft high = 35 sq ft of wall; one door (20) and one window
  // (15) leave 0 sq ft to paint. Labor stays on the 35 sq ft wall: 35 x 2 coats x
  // 1.00 = 70.00. Paint: 0 x 2 x 0.30 = 0.00. A 36 sq ft wall paints 1 sq ft:
  // 1 x 2 x 1.10 x 0.30 = 0.66, total 72.66.
  const paint=(heightFeet,waste)=>{
    const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0},{areaInputMethod:'room_dimensions',rooms:[{lengthFeet:2.5,widthFeet:1,heightFeet,doorCount:1,windowCount:1}],wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false});
    f.ownerPricing.priceBasisByCategory.material='sell_price';
    if(waste!==undefined)f.ownerPricing.pricing.paintWasteFactor=waste;
    return f;
  };
  for(const waste of [undefined,0]){
    const q=ready(paint(5,waste));
    assert.equal(line(q,'Wall paint and materials').amountCents,0);
    assert.equal(line(q,'Wall labor').amountCents,7000);
    assert.equal(q.options[0].midEstimate,70);
  }
  assert.equal(ready(paint(36/7)).options[0].midEstimate,72.66);
});

const overlay=(name,sound,pricing={})=>{
  const id=randomUUID(),f=flooring('laminate');
  Object.assign(f.ownerPricing.pricing,{scopeDetails:{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}},...pricing});
  f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[name]:id};
  f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:name,removalNeeded:false,...(sound?{existingFloorSound:sound}:{}),underlaymentScopeConfirmed:true});
  f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:name,offeringId:id}};
  return f;
};

// The owner classifies each registered existing floor (verified names need no
// classification); the November 5 reconciliation replaced name exclusion.
const CLASSES={wood:'wood',solid_wood:'wood',birch:'wood',hickory:'wood',pine:'wood',parquet:'wood',slate:'ceramic_stone_tile',travertine:'ceramic_stone_tile',marmoleum:'resilient_sheet',epoxy:'concrete'};
test('laminate over any sound, fully attached existing floor quotes as an ordinary install',()=>{
  // 200 sq ft laminate: labor 200 x 3.00 x 1.10 (room up to 300 sq ft) = 660.00;
  // material 200 x 5.00 x 1.08 = 1,080.00; total 1,740.00.
  for(const name of ['tile','oak','wood','solid_wood','birch','hickory','pine','parquet','slate','travertine','marmoleum','epoxy']){
    const q=ready(overlay(name,'yes',CLASSES[name]?{existingFloorSubstrate:{[name]:CLASSES[name]}}:{}));
    assert.equal(q.options[0].midEstimate,1740,name);
    assert.match(q.options[0].disclaimer,/The new floor floats over the existing floor/,name);
  }
});

test('the soundness question is asked for those floors, and its answers keep their outcomes',()=>{
  const slate={existingFloorSubstrate:{slate:'ceramic_stone_tile'}};
  assert.deepEqual(generateQuoteVNext(overlay('slate',undefined,slate)).missingCustomerFields,['existingFloorSound']);
  assert.match(generateQuoteVNext(overlay('slate','no',slate)).reviewReason,/loose, cushioned or floating floor usually has to come out/);
  assert.match(generateQuoteVNext(overlay('slate','not_sure',slate)).reviewReason,/needs an on-site check/);
  // Cushioned, floating, unclassified or unknown floors still need the owner's overlay rule.
  for(const [name,pricing] of [['rubber',{}],['cork',{}],['rubber',{existingFloorSubstrate:{rubber:'cushioned_or_floating'}}],['engineered_oak',{}],['vinyl_plank',{}],['unknown',{}]]){
    assert.equal(hardOverlayBase(name,pricing),false,name);
    assert.deepEqual(generateQuoteVNext(overlay(name,'yes',pricing)).ownerDecisionRequired.map(d=>d.path),['floorOverlayPricing'],name);
  }
});

test('owners are told which rates carry a waste allowance, and that the roof material price is material only',()=>{
  const services=applicationMetadata().services,help=(type,field)=>services.find(s=>s.serviceType===type).fields.find(f=>f.field===field).help;
  const allowance=name=>new RegExp('includes the '+name+' allowance under Quantity assumptions; if this price already includes waste, set that allowance to 0\\.');
  for(const field of ['materialPerWallSqftPerCoat','ceilingMaterialPerSqftPerCoat','trimMaterialPerLF'])assert.match(help('INTERIOR_PAINTING',field),allowance('Finish paint material waste'),field);
  for(const field of ['starterPerLF','dripEdgePerLF','ridgeCapPerLF'])assert.match(help('ROOFING_REPLACEMENT',field),allowance('Starter strip, drip edge and ridge cap waste'),field);
  assert.match(help('FLAT_ROOF_REPLACEMENT','membraneCostPerSqft'),allowance('Membrane material waste'));
  for(const type of ['CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB']){
    for(const field of ['wireReinforcementPerSqft','rebarReinforcementPerSqft'])assert.match(help(type,field),allowance('Wire mesh and rebar material waste'),type+' '+field);
    assert.match(help(type,'stampedMaterialPerSqft'),allowance('Stamped finish material waste'),type);
  }
  // Each named allowance is the label owners see under Quantity assumptions.
  const factorLabels=type=>services.find(s=>s.serviceType===type).class2Fields.map(f=>f.label);
  assert.ok(factorLabels('INTERIOR_PAINTING').includes('Finish paint material waste'));
  assert.ok(factorLabels('ROOFING_REPLACEMENT').includes('Starter strip, drip edge and ridge cap waste'));
  assert.ok(factorLabels('FLAT_ROOF_REPLACEMENT').includes('Membrane material waste'));
  assert.ok(factorLabels('CONCRETE_PATIO_SLAB').includes('Wire mesh and rebar material waste'));
  assert.ok(factorLabels('CONCRETE_PATIO_SLAB').includes('Stamped finish material waste'));
  const roof=services.find(s=>s.serviceType==='ROOFING_REPLACEMENT').fields.find(f=>f.field==='materialCostPerSquare');
  assert.match(roof.copyByAccessoryPricingMode.per_square_allin.label,/material only with no labor/);
  assert.doesNotMatch(JSON.stringify(roof),/installed material price/);
});
