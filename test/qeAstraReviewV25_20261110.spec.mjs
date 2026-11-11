import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
import {customerQuoteFields} from '../server/customerQuoteFields.js';
import {discloseQuoteScope} from '../server/src/quoteScopeDisclosure.js';
import {applicationServiceDefinition} from '../server/src/quoteDoneBridge.js';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {customerFieldVisible,withoutInapplicableFloorAnswers,FLOOR_SUPPORT_LABEL,FLOOR_STAY_LABEL} from '../server/scopeConfiguration.js';

// November 10, 2026: Astra's review of v25 (engine v26).
// Expected values worked out by hand before running:
// - 200 sq ft laminate: labor 200 x 3.00 x 1.10 = 660.00; material 200 x 5.00
//   x 1.08 = 1,080.00; total 1,740.00. Removal at 1.00 per sq ft adds 200.00:
//   1,940.00. A subfloor repair allowance of 20 measured sq ft at 4.00 adds
//   80.00: 2,020.00.
// - "No, check it at the site visit" reads exactly like Not sure: the same
//   price, with the construction check left for the site visit.
const L={laminateInstallInstructions:'[SYNTHETIC] Laminate X rev. 2025'};
const ALL={wood:true,resilient_sheet:true,resilient_tile_plank:true,laminate:true,ceramic_stone_tile:true,concrete:true};
const floor=(name,pricing={},answers={},type='FLOORING_INSTALL')=>{
  const f=flooring('laminate');f.serviceType=type;f.ownerPricing.serviceType=type;if(f.ownerPricing.origin)f.ownerPricing.origin={...f.ownerPricing.origin,serviceType:type};
  Object.assign(f.ownerPricing.pricing,{scopeDetails:{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}},...L,laminateFloatsOver:{...ALL},...pricing});
  if(name!=='none'){
    f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[name]:randomUUID()};
    f.ownerPricing.pricing.removalPerSqft={...(f.ownerPricing.pricing.removalPerSqft||{}),[name]:100};
  }
  f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:name,removalNeeded:false,underlaymentScopeConfirmed:true,...(type==='FLOORING_REPLACEMENT'?{subfloorIssues:false}:{}),...answers});
  if(name!=='none')f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:name,offeringId:f.ownerPricing.knownOfferings.existingFloorType[name]}};
  return f;
};
const sleepers={laminateFloatConditions:{no_sleeper_construction:true}},both={laminateFloatConditions:{no_sleeper_construction:true,wood_not_directly_over_concrete:true}};
const stay={removalNeeded:false,existingFloorSound:'yes'},remove={removalNeeded:true,removalAreaSqft:200};
const form=f=>customerQuoteFields({...f.ownerPricing,serviceType:f.serviceType},f.ownerPricing.pricing);
const shown=(fields,name,inputs)=>{const field=fields.find(x=>x.name===name);return !!field&&customerFieldVisible(field,inputs);};
const outcome=q=>q.resultType==='INSTANT_ESTIMATE_READY'
  ?(q.options[0].skippedAddons.includes(FLOOR_SUPPORT_LABEL)?'partial-support':q.options[0].skippedAddons.includes(FLOOR_STAY_LABEL)?'partial-stay':'ready')
  :q.missingCustomerFields?.length?'asks:'+q.missingCustomerFields.join(','):q.invalidCustomerFields?.length?'invalid:'+q.invalidCustomerFields.map(e=>e.field||e).join(','):'refused';

test('one No answers every construction condition: nothing more is asked, and the estimate is the full listed work',()=>{
  for(const [name,base,total,question] of [['oak',stay,1740,'woodFloorAssembly'],['oak',remove,1940,'woodFloorAssembly'],['ceramic_tile',stay,1740,'floorSupportConstruction'],['ceramic_tile',remove,1940,'floorSupportConstruction'],['none',{removalNeeded:false},1740,'floorSupportConstruction']]){
    const f=floor(name,both,{...base,floorConstructionKnown:'no'});
    const q=generateQuoteVNext(f);
    assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',name);
    assert.equal(q.options[0].midEstimate,total,name);
    assert.equal(outcome(q),base.removalNeeded===false&&name!=='none'?'partial-stay':'partial-support',name);
    assert.equal(shown(form(f),question,f.customerInputs),false,name+' detail not asked');
  }
});

test('a known construction is never lost: earlier answers, restored drafts and removal keep it',()=>{
  for(const [name,question] of [['oak','woodFloorAssembly'],['ceramic_tile','floorSupportConstruction']]){
    // A draft saved before the knowledge question: the detail answer alone decides.
    const draft=floor(name,sleepers,{...stay,[question]:'sleepers'});
    assert.equal(outcome(generateQuoteVNext(draft)),'refused',name);
    const fields=form(draft);
    const kept=withoutInapplicableFloorAnswers(fields,{...draft.customerInputs,...remove});
    assert.equal(kept[question],'sleepers',name+' kept on removal without the knowledge answer');
    assert.equal(withoutInapplicableFloorAnswers(fields,{...draft.customerInputs,floorConstructionKnown:'yes'})[question],'sleepers');
    // Yes plus the detail: refused.
    assert.equal(outcome(generateQuoteVNext(floor(name,sleepers,{...remove,floorConstructionKnown:'yes',[question]:'sleepers'}))),'refused');
    // The customer changes their own answer to No: the form drops the detail
    // with it; the server refuses the two together rather than choose one.
    assert.equal(Object.hasOwn(withoutInapplicableFloorAnswers(fields,{...draft.customerInputs,floorConstructionKnown:'no'}),question),false);
    assert.equal(outcome(generateQuoteVNext(floor(name,sleepers,{...stay,floorConstructionKnown:'no',[question]:'sleepers'}))),'invalid:'+question);
    // The earlier glue answer is still read while a wood floor stays.
  }
  assert.equal(outcome(generateQuoteVNext(floor('oak',{laminateFloatConditions:{wood_not_glued_to_concrete:true}},{...stay,woodAdheredToConcrete:'yes'}))),'refused');
});

test('the knowledge question is not asked where no construction condition applies',()=>{
  for(const [name,base] of [['oak',remove],['ceramic_tile',stay],['none',{removalNeeded:false}]]){
    const f=floor(name,{},base);
    assert.equal(shown(form(f),'floorConstructionKnown',f.customerInputs),false,name);
    assert.equal(outcome(generateQuoteVNext(f)),'ready',name);
  }
  // The glue condition alone, once the wood floor is removed.
  const glue=floor('oak',{laminateFloatConditions:{wood_not_glued_to_concrete:true}},remove);
  assert.equal(shown(form(glue),'floorConstructionKnown',glue.customerInputs),false);
});

test('the detail answers describe construction only, never a room location',()=>{
  const fields=form(floor('oak',both,stay));
  for(const name of ['woodFloorAssembly','floorSupportConstruction']){
    const field=fields.find(x=>x.name===name);assert.ok(field,name);
    const labels=Object.values(field.optionLabels||{}).join(' | ');
    assert.doesNotMatch(labels,/basement|crawlspace|upper floor|upstairs/i,name);
    assert.equal(field.optionLabels.joists,'A wood subfloor on joists or framing');
  }
  const known=fields.find(x=>x.name==='floorConstructionKnown');
  assert.deepEqual(known.optionLabels,{yes:'Yes',no:'No, check it at the site visit'});
});

test('an itemized subfloor repair allowance and the construction exclusion do not contradict each other',()=>{
  const f=floor('ceramic_tile',{...sleepers,subfloorAllowancePerSqft:400},{...remove,floorConstructionKnown:'no',subfloorIssues:true,subfloorRepairAreaSqft:20},'FLOORING_REPLACEMENT');
  const q=generateQuoteVNext(f);
  assert.equal(q.options[0].midEstimate,2020);
  assert.ok(q.options[0].lineItems.some(line=>line.name==='Subfloor repair allowance'&&line.amountCents===8000));
  const text=q.options[0].disclaimer;
  assert.match(text,/Any subfloor work it needs beyond the work listed in this estimate is not included\./);
  assert.doesNotMatch(text,/Any subfloor work it needs is not included/);
  assert.ok(q.options[0].skippedAddons.includes('Whether the floor construction under the new floor suits this product (any subfloor work it needs beyond the work listed in this estimate)'));
});

test('what the customer receives: a known construction is a complete estimate; No is an estimate for the selected work',()=>{
  const present=answers=>{const f=floor('ceramic_tile',sleepers,{...remove,...answers});const raw={...f.ownerPricing,serviceType:f.serviceType};
    return discloseQuoteScope(sanitizeForCustomerVNext(generateQuoteVNext(f)),raw,applicationServiceDefinition(raw,{defaults:{}}),{customerInputs:f.customerInputs},'r1',[]);};
  const known=present({floorConstructionKnown:'yes',floorSupportConstruction:'joists'});
  assert.equal(known.resultType,'INSTANT_ESTIMATE_READY');assert.equal(known.midEstimate,1940);
  const unknown=present({floorConstructionKnown:'no'});
  assert.equal(unknown.resultType,'PARTIAL_ESTIMATE_READY');
  assert.equal(unknown.pricedEstimate.midEstimate,1940);
  assert.deepEqual(unknown.additionalWork.map(item=>item.description),[FLOOR_SUPPORT_LABEL]);
  assert.equal(unknown.additionalWorkStatus,'ON_SITE_ESTIMATE_REQUIRED');
});

test('the real form: Yes shows the detail question, No does not, and changing back keeps nothing stale',async t=>{
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const f=floor('ceramic_tile',sleepers,stay),fields=form(f);
  const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},stdin:{resolveDir:root,loader:'jsx',contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {CustomerMeasurements} from './client/src/quoteDoneControls.jsx';
    function App(){const [value,setValue]=useState(window.initial);window.current=value;return <CustomerMeasurements fields={window.fields.filter(f=>['floorConstructionKnown','floorSupportConstruction'].includes(f.name))} scopeFields={window.fields} value={value} onChange={v=>{window.current=v;setValue(v);}}/>;}
    createRoot(document.getElementById('root')).render(<App/>);`}});
  const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;t.after(()=>w.close());
  w.eval(`window.initial=${JSON.stringify(f.customerInputs)};window.fields=${JSON.stringify(fields)};window.structuredClone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));`);
  w.eval(output.outputFiles[0].text);
  const until=async cond=>{for(let i=0;i<500&&!cond();i++)await new Promise(r=>setTimeout(r,10));};
  const selects=()=>[...w.document.querySelectorAll('select')];
  const pick=async(select,value)=>{select.value=value;select.dispatchEvent(new w.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,30));};
  await until(()=>selects().length>0);
  assert.equal(selects().length,1,'only the knowledge question at first');
  await pick(selects()[0],'yes');
  assert.equal(selects().length,2,'detail question after Yes');
  await pick(selects()[1],'sleepers');
  assert.equal(JSON.parse(JSON.stringify(w.current)).floorSupportConstruction,'sleepers');
  await pick(selects()[0],'no');
  assert.equal(selects().length,1);
  const current=JSON.parse(JSON.stringify(w.current));
  assert.equal(Object.hasOwn(current,'floorSupportConstruction'),false);
  assert.equal(outcome(generateQuoteVNext({...f,customerInputs:current})),'partial-stay');
});
