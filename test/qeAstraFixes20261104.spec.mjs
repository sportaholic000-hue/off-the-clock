import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
import {editCarpetPriceUnit,editTierCarpetPriceUnit,starterSuggestionProblem} from '../client/src/pricebookEditing.js';
import {convertCarpetPrice} from '../server/carpetPriceUnits.js';
import {suggestStarterBook,interpretInterviewAnswer,starterCurrency} from '../server/src/priceBookAI.js';

// November 4, 2026: Astra audit F01, F07, F08, F09. Expected values were worked
// out by hand before the run. The fixtures store prices in cents; the editor
// converts whatever unit it holds, and 9 sq ft = 1 sq yd either way.
//
// 200 sq ft of carpet: labor 200 x 3.00 x 1.10 = 660.00; material 220 x 5.00 =
// 1,100.00 (10% waste) = 1,760.00. Tile is never touched by a carpet change.
function carpetBook(tiers,pricing={}){
  const f=flooring('carpet',200);delete f.ownerPricing.pricing.perStepPrice;
  Object.assign(f.customerInputs,{underlaymentScopeConfirmed:true});
  Object.assign(f.ownerPricing.pricing,{scopeDetails:{floor_underlayment_carpet:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}},...pricing});
  f.ownerPricing.pricing.laborPerSqft={...f.ownerPricing.pricing.laborPerSqft,tile:450};
  f.ownerPricing.tiers=tiers;return f;
}
const mids=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);return q.options.map(o=>o.midEstimate);};
const withService=(f,service)=>({...f,ownerPricing:service});
const priced=(service,field)=>service.pricing[field];

// A service holds at most three tiers, so the five tier shapes use two books.
test('F01: a base unit switch keeps every tier quote, both directions and repeated',()=>{
  const shapes=[
    {name:'Own yard',overrides:{carpetPriceUnit:'square_yard',laborPerSqft:{carpet:2700},materialPerSqft:{carpet:4500}}},
    {name:'Own foot',overrides:{carpetPriceUnit:'square_foot',laborPerSqft:{carpet:300},materialPerSqft:{carpet:500}}},
    {name:'Inherits unit, own labor',overrides:{laborPerSqft:{carpet:300}}},
    {name:'Inherits unit, own material',overrides:{materialPerSqft:{carpet:500}}},
    {name:'Own foot, inherits prices',overrides:{carpetPriceUnit:'square_foot'}}];
  for(const tiers of [shapes.slice(0,3),shapes.slice(3)]){
    const f=carpetBook(tiers),before=structuredClone(f.ownerPricing),all=tiers.map(()=>1760);
    assert.deepEqual(mids(f),all);
    const yard=editCarpetPriceUnit(f.ownerPricing,'square_yard');
    // Base 3.00/5.00 per sq ft = 27.00/45.00 per sq yd; tile 4.50 untouched.
    assert.equal(priced(yard,'laborPerSqft').carpet,2700);assert.equal(priced(yard,'materialPerSqft').carpet,4500);assert.equal(priced(yard,'laborPerSqft').tile,450);
    for(const [i,tier] of tiers.entries()){
      const after=yard.tiers[i].overrides;
      if(tier.name.startsWith('Own yard')||tier.name==='Own foot')assert.deepEqual(after,tier.overrides);
      if(tier.name==='Inherits unit, own labor')assert.equal(after.laborPerSqft.carpet,2700);
      if(tier.name==='Inherits unit, own material')assert.equal(after.materialPerSqft.carpet,4500);
      // A tier with its own square-foot unit that inherited 3.00/5.00 gets them pinned.
      if(tier.name==='Own foot, inherits prices')assert.deepEqual(after,{carpetPriceUnit:'square_foot',laborPerSqft:{carpet:300},materialPerSqft:{carpet:500}});
    }
    assert.deepEqual(mids(withService(f,yard)),all);
    const foot=editCarpetPriceUnit(yard,'square_foot');
    assert.deepEqual(mids(withService(f,foot)),all);
    assert.deepEqual(foot.pricing.laborPerSqft,before.pricing.laborPerSqft);assert.deepEqual(foot.pricing.materialPerSqft,before.pricing.materialPerSqft);
    const again=editCarpetPriceUnit(editCarpetPriceUnit(foot,'square_yard'),'square_foot');
    assert.deepEqual(again.pricing,foot.pricing);assert.deepEqual(again.tiers,foot.tiers);
  }
});

test('F01: fractional, zero and missing carpet prices convert exactly; an inexact one refuses the whole change',()=>{
  // 3.005/sq ft = 27.045/sq yd exactly; 0.10/sq ft = 0.90/sq yd; 0 stays 0.
  assert.equal(convertCarpetPrice(3.005,'square_foot','square_yard'),27.045);
  assert.equal(convertCarpetPrice(27.045,'square_yard','square_foot'),3.005);
  assert.equal(convertCarpetPrice(0.1,'square_foot','square_yard'),0.9);
  assert.equal(convertCarpetPrice(0,'square_yard','square_foot'),0);
  // 300.5 cents per sq ft quotes the same before and after conversion.
  const fractional=carpetBook([],{laborPerSqft:{carpet:300.5,tile:450}});
  const fy=editCarpetPriceUnit(fractional.ownerPricing,'square_yard');
  assert.equal(fy.pricing.laborPerSqft.carpet,2704.5);assert.deepEqual(mids(withService(fractional,fy)),mids(fractional));
  // No carpet price set: nothing to convert, the unit still changes.
  const none=carpetBook([]);delete none.ownerPricing.pricing.materialPerSqft.carpet;
  const ny=editCarpetPriceUnit(none.ownerPricing,'square_yard');
  assert.equal(ny.pricing.carpetPriceUnit,'square_yard');assert.equal(Object.hasOwn(ny.pricing.materialPerSqft,'carpet'),false);
  // 10.00/sq yd is 1.111... per sq ft: refused, and the draft is unchanged.
  const yardBook=carpetBook([{name:'Inherits',overrides:{}}],{carpetPriceUnit:'square_yard',laborPerSqft:{carpet:1000,tile:450},materialPerSqft:{carpet:4500}});
  const untouched=structuredClone(yardBook.ownerPricing);
  assert.equal(editCarpetPriceUnit(yardBook.ownerPricing,'square_foot'),null);
  assert.equal(editTierCarpetPriceUnit(yardBook.ownerPricing,0,'square_foot'),null);
  assert.deepEqual(yardBook.ownerPricing,untouched);
});

test('F01: setting and clearing a tier unit keeps the tier quote',()=>{
  const f=carpetBook([{name:'Inherits',overrides:{}},{name:'Own yard',overrides:{carpetPriceUnit:'square_yard',laborPerSqft:{carpet:2700},materialPerSqft:{carpet:4500}}}]);
  let s=editTierCarpetPriceUnit(f.ownerPricing,0,'square_yard');
  assert.deepEqual(s.tiers[0].overrides,{carpetPriceUnit:'square_yard',laborPerSqft:{carpet:2700},materialPerSqft:{carpet:4500}});
  assert.deepEqual(mids(withService(f,s)),[1760,1760]);
  s=editTierCarpetPriceUnit(s,1,undefined);
  assert.deepEqual(s.tiers[1].overrides,{laborPerSqft:{carpet:300},materialPerSqft:{carpet:500}});
  assert.deepEqual(mids(withService(f,s)),[1760,1760]);
});

const env={GEMINI_API_KEY:'SYNTHETIC-TEST-KEY',GEMINI_TEXT_MODEL:'synthetic-text-model'};
const provider=(value,capture=()=>{})=>({env,fetchImpl:async(_url,init)=>{const body=JSON.parse(init.body);capture(JSON.parse(body.contents[0].parts[0].text),body);return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]})};}});
const noCall={env,fetchImpl:async()=>{throw Error('must not call provider');}};

test('F07: starter prices use the draft currency, then the saved one, then the country; an unsupported one is refused',async()=>{
  assert.equal(starterCurrency('CA','USD'),'USD');assert.equal(starterCurrency('US','CAD'),'CAD');
  assert.equal(starterCurrency('CA',undefined),'CAD');assert.equal(starterCurrency('US',''),'USD');
  assert.throws(()=>starterCurrency('US','EUR'),e=>e.statusCode===422&&/CAD or USD/.test(e.message));
  const values=[{service:'[SYNTHETIC] Mowing',serviceType:'LANDSCAPING_MOWING',fields:{mowingBaseRatePerSqft:.02}}];
  let data;await suggestStarterBook({industry:'[SYNTHETIC]',serviceTypes:['LANDSCAPING_MOWING'],country:'CA',region:'NB',currency:'USD'},provider(values,sent=>{data=sent;}));
  assert.deepEqual(data.market,{country:'CA',region:'NB',currency:'USD'});
  await assert.rejects(suggestStarterBook({industry:'[SYNTHETIC]',serviceTypes:['LANDSCAPING_MOWING'],country:'CA',currency:'EUR'},noCall),e=>e.statusCode===422);
});

test('F07: a suggestion is refused for another business or a changed currency',()=>{
  const made={forOwnerId:'owner-a',currency:'CAD',suggestions:[]};
  assert.equal(starterSuggestionProblem(made,'owner-a','CAD'),null);
  assert.match(starterSuggestionProblem(made,'owner-b','CAD'),/different business/);
  assert.match(starterSuggestionProblem(made,'owner-a','USD'),/priced in CAD, but this price book is now in USD/);
  assert.equal(starterSuggestionProblem(made,'owner-a',undefined),null);
});

const interview=(pricing,answer,field='laborPerSqft',capture)=>interpretInterviewAnswer({serviceType:'FLOORING_INSTALL',field,answer:'[SYNTHETIC] owner answer',pricing},provider(answer,capture));

test('F08: the interview converts a stated carpet unit in code, and only the carpet entry',async()=>{
  const yard={carpetPriceUnit:'square_yard'},foot={carpetPriceUnit:'square_foot'};
  // $3 per sq ft for a square-yard field = $27 per sq yd. Tile 5 is untouched.
  assert.deepEqual(await interview(yard,{value:{carpet:3,tile:5},carpetSourceUnit:'square_foot'}),{carpet:27,tile:5});
  // No unit stated: the draft's unit at the time of the request.
  assert.deepEqual(await interview(yard,{value:{carpet:27},carpetSourceUnit:null}),{carpet:27});
  // $27 per sq yd for a square-foot field = $3 per sq ft; material field too.
  assert.deepEqual(await interview(foot,{value:{carpet:27},carpetSourceUnit:'square_yard'}),{carpet:3});
  assert.deepEqual(await interview(foot,{value:{carpet:45},carpetSourceUnit:'square_yard'},'materialPerSqft'),{carpet:5});
  // $10 per sq yd cannot be stated exactly per sq ft; an unknown unit; both ask again.
  await assert.rejects(interview(foot,{value:{carpet:10},carpetSourceUnit:'square_yard'}),e=>e.statusCode===422&&/clear value/.test(e.message));
  await assert.rejects(interview(foot,{value:{carpet:3},carpetSourceUnit:'square_metre'}),e=>e.statusCode===422&&/clear value/.test(e.message));
  // The request states the draft's unit and asks for the stated unit back.
  let data,body;await interview(yard,{value:{carpet:27},carpetSourceUnit:null},'laborPerSqft',(sent,raw)=>{data=sent;body=raw;});
  assert.match(data.field.carpetEntryUnit,/priced per square yard/);assert.match(body.systemInstruction.parts[0].text,/carpetSourceUnit/);
  // Other fields carry no carpet note and may not return a unit.
  let other;await interpretInterviewAnswer({serviceType:'FLOORING_INSTALL',field:'minimumJob',answer:'[SYNTHETIC] $500 minimum',pricing:yard},provider({value:500},sent=>{other=sent;}));
  assert.equal(other.field.carpetEntryUnit,undefined);
  await assert.rejects(interpretInterviewAnswer({serviceType:'FLOORING_INSTALL',field:'minimumJob',answer:'[SYNTHETIC] $500',pricing:yard},provider({value:500,carpetSourceUnit:'square_foot'})),e=>e.statusCode===503&&/could not produce a valid draft/.test(e.message));
});

async function renderWizard(t,{customerFields,inputs}){
  const root=new URL('..',import.meta.url).pathname;
  const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},
    stdin:{resolveDir:root,loader:'jsx',contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {QuoteWizard} from './client/src/quoteWizard.jsx';
      const service=${JSON.stringify({id:'synthetic-service',name:'[SYNTHETIC] Service',customerFields})};
      function App(){const [values,setValues]=useState(${JSON.stringify({inputs,fees:{},contact:{},site:{}})});window.__inputs=values.inputs;
        return <QuoteWizard services={[service]} service={service} values={values} change={(key,value)=>setValues(current=>{const next={...current,[key]:value};window.__inputs=next.inputs;return next;})} onServiceChange={()=>{}} onSubmit={()=>{}} sending={false}/>;}
      createRoot(document.getElementById('root')).render(<App/>);`}});
  const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window,d=w.document;w.eval('window.structuredClone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value))');w.eval(output.outputFiles[0].text);
  const wait=async check=>{for(let i=0;i<300;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('Synthetic wizard condition timed out');};
  const byLabel=label=>d.querySelector('[aria-label="'+label+'"]');
  const button=text=>[...d.querySelectorAll('button')].find(b=>b.textContent===text);
  const click=async text=>{await wait(()=>button(text));button(text).click();};
  const next=async()=>{const form=d.querySelector('form');form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
  const type=async(label,value)=>{await wait(()=>byLabel(label));const input=byLabel(label);Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const title=()=>d.querySelector('h2')?.textContent;
  return {w,d,wait,byLabel,click,next,type,title};
}

test('F09: the real wizard keeps fence runs in step with the run count across steps and a restored draft',async t=>{
  const count={name:'fenceRunCount',label:'How many separate fence runs?',type:'number',unit:'runs',min:1,max:1000,integer:true};
  const runs={name:'fenceRuns',label:'Length of each straight section, in feet, between ends, corners and gates',summaryLabel:'Fence layout',type:'fence_runs',unit:'feet',closedQuestion:'Does this run connect back to where it starts?',sectionQuestion:'Length of each straight section, in feet, between ends, corners and gates',gateChoices:[]};
  // A restored draft: one measured 20 ft run.
  const ui=await renderWizard(t,{customerFields:[count,runs],inputs:{fenceRunCount:1,fenceRuns:[{closed:false,sections:[{lengthLF:20}]}]}});
  await ui.wait(()=>ui.title()==='What can we help with?');await ui.next();
  await ui.wait(()=>ui.title()===count.label);await ui.type(count.label,'2');
  await ui.wait(()=>ui.w.__inputs.fenceRuns.length===2);await ui.next();
  // The runs step offers both runs; the measured 20 ft is kept.
  await ui.wait(()=>ui.byLabel(runs.closedQuestion+' — run 2'));
  assert.equal(ui.w.__inputs.fenceRuns[0].sections[0].lengthLF,20);
  // Back to 1: per the Oct 16 rule a measured run is never erased by the count;
  // the customer removes the run they mean, and the count follows.
  await ui.click('Back');await ui.wait(()=>ui.title()===count.label);await ui.type(count.label,'1');
  await ui.wait(()=>ui.w.__inputs.fenceRunCount===1);assert.equal(ui.w.__inputs.fenceRuns.length,2);
  await ui.next();await ui.click('Remove run 2');
  await ui.wait(()=>ui.w.__inputs.fenceRuns.length===1);assert.equal(ui.w.__inputs.fenceRunCount,1);
  // And back to 2 again: a fresh second run, the first still 20 ft.
  await ui.click('Back');await ui.wait(()=>ui.title()===count.label);await ui.type(count.label,'2');
  await ui.wait(()=>ui.w.__inputs.fenceRuns.length===2);
  assert.equal(ui.w.__inputs.fenceRuns[0].sections[0].lengthLF,20);assert.equal(ui.w.__inputs.fenceRuns[1].sections[0].lengthLF,undefined);
});

test('F09: unticking an optional painting item in the wizard clears its hidden answer',async t=>{
  const items={name:'surfaceOptionalItems',label:'Which optional painting items would you like?',type:'multi_enum',unit:null,values:['door_sides','windows'],optionLabels:{door_sides:'Door sides',windows:'Windows'}};
  const doors={name:'paintDoorSides',label:'Door sides to paint',type:'number',unit:'sides',min:0,max:1000000,integer:true,optionalItemKey:'door_sides'};
  const ui=await renderWizard(t,{customerFields:[items,doors],inputs:{surfaceOptionalItems:['door_sides','windows'],paintDoorSides:4}});
  await ui.wait(()=>ui.title()==='What can we help with?');await ui.next();
  await ui.wait(()=>ui.byLabel('Door sides'));ui.byLabel('Door sides').click();
  await ui.wait(()=>!ui.w.__inputs.surfaceOptionalItems.includes('door_sides'));
  assert.deepEqual(JSON.parse(JSON.stringify(ui.w.__inputs.surfaceOptionalItems)),['windows']);assert.equal(Object.hasOwn(ui.w.__inputs,'paintDoorSides'),false);
});
