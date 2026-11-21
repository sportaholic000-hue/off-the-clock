import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import {customerContractForVNext} from '../server/quote-engine-vnext/contracts.js';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';

// November 21, 2026 (v42). The website quote widget asks one question per
// step. For a fence it listed both measuring methods' questions: the section
// layout and the total length, gates and corners. It now asks one method only.
// The real QuoteWizard is mounted in a DOM; only the host state is synthetic.
let bundle;
before(async()=>{
 const root=fileURLToPath(new URL('..',import.meta.url));
 const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},
  stdin:{resolveDir:root,loader:'jsx',contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {QuoteWizard} from './client/src/quoteWizard.jsx';
   function Host(){const [v,setV]=useState(window.__initial);window.__values=v;return <QuoteWizard services={[window.__service]} service={window.__service} values={v} change={(k,x)=>setV(p=>({...p,[k]:x}))} onServiceChange={()=>{}} onSubmit={()=>{window.__submitted=true;}} sending={false}/>;}
   window.__root=createRoot(document.getElementById('root'));window.__root.render(<Host/>);`}});
 bundle=output.outputFiles[0].text;
});
const pause=()=>new Promise(r=>setTimeout(r,10));
function fenceService(){
 const f=offeringFixture('FENCING_INSTALL','installed'),contract=customerContractForVNext('FENCING_INSTALL',f.ownerPricing.pricing,f.ownerPricing.feeRules||{});
 return {id:'11111111-1111-4111-8111-111111111111',name:'[SYNTHETIC] Fence',serviceType:'FENCING_INSTALL',customerFields:Object.entries(contract.fields).map(([name,d])=>({name,...d})),knownOfferings:f.ownerPricing.knownOfferings||{},customerFees:[]};
}
async function mount(t,inputs={}){
 const errors=[],service=fenceService();
 const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
 const {window}=dom;window.structuredClone=structuredClone;window.__service=service;window.__initial={serviceId:service.id,inputs,contact:{},location:{},context:'',unknowns:'',urgency:'',fees:{},additionalWork:[]};
 window.eval(bundle);t.after(()=>{window.__root?.unmount();window.close();});
 for(let n=0;n<200&&!window.document.querySelector('h2');n++)await pause();
 const d=window.document,title=()=>d.querySelector('h2').textContent,button=name=>[...d.querySelectorAll('button')].find(b=>b.textContent===name);
 const click=async name=>{const b=button(name);assert.ok(b,'button "'+name+'" on step "'+title()+'"');b.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));await pause();await pause();};
 const next=async()=>{const before=title();d.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));for(let n=0;n<100&&title()===before;n++)await pause();};
 const byLabel=Object.fromEntries(service.customerFields.map(f=>[f.label,f.name]));
 // Walk forward from the current step, naming each measurement question by its field.
 const walk=async()=>{const seen=[];for(let n=0;n<40;n++){const name=byLabel[title()];if(name)seen.push(name);if(title()==='Anything we should know about this job?')break;await next();}return seen;};
 return {window,errors,title,button,click,next,walk,byLabel};
}
const TOTAL=['linearFeet','lfMethod','gates','cornerCount','closedRunCount'];

test('the fence wizard asks the section method only, until the customer chooses a total length',async t=>{
 const w=await mount(t);
 const section=await w.walk();
 assert.ok(section.includes('fenceRuns')&&section.includes('fenceRunCount'),JSON.stringify(section));
 for(const name of TOTAL)assert.ok(!section.includes(name),name+' is not asked with section measurements: '+JSON.stringify(section));
 assert.deepEqual(w.errors,[]);
});

test('choosing the total length asks that method only, and offers the way back',async t=>{
 const w=await mount(t);
 for(let n=0;n<40&&w.byLabel[w.title()]!=='fenceRuns';n++)await w.next();
 assert.equal(w.byLabel[w.title()],'fenceRuns');
 await w.click('I only know the total length');
 // The customer lands on the first total-length question, not past it.
 assert.equal(w.byLabel[w.title()],'linearFeet');
 // The section step is gone; go back to the start and walk every step.
 for(let n=0;n<40&&w.button('Back');n++)await w.click('Back');
 const total=await w.walk();
 assert.ok(!total.includes('fenceRuns'),JSON.stringify(total));
 for(const name of ['linearFeet','lfMethod','gates','cornerCount'])assert.ok(total.includes(name),name+' is asked with a total length: '+JSON.stringify(total));
 // The total-length step offers section measurements again.
 for(let n=0;n<40&&w.button('Back');n++)await w.click('Back');
 for(let n=0;n<40&&w.byLabel[w.title()]!=='linearFeet';n++)await w.next();
 await w.click('Use section measurements');
 // Back with sections, the next unanswered question follows; none is skipped.
 assert.equal(w.byLabel[w.title()],'fenceType');
 for(let n=0;n<40&&w.button('Back');n++)await w.click('Back');
 const again=await w.walk();
 assert.ok(again.includes('fenceRuns'));for(const name of TOTAL)assert.ok(!again.includes(name),name);
 assert.deepEqual(w.errors,[]);
});

test('a request restored with a total length starts in the total-length method',async t=>{
 const w=await mount(t,{linearFeet:100,lfMethod:'exact'});
 const total=await w.walk();
 assert.ok(total.includes('linearFeet')&&!total.includes('fenceRuns'),JSON.stringify(total));
});
