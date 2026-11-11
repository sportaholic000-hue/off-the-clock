import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {MEASUREMENT_CONTRACTS} from '../server/quote-engine-vnext/contracts.js';
import {offeringContract} from '../server/quote-engine-vnext/configuredOfferings.js';
import {flooringPricingDiagnostics} from '../server/quote-engine-vnext/flooringPricing.js';
import {PAINTING_RATES,activePaintingRateKeys} from '../server/quote-engine-vnext/surfacePricing.js';
import {customerQuoteFields} from '../server/customerQuoteFields.js';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {applicationMetadata,applicationStatus,withRenamedFloatConditions} from '../server/src/quoteDoneBridge.js';
import {customerFieldVisible,customerFieldForInputs,withoutInapplicableFloorAnswers,withoutDeselectedDependents,withoutDependentsOfClearedParent,DEPENDENT_ANSWERS,FLOOR_STAY_LABEL,FLOOR_SOUND_LABELS} from '../server/scopeConfiguration.js';

// November 10, 2026: Astra's review of v23 and her refinements. Expected values
// worked out by hand before running:
// - Flooring, 200 sq ft laminate: labor 200 x 3.00 x 1.10 = 660.00; material
//   200 x 5.00 x 1.08 = 1,080.00; total 1,740.00. Removal at 1.00 adds 200.00.
// - Itemized interior trim: 100 LF x 2 coats x 0.25 x 1.10 = 55.00; at 0.50 the
//   line is 100 x 2 x 0.50 x 1.10 = 110.00, so the quote rises by 55.00.
// - Exterior itemized at a 0% allowance: finish 500 sq ft x 2 coats x 0.30 =
//   300.00, primer 500 x 1 x 0.20 = 100.00, preparation 500 x 0.20 = 100.00;
//   material 500.00. A 50% allowance on all three adds 250.00: 2,425 -> 2,675.
// - Installed offerings: their installed prices decide the charge, so no
//   component price or waste allowance moves them (interior 3,800).
const L={laminateInstallInstructions:'[SYNTHETIC] Laminate X rev. 2025'},V={vinylPlankInstallInstructions:'[SYNTHETIC] Plank Y rev. 2025',vinylPlankInstallMethod:'floating'};
const floor=(product,name,pricing={},answers={},type='FLOORING_INSTALL')=>{
  const f=flooring(product);f.serviceType=type;f.ownerPricing.serviceType=type;if(f.ownerPricing.origin)f.ownerPricing.origin={...f.ownerPricing.origin,serviceType:type};
  Object.assign(f.ownerPricing.pricing,{scopeDetails:product==='laminate'?{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}}:{},...pricing});
  if(!f.ownerPricing.knownOfferings.existingFloorType[name])f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[name]:randomUUID()};
  f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:name,removalNeeded:false,...(product==='laminate'?{underlaymentScopeConfirmed:true}:{}),...(type==='FLOORING_REPLACEMENT'?{subfloorIssues:false}:{}),...answers});
  f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:name,offeringId:f.ownerPricing.knownOfferings.existingFloorType[name]}};
  return f;
};
const register=(f,...names)=>{for(const n of names)if(!f.ownerPricing.knownOfferings.existingFloorType[n])f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[n]:randomUUID()};return f;};
const outcome=q=>q.resultType==='INSTANT_ESTIMATE_READY'?(q.options[0].skippedAddons.includes(FLOOR_STAY_LABEL)?'partial':'ready'):q.missingCustomerFields?.length?'asks':'refused';
const form=f=>customerQuoteFields({...f.ownerPricing,serviceType:f.serviceType},f.ownerPricing.pricing);
const shown=(fields,name,inputs)=>{const field=fields.find(x=>x.name===name);return !!field&&customerFieldVisible(field,inputs);};
const keep={removalNeeded:false};

async function render(entry,globals){
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'test-exports',setup(b){b.onLoad({filter:/client[\\/]src[\\/]pricebook\.jsx$/},async args=>({contents:(await readFile(args.path,'utf8'))+'\nexport {TierBuilder,PricingContext};',loader:'jsx'}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:entry}});
  const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.eval(Object.entries(globals).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('')+'window.structuredClone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));');
  w.eval(output.outputFiles[0].text);
  return w;
}
const until=async(cond,n=500)=>{for(let i=0;i<n&&!cond();i++)await new Promise(r=>setTimeout(r,10));};

// ---- Finding 1: painting prices ----
const interior=(mode,extra={})=>{const f=offeringFixture('INTERIOR_PAINTING',mode);const P=f.ownerPricing.pricing,r=P.offeringRates;
  if(mode==='itemized')Object.assign(r,{prepLaborPerSqft_good:r.prepLaborPerSqft,prepMaterialPerSqft_good:r.prepMaterialPerSqft});
  Object.assign(f.customerInputs,{ceilingCoats:2,ceilingSurfaceCondition:'good',trimCoats:1,trimSurfaceCondition:'good'});Object.assign(P,extra);return f;};
const total=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);return q.options[0].midEstimate;};

test('1: painting component prices the pricing method does not read never move the quote, and active ones do',()=>{
  // Installed interior: neither component prices nor allowances decide the charge.
  for(const extra of [{paintingRates:{primerMaterialPerSqftPerCoat:20,trimMaterialPerLFPerCoat:25}},{paintingRates:{primerMaterialPerSqftPerCoat:2000,trimMaterialPerLFPerCoat:5000}},{paintWasteFactor:0,primerWasteFactor:0,prepMaterialWasteFactor:0},{paintWasteFactor:0.5,primerWasteFactor:0.5,prepMaterialWasteFactor:0.5}])
    assert.equal(total(interior('installed',extra)),3800,JSON.stringify(extra));
  // Itemized interior: wall primer comes from offeringRates, so the paintingRates primer is retained only.
  const base=total(interior('itemized',{paintingRates:{primerMaterialPerSqftPerCoat:20}}));
  assert.equal(total(interior('itemized',{paintingRates:{primerMaterialPerSqftPerCoat:2000}})),base);
  // The active trim component: 100 LF x 2 coats, rate 0.25 -> 0.50 at 10% adds 55.00.
  const trim=rate=>{const f=interior('itemized',{paintingRates:{trimLaborPerLFPerCoat:100,trimMaterialPerLFPerCoat:rate}});Object.assign(f.customerInputs,{trimIncluded:true,trimLengthLF:100,trimCoats:2});
    const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);return {total:q.options[0].midEstimate,line:q.options[0].lineItems.find(l=>l.calculation?.ratePath==='paintingRates.trimMaterialPerLFPerCoat').amountCents};};
  const low=trim(25),high=trim(50);
  assert.equal(low.line,5500);assert.equal(high.line,11000);assert.equal(high.total-low.total,55);
  // Exterior itemized: no paintingRates entry is read; the allowances are (2,425 -> 2,675).
  const exterior=extra=>{const f=offeringFixture('EXTERIOR_PAINTING','itemized');Object.assign(f.ownerPricing.pricing,{paintWasteFactor:0,primerWasteFactor:0,prepMaterialWasteFactor:0},extra);return total(f);};
  assert.equal(exterior({}),2425);
  assert.equal(exterior({paintingRates:Object.fromEntries(Object.keys(PAINTING_RATES).map(k=>[k,2000]))}),2425);
  assert.equal(exterior({paintWasteFactor:0.5,primerWasteFactor:0.5,prepMaterialWasteFactor:0.5}),2675);
  // The shared rule the editors use.
  assert.deepEqual(activePaintingRateKeys('INTERIOR_PAINTING',{}),Object.keys(PAINTING_RATES));
  assert.deepEqual(activePaintingRateKeys('INTERIOR_PAINTING',{offeringMode:'itemized'}),Object.keys(PAINTING_RATES).filter(k=>k.startsWith('trim')));
  assert.equal(activePaintingRateKeys('INTERIOR_PAINTING',{offeringMode:'itemized'}).length,10);
  for(const [type,mode] of [['INTERIOR_PAINTING','installed'],['EXTERIOR_PAINTING','itemized'],['EXTERIOR_PAINTING','installed'],['EXTERIOR_PAINTING',undefined]])assert.deepEqual(activePaintingRateKeys(type,{offeringMode:mode}),[],type+' '+mode);
});

test('1: the real tier and base editors offer only the prices the quote reads, and show the rest as unused',async t=>{
  const {convertPricebookMoney}=await import('../server/priceBookMoney.js');
  const tierEntry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {TierBuilder,PricingContext} from './client/src/pricebook.jsx';import {offeringTierFields} from './client/src/offeringEditor.jsx';
    function App(){const [service,setService]=useState(window.initial);return <PricingContext.Provider value={service}><TierBuilder tiers={service.tiers} definitions={overrides=>offeringTierFields(window.meta,service,overrides)} onChange={tiers=>setService({...service,tiers})}/></PricingContext.Provider>;}
    createRoot(document.getElementById('root')).render(<App/>);`;
  const baseEntry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {SurfacePricingEditor} from './client/src/surfacePricingEditor.jsx';
    function App(){const [service,setService]=useState(window.initial);return <SurfacePricingEditor service={service} onChange={setService}/>;}
    createRoot(document.getElementById('root')).render(<App/>);`;
  const unusedHelp=/Saved, but not used by this pricing method/;
  for(const [type,mode] of [['INTERIOR_PAINTING','installed'],['INTERIOR_PAINTING','itemized'],['EXTERIOR_PAINTING','itemized']]){
    const f=offeringFixture(type,mode);
    f.ownerPricing.tiers=[{name:'Probe',overrides:{paintWasteFactor:0.25,paintingRates:{primerMaterialPerSqftPerCoat:2000,trimMaterialPerLFPerCoat:25}}}];
    f.ownerPricing.pricing.paintingRates={primerMaterialPerSqftPerCoat:20,trimMaterialPerLFPerCoat:25};
    const service=convertPricebookMoney(f.ownerPricing,'toDollars'),meta=applicationMetadata().services.find(s=>s.serviceType===type);
    const tier=await render(tierEntry,{initial:service,meta});t.after(()=>tier.close());
    const text=()=>tier.document.body.textContent;
    await until(()=>/Additional painting component prices/.test(text())&&/Saved, but not used|Waste allowance applied/.test(text()));
    const label=k=>PAINTING_RATES[k];
    // The unused primer price is read-only with the unused help, and has no allowance note.
    assert.match(text(),unusedHelp,type+' '+mode);
    assert.doesNotMatch(text(),new RegExp(label('primerMaterialPerSqftPerCoat')+'Waste allowance'),type+' '+mode);
    const trimActive=type==='INTERIOR_PAINTING'&&mode==='itemized';
    if(trimActive)assert.match(text(),/Waste allowance applied to this price in the Probe tier: 25% \(Finish paint material waste/);
    else assert.doesNotMatch(text(),/Waste allowance applied to this price/,type+' '+mode);
    // Installed pricing: the allowance is shown as unused configuration, not as a percent input.
    const allowanceInputs=[...tier.document.querySelectorAll('input')].filter(i=>/Finish paint material waste/.test(i.getAttribute('aria-label')||''));
    if(mode==='installed'){assert.equal(allowanceInputs.length,0);assert.match(text(),/25%\. Saved, but not used by installed pricing/);}
    else assert.ok(allowanceInputs.some(i=>i.value==='25'));
    // Base editor: rows only for prices the method reads; the saved unused one is read-only.
    const base=await render(baseEntry,{initial:service});t.after(()=>base.close());
    const btext=()=>base.document.body.textContent;
    await until(()=>btext().length>0);
    const editable=[...base.document.querySelectorAll('input')].map(i=>i.getAttribute('aria-label'));
    for(const key of Object.keys(PAINTING_RATES))assert.equal(editable.includes(label(key)),activePaintingRateKeys(type,f.ownerPricing.pricing).includes(key),type+' '+mode+' '+key);
    assert.match(btext(),unusedHelp,type+' '+mode);
    if(!trimActive)assert.doesNotMatch(btext(),/Trim primer coats included/);
  }
});

// ---- Finding 2: dependent answers ----
const contractFor=type=>type==='FENCING_REPLACEMENT_OFFERING'?offeringContract('FENCING_REPLACEMENT',offeringFixture('FENCING_REPLACEMENT').ownerPricing.pricing):MEASUREMENT_CONTRACTS[type];
const SAMPLE={partialPercent:50,partialAreaSqft:500,removalAreaSqft:200,floorLevelingSqft:50,subfloorRepairAreaSqft:20,ceilingAreaSqft:100,ceilingCoats:2,trimLengthLF:100,gateWidthTotalLF:4,removalLengthLF:50,adjoiningEdgeLF:10,demolitionAreaSqft:100,placementMethod:'pump',mulchDepth:3,bedSqft:100,edgeLF:50,mulchYards:2,mulchType:'cedar',edgingLengthLF:40,usableTopsoilDepthInches:2,leakSourceIdentified:true};

test('2: every shared dependency is one the server rejects, and the cleanup removes exactly that',()=>{
  const types=[...Object.keys(MEASUREMENT_CONTRACTS),'FENCING_REPLACEMENT_OFFERING'];
  for(const {parent,off,dependents} of DEPENDENT_ANSWERS){
    const owners=types.filter(type=>{const c=contractFor(type);return c?.fields?.[parent]&&dependents.some(d=>c.fields[d]);});
    assert.ok(owners.length,parent+' belongs to at least one service');
    for(const type of owners){
      const contract=contractFor(type),fields=Object.keys(contract.fields).map(name=>({name}));
      for(const value of off)for(const dependent of dependents.filter(d=>contract.fields[d])){
        const inputs={[parent]:value,[dependent]:SAMPLE[dependent],unrelatedMeasurement:7};
        // Pricing that offers the sample placement method, so only the parent decides.
        const pricing=dependent==='placementMethod'?{placementFlat:{[SAMPLE.placementMethod]:10000}}:{};
        assert.ok((contract.crossValidate?.(inputs,pricing)||[]).some(e=>e.field===dependent),type+' rejects '+dependent+' with '+parent+'='+value);
        if(dependent==='placementMethod')assert.equal((contract.crossValidate?.({...inputs,chuteAccess:'no'},pricing)||[]).some(e=>e.field===dependent),false,'accepted when the chute cannot reach');
        const cleaned=withoutDeselectedDependents(fields,inputs);
        assert.equal(Object.hasOwn(cleaned,dependent),false,type+' '+dependent);
        assert.equal(cleaned.unrelatedMeasurement,7);
        assert.equal((contract.crossValidate?.(cleaned,pricing)||[]).some(e=>e.field===dependent),false,type+' accepts the cleaned answers');
      }
      // Unanswered parent, or a parent the form does not ask: nothing is removed.
      const kept={...Object.fromEntries(dependents.map(d=>[d,SAMPLE[d]]))};
      assert.deepEqual(withoutDeselectedDependents(fields,kept),kept);
      assert.deepEqual(withoutDeselectedDependents([],{[parent]:off[0],...kept}),{[parent]:off[0],...kept});
    }
  }
  // A parent the customer clears (back to unanswered) takes its dependents; one never answered keeps them.
  assert.deepEqual(withoutDependentsOfClearedParent('subfloorIssues',{subfloorRepairAreaSqft:30,roomCount:2}),{roomCount:2});
  assert.deepEqual(withoutDependentsOfClearedParent('subfloorIssues',{subfloorIssues:true,subfloorRepairAreaSqft:30}),{subfloorIssues:true,subfloorRepairAreaSqft:30});
  assert.deepEqual(withoutDeselectedDependents([{name:'subfloorIssues'}],{subfloorRepairAreaSqft:30}),{subfloorRepairAreaSqft:30});
  // Related confirmations go with the answer.
  const c=withoutDeselectedDependents([{name:'mulchNeeded'}],{mulchNeeded:false,mulchType:'cedar',confirmedFacts:{mulchType:{status:'identified'},other:{status:'identified'}}});
  assert.deepEqual(c,{mulchNeeded:false,confirmedFacts:{other:{status:'identified'}}});
});

test('2: no server check of this kind is left without a cleanup (found by code shape, not wording)',async()=>{
  const sources=await Promise.all(['../server/quote-engine-vnext/contracts.js','../server/quote-engine-vnext/configuredOfferings.js','../server/quote-engine-vnext/surfacePricing.js','../server/quote-engine-vnext/templates.js'].map(p=>readFile(new URL(p,import.meta.url),'utf8')));
  const pairs=new Set();
  for(const source of sources)for(const m of source.replace(/\s+/g,'').matchAll(/c\.([a-zA-Z]+)(===|!==)(false|true|'[a-z_]+'|0)&&c\.([a-zA-Z]+)!==undefined/g))pairs.add(m[1]+'>'+m[4]);
  const covered=new Set(DEPENDENT_ANSWERS.flatMap(({parent,dependents})=>dependents.map(d=>parent+'>'+d)));
  // Method switches the form already clears on change (both methods' answers), and
  // the roof scope's partial-percent agreement check (a consistency check, not a deselection).
  const handledElsewhere=new Set(['serviceScope>partialPercent','areaInputMethod>buildingPerimeterFeet','areaInputMethod>rooms','newFlooringType>carpetRooms']);
  const missing=[...pairs].filter(p=>!covered.has(p)&&!handledElsewhere.has(p));
  assert.deepEqual(missing,[]);
});

const formEntry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {CustomerMeasurements} from './client/src/quoteDoneControls.jsx';
  function App(){const [value,setValue]=useState(window.initial);window.current=value;return <CustomerMeasurements fields={window.fields.filter(f=>f.name===window.parent)} scopeFields={window.fields} value={value} onChange={v=>{window.current=v;setValue(v);}}/>;}
  createRoot(document.getElementById('root')).render(<App/>);`;
async function choose(w,value){
  let select;await until(()=>select=w.document.querySelector('select'));
  assert.ok(select,'parent control rendered');
  const option=[...select.options].find(o=>o.value===String(value));assert.ok(option,'option '+value+' in '+[...select.options].map(o=>o.value));
  select.value=option.value;select.dispatchEvent(new w.Event('change',{bubbles:true}));
  await new Promise(r=>setTimeout(r,30));
}

test('2: removal -> keep -> removal through the real form, both flooring services, with the final payload',async t=>{
  for(const type of ['FLOORING_INSTALL','FLOORING_REPLACEMENT']){
    const f=floor('laminate','sheet_vinyl',{removalPerSqft:{sheet_vinyl:100}},{removalNeeded:true,removalAreaSqft:200},type);
    const fields=form(f);
    assert.equal(generateQuoteVNext(f).options[0].midEstimate,1940,type);
    const w=await render(formEntry,{initial:f.customerInputs,fields,parent:'removalNeeded'});t.after(()=>w.close());
    await choose(w,false);
    assert.equal(w.current.removalNeeded,false,type);
    assert.equal(Object.hasOwn(w.current,'removalAreaSqft'),false,type);
    // The final payload the submission sends, from a restored draft that still has the area.
    // Submissions arrive as JSON; the window's objects are converted the same way.
    const current=()=>JSON.parse(JSON.stringify(w.current));
    const restored={...current(),removalAreaSqft:200,existingFloorSound:'yes'};
    const payload=withoutInapplicableFloorAnswers(fields,withoutDeselectedDependents(fields,restored));
    assert.equal(Object.hasOwn(payload,'removalAreaSqft'),false);
    {const q=generateQuoteVNext({...f,customerInputs:payload});assert.equal(q.resultType,"INSTANT_ESTIMATE_READY",type+" "+q.reviewReason+" "+JSON.stringify(q.missingCustomerFields||q.invalidFields||""));assert.equal(q.options[0].midEstimate,1740,type);}
    assert.equal(generateQuoteVNext({...f,customerInputs:restored}).resultType,'ESTIMATE_REQUIRES_REVIEW',type);
    // Back to removal: the area is asked again, unanswered; the soundness answer goes.
    await choose(w,true);
    assert.equal(w.current.removalNeeded,true);assert.equal(w.current.removalAreaSqft,undefined);
    assert.equal(generateQuoteVNext({...f,customerInputs:{...current(),removalAreaSqft:200}}).options[0].midEstimate,1940,type);
  }
});

test('2: Astra\'s three transitions through the real form drop the answer the server rejects',async t=>{
  const cases=[
    ['LANDSCAPING_MULCH','bedCondition','clean','bedSqft',{bedCondition:'weeds',bedSqft:100}],
    ['LANDSCAPING_PLANTING','bedCondition','clean','bedSqft',{bedCondition:'weeds',bedSqft:100}],
    ['LANDSCAPING_MULCH','edgingNeeded',false,'edgeLF',{edgingNeeded:true,edgeLF:50}],
    ['FENCING_REPLACEMENT_OFFERING','oldFenceRemoval',false,'removalLengthLF',{oldFenceRemoval:true,removalLengthLF:50}]
  ];
  for(const [type,parent,value,dependent,initial] of cases){
    const contract=contractFor(type),fields=Object.entries(contract.fields).map(([name,d])=>({name,...d}));
    const values=contract.fields[parent].values;
    const start={...initial,...(values&&!values.includes(initial[parent])?{[parent]:values.find(v=>v!==value)}:{}),keepMe:3};
    const w=await render(formEntry,{initial:start,fields,parent});t.after(()=>w.close());
    await choose(w,value);
    assert.equal(w.current[parent],value,type);
    assert.equal(Object.hasOwn(w.current,dependent),false,type+' '+dependent);
    assert.equal(w.current.keepMe,3);
    assert.equal((contract.crossValidate?.(w.current,{})||[]).some(e=>e.field===dependent),false,type);
  }
});

// ---- Finding 3: concrete and unclassified wording ----
test('3: the soundness question follows the floor material; a No on concrete is about surface preparation',()=>{
  const f=register(floor('laminate','slab_floor',{...L,existingFloorSubstrate:{slab_floor:'concrete'},laminateFloatsOver:{concrete:true,wood:true}}),'concrete','hardwood','mystery_floor');
  const field=form(f).find(x=>x.name==='existingFloorSound');
  const label=name=>customerFieldForInputs(field,{removalNeeded:false,existingFloorType:name}).label;
  assert.equal(label('slab_floor'),FLOOR_SOUND_LABELS.concrete);
  assert.equal(label('concrete'),FLOOR_SOUND_LABELS.concrete);
  assert.equal(label('hardwood'),FLOOR_SOUND_LABELS.attached);
  assert.equal(label('mystery_floor'),FLOOR_SOUND_LABELS.neutral);
  assert.doesNotMatch(FLOOR_SOUND_LABELS.concrete,/glued|nailed/);assert.doesNotMatch(FLOOR_SOUND_LABELS.neutral,/glued|nailed/);
  assert.match(customerFieldForInputs(field,{removalNeeded:false,existingFloorType:'concrete'}).details.join(' '),/Moisture and exact flatness are checked on site/);
  for(const name of ['slab_floor','concrete']){
    assert.equal(generateQuoteVNext(floor('laminate',name,{...L,existingFloorSubstrate:{slab_floor:'concrete'},laminateFloatsOver:{concrete:true}},{existingFloorSound:'yes'})).options[0].midEstimate,1740);
    const no=generateQuoteVNext(floor('laminate',name,{...L,existingFloorSubstrate:{slab_floor:'concrete'},laminateFloatsOver:{concrete:true}},{existingFloorSound:'no'}));
    assert.equal(no.resultType,'ESTIMATE_REQUIRES_REVIEW');
    assert.match(no.reviewReason,/surface may need preparation or repair/);
    assert.doesNotMatch(no.reviewReason,/come out|damage|replace/);
    const unsure=generateQuoteVNext(floor('laminate',name,{...L,existingFloorSubstrate:{slab_floor:'concrete'},laminateFloatsOver:{concrete:true}},{existingFloorSound:'not_sure'}));
    assert.match(unsure.reviewReason,/on-site check/);
  }
  // Other floors keep their wording and outcome.
  assert.match(generateQuoteVNext(floor('laminate','hardwood',{...L,laminateFloatsOver:{wood:true}},{existingFloorSound:'no'})).reviewReason,/loose, cushioned or floating floor/);
});

// ---- Finding 4: wood construction ----
const WOOD_EXPECTED={
  wood_not_glued_to_concrete:{joists:'ready',glued_to_concrete:'refused',direct_on_concrete:'ready',sleepers:'ready',not_sure:'partial'},
  wood_not_directly_over_concrete:{joists:'ready',glued_to_concrete:'refused',direct_on_concrete:'refused',sleepers:'partial',not_sure:'partial'},
  no_sleeper_construction:{joists:'ready',glued_to_concrete:'ready',direct_on_concrete:'ready',sleepers:'refused',not_sure:'partial'}
};
test('4: each wood restriction alone, for both floating products, and in combination',()=>{
  for(const [product,rules] of [['laminate',{...L}],['vinyl_plank',{...V}]]){
    const over=product==='laminate'?'laminateFloatsOver':'vinylPlankFloatsOver',set=product==='laminate'?'laminateFloatConditions':'vinylPlankFloatConditions';
    for(const [condition,expected] of Object.entries(WOOD_EXPECTED)){
      const pricing={...rules,[over]:{wood:true},[set]:{[condition]:true}};
      // Asked first whether the customer knows; the wood question follows a Yes.
      assert.deepEqual(generateQuoteVNext(floor(product,'plywood',{...pricing,existingFloorSubstrate:{plywood:'wood'}},{existingFloorSound:'yes'})).missingCustomerFields,['floorConstructionKnown'],product+' '+condition);
      assert.deepEqual(generateQuoteVNext(floor(product,'plywood',{...pricing,existingFloorSubstrate:{plywood:'wood'}},{existingFloorSound:'yes',floorConstructionKnown:'yes'})).missingCustomerFields,['woodFloorAssembly'],product+' '+condition);
      for(const [answer,result] of Object.entries(expected)){
        const q=generateQuoteVNext(floor(product,'plywood',{...pricing,existingFloorSubstrate:{plywood:'wood'}},{existingFloorSound:'yes',woodFloorAssembly:answer}));
        assert.equal(outcome(q),result,product+' '+condition+' '+answer);
        // Both products: labor 200 x 3.00 x 1.10 = 660.00; material 216 x 5.00 = 1,080.00.
        if(result==='ready'||result==='partial')assert.equal(q.options[0].midEstimate,1740,product+' '+condition+' '+answer);
        // The glue condition is about the covering, which removal takes away;
        // the two construction conditions are about what the floor is built
        // on, so their refusal never says removing the old floor is enough.
        if(result==='refused')assert.match(q.reviewReason,condition==='wood_not_glued_to_concrete'?/has to come out first/:/construction \(.*including whether removing the existing floor is enough/);
      }
    }
    // Astra's case: plywood fastened directly over concrete, under the broad restriction.
    const broad={...rules,existingFloorSubstrate:{plywood:'wood'},[over]:{wood:true},[set]:{wood_not_directly_over_concrete:true}};
    assert.match(generateQuoteVNext(floor(product,'plywood',broad,{existingFloorSound:'yes',woodFloorAssembly:'direct_on_concrete'})).reviewReason,/laid directly over concrete/);
    // A suspended floor above a basement is not on concrete.
    assert.equal(outcome(generateQuoteVNext(floor(product,'plywood',broad,{existingFloorSound:'yes',woodFloorAssembly:'joists'}))),'ready');
    // All three: a known violation wins over another unresolved condition and over a blank list.
    const all={wood_not_glued_to_concrete:true,wood_not_directly_over_concrete:true,no_sleeper_construction:true};
    assert.match(generateQuoteVNext(floor(product,'oak',{...rules,[over]:{wood:true},[set]:all},{existingFloorSound:'yes',woodFloorAssembly:'sleepers'})).reviewReason,/sleeper construction/);
    assert.equal(outcome(generateQuoteVNext(floor(product,'oak',{...rules,[set]:all},{existingFloorSound:'yes',woodFloorAssembly:'glued_to_concrete'}))),'refused');
    assert.equal(outcome(generateQuoteVNext(floor(product,'oak',{...rules,[over]:{wood:true},[set]:all},{existingFloorSound:'yes',woodFloorAssembly:'joists'}))),'ready');
    assert.equal(outcome(generateQuoteVNext(floor(product,'oak',{...rules,[over]:{wood:true},[set]:all},{existingFloorSound:'yes',woodFloorAssembly:'not_sure'}))),'partial');
  }
});

// ---- Finding 5: earlier settings and answers ----
test('5: the earlier glue-only setting and answer keep exactly their meaning, and the owner is told',()=>{
  const old={...L,laminateFloatsOver:{wood:true},laminateFloatConditions:{wood_not_on_concrete:true}};
  assert.deepEqual(flooringPricingDiagnostics(old),[]);
  assert.equal(outcome(generateQuoteVNext(floor('laminate','oak',old,{existingFloorSound:'yes',woodAdheredToConcrete:'no'}))),'ready');
  assert.equal(outcome(generateQuoteVNext(floor('laminate','oak',old,{existingFloorSound:'yes',woodAdheredToConcrete:'yes'}))),'refused');
  assert.equal(outcome(generateQuoteVNext(floor('laminate','oak',old,{existingFloorSound:'yes',woodAdheredToConcrete:'not_sure'}))),'partial');
  // An old No says nothing about the broader restrictions: the construction is still asked.
  for(const condition of ['wood_not_directly_over_concrete','no_sleeper_construction'])
    assert.deepEqual(generateQuoteVNext(floor('laminate','oak',{...L,laminateFloatsOver:{wood:true},laminateFloatConditions:{[condition]:true}},{existingFloorSound:'yes',woodAdheredToConcrete:'no'})).missingCustomerFields,['floorConstructionKnown'],condition);
  // An old Yes (glued directly to concrete) is a construction every condition decides.
  assert.equal(outcome(generateQuoteVNext(floor('laminate','oak',{...L,laminateFloatsOver:{wood:true},laminateFloatConditions:{no_sleeper_construction:true}},{existingFloorSound:'yes',woodAdheredToConcrete:'yes'}))),'ready');
  // The form keeps an old answer only while the new question applies and is unanswered.
  const f=floor('laminate','oak',{...L,laminateFloatsOver:{wood:true},laminateFloatConditions:{wood_not_glued_to_concrete:true}});
  const fields=form(f);
  assert.equal(fields.some(x=>x.name==='woodAdheredToConcrete'),false);
  assert.equal(withoutInapplicableFloorAnswers(fields,{...keep,newFlooringType:'laminate',existingFloorType:'oak',woodAdheredToConcrete:'no'}).woodAdheredToConcrete,'no');
  assert.equal(Object.hasOwn(withoutInapplicableFloorAnswers(fields,{...keep,newFlooringType:'laminate',existingFloorType:'oak',woodAdheredToConcrete:'no',woodFloorAssembly:'joists'}),'woodAdheredToConcrete'),false);
  // The bridge carries the setting under its new name (the editor shows and saves it) and tells the owner.
  const g=floor('laminate','oak',old);g.ownerPricing.tiers=[{name:'Best',overrides:{vinylPlankFloatConditions:{wood_not_on_concrete:false}}}];
  const raw=structuredClone(g.ownerPricing),book={services:[raw],defaults:{currency:'CAD',...g.businessDefaults}};
  const status=applicationStatus(raw,book);
  assert.ok(status.statusNotices.some(n=>/saved under its earlier name, wood not on concrete/.test(n)));
  // The editor's read (readApplicationBook) and the engine's projection both carry the new name; the saved record is untouched.
  const shownToEditor=withRenamedFloatConditions(raw);
  assert.deepEqual(shownToEditor.pricing.laminateFloatConditions,{wood_not_glued_to_concrete:true});
  assert.deepEqual(shownToEditor.tiers[0].overrides.vinylPlankFloatConditions,{wood_not_glued_to_concrete:false});
  assert.deepEqual(raw.pricing.laminateFloatConditions,{wood_not_on_concrete:true});
  const rootSaved=withRenamedFloatConditions({serviceType:'FLOORING_INSTALL',laminateFloatConditions:{wood_not_on_concrete:true,sheet_vinyl_single_layer:true}});
  assert.deepEqual(rootSaved.laminateFloatConditions,{sheet_vinyl_single_layer:true,wood_not_glued_to_concrete:true});
  // Once saved under the new name, the notice is gone.
  assert.equal(applicationStatus(shownToEditor,{...book,services:[shownToEditor]}).statusNotices.some(n=>/earlier name/.test(n)),false);
});

// ---- Finding 6: per-option visibility ----
test('6: each option decides its own questions; unrelated tiers never combine into one',()=>{
  // Astra's case: base glue-down; one tier floats, another turns the wood condition on.
  const v=floor('vinyl_plank','hardwood',{...V,vinylPlankInstallMethod:'glue_down'});
  v.ownerPricing.tiers=[{name:'Floating',overrides:{vinylPlankInstallMethod:'floating'}},{name:'Glued',overrides:{vinylPlankFloatConditions:{wood_not_glued_to_concrete:true}}}];
  // The customer has said they know what is under the floor, so the wood question can show.
  const wood={...keep,newFlooringType:'vinyl_plank',existingFloorType:'hardwood',floorConstructionKnown:'yes'};
  assert.equal(shown(form(v),'woodFloorAssembly',wood),false);
  v.ownerPricing.tiers[0].overrides.vinylPlankFloatConditions={wood_not_glued_to_concrete:true};
  assert.equal(shown(form(v),'woodFloorAssembly',wood),true);
  // A single nested substrate override keeps the inherited entries.
  const n=register(floor('laminate','hardwood',{...L,laminateFloatsOver:{wood:true,resilient_sheet:true},laminateFloatConditions:{sheet_vinyl_single_layer:true,wood_not_glued_to_concrete:true}}),'sheet_vinyl');
  n.ownerPricing.tiers=[{name:'Best',overrides:{laminateFloatsOver:{resilient_sheet:false}}}];
  const lam=name=>({...keep,newFlooringType:'laminate',existingFloorType:name,floorConstructionKnown:'yes'});
  assert.equal(shown(form(n),'woodFloorAssembly',lam('hardwood')),true);
  assert.equal(shown(form(n),'existingFloorLayers',lam('sheet_vinyl')),false);
  // A single condition override keeps the other inherited conditions.
  const c=register(floor('laminate','hardwood',{...L,laminateFloatsOver:{wood:true,resilient_sheet:true},laminateFloatConditions:{sheet_vinyl_single_layer:true}}),'sheet_vinyl');
  c.ownerPricing.tiers=[{name:'Best',overrides:{laminateFloatConditions:{wood_not_glued_to_concrete:true}}}];
  assert.equal(shown(form(c),'woodFloorAssembly',lam('hardwood')),true);
  assert.equal(shown(form(c),'existingFloorLayers',lam('sheet_vinyl')),true);
  // Tier-only condition, and explicit false in that tier.
  const t=floor('laminate','hardwood',{...L,laminateFloatsOver:{wood:true}});
  t.ownerPricing.tiers=[{name:'Good',overrides:{}},{name:'Best',overrides:{laminateFloatConditions:{wood_not_directly_over_concrete:true}}}];
  assert.equal(shown(form(t),'woodFloorAssembly',lam('hardwood')),true);
  t.ownerPricing.tiers[1].overrides.laminateFloatsOver={wood:false};
  assert.equal(shown(form(t),'woodFloorAssembly',lam('hardwood')),false);
  // Required fields match the form: every question an option needs is shown, and
  // an answer only one tier uses is accepted by the other without changing it.
  t.ownerPricing.tiers[1].overrides.laminateFloatsOver={wood:true};
  t.customerInputs={...t.customerInputs,existingFloorSound:'yes'};
  const fields=form(t);
  for(const option of t.ownerPricing.tiers){
    const single={...t,ownerPricing:{...t.ownerPricing,tiers:[option]}};
    for(const name of generateQuoteVNext(single).missingCustomerFields||[])assert.equal(shown(fields,name,t.customerInputs),true,option.name+' '+name);
  }
  const answered=generateQuoteVNext({...t,customerInputs:{...t.customerInputs,woodFloorAssembly:'joists'}});
  assert.deepEqual(answered.options.map(o=>[o.tierName,o.midEstimate]),[['Good',1740],['Best',1740]]);
  const violated=generateQuoteVNext({...t,customerInputs:{...t.customerInputs,woodFloorAssembly:'direct_on_concrete'}});
  assert.deepEqual(violated.options.map(o=>[o.tierName,o.midEstimate]),[['Good',1740]]);
});

// ---- Finding 7: help and comments ----
test('7: the help separates compatibility from an overlay price, and stale comments are gone',async()=>{
  const meta=applicationMetadata().services.find(s=>s.serviceType==='FLOORING_INSTALL');
  const help=[...meta.fields,...(meta.class2Fields||[]),...(meta.interviewFields||[])].find(f=>f.field==='vinylPlankInstallMethod')?.help||'';
  assert.match(help,/substrates and conditions you set for it decide that, and a compatible install quotes without an overlay price/);
  assert.match(help,/An overlay or preparation price is separately priced work; it never makes an incompatible install quote/);
  assert.doesNotMatch(help,/without your overlay rule/);
  const source=await readFile(new URL('../server/scopeConfiguration.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/overlay rule decides, as before|Laminate always\s*\/\/\s*floats|needs the owner's overlay rule/);
  const contracts=await readFile(new URL('../server/quote-engine-vnext/contracts.js',import.meta.url),'utf8');
  assert.doesNotMatch(contracts,/quotes as standard once the owner says the plank floats/);
});
