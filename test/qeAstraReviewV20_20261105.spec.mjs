import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {applicationMetadata} from '../server/src/quoteDoneBridge.js';
import {flooringPricingDiagnostics,FLOORING_FIELD_COPY} from '../server/quote-engine-vnext/flooringPricing.js';
import {existingFloorSubstrate,floatCompatibility,FLOOR_STAY_LABEL} from '../server/scopeConfiguration.js';
import {paintingMaterialNote,paintingMaterialNotice} from '../client/src/pricebookEditing.js';

// November 5, 2026: Astra's review of v19/v20. Expected values worked out by
// hand: 200 sq ft at 3.00 labor and 5.00 material = 660.00 + 1,080.00 = 1,740.00;
// an overlay preparation scope adds 200 x (1.00 + 0.50) = 300.00.
const floor=(product,name,pricing={},{overlay=false,sound='yes'}={})=>{
  const id=randomUUID(),f=flooring(product);
  Object.assign(f.ownerPricing.pricing,{
    scopeDetails:{...(product==='laminate'?{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}}:{}),
      ...(overlay?{floor_overlay:{description:'[SYNTHETIC] Clean only; the existing floor stays',mode:'itemized',existingFloorType:name,newFlooringType:product,basePriceExcludesPreparation:true}}:{})},
    ...(overlay?{scopeRates:{floor_overlay_prep:100,floor_overlay_material:50}}:{}),...pricing});
  if(!f.ownerPricing.knownOfferings.existingFloorType[name])f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[name]:id};
  f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:name,removalNeeded:false,...(sound?{existingFloorSound:sound}:{}),...(product==='laminate'?{underlaymentScopeConfirmed:true}:{}),...(overlay?{overlayScopeConfirmed:true}:{})});
  f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:name,offeringId:f.ownerPricing.knownOfferings.existingFloorType[name]}};
  return f;
};
const mid=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);return q.options[0].midEstimate;};
const refused=f=>assert.match(generateQuoteVNext(f).reviewReason,/can't be installed over the existing floor, so the existing floor has to come out first/);
const allFalse={wood:false,resilient_sheet:false,resilient_tile_plank:false,ceramic_stone_tile:false,concrete:false};
// Saved product rules name their product and instruction revision (required since v22).
const L={laminateInstallInstructions:'[SYNTHETIC] Laminate, instructions 2025'},V={vinylPlankInstallInstructions:'[SYNTHETIC] Vinyl plank, instructions 2025'};

test('S08-A: no overlay or preparation price makes a prohibited floating combination quote',()=>{
  const noTile={...L,laminateFloatsOver:{wood:true,resilient_sheet:true,ceramic_stone_tile:false,concrete:true}};
  refused(floor('laminate','tile',noTile));
  refused(floor('laminate','tile',noTile,{overlay:true}));
  refused(floor('laminate','tile',{...L,laminateFloatsOver:allFalse},{overlay:true}));
  refused(floor('laminate','rubber',{existingFloorSubstrate:{rubber:'cushioned_or_floating'}},{overlay:true}));
  // Since v23 laminate is a material; only the registered name 'floating' always floats.
  refused(floor('laminate','floating',{},{overlay:true}));
  const plank={...V,vinylPlankInstallMethod:'floating',vinylPlankFloatsOver:allFalse};
  refused(floor('vinyl_plank','tile',plank));
  refused(floor('vinyl_plank','tile',plank,{overlay:true}));
  // Permitted, with separately priced preparation: 1,740.00 + 300.00.
  assert.equal(mid(floor('laminate','tile',{...L,laminateFloatsOver:{...allFalse,ceramic_stone_tile:true}},{overlay:true})),2040);
  // Glue-down vinyl plank is not a floating product; its overlay rule still prices it.
  assert.equal(generateQuoteVNext(floor('vinyl_plank','tile',{vinylPlankInstallMethod:'glue_down'},{overlay:true})).resultType,'INSTANT_ESTIMATE_READY');
});

test('S08-B: only exact recognized names classify themselves; compounds need the owner',()=>{
  for(const [name,expected] of [['sheet_vinyl','resilient_sheet'],['vct','resilient_tile_plank'],['engineered_hardwood','wood'],['tile','ceramic_stone_tile'],['porcelain_tile','ceramic_stone_tile'],['oak','wood'],['concrete','concrete'],['carpet','carpet'],['vinyl_plank','resilient_tile_plank'],['laminate','laminate'],['floating','cushioned_or_floating']])assert.equal(existingFloorSubstrate(name),expected,name);
  for(const name of ['vinyl_tile','vct_tile','rubber_tile','cork_tile','oak_strip','slate','vinyl'])assert.equal(existingFloorSubstrate(name),undefined,name);
  // Tile allowed, resilient flooring forbidden: vinyl_tile is not quoted as ceramic.
  const tileOnly={...L,laminateFloatsOver:{...allFalse,ceramic_stone_tile:true}};
  // Unclassified, since v23 they are a partial estimate leaving whether the floor can stay for the site visit.
  for(const name of ['vinyl_tile','vct_tile','rubber_tile','cork_tile']){const q=generateQuoteVNext(floor('laminate',name,tileOnly));assert.equal(q.options?.[0]?.midEstimate,1740,name);assert.deepEqual(q.options[0].skippedAddons,[FLOOR_STAY_LABEL],name);}
  assert.equal(mid(floor('laminate','vct_tile',{...tileOnly,existingFloorSubstrate:{vct_tile:'ceramic_stone_tile'}})),1740);
  refused(floor('laminate','vct_tile',{...tileOnly,existingFloorSubstrate:{vct_tile:'resilient_sheet'}}));
});

test('S08-C: blank product rules quote with compatibility stated as unconfirmed; saved rules name their instructions',()=>{
  assert.equal(floatCompatibility('laminate','tile',{}),'conditional');
  const blank=generateQuoteVNext(floor('laminate','tile'));
  assert.equal(blank.options[0].midEstimate,1740);
  assert.match(blank.options[0].disclaimer,/has not been confirmed for this job and is checked on site/);
  const saved=generateQuoteVNext(floor('laminate','tile',{laminateFloatsOver:{...allFalse,ceramic_stone_tile:true},laminateInstallInstructions:'[SYNTHETIC] Laminate instructions 2025, one layer only'}));
  assert.equal(saved.options[0].midEstimate,1740);
  assert.match(saved.options[0].disclaimer,/which the product's installation instructions \(\[SYNTHETIC\] Laminate instructions 2025, one layer only\) permit for this floor/);
  assert.deepEqual(flooringPricingDiagnostics({laminateInstallInstructions:'<b>x</b>'}).map(d=>d.path),['laminateInstallInstructions']);
});

test('S08-D: a class that contradicts a recognized name is flagged and never disables the carpet guard',()=>{
  const carpetAsWood={existingFloorSubstrate:{carpet:'wood'}};
  const q=generateQuoteVNext(floor('laminate','carpet',carpetAsWood));
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.notEqual(q.options?.[0]?.midEstimate,1740);
  assert.deepEqual(flooringPricingDiagnostics(carpetAsWood).map(d=>d.path),['existingFloorSubstrate.carpet']);
  assert.match(flooringPricingDiagnostics({existingFloorSubstrate:{tile:'carpet'}})[0].message,/recognized ceramic or stone tile floor but is classified as carpet/);
  // An unrecognized name classified as carpet is refused as carpet.
  assert.ok(JSON.stringify(generateQuoteVNext(floor('laminate','shag',{existingFloorSubstrate:{shag:'carpet'}}))).includes('Existing carpet has to be removed before a new floor is installed.'));
});

test('S01-B: painting material notes follow the pricing method',()=>{
  const measured={serviceType:'INTERIOR_PAINTING',priceBasisByCategory:{material:'sell_price'}},packaged={serviceType:'INTERIOR_PAINTING',priceBasisByCategory:{material:'cost'}};
  assert.match(paintingMaterialNotice(measured,{paintWasteFactor:0.25}),/finish paint 25%, primer 10%, preparation 10%/);
  assert.match(paintingMaterialNotice(packaged,{paintWasteFactor:0.25}),/bought by the package .* do not change those quantities/);
  assert.equal(paintingMaterialNote(measured,{primerWasteFactor:0},'offeringRates','primerMaterialPerSqftPerCoat'),'Waste allowance applied to this price: 0% (Primer material waste, under Quantity assumptions).');
  assert.match(paintingMaterialNote(packaged,{},'offeringRates','wallMaterialPerSqftPerCoat'),/^Not used for materials bought by the package/);
  assert.match(paintingMaterialNote(measured,{},'paintingRates','trimPrepMaterialPerLF'),/10% \(Preparation material waste/);
  assert.equal(paintingMaterialNote(measured,{},'offeringRates','wallLaborPerSqftPerCoat'),null);
});

test('S01-A: the real tier editor shows each itemized material rate its tier allowance',async t=>{
  const {readFile}=await import('node:fs/promises'),{fileURLToPath}=await import('node:url'),{build}=await import('esbuild'),{JSDOM}=await import('jsdom'),{convertPricebookMoney}=await import('../server/priceBookMoney.js');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const f=offeringFixture('INTERIOR_PAINTING','itemized');f.ownerPricing.priceBasisByCategory.material='sell_price';
  f.ownerPricing.tiers=[{name:'Premium',overrides:{offeringRates:{...f.ownerPricing.pricing.offeringRates,wallMaterialPerSqftPerCoat:40},paintWasteFactor:0.25}}];
  // The engine applies 25% in that tier: wall material quantity is 1.25 x the measured coats.
  const q=generateQuoteVNext(f),wall=option=>option.lineItems.find(l=>l.calculation?.ratePath==='offeringRates.wallMaterialPerSqftPerCoat').calculation.quantity;
  // The same job without the tier uses the base 10%.
  const untiered=structuredClone(f);delete untiered.ownerPricing.tiers;
  assert.equal(Number((wall(q.options[0])/wall(generateQuoteVNext(untiered).options[0])).toFixed(10)),Number((1.25/1.10).toFixed(10)));
  const meta=applicationMetadata().services.find(s=>s.serviceType==='INTERIOR_PAINTING');
  const service=convertPricebookMoney(f.ownerPricing,'toDollars');
  const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'test-exports',setup(b){b.onLoad({filter:/client[\\/]src[\\/]pricebook\.jsx$/},async args=>({contents:(await readFile(args.path,'utf8'))+'\nexport {TierBuilder,PricingContext};',loader:'jsx'}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {TierBuilder,PricingContext} from './client/src/pricebook.jsx';import {offeringTierFields} from './client/src/offeringEditor.jsx';
      createRoot(document.getElementById('root')).render(<PricingContext.Provider value={window.initial}><TierBuilder tiers={window.initial.tiers} definitions={overrides=>offeringTierFields(window.meta,window.initial,overrides)} onChange={()=>{}}/></PricingContext.Provider>);`}});
  const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window;
  w.eval('window.initial='+JSON.stringify(service)+';window.meta='+JSON.stringify(meta)+';window.structuredClone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));');
  w.eval(output.outputFiles[0].text);
  const text=()=>w.document.body.textContent;
  for(let i=0;i<500&&!/Waste allowance applied/.test(text());i++)await new Promise(r=>setTimeout(r,10));
  assert.match(text(),/Waste allowance applied to this price in the Premium tier: 25% \(Finish paint material waste, under Quantity assumptions\)\./);
  assert.match(text(),/Waste allowance applied to this price in the Premium tier: 10% \(Primer material waste, under Quantity assumptions\)\./);
});

test('carpet unit help describes the exact conversion and refusal',()=>{
  assert.match(FLOORING_FIELD_COPY.carpetPriceUnit.help,/a change that cannot be stated exactly in the new unit is refused and nothing is changed/);
  assert.doesNotMatch(JSON.stringify(applicationMetadata()),/cleared for you to re-enter/);
});
