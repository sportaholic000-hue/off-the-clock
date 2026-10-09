import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import {fileURLToPath} from 'node:url';

// Handwritten money expectations: EXPECTATIONS.md. This runs the actual React UI.
let bundle;
before(async()=>{
  const root=fileURLToPath(new URL('..',import.meta.url));
  const result=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'synthetic-transport',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({contents:'export const api=(...args)=>window.__transport(...args);export const go=()=>{};export const logout=()=>{};export const getSessionKey=()=>"SYNTHETIC";',loader:'js'}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {OwnerRecordActions} from './client/src/ownerRecordActions.jsx';import MinuteUsage from './client/src/minuteUsage.jsx';window.__root=createRoot(document.getElementById('root'));window.mount=(kind,props)=>window.__root.render(kind==='quote'?<OwnerRecordActions {...props}/>:<MinuteUsage {...props}/>);"}});
  bundle=result.outputFiles[0].text;
});
async function waitFor(check){const end=Date.now()+4000;while(Date.now()<end){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('React update timed out');}
function setup(t){
  const errors=[],calls=[],dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
  const {window}=dom;window.crypto.randomUUID=randomUUID;window.__transport=async(path,options)=>{calls.push(JSON.parse(JSON.stringify({path,...options})));return {};};window.eval(bundle);
  t.after(()=>{window.__root.unmount();window.close();assert.deepEqual(errors,[]);});return {window,document:window.document,calls};
}
function change(window,element,value){const proto=element.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLSelectElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);element.dispatchEvent(new window.Event(element.tagName==='TEXTAREA'?'input':'change',{bubbles:true}));}
for(const names of [[null],['Basic'],['Basic','Plus']])test(`audit 1 DOM: ${JSON.stringify(names)} picker and submitted acceptance`,async t=>{
  const {window,document,calls}=setup(t);
  window.mount('quote',{kind:'quotes',row:{id:'SYNTHETIC',status:'SENT',canReview:true,result:{currency:'CAD',options:names.map(tierName=>({tierName,lowEstimate:3538.89,highEstimate:3538.89}))},workflow:{version:1,history:[]}}});
  await waitFor(()=>document.querySelector('[aria-label="Follow-up action"]'));
  change(window,document.querySelector('[aria-label="Follow-up action"]'),'ACCEPTED');
  await waitFor(()=>document.querySelector('input[type="checkbox"]'));
  const picker=document.querySelector('[aria-label="Accepted quote option"]');assert.equal(Boolean(picker),names.length>1);
  if(picker){assert.equal(picker.required,true);change(window,picker,'Plus');}
  change(window,document.querySelector('textarea'),'[SYNTHETIC] Caller accepted outside app');document.querySelector('input[type="checkbox"]').click();
  await new Promise(r=>setTimeout(r,20));document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  await waitFor(()=>calls.length);assert.equal(calls[0].body.action,'ACCEPTED');assert.equal(calls[0].body.attested,true);
  assert.equal(Object.hasOwn(calls[0].body,'tierName'),names.length>1);if(picker)assert.equal(calls[0].body.tierName,'Plus');
});
for(const [status,pending,minutes,included] of [['TRIAL',6,0,60],['PAID',1,300,300]])test(`audit 3 DOM: ${status} pending calls use approved count wording and zero overage`,async t=>{
  const {window,document}=setup(t);window.mount('usage',{usage:{status,periodStartAt:'2026-10-09T00:00:00.000Z',periodEndAt:'2026-10-23T00:00:00.000Z',minutesUsed:minutes,minutesLeft:included-minutes,includedMinutes:included,overageCents:0,chargedCents:0,unchargedCents:0,unconfirmedCalls:pending}});
  await waitFor(()=>document.querySelector('.minute-usage'));assert.match(document.body.textContent,new RegExp('Calls still being confirmed: '+pending));
  for(const label of ['Overage so far','Charged so far','Not yet charged']){const dt=[...document.querySelectorAll('dt')].find(e=>e.textContent===label);assert.equal(dt.nextElementSibling.textContent,'$0.00');}
  assert.doesNotMatch(document.body.textContent,/\$3\.50/);
});
