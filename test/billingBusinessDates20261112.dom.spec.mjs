import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';

// Billing "Service ends", "Phone release" and "Export deadline" show the
// business's local date, formatted like the trial date. Only HTTP is replaced.
// Expected before the change: the stored UTC timestamps are printed as-is
// (2026-11-21T03:30:00.000Z), and a cancelled plan never reads the time zone.
// Hand-calculated: 03:30 UTC is 19:30 the previous day in America/Los_Angeles
// (PST, UTC-8, in November, December and February).
const SERVICE_END='2026-11-21T03:30:00.000Z';         // Nov 20, 2026 7:30 PM PST
const PHONE_RELEASE='2026-12-21T03:30:00.000Z';       // end + 30 days → Dec 20, 2026 PST
const EXPORT_UNTIL='2027-02-19T03:30:00.000Z';        // end + 90 days → Feb 18, 2027 PST
const NOW=Date.parse('2026-11-12T12:00:00.000Z');

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
const refreshButton=d=>[...d.querySelectorAll('button')].find(n=>n.textContent==='Refresh billing status');

async function mount(t,{timezone,planStatus='active',serviceEndsAt=SERVICE_END,cancellation={state:'CONFIRMED',endAt:SERVICE_END,phoneReleaseAt:PHONE_RELEASE,exportUntilAt:EXPORT_UNTIL}}){
  const errors=[],calls=[];
  const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid/settings/billing',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
  const {window}=dom;window.TextEncoder=TextEncoder;Object.defineProperty(window.crypto,'subtle',{value:webcrypto.subtle});window.Date.now=()=>NOW;
  window.__transport=async path=>{
    calls.push(path);
    if(path==='/api/onboarding/state')return {account:{timezone}};
    if(path==='/api/billing/lifecycle')return {serviceEndsAt,notices:[],cancellation};
    if(path==='/api/dashboard')return {minuteUsage:null};
    if(path==='/api/billing/status')return {plan:'Operator',planStatus,serviceEndsAt,billingEnabled:true,providerAvailable:true,canCheckout:false,canManageBilling:true,cancelAtPeriodEnd:false,checkoutState:'NONE',billingInterval:'monthly'};
    throw Error('Unexpected synthetic request '+path);
  };
  t.after(()=>{window.__root.unmount();window.close();assert.deepEqual(errors,[]);});
  window.eval(bundle);await waitFor(()=>refreshButton(window.document)&&!refreshButton(window.document).disabled);
  return {document:window.document,calls};
}

test('a Los Angeles business sees its own local dates for service end, phone release and export deadline',async t=>{
  const {document:d,calls}=await mount(t,{timezone:'America/Los_Angeles'});
  const text=d.body.textContent;
  assert.ok(calls.includes('/api/onboarding/state'),'the business time zone is read for a cancelled plan');
  assert.ok(text.includes('Service ends Nov 20, 2026. No partial refunds.'),text);
  assert.ok(text.includes('Phone release: Dec 20, 2026. Export deadline: Feb 18, 2027.'),text);
  for(const raw of [SERVICE_END,PHONE_RELEASE,EXPORT_UNTIL,'Nov 21, 2026','Dec 21, 2026','Feb 19, 2027'])assert.ok(!text.includes(raw),raw);
});

test('the same timestamps for a UTC business show the UTC date',async t=>{
  const {document:d}=await mount(t,{timezone:'UTC'});
  const text=d.body.textContent;
  assert.ok(text.includes('Service ends Nov 21, 2026. No partial refunds.'),text);
  assert.ok(text.includes('Phone release: Dec 21, 2026. Export deadline: Feb 19, 2027.'),text);
});

test('an active plan with no end date and no cancellation does not read the time zone',async t=>{
  const {document:d,calls}=await mount(t,{timezone:'America/Los_Angeles',serviceEndsAt:null,cancellation:null});
  assert.ok(!calls.includes('/api/onboarding/state'));
  assert.ok(!d.body.textContent.includes('Service ends'));
  assert.ok(!d.body.textContent.includes('Phone release'));
});
