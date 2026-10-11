import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import {fixture,A,SIGNUP,START} from './overageMinute20261006Fixture.mjs';

// Handwritten expectations: verification/billing-staff-scan-20261011/EXPECTED.md.
// Actual React Billing + existing in-memory billing and duration fixtures.
// Only HTTP is replaced; MinuteUsage receives the production service snapshot.
let bundle;
before(async()=>{
 const root=fileURLToPath(new URL('..',import.meta.url));
 const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},
  plugins:[{name:'synthetic-billing-transport',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({contents:'export const api=(...args)=>window.__transport(...args);export const go=()=>{};export const logout=async()=>{};export const getToken=()=>"[PLACEHOLDER] owner session";export const getSessionKey=()=>"[PLACEHOLDER] owner";',loader:'js'}));}}],
  stdin:{resolveDir:root,loader:'jsx',contents:"import React from 'react';import {createRoot} from 'react-dom/client';import Billing from './client/src/billing.jsx';window.__root=createRoot(document.getElementById('root'));window.__root.render(<Billing/>);"}});
 bundle=output.outputFiles[0].text;
});
const pause=()=>new Promise(r=>setTimeout(r,10));
async function waitFor(check){for(let n=0;n<400;n++){if(check())return;await pause();}assert.fail('Billing DOM update timed out');}
const label=(d,text)=>[...d.querySelectorAll('dt')].find(n=>n.textContent===text)?.nextElementSibling.textContent;
const refreshButton=d=>[...d.querySelectorAll('button')].find(n=>n.textContent==='Refresh billing status');
async function mount(t,h,{checkout=false,disabled=false,staff=false}={}){
 const errors=[],calls=[],dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid/settings/billing',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
 const {window}=dom;window.TextEncoder=TextEncoder;Object.defineProperty(window.crypto,'subtle',{value:webcrypto.subtle});window.Date.now=()=>h.clock().getTime();
 window.__transport=async path=>{
  calls.push(path);
  if(disabled)throw Object.assign(new Error('Not found'),{status:404});
  if(staff)throw Object.assign(new Error('Forbidden'),{status:403});
  if(path==='/api/billing/lifecycle')return {notices:[],cancellation:null};
  if(path==='/api/dashboard')return JSON.parse(JSON.stringify({minuteUsage:h.service.snapshot(A)}));
  if(path==='/api/billing/status'){
   const row=h.db.prepare('SELECT * FROM users WHERE id=?').get(A);
   return {...row,billingEnabled:true,providerAvailable:true,canCheckout:checkout,canManageBilling:!checkout,cancelAtPeriodEnd:false,checkoutState:'NONE',billingInterval:'monthly'};
  }
  throw Error('Unexpected synthetic request '+path);
 };
 t.after(()=>{window.__root.unmount();window.close();assert.deepEqual(errors,[]);});
 window.eval(bundle);await waitFor(()=>refreshButton(window.document)&&!refreshButton(window.document).disabled);
 return {window,document:window.document,calls,async refresh(){refreshButton(window.document).click();await pause();await waitFor(()=>refreshButton(window.document)&&!refreshButton(window.document).disabled);}};
}
function trial(t){const h=fixture(t);h.setTime(SIGNUP);h.subscription(A,{status:'trialing',start:SIGNUP,end:START});return h;}
test('Billing trial shows end, fourteen days left, 60-minute cap and one unconfirmed call',async t=>{
 const h=trial(t);h.call(125,{provider:false});const ui=await mount(t,h),d=ui.document;
 assert.equal(label(d,'Status'),'Trial');assert.equal(label(d,'Trial ends'),'2026-10-20');assert.equal(label(d,'Days left'),'14');
 assert.match(d.body.textContent,/Trial minutes/);assert.match(d.body.textContent,/60 included minutes/);
 assert.equal(label(d,'Minutes used'),'0');assert.equal(label(d,'Minutes left'),'60');assert.match(d.body.textContent,/Calls still being confirmed: 1/);
});
test('Billing refresh completes the same 125-second trial call as 3 of 60 minutes, never overage',async t=>{
 const h=trial(t),call=h.call(125,{provider:false}),ui=await mount(t,h);
 assert.equal(label(ui.document,'Minutes used'),'0');
 h.meter.providerComplete(call.receipt);await ui.refresh();
 assert.equal(label(ui.document,'Minutes used'),'3');assert.equal(label(ui.document,'Minutes left'),'57');assert.match(ui.document.body.textContent,/60 included minutes/);
 assert.doesNotMatch(ui.document.body.textContent,/Calls still being confirmed/);assert.equal(label(ui.document,'Overage so far'),'$0.00');
 assert.equal(ui.calls.filter(p=>p==='/api/billing/status').length,2);assert.equal(ui.calls.filter(p=>p==='/api/dashboard').length,2);
 h.setTime('2026-10-19T12:00:00.000Z');await ui.refresh();assert.equal(label(ui.document,'Days left'),'1');
});
test('Billing paid Operator uses the existing meter: 302 of 300 minutes, $0.70 overage',async t=>{
 const h=fixture(t);h.activate();h.call(302*60);const {document:d}=await mount(t,h);
 assert.match(d.body.textContent,/Minutes this billing month/);assert.match(d.body.textContent,/300 included minutes/);
 assert.equal(label(d,'Minutes used'),'302');assert.equal(label(d,'Minutes left'),'0');assert.equal(label(d,'Overage so far'),'$0.70');assert.equal(label(d,'Charged so far'),'$0.00');assert.equal(label(d,'Not yet charged'),'$0.70');
 assert.match(d.body.textContent,/Extra minutes are \$0\.35\/min, charged to your card each time they reach \$25/);
 assert.equal(label(d,'Trial ends'),undefined);
});
for(const interval of ['monthly','annual'])test('Billing '+interval+' choices show all prices and monthly allowances before checkout',async t=>{
 const h=fixture(t),{window,document:d}=await mount(t,h,{checkout:true});
 const select=d.querySelector('select[aria-label="Billing interval"]');select.value=interval;select.dispatchEvent(new window.Event('change',{bubbles:true}));await pause();
 for(const text of ['$69/month or $690/year. 150 included minutes each billing month.','$119/month or $1,190/year. 300 included minutes each billing month.','$279/month or $2,790/year. 1,200 included minutes each billing month.'])assert.ok(d.querySelector('[aria-label="Start subscription"]').textContent.includes(text),text);
 assert.match(d.body.textContent,/Extra minutes are \$0\.35\/min, charged to your card each time they reach \$25/);
});
test('Billing with Stripe disabled preserves the 404 message and does not request usage',async t=>{
 const ui=await mount(t,fixture(t),{disabled:true});assert.match(ui.document.body.textContent,/Billing is not configured yet\./);
 assert.equal(ui.document.querySelector('.minute-usage'),null);assert.ok(!ui.calls.includes('/api/dashboard'));assert.equal(ui.document.querySelector('[aria-label="Current subscription"]'),null);
});
test('staff denied Billing status never requests or displays owner minute usage',async t=>{
 const ui=await mount(t,fixture(t),{staff:true});assert.match(ui.document.body.textContent,/Only the business owner can manage billing/);
 assert.ok(!ui.calls.includes('/api/dashboard'));assert.equal(ui.document.querySelector('.minute-usage'),null);
});
