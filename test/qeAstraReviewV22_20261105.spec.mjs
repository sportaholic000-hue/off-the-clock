import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
import {customerQuoteFields} from '../server/customerQuoteFields.js';
import {customerContractForVNext} from '../server/quote-engine-vnext/contracts.js';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {discloseQuoteScope} from '../server/src/quoteScopeDisclosure.js';
import {applicationMetadata} from '../server/src/quoteDoneBridge.js';
import {customerFieldVisible,withoutInapplicableFloorAnswers,existingFloorSubstrate,substrateContradiction,FLOOR_STAY_LABEL} from '../server/scopeConfiguration.js';

// November 5, 2026: Astra's review of v22. Expected values worked out by hand:
// 200 sq ft at 3.00 labor + 5.00 material = 660.00 + 1,080.00 = 1,740.00; a
// cleaning-only overlay adds 200 x 1.50 = 300.00; removal at 1.00 adds 200.00.
const L={laminateInstallInstructions:'[SYNTHETIC] Laminate X rev. 2025'},V={vinylPlankInstallInstructions:'[SYNTHETIC] Plank Y rev. 2025',vinylPlankInstallMethod:'floating'};
const ALL_FALSE={wood:false,resilient_sheet:false,resilient_tile_plank:false,laminate:false,ceramic_stone_tile:false,concrete:false};
const floor=(product,name,pricing={},answers={},{overlay=false}={})=>{
  const id=randomUUID(),f=flooring(product);
  Object.assign(f.ownerPricing.pricing,{
    scopeDetails:{...(product==='laminate'?{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}}:{}),
      ...(overlay?{floor_overlay:{description:'[SYNTHETIC] Cleaning only; the existing covering remains; no substrate replacement',mode:'itemized',existingFloorType:name,newFlooringType:product,basePriceExcludesPreparation:true}}:{})},
    ...(overlay?{scopeRates:{floor_overlay_prep:100,floor_overlay_material:50}}:{}),...pricing});
  if(!f.ownerPricing.knownOfferings.existingFloorType[name])f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[name]:id};
  f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:name,removalNeeded:false,...(product==='laminate'?{underlaymentScopeConfirmed:true}:{}),...(overlay?{overlayScopeConfirmed:true}:{}),...answers});
  f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:name,offeringId:f.ownerPricing.knownOfferings.existingFloorType[name]}};
  return f;
};
const priced=(f,total,partial)=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);assert.equal(q.options[0].midEstimate,total);assert.deepEqual(q.options[0].skippedAddons,partial?[FLOOR_STAY_LABEL]:[]);return q;};
const refused=(f,reason)=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.match(q.reviewReason,reason);};
// The public form's fields (one per option, merged), the path customers see.
const fields=f=>Object.fromEntries(customerQuoteFields({...f.ownerPricing,serviceType:f.serviceType},f.ownerPricing.pricing).map(({name,...d})=>[name,d]));

test('1: condition questions are offered only where a product condition applies, and inapplicable answers are dropped',()=>{
  for(const type of ['FLOORING_INSTALL','FLOORING_REPLACEMENT']){
    const build=pricing=>{const f=floor('laminate','sheet_vinyl',pricing);f.serviceType=type;f.ownerPricing.serviceType=type;f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,oak:randomUUID()};return f;};
    // Blank rules: neither question is offered.
    let defs=fields(build({}));
    assert.equal(defs.existingFloorLayers,undefined,type);assert.equal(defs.woodFloorAssembly,undefined,type);
    // The sheet-vinyl condition: offered for the old floor staying, laminate, and sheet vinyl only.
    defs=fields(build({...L,laminateFloatConditions:{sheet_vinyl_single_layer:true}}));
    const layers={name:'existingFloorLayers',...defs.existingFloorLayers};
    assert.equal(customerFieldVisible(layers,{removalNeeded:false,newFlooringType:'laminate',existingFloorType:'sheet_vinyl'}),true,type);
    assert.equal(customerFieldVisible(layers,{removalNeeded:true,newFlooringType:'laminate',existingFloorType:'sheet_vinyl'}),false,type);
    assert.equal(customerFieldVisible(layers,{removalNeeded:false,newFlooringType:'laminate',existingFloorType:'oak'}),false,type);
    assert.equal(customerFieldVisible(layers,{removalNeeded:false,newFlooringType:'tile',existingFloorType:'sheet_vinyl'}),false,type);
    assert.equal(defs.woodFloorAssembly,undefined,type);
    // An explicit No for the material: no question.
    defs=fields(build({...L,laminateFloatConditions:{sheet_vinyl_single_layer:true},laminateFloatsOver:{resilient_sheet:false}}));
    assert.equal(defs.existingFloorLayers,undefined,type);
  }
  // Switching to removal (or a restored draft) drops the answers before sending.
  const f=floor('laminate','sheet_vinyl',{...L,laminateFloatConditions:{sheet_vinyl_single_layer:true,wood_not_glued_to_concrete:true}});
  const list=Object.entries(fields(f)).map(([name,d])=>({name,...d}));
  const removal={...f.customerInputs,removalNeeded:true,removalAreaSqft:200,existingFloorLayers:'one',woodFloorAssembly:'joists',existingFloorSound:'yes'};
  const cleaned=withoutInapplicableFloorAnswers(list,removal);
  for(const name of ['existingFloorLayers','woodFloorAssembly','existingFloorSound'])assert.equal(cleaned[name],undefined,name);
  assert.equal(withoutInapplicableFloorAnswers(list,{...f.customerInputs,existingFloorLayers:'one'}).existingFloorLayers,'one');
  // The $1,940 removal job quotes with the cleaned answers; the server still refuses them unclean.
  f.ownerPricing.pricing.removalPerSqft={sheet_vinyl:100};
  assert.equal(generateQuoteVNext({...f,customerInputs:cleaned}).options[0].midEstimate,1940);
  assert.equal(generateQuoteVNext({...f,customerInputs:removal}).resultType,'ESTIMATE_REQUIRES_REVIEW');
});

test('1: the wood question, floating vinyl plank and tier rules decide where the questions show',()=>{
  const visible=(defs,name,inputs)=>customerFieldVisible({name,...defs[name]},inputs);
  // The wood condition: asked for wood staying under laminate, not for sheet vinyl.
  let f=floor('laminate','hardwood',{...L,laminateFloatConditions:{wood_not_glued_to_concrete:true}});
  f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,sheet_vinyl:randomUUID()};
  let defs=fields(f);
  assert.equal(visible(defs,'woodFloorAssembly',{removalNeeded:false,newFlooringType:'laminate',existingFloorType:'hardwood'}),true);
  assert.equal(visible(defs,'woodFloorAssembly',{removalNeeded:false,newFlooringType:'laminate',existingFloorType:'sheet_vinyl'}),false);
  assert.equal(visible(defs,'woodFloorAssembly',{removalNeeded:true,newFlooringType:'laminate',existingFloorType:'hardwood'}),false);
  assert.equal(defs.existingFloorLayers,undefined);
  // Vinyl plank: asked only when the owner sets it to float.
  f=floor('vinyl_plank','sheet_vinyl',{...V,vinylPlankFloatConditions:{sheet_vinyl_single_layer:true}});
  defs=fields(f);
  assert.equal(visible(defs,'existingFloorLayers',{removalNeeded:false,newFlooringType:'vinyl_plank',existingFloorType:'sheet_vinyl'}),true);
  assert.equal(visible(defs,'existingFloorLayers',{removalNeeded:false,newFlooringType:'laminate',existingFloorType:'sheet_vinyl'}),false);
  f=floor('vinyl_plank','sheet_vinyl',{...V,vinylPlankInstallMethod:'glue_down',vinylPlankFloatConditions:{sheet_vinyl_single_layer:true}});
  assert.equal(fields(f).existingFloorLayers,undefined);
  // A condition set only in a tier is offered; a tier that says No for the material is not.
  f=floor('laminate','sheet_vinyl',{});
  f.ownerPricing.tiers=[{name:'Good',overrides:{}},{name:'Best',overrides:{...L,laminateFloatConditions:{sheet_vinyl_single_layer:true}}}];
  defs=fields(f);
  assert.equal(visible(defs,'existingFloorLayers',{removalNeeded:false,newFlooringType:'laminate',existingFloorType:'sheet_vinyl'}),true);
  f.ownerPricing.tiers[1].overrides.laminateFloatsOver={resilient_sheet:false};
  assert.equal(fields(f).existingFloorLayers,undefined);
});

test('1: the real customer form drops a condition answer when removal is chosen',async t=>{
  const {readFile}=await import('node:fs/promises'),{fileURLToPath}=await import('node:url'),{build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const f=floor('laminate','sheet_vinyl',{...L,laminateFloatConditions:{sheet_vinyl_single_layer:true}});
  const scopeFields=Object.entries(fields(f)).map(([name,d])=>({name,...d}));
  const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},
    stdin:{resolveDir:root,loader:'jsx',contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {CustomerMeasurements} from './client/src/quoteDoneControls.jsx';
      function App(){const [value,setValue]=useState(window.initial);window.current=value;return <CustomerMeasurements fields={window.fields.filter(f=>f.name==='removalNeeded')} scopeFields={window.fields} value={value} onChange={v=>{window.current=v;setValue(v);}}/>;}
      createRoot(document.getElementById('root')).render(<App/>);`}});
  const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window;
  w.eval('window.initial='+JSON.stringify({...f.customerInputs,existingFloorLayers:'one',existingFloorSound:'yes'})+';window.fields='+JSON.stringify(scopeFields)+';window.structuredClone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));');
  w.eval(output.outputFiles[0].text);
  let select;for(let i=0;i<300&&!(select=w.document.querySelector('select'));i++)await new Promise(r=>setTimeout(r,10));
  assert.ok(select,'removal control rendered');
  select.value=[...select.options].find(o=>o.value==='true')?.value??'true';select.dispatchEvent(new w.Event('change',{bubbles:true}));
  for(let i=0;i<300&&w.current.removalNeeded!==true;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(w.current.removalNeeded,true);
  assert.equal(w.current.existingFloorLayers,undefined);
  assert.equal(w.current.existingFloorSound,undefined);
  // Going back and choosing to keep the floor: the question shows again, unanswered.
  select.value='false';select.dispatchEvent(new w.Event('change',{bubbles:true}));
  for(let i=0;i<300&&w.current.removalNeeded!==false;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(w.current.removalNeeded,false);
  assert.equal(w.current.existingFloorLayers,undefined);
  assert.equal(customerFieldVisible(scopeFields.find(d=>d.name==='existingFloorLayers'),w.current),true);
});

test('2: an unclassified floor never quotes as compatible through a preparation price',()=>{
  for(const [product,rules] of [['laminate',L],['vinyl_plank',V]]){
    // Sound: priced with the overlay, as a partial estimate (material unresolved).
    priced(floor(product,'oak_strip',product==='vinyl_plank'?{vinylPlankInstallMethod:'floating'}:{},{existingFloorSound:'yes'},{overlay:true}),2040,true);
    refused(floor(product,'oak_strip',product==='vinyl_plank'?{vinylPlankInstallMethod:'floating'}:{},{existingFloorSound:'no'},{overlay:true}),/loose, cushioned or floating floor usually has to come out/);
    refused(floor(product,'oak_strip',product==='vinyl_plank'?{vinylPlankInstallMethod:'floating'}:{},{existingFloorSound:'not_sure'},{overlay:true}),/needs an on-site check/);
    const field=product==='laminate'?'laminateFloatsOver':'vinylPlankFloatsOver';
    refused(floor(product,'oak_strip',{...rules,[field]:ALL_FALSE},{existingFloorSound:'yes'},{overlay:true}),/has to come out first/);
  }
  // The customer sees it as a partial estimate.
  const f=floor('laminate','oak_strip',{},{existingFloorSound:'yes'},{overlay:true});
  assert.equal(discloseQuoteScope(sanitizeForCustomerVNext(generateQuoteVNext(f)),f.ownerPricing,{},{customerInputs:f.customerInputs},'audit').resultType,'PARTIAL_ESTIMATE_READY');
});

test('3: a known violation of a configured condition is refused whatever the product list says',()=>{
  for(const [product,rules,setField,mapField] of [['laminate',L,'laminateFloatConditions','laminateFloatsOver'],['vinyl_plank',V,'vinylPlankFloatConditions','vinylPlankFloatsOver']]){
    for(const map of [undefined,{wood:true},{resilient_sheet:true,wood:true}]){
      const base={...rules,[setField]:{sheet_vinyl_single_layer:true,wood_not_glued_to_concrete:true},...(map?{[mapField]:map}:{})};
      refused(floor(product,'sheet_vinyl',base,{existingFloorSound:'yes',existingFloorLayers:'two_or_more'}),/only one layer of existing sheet vinyl or linoleum/);
      refused(floor(product,'oak',base,{existingFloorSound:'yes',woodFloorAssembly:'glued_to_concrete'}),/glued directly to concrete/);
    }
    // With an overlay price too.
    refused(floor(product,'sheet_vinyl',{...rules,[setField]:{sheet_vinyl_single_layer:true}},{existingFloorSound:'yes',existingFloorLayers:'two_or_more'},{overlay:true}),/only one layer/);
    // Asked even with no product list, so the violation can be known.
    assert.deepEqual(generateQuoteVNext(floor(product,'sheet_vinyl',{...rules,[setField]:{sheet_vinyl_single_layer:true}},{existingFloorSound:'yes'})).missingCustomerFields,['existingFloorLayers']);
  }
});

test('4: existing laminate is a material; whether it floats is the customer answer',()=>{
  assert.equal(existingFloorSubstrate('laminate'),'laminate');
  assert.equal(substrateContradiction('laminate',{existingFloorSubstrate:{laminate:'laminate'}}),null);
  priced(floor('laminate','laminate',{},{existingFloorSound:'yes'}),1740,true);                       // bonded, rules blank: conditional
  priced(floor('laminate','laminate',{...L,laminateFloatsOver:{laminate:true}},{existingFloorSound:'yes'}),1740,false);  // permitted
  refused(floor('laminate','laminate',{...L,laminateFloatsOver:{laminate:false}},{existingFloorSound:'yes'}),/has to come out first/);
  refused(floor('laminate','laminate',{},{existingFloorSound:'no'}),/loose, cushioned or floating floor/);   // known floating
  refused(floor('laminate','floating',{},{existingFloorSound:'yes'}),/has to come out first/);              // named floating
  assert.match(applicationMetadata().services.find(s=>s.serviceType==='FLOORING_INSTALL').fields.find(f=>f.field==='laminateFloatsOver').help,/New laminate is quoted only as a floating install/);
});

test('5: itemized painting tiers show the allowance beside component rates, through the real tier editor',async t=>{
  // Engine: 100 LF trim x 2 coats x 0.25 x 1.25 = 62.50 in the Premium tier.
  const f=offeringFixture('INTERIOR_PAINTING','itemized');f.ownerPricing.priceBasisByCategory.material='sell_price';
  const r=f.ownerPricing.pricing.offeringRates;Object.assign(r,{prepLaborPerSqft_good:r.prepLaborPerSqft,prepMaterialPerSqft_good:r.prepMaterialPerSqft});
  Object.assign(f.ownerPricing.pricing,{paintingRates:{trimLaborPerLFPerCoat:100,trimMaterialPerLFPerCoat:25,trimPrimerMaterialPerLFPerCoat:10,trimPrepLaborPerLF_good:50,trimPrepMaterialPerLF_good:20}});
  Object.assign(f.customerInputs,{trimIncluded:true,trimLengthLF:100,trimCoats:2,trimSurfaceCondition:'good',ceilingCoats:2,ceilingSurfaceCondition:'good'});
  f.ownerPricing.tiers=[{name:'Premium',overrides:{paintWasteFactor:0.25,prepMaterialWasteFactor:0.2,paintingRates:{...f.ownerPricing.pricing.paintingRates}}},{name:'Zero',overrides:{paintWasteFactor:0,paintingRates:{...f.ownerPricing.pricing.paintingRates}}},{name:'Inherits',overrides:{paintingRates:{...f.ownerPricing.pricing.paintingRates}}}];
  const q=generateQuoteVNext(f),trim=name=>q.options.find(o=>o.tierName===name).lineItems.find(l=>l.calculation?.ratePath==='paintingRates.trimMaterialPerLFPerCoat').amountCents;
  assert.equal(trim('Premium'),6250);assert.equal(trim('Zero'),5000);assert.equal(trim('Inherits'),5500);
  const {readFile}=await import('node:fs/promises'),{fileURLToPath}=await import('node:url'),{build}=await import('esbuild'),{JSDOM}=await import('jsdom'),{convertPricebookMoney}=await import('../server/priceBookMoney.js');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const meta=applicationMetadata().services.find(s=>s.serviceType==='INTERIOR_PAINTING');
  const service=convertPricebookMoney(f.ownerPricing,'toDollars');
  const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'test-exports',setup(b){b.onLoad({filter:/client[\\/]src[\\/]pricebook\.jsx$/},async args=>({contents:(await readFile(args.path,'utf8'))+'\nexport {TierBuilder,PricingContext};',loader:'jsx'}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {TierBuilder,PricingContext} from './client/src/pricebook.jsx';import {offeringTierFields} from './client/src/offeringEditor.jsx';
      function App(){const [service,setService]=useState(window.initial);window.current=service;return <PricingContext.Provider value={service}><TierBuilder tiers={service.tiers} definitions={overrides=>offeringTierFields(window.meta,service,overrides)} onChange={tiers=>{const next={...service,tiers};window.current=next;setService(next);}}/></PricingContext.Provider>;}
      createRoot(document.getElementById('root')).render(<App/>);`}});
  const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window;
  w.eval('window.initial='+JSON.stringify(service)+';window.meta='+JSON.stringify(meta)+';window.structuredClone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));');
  w.eval(output.outputFiles[0].text);
  const text=()=>w.document.body.textContent;
  for(let i=0;i<500&&!/Premium tier: 25%/.test(text());i++)await new Promise(r=>setTimeout(r,10));
  assert.match(text(),/in the Premium tier: 25% \(Finish paint material waste/);
  assert.match(text(),/in the Zero tier: 0% \(Finish paint material waste/);
  assert.match(text(),/in the Inherits tier: 10% \(Finish paint material waste/);
  assert.match(text(),/in the Premium tier: 10% \(Primer material waste/);
  // Preparation material: the Premium override 20%; the Zero tier inherits the base value. Labor carries no note.
  assert.match(text(),/in the Premium tier: 20% \(Preparation material waste/);
  assert.match(text(),/in the Zero tier: \d+% \(Preparation material waste/);
  // The preparation labor row is followed directly by its Remove button: no allowance note.
  assert.match(text(),/good trim preparation labor per linear footRemove Trim prep labor/);
  assert.doesNotMatch(text(),/good trim preparation labor per linear footWaste allowance/);
  assert.doesNotMatch(text(),/Retained Painting rates/);
  // The allowance itself shows as a percent, not a raw 0.25.
  const inputs=[...w.document.querySelectorAll('input')].filter(i=>/Finish paint material waste/.test(i.getAttribute('aria-label')||''));
  assert.ok(inputs.some(i=>i.value==='25'),inputs.map(i=>i.value).join(','));
  // Clearing the Premium override: the tier inherits 10% again.
  const row=[...w.document.querySelectorAll('.override-row')].find(r=>r.querySelector('select')?.value==='paintWasteFactor'&&r.closest('.tier-row')?.textContent.includes('Premium'));
  const tierRows=[...w.document.querySelectorAll('.tier-row')];
  const premiumRow=[...tierRows[0].querySelectorAll('.override-row')].find(r=>r.querySelector('select')?.value==='paintWasteFactor');
  assert.ok(premiumRow||row,'Premium waste override row');
  (premiumRow||row).querySelector('button[aria-label="Remove override"]').click();
  for(let i=0;i<300&&w.current.tiers[0].overrides.paintWasteFactor!==undefined;i++)await new Promise(r=>setTimeout(r,10));
  for(let i=0;i<300&&/Premium tier: 25%/.test(text());i++)await new Promise(r=>setTimeout(r,10));
  assert.match(text(),/in the Premium tier: 10% \(Finish paint material waste/);
});

test('6: the conditional disclosure excludes only additional work beyond what the estimate includes',()=>{
  const q=priced(floor('laminate','tile',{},{existingFloorSound:'yes'},{overlay:true}),2040,true);
  assert.match(q.options[0].disclaimer,/Any additional removal, disposal, preparation, leveling, underlayment or moisture treatment needed beyond what this estimate includes is not included\./);
  assert.doesNotMatch(q.options[0].disclaimer,/Any removal, disposal, preparation/);
  assert.match(FLOOR_STAY_LABEL,/any additional removal/);
});
