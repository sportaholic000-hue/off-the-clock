import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {custom} from '../verification/engine-independent/fixtures.mjs';
import {ownerCallFixture} from './helpers/ownerCallFixture.mjs';
import {createOwnerJobCostService} from '../server/src/ownerJobCosts.js';
import {ownerJobMetrics} from '../server/src/ownerJobMetrics.js';
const pause=()=>new Promise(resolve=>setTimeout(resolve,15));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await pause();}assert.fail('Synthetic DOM condition timed out');}
const root=new URL('..',import.meta.url).pathname;
// Expected: five numeric controls preserve explicit 0 and clear to absent;
// saved costs 40000/30000 cents, hours8.5 and change20000 persist after reload.
test('rendered owner controls edit ranges, split shares, job costs and changes without customer fields',async t=>{
 const f=ownerCallFixture();t.after(()=>f.db.close());const ownerId='synthetic-a',id=ownerId+'-quote',service=createOwnerJobCostService({database:f.db,ownerQuery:sql=>f.db.prepare(sql)});
 const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},
 plugins:[{name:'synthetic-api',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({contents:'export const api=(...args)=>window.__transport(...args);export const go=()=>{};export const logout=async()=>{};',loader:'js'}));}}],
 stdin:{resolveDir:root,loader:'jsx',contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {QuoteRangeControls,RangeBufferConfirmation} from './client/src/quoteRangeControls.jsx';import {InstalledMaterialsEditor} from './client/src/installedMaterialsEditor.jsx';import {OwnerJobCosts} from './client/src/ownerJobCosts.jsx';import {OwnerJobMetrics} from './client/src/ownerJobMetrics.jsx';function App(){const [service,setService]=useState(window.__service),[defaults,setDefaults]=useState({rangeBufferPercent:10});window.__current={service,defaults};return <><span id="range-confirmation"><RangeBufferConfirmation defaults={defaults} service={service}/></span><QuoteRangeControls service={service} defaults={defaults} onService={setService} onDefault={(field,value)=>setDefaults({...defaults,[field]:value})}/><InstalledMaterialsEditor service={service} onChange={setService}/><OwnerJobCosts row={{id:'${id}',result:{currency:'CAD'}}}/><OwnerJobMetrics groups={window.__metrics}/></>};window.__root=createRoot(document.getElementById('root'));window.__root.render(<App/>);`}});
 const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;w.eval('window.structuredClone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));');
 w.__service=custom().ownerPricing;w.__metrics=ownerJobMetrics([]);w.__transport=async(path,options={})=>JSON.parse(JSON.stringify(options.method==='PUT'?service.save({ownerId,id,body:options.body}):service.view({ownerId,id})));w.eval(output.outputFiles[0].text);
 const field=label=>d.querySelector('[aria-label="'+label+'"]');
 async function enter(label,value){const input=field(label);assert.ok(input,label);const proto=input.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);input.dispatchEvent(new w.Event('input',{bubbles:true}));input.dispatchEvent(new w.Event('change',{bubbles:true}));input.dispatchEvent(new w.FocusEvent('focusout',{bubbles:true}));await pause();}
 const button=label=>[...d.querySelectorAll('button')].find(node=>node.textContent===label);
 await until(()=>field('Business low range buffer (%)'));
 assert.equal(d.querySelector('#range-confirmation').textContent,'the 10% estimate range buffer');
 await enter('Business low range buffer (%)','5');await enter('Business high range buffer (%)','15');await enter('This service low range buffer (%)','0');await enter('Custom price materials share (%)','40');
 assert.equal(d.querySelector('#range-confirmation').textContent,'the 0% low and 15% high commercial range buffers');
 assert.equal(w.__current.defaults.rangeLowPercent,5);assert.equal(w.__current.defaults.rangeHighPercent,15);assert.equal(w.__current.service.rangeLowPercent,0);assert.equal(w.__current.service.pricing.installedMaterialsPercent.price,40);
 await enter('This service low range buffer (%)','');assert.equal(w.__current.service.rangeLowPercent,undefined);await enter('Custom price materials share (%)','');assert.equal(w.__current.service.pricing.installedMaterialsPercent.price,undefined);
 const details=[...d.querySelectorAll('details')].find(node=>node.querySelector('summary')?.textContent==='Job costs and approved changes');details.open=true;details.dispatchEvent(new w.Event('toggle'));
 await until(()=>field('Actual labor hours'));await enter('Actual labor hours','8.5');await enter('Actual labor cost (CAD)','400');await enter('Actual material cost (CAD)','300');button('Add approved change').click();await until(()=>field('Change 1 amount (CAD)'));await enter('Change 1 amount (CAD)','200');await enter('Change 1 description','[SYNTHETIC] Added scope');button('Save job costs').click();
 await until(()=>d.body.textContent.includes('Job costs saved.'));const saved=service.view({ownerId,id});assert.equal(saved.actualLaborHours,8.5);assert.equal(saved.actualLaborCostCents,40000);assert.equal(saved.actualMaterialCostCents,30000);assert.equal(saved.approvedChanges[0].amountCents,20000);
 assert.match(d.body.textContent,/commercial buffer, not a measured accuracy band/);assert.match(d.body.textContent,/Blank keeps the existing single charge category/);
});
