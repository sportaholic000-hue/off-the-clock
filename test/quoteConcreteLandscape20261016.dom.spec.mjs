import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook} from '../server/priceBookService.js';
import {concreteFixture,customPlantFixture} from './quoteConcreteLandscape20261016Fixture.mjs';

// Expected before execution: the actual owner page exposes plant definitions
// inside Optional prices, keeps exact owner names and persists a changed name.
// Concrete optional inputs start empty; typing $40 persists exactly 4000 cents.
// This is DOM behavior evidence, not a substitute for the Chromium tests.
let bundle;
before(async()=>{
  bundle=(await build({bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'synthetic-transport',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({contents:'export const api=async(...args)=>JSON.parse(JSON.stringify(await window.__transport(...args)));export const go=()=>{};export const logout=async()=>{};export const getSessionKey=()=>"[SYNTHETIC]";',loader:'js'}));}}],stdin:{resolveDir:process.cwd(),loader:'jsx',contents:"import React from'react';import{createRoot}from'react-dom/client';import PriceBook from'./client/src/pricebook.jsx';window.__root=createRoot(document.getElementById('root'));window.__root.render(<PriceBook/>);"}})).outputFiles[0].text;
});
const pause=()=>new Promise(resolve=>setTimeout(resolve,15));
async function waitFor(fn,label){for(let i=0;i<300;i++){if(fn())return;await pause();}assert.fail('Timed out: '+label);}
const button=(d,label)=>[...d.querySelectorAll('button')].find(n=>n.textContent.includes(label));
async function mount(t,f){
  const owner='[SYNTHETIC]-concrete-landscape-dom-'+randomUUID(),service=structuredClone(f.ownerPricing);delete service.origin;
  const draft=bridge.convertApplicationBook({services:[service],defaults:f.businessDefaults},'toDollars');bridge.saveApplicationBook(owner,{...draft,revision:bridge.readApplicationBook(owner).revision});
  const errors=[],calls=[],dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid/pricebook',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))}),w=dom.window,d=w.document;
  w.eval('window.structuredClone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));');w.crypto.randomUUID=randomUUID;w.HTMLElement.prototype.scrollIntoView=function(){};
  w.__transport=async(path,{body}={})=>{
    body=body===undefined?undefined:JSON.parse(JSON.stringify(body));let result;
    if(path==='/api/dashboard')result={ownerId:owner,operator:{}};
    else if(path==='/api/onboarding/state')result={account:{plan:'QuoteDone'},profile:{businessTypes:[f.serviceType]}};
    else if(path==='/api/pricebook/meta')result=bridge.applicationMetadata();
    else if(path==='/api/pricebook/'+owner)result=bridge.readApplicationBook(owner);
    else if(path==='/api/pricebook/validate')result=bridge.validateApplicationDraft(owner,body);
    else if(path==='/api/pricebook/preview')result=bridge.previewApplicationQuote(owner,body);
    else if(path==='/api/pricebook/save')result=bridge.saveApplicationBook(owner,body);
    else throw Error('Unexpected synthetic path '+path);
    calls.push(path);return result;
  };
  t.after(()=>{w.__root.unmount();w.close();assert.deepEqual(errors,[]);});w.eval(bundle);
  await waitFor(()=>button(d,'Save & validate'),'owner editor');button(d,'Optional prices and add-on charges').click();
  return {owner,w,d,calls};
}
async function fill(h,selector,value){const input=h.d.querySelector(selector);assert.ok(input,selector);Object.getOwnPropertyDescriptor(h.w.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new h.w.Event('input',{bubbles:true}));input.dispatchEvent(new h.w.FocusEvent('focusout',{bubbles:true}));await pause();}
async function save(h){button(h.d,'Save & validate').click();await waitFor(()=>h.calls.includes('/api/pricebook/save'),'saved price book');}
test('plant owner DOM exposes definitions, edits the exact name and persists it',async t=>{
  const h=await mount(t,customPlantFixture());await waitFor(()=>h.d.querySelector('[aria-label="Customer size name 1"]'),'plant definitions');
  assert.equal(h.d.querySelector('[aria-label="Container number 1"]').value,'5');assert.equal(h.d.querySelector('[aria-label="Tree caliper (inches) 2"]').value,'2');
  await fill(h,'[aria-label="Customer size name 1"]','#5 patio shrub, container');await save(h);
  assert.equal(loadPricebook(h.owner).services[0].pricing.plantSizes.shrub_5.name,'#5 patio shrub, container');
});
test('concrete owner DOM leaves new prices blank and saves40 dollars as4000 cents',async t=>{
  const h=await mount(t,concreteFixture());await waitFor(()=>h.d.querySelector('#field-shortLoadPerYard input'),'short-load fields');
  assert.equal(h.d.querySelector('#field-shortLoadPerYard input').value,'');assert.equal(h.d.querySelector('[aria-label="Placement flat charge ($ per pour) Pump"]').value,'');
  await fill(h,'#field-shortLoadThresholdCubicYards input','5');await fill(h,'#field-shortLoadPerYard input','40');await save(h);
  assert.equal(loadPricebook(h.owner).services[0].pricing.shortLoadPerYard,4000);
});
