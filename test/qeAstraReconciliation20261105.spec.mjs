import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {fixture,flooring,flatRoof,concrete} from '../verification/engine-independent/fixtures.mjs';
import {roof} from './opusQuoteFixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {applicationMetadata} from '../server/src/quoteDoneBridge.js';
import {flooringPricingDiagnostics} from '../server/quote-engine-vnext/flooringPricing.js';
import {wasteAllowancePercent} from '../client/src/pricebookEditing.js';

// November 5, 2026: Astra's reconciliation of the separate audit (S08 substrate
// classes, S01 effective waste allowance, wall labor area wording, S05 interview
// label). Expected values worked out by hand before the run.
const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);return q;};
const line=(q,name)=>q.options[0].lineItems.find(l=>l.name===name);
const floor=(product,name,pricing={},sound='yes')=>{
  const id=randomUUID(),f=flooring(product);
  // Laminate needs its underlayment scope; the vinyl plank fixture never includes underlayment.
  Object.assign(f.ownerPricing.pricing,{...(product==='laminate'?{scopeDetails:{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}}}:{}),...pricing});
  f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[name]:id};
  f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:name,removalNeeded:false,...(sound?{existingFloorSound:sound}:{}),...(product==='laminate'?{underlaymentScopeConfirmed:true}:{})});
  f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:name,offeringId:id}};
  return f;
};
const overlayRule=f=>assert.deepEqual(generateQuoteVNext(f).ownerDecisionRequired?.map(d=>d.path),['floorOverlayPricing']);

test('a floating floor goes over an existing floor only when the owner-classified substrate is permitted for that product',()=>{
  // 200 sq ft laminate: labor 200 x 3.00 x 1.10 = 660.00; material 200 x 5.00 x 1.08 = 1,080.00.
  // Verified names quote without a classification, as before.
  for(const name of ['tile','oak','sheet_vinyl','concrete'])assert.equal(ready(floor('laminate',name)).options[0].midEstimate,1740,name);
  // An unrecognized name is unclassified: the owner's overlay rule, and no soundness question.
  overlayRule(floor('laminate','slate'));
  assert.equal(generateQuoteVNext(floor('laminate','slate',{},null)).missingCustomerFields?.includes('existingFloorSound')??false,false);
  // Classified, it quotes and asks the soundness question.
  const slate={existingFloorSubstrate:{slate:'ceramic_stone_tile'}};
  assert.equal(ready(floor('laminate','slate',slate)).options[0].midEstimate,1740);
  assert.deepEqual(generateQuoteVNext(floor('laminate','slate',slate,null)).missingCustomerFields,['existingFloorSound']);
  // The product's own list decides: a laminate that may not float over tile.
  overlayRule(floor('laminate','slate',{...slate,laminateFloatsOver:{wood:true,resilient_sheet:true,ceramic_stone_tile:false,concrete:true}}));
  overlayRule(floor('laminate','tile',{laminateFloatsOver:{wood:true,resilient_sheet:false,ceramic_stone_tile:false,concrete:false}}));
  // The owner's classification describes the material; it cannot make a cushioned floor floatable.
  overlayRule(floor('laminate','rubber',{existingFloorSubstrate:{rubber:'cushioned_or_floating'}}));
  // A floor the owner classifies as carpet is refused like a carpet name.
  const shag=generateQuoteVNext(floor('laminate','shag',{existingFloorSubstrate:{shag:'carpet'}}));
  assert.equal(shag.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(JSON.stringify(shag).includes('Existing carpet has to be removed before a new floor is installed.'));
});

test('floating vinyl plank follows its own permitted substrates; glue-down vinyl plank still needs the overlay rule',()=>{
  // 200 sq ft vinyl plank at 3.00 labor and 5.00 material: 660.00 + 200 x 5.00 x 1.08 = 1,740.00.
  const wood={existingFloorSubstrate:{pine:'wood'},vinylPlankInstallMethod:'floating'};
  assert.equal(ready(floor('vinyl_plank','pine',wood)).options[0].midEstimate,1740);
  overlayRule(floor('vinyl_plank','pine',{...wood,vinylPlankFloatsOver:{wood:false,resilient_sheet:true,ceramic_stone_tile:true,concrete:true}}));
  overlayRule(floor('vinyl_plank','pine',{...wood,vinylPlankInstallMethod:'glue_down'}));
});

test('substrate settings refuse unknown classes and never permit carpet or cushioned floors',()=>{
  const paths=p=>flooringPricingDiagnostics(p).map(d=>d.path);
  assert.deepEqual(paths({existingFloorSubstrate:{slate:'stone'}}),['existingFloorSubstrate.slate']);
  assert.deepEqual(paths({laminateFloatsOver:{carpet:true}}),['laminateFloatsOver.carpet']);
  assert.deepEqual(paths({vinylPlankFloatsOver:{cushioned_or_floating:true}}),['vinylPlankFloatsOver.cushioned_or_floating']);
  assert.deepEqual(paths({laminateFloatsOver:{wood:'yes'}}),['laminateFloatsOver.wood']);
  assert.deepEqual(paths({existingFloorSubstrate:{slate:'ceramic_stone_tile'},laminateFloatsOver:{wood:true,resilient_sheet:true,ceramic_stone_tile:true,concrete:false}}),[]);
  const fields=applicationMetadata().services.find(s=>s.serviceType==='FLOORING_INSTALL').fields;
  assert.equal(fields.find(f=>f.field==='existingFloorSubstrate').tree.keysFromRegisteredOfferings,'existingFloorType');
  assert.deepEqual(fields.find(f=>f.field==='laminateFloatsOver').tree.leafKeys,['wood','resilient_sheet','ceramic_stone_tile','concrete']);
});

// Each affected rate: the allowance the editor shows equals the one the engine applies.
const CASES=[
  ['INTERIOR_PAINTING','materialPerWallSqftPerCoat',()=>{const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0},{areaInputMethod:'wall_sqft',wallAreaSqft:500,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false});f.ownerPricing.priceBasisByCategory.material='sell_price';return f;},'Wall paint and materials',1000*30],
  ['ROOFING_REPLACEMENT','starterPerLF',()=>roof(),'Starter strip',100*100],
  ['ROOFING_REPLACEMENT','ridgeCapPerLF',()=>roof(),'Ridge cap',20*300],
  ['FLAT_ROOF_REPLACEMENT','membraneCostPerSqft',()=>flatRoof(),'Membrane',1000*700],
  ['CONCRETE_PATIO_SLAB','wireReinforcementPerSqft',()=>{const f=concrete();f.customerInputs.reinforcement='wire_mesh';return f;},'Wire mesh reinforcement',200*150],
  ['CONCRETE_PATIO_SLAB','rebarReinforcementPerSqft',()=>{const f=concrete();f.customerInputs.reinforcement='rebar';return f;},'Rebar reinforcement',200*200]
];
test('the waste allowance shown beside each rate is the one the engine applies, including zero and a changed value',()=>{
  const services=applicationMetadata().services;
  for(const [type,rate,build,lineName,measuredCents] of CASES){
    const w=services.find(s=>s.serviceType===type).fields.find(f=>f.field===rate).wasteAllowance;
    assert.ok(w,type+' '+rate);
    for(const value of [undefined,0,0.05]){
      const f=build(),p=f.ownerPricing.pricing;
      if(value!==undefined)p[w.field]=w.key?{...(typeof p[w.field]==='object'?p[w.field]:w.defaultValue),[w.key]:value}:value;
      const shown=wasteAllowancePercent(type,value===undefined?{}:p,w.field,w.key);
      assert.equal(shown,value===undefined?10:value*100,type+' '+rate+' '+value);
      // measured quantity x rate x (1 + shown allowance)
      assert.equal(line(ready(f),lineName).amountCents,Math.round(measuredCents*(1+shown/100)),type+' '+rate+' '+value);
    }
  }
});

test('itemized painting applies the finish, primer and preparation allowances the editor names',()=>{
  // Fixture: 400 sq ft of wall (no openings), 2 finish coats, 1 primer coat.
  const amounts=pricing=>{const f=offeringFixture('INTERIOR_PAINTING','itemized');Object.assign(f.ownerPricing.pricing,pricing);const q=ready(f);return Object.fromEntries(q.options[0].lineItems.filter(l=>l.category==='material').map(l=>[l.name,l.calculation.quantity]));};
  const base=amounts({}),zero=amounts({paintWasteFactor:0,primerWasteFactor:0,prepMaterialWasteFactor:0});
  for(const [name,value] of Object.entries(base))assert.equal(Number((value/zero[name]).toFixed(10)),1.1,name);
  assert.equal(wasteAllowancePercent('INTERIOR_PAINTING',{paintWasteFactor:0},'paintWasteFactor'),0);
  assert.equal(wasteAllowancePercent('INTERIOR_PAINTING',{},'primerWasteFactor'),10);
});

test('wall labor help states the labor area convention; the interview roof label says material only',()=>{
  const services=applicationMetadata().services,help=(type,field)=>services.find(s=>s.serviceType===type).fields.find(f=>f.field===field);
  assert.match(help('INTERIOR_PAINTING','laborPerWallSqftPerCoat').help,/measured wall area with standard doors and windows left in .*Paint material uses the net area after openings\./);
  assert.match(help('ROOFING_REPLACEMENT','materialCostPerSquare').label,/material only with no labor/);
  // The labor convention matches the engine: 36 sq ft of wall with one door and one window.
  const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0},{areaInputMethod:'room_dimensions',rooms:[{lengthFeet:2.5,widthFeet:1,heightFeet:36/7,doorCount:1,windowCount:1}],wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false});
  f.ownerPricing.priceBasisByCategory.material='sell_price';
  const q=ready(f);
  assert.equal(line(q,'Wall labor').calculation.quantity,72);
  assert.equal(line(q,'Wall paint and materials').calculation.quantity,2.2000000000000024);
});

test('the real tier editor shows the waste allowance that applies in that tier, including zero',async t=>{
  const {readFile}=await import('node:fs/promises'),{fileURLToPath}=await import('node:url'),{build}=await import('esbuild'),{JSDOM}=await import('jsdom'),{convertPricebookMoney}=await import('../server/priceBookMoney.js');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0,paintWasteFactor:0},{});
  f.ownerPricing.tiers=[{name:'Premium',overrides:{materialPerWallSqftPerCoat:40}}];
  const service=convertPricebookMoney(f.ownerPricing,'toDollars');
  const definitions=applicationMetadata().services.find(s=>s.serviceType==='INTERIOR_PAINTING').fields.filter(d=>d.field==='materialPerWallSqftPerCoat');
  const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'test-exports',setup(b){b.onLoad({filter:/client[\\/]src[\\/]pricebook\.jsx$/},async args=>({contents:(await readFile(args.path,'utf8'))+'\nexport {TierBuilder,PricingContext};',loader:'jsx'}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {TierBuilder,PricingContext} from './client/src/pricebook.jsx';
      createRoot(document.getElementById('root')).render(<PricingContext.Provider value={window.initial}><TierBuilder tiers={window.initial.tiers} definitions={()=>window.definitions} onChange={()=>{}}/></PricingContext.Provider>);`}});
  const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window;
  w.eval('window.initial='+JSON.stringify(service)+';window.definitions='+JSON.stringify(definitions)+';window.structuredClone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));');
  w.eval(output.outputFiles[0].text);
  const text=()=>w.document.body.textContent;
  for(let i=0;i<500&&!/Waste allowance applied/.test(text());i++)await new Promise(r=>setTimeout(r,10));
  assert.match(text(),/Waste allowance applied to this price in the Premium tier: 0% \(Finish paint material waste, under Quantity assumptions\)\./);
});
