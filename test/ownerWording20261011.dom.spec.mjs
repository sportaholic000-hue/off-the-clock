import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';

// Expected results written before execution in release-candidate-20261011h/EXPECTED.md.
// Real React Dashboard and StepRail, synthetic transport only. Auxiliary panels
// receive an explicit unavailable response; no provider or account is contacted.
let bundle;
before(async()=>{
 const root=fileURLToPath(new URL('..',import.meta.url));
 const result=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"'},
  plugins:[{name:'synthetic-owner-transport',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({contents:'export const api=(...args)=>window.__transport(...args);export const go=()=>{};export const logout=async()=>{};export const getToken=()=>"[PLACEHOLDER]";export const setToken=()=>{};export const getSessionKey=()=>"[PLACEHOLDER]";',loader:'js'}));}}],
  stdin:{resolveDir:root,loader:'jsx',contents:"import React from 'react';import {createRoot} from 'react-dom/client';import Dashboard from './client/src/dashboard.jsx';import {StepRail} from './client/src/onboarding.jsx';window.__root=createRoot(document.getElementById('root'));window.__root.render(window.__screen==='dashboard'?<Dashboard/>:<StepRail step={2} state={window.__state}/>);"}});
 bundle=result.outputFiles[0].text;
});
const pause=()=>new Promise(r=>setTimeout(r,10));
async function mount(t,screen,plan,planStatus){
 const errors=[],dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid/'+screen,runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
 const {window}=dom,state={account:{plan,planStatus},profile:{knowledgeBase:{},calendar:{}},operator:{}};
 window.structuredClone=structuredClone;
 window.__screen=screen;window.__state=state;
 window.__transport=async path=>{
  if(path==='/api/onboarding/state')return state;
  if(path==='/api/dashboard')return {operator:{},pricebookStatuses:[{serviceType:'CUSTOM',service:'[PLACEHOLDER] Live service',status:'QUOTING LIVE',missingOwnerFields:[]},{serviceType:'LANDSCAPING_MOWING',service:'[PLACEHOLDER] Draft service',status:'NEEDS PRICING',missingOwnerFields:[]}],callActivity:null,previewActivity:null};
  if(path==='/api/leads/activity')return null;
  throw Error('[PLACEHOLDER] auxiliary panel unavailable');
 };
 t.after(()=>{window.__root.unmount();window.close();assert.deepEqual(errors,[]);});window.eval(bundle);
 for(let n=0;n<300;n++){if(window.document.querySelector(screen==='dashboard'?'.dashboard-page > .counter-grid':'.answering-note'))return window.document;await pause();}
 assert.fail('Owner wording DOM did not settle');
}
const intro='Ready when your account has access, your number is set, and the About and Hours sections have content.';
for(const plan of ['Starter','Operator','QuoteDone','Scale'])for(const status of ['active','trialing']){
 test(`owner wording: ${plan} ${status} dashboard fallback cards`,async t=>{
  const d=await mount(t,'dashboard',plan,status),grid=d.querySelector('.dashboard-page > .counter-grid'),text=grid.textContent;
  assert.match(text,/CALLS ANSWERED/);assert.match(text,/QUOTES DELIVERED/);assert.match(text,/NO QUOTES DELIVERED YET/);
  if(plan==='Starter'){
   assert.equal(grid.children.length,2);assert.doesNotMatch(text,/READY TO QUOTE|NEEDS PRICING|THESE CAN QUOTE/);
  }else{
   assert.equal(grid.children.length,4);assert.match(text,/READY TO QUOTE1 service/);assert.match(text,/NEEDS PRICING1 service/);
   const caption=plan==='Operator'?'THESE CAN QUOTE ON YOUR WIDGET':'THESE CAN QUOTE ON A CALL';assert.ok(text.includes(caption));
   assert.ok(!text.includes(plan==='Operator'?'THESE CAN QUOTE ON A CALL':'THESE CAN QUOTE ON YOUR WIDGET'));
  }
 });
 test(`owner wording: ${plan} ${status} setup answering note`,async t=>{
  const d=await mount(t,'onboarding',plan,status),note=d.querySelector('.answering-note').textContent.replace(/\s+/g,' ').trim();
  const continuation=plan==='Starter'?'Price Book quoting is included with Operator and QuoteDone.':plan==='Operator'?'Website widget quoting turns on per service later. Answering never waits on your price book.':'Quoting turns on per service later. Answering never waits on your price book.';
  assert.equal(note,intro+' '+continuation);
 });
}
