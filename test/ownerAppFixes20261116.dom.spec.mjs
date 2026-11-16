import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';

// Owner-app launch fixes, 2026-11-16. The real Dashboard and Billing pages in
// jsdom; only HTTP is replaced by a synthetic transport. No server or provider
// is contacted.
//
// Expected results, written before running:
//  Dashboard, Starter (new, or downgraded with a kept price book): no QUOTEDONE
//   STATUS band, no NEEDS PRICING band or counter, no "SERVICES WAITING ON YOUR
//   PRICING" button, no "NOTHING WAITING ON YOU" line, no "BOOKED ON CALENDAR"
//   counter (dashboard or report), no "Calendar" setup fact, no "Quote accuracy
//   and job costs" section, no "Webhooks and CSV support" panel, no quoting
//   notice, and no button that opens /pricebook or /calendar.
//   Today: every one of these renders.
//  Dashboard, Operator and QuoteDone: every one of those sections still renders.
//  Billing: a refused Reactivate and a Cancel plan answered
//   BILLING_CANCELLATION_UNCONFIRMED keep their message after the refresh
//   (today: no message). "Cancel before your next charge using Cancel plan
//   below." shows only together with the Cancel plan button (today: also with
//   the button hidden).
const root=fileURLToPath(new URL('..',import.meta.url));
const fakeApi='export const api=(...args)=>window.__transport(...args);'+
  'export function go(path){window.__went.push(path);}'+
  'export const logout=async()=>{};export const getToken=()=>"[PLACEHOLDER] owner session";export const setToken=()=>{};'+
  'export const getSessionKey=()=>"[PLACEHOLDER] owner";export const refreshSession=async()=>{};';
const bundleFor=async contents=>(await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',loader:{'.css':'empty'},
  define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},
  plugins:[{name:'synthetic-owner-transport',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({loader:'js',contents:fakeApi}));}}],
  stdin:{resolveDir:root,loader:'jsx',contents}})).outputFiles[0].text;
let dashboardBundle,billingBundle;
before(async()=>{
  dashboardBundle=await bundleFor("import React from 'react';import {createRoot} from 'react-dom/client';import Dashboard from './client/src/dashboard.jsx';window.__root=createRoot(document.getElementById('root'));window.__root.render(<Dashboard/>);");
  billingBundle=await bundleFor("import React from 'react';import {createRoot} from 'react-dom/client';import Billing from './client/src/billing.jsx';window.__root=createRoot(document.getElementById('root'));window.__root.render(<Billing/>);");
});
const pause=()=>new Promise(r=>setTimeout(r,10));
async function waitFor(check,label){for(let n=0;n<500;n++){const value=check();if(value)return value;await pause();}assert.fail('Timed out: '+label);}
function jsdom(t,url){
  const errors=[];
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url,runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
  const {window}=dom;window.TextEncoder=TextEncoder;window.structuredClone=structuredClone;window.__went=[];window.scrollTo=()=>{};
  Object.defineProperty(window,'crypto',{value:webcrypto,configurable:true});
  t.after(()=>{window.__root?.unmount();window.close();assert.deepEqual(errors,[]);});
  return window;
}

// Dashboard ------------------------------------------------------------------
const NEEDS={serviceType:'FENCING_INSTALL',service:'[SYNTHETIC] Fencing installation',status:'NEEDS PRICING',missingOwnerFields:['source','origin','post'],missingOwnerLabels:['Source','Origin','Post']};
const LIVE={serviceType:'DECK_BUILD',service:'[SYNTHETIC] Deck building',status:'QUOTING LIVE',missingOwnerFields:[],missingOwnerLabels:[]};
const STORED={total:3,calls:[],counts:{answered:3,quotes:1,bookings:1,seconds:900},notifications:null,emailAlertsConfigured:false};
const PREVIEW={label:'[SYNTHETIC] PREVIEW',minutes:{label:'10 / 300',used:10,included:300},feed:[],liveCall:null,
  counters:{callsAnswered:{value:4,unit:'calls',detail:'[SYNTHETIC] ANSWERED'},quotesDelivered:{value:2,detail:'[SYNTHETIC] QUOTED'},bookedOnCalendar:{value:1,detail:'[SYNTHETIC] BOOKED'},timeOffTheClock:{value:1.5,unit:'hrs',detail:'[SYNTHETIC] TIME'}},
  priorityAction:{eyebrow:'[SYNTHETIC] REVIEW QUOTES',detail:'[SYNTHETIC] Two quotes wait.',count:2}};
const REPORT={counts:{answered:3,calls:3,spam:0,quotes:1,bookings:1,seconds:900,billedMinutes:5},range:{fromDate:'2026-11-01',toDate:'2026-11-30',timezone:'America/Moncton'},
  afterHours:{count:0,unknown:0,duringHours:3,basis:'[SYNTHETIC] basis'},values:{quoted:[],booked:[],invoiced:[]},excludedValues:{quoted:{},booked:{},invoiced:{}},
  valueBasis:'[SYNTHETIC] value basis',funnel:[],funnelBasis:'[SYNTHETIC] funnel basis',jobMetrics:[],followUp:{open:0,overdue:0,items:[]},canManage:false,settings:{revision:0}};
async function mountDashboard(t,{plan,statuses=[],activity=STORED,preview=null,quotingNotice=null}){
  const window=jsdom(t,'https://synthetic.invalid/dashboard'),requests=[];
  window.__transport=async path=>{
    requests.push(path);
    if(path==='/api/dashboard')return {role:'owner',ownerId:'synthetic-owner',operator:{enabled:false,eligible:true,missing:[]},onboardingStep:9,quoteRequestCount:0,
      callActivity:activity,quotingNotice,minuteUsage:null,pricebookStatuses:statuses,previewActivity:preview,sections:[]};
    if(path==='/api/onboarding/state')return {account:{plan,planStatus:'active',timezone:'America/Moncton',businessName:'[SYNTHETIC] Cedar Co'},preview:{},
      profile:{onboardingStep:9,knowledgeBase:{about:'[SYNTHETIC] About',hours:'[SYNTHETIC] Hours'},calendar:{status:'not_connected'},agentName:'Nova',phoneProvisioningStatus:'provisioned'}};
    if(path==='/api/leads/activity')return activity;
    if(path.startsWith('/api/reports?'))return REPORT;
    if(path==='/api/integrations/webhook')return {webhook:null,deliveries:[],dispatchEnabled:true};
    if(path.startsWith('/api/integrations/webhook/deliveries'))return {total:0,deliveries:[],nextOffset:null};
    throw Error('[PLACEHOLDER] unexpected request '+path);
  };
  window.eval(dashboardBundle);
  const d=window.document;
  await waitFor(()=>d.querySelector('main')?.textContent.includes('Follow-up'),'dashboard and report');
  await pause();
  return {window,d,requests,text:d.querySelector('main').textContent};
}
const LOCKED_SECTIONS=['QUOTEDONE STATUS','NEEDS PRICING','SERVICES WAITING ON YOUR PRICING','SET PRICES','Open price book','BOOKED ON CALENDAR','Quote accuracy and job costs','Webhooks and CSV support','Save webhook'];
const setupFacts=d=>[...d.querySelectorAll('.setup-facts > div > span')].map(n=>n.textContent);
// Clicks every button on the page and records where it navigates.
async function destinations(window){
  const went=[];
  for(const button of [...window.document.querySelectorAll('main button')]){
    if(button.disabled)continue;window.__went.length=0;button.click();await pause();went.push(...window.__went);
  }
  return went;
}

for(const [label,options] of [
  ['new Starter owner',{plan:'Starter'}],
  ['downgraded Starter owner with a kept price book',{plan:'Starter',statuses:[NEEDS,LIVE]}],
  ['downgraded Starter owner, every service priced',{plan:'Starter',statuses:[LIVE]}],
  ['Starter owner with an unreadable kept price book',{plan:'Starter',statuses:[],quotingNotice:'[SYNTHETIC] The saved price book cannot be read.'}],
  ['Starter owner in local preview',{plan:'Starter',statuses:[NEEDS],activity:{...STORED,total:0},preview:PREVIEW}]
]){
  test(`dashboard (${label}): no QuoteDone, price book, calendar, job-cost or webhook panels and no way into locked pages`,async t=>{
    const {window,d,text}=await mountDashboard(t,options);
    for(const words of LOCKED_SECTIONS)assert.ok(!text.includes(words),words);
    assert.ok(!text.includes('NOTHING WAITING ON YOU'));assert.ok(!text.includes('[SYNTHETIC] REVIEW QUOTES'));
    assert.ok(!text.includes('[SYNTHETIC] The saved price book cannot be read.'));
    assert.deepEqual(setupFacts(d),['Business line','Knowledge base','Voice']);
    // What Starter keeps.
    for(const words of ['Where to continue','Call feed','Reports','CALLS ANSWERED','TIME OFF THE CLOCK · EST.','Follow-up'])assert.ok(text.includes(words),words);
    const went=await destinations(window);
    assert.ok(!went.some(path=>/^\/(pricebook|calendar)/.test(path)),JSON.stringify(went));
  });
}

for(const plan of ['Operator','QuoteDone']){
  test(`dashboard (${plan}): every QuoteDone, price book, calendar, job-cost and webhook section still shows`,async t=>{
    const {d,text}=await mountDashboard(t,{plan,statuses:[NEEDS,LIVE]});
    for(const words of LOCKED_SECTIONS)assert.ok(text.includes(words),words);
    assert.deepEqual(setupFacts(d),['Business line','Knowledge base','Calendar','Voice']);
    const settled=await mountDashboard(t,{plan,statuses:[LIVE]});
    assert.ok(settled.text.includes('NOTHING WAITING ON YOU'));
    const notice=await mountDashboard(t,{plan,quotingNotice:'[SYNTHETIC] The saved price book cannot be read.'});
    assert.ok(notice.text.includes('[SYNTHETIC] The saved price book cannot be read.'));
    const preview=await mountDashboard(t,{plan,statuses:[],activity:{...STORED,total:0},preview:PREVIEW});
    assert.ok(preview.text.includes('[SYNTHETIC] REVIEW QUOTES'));assert.ok(preview.text.includes('BOOKED ON CALENDAR'));
  });
}

// Billing --------------------------------------------------------------------
const NOW=Date.parse('2026-11-16T12:00:00.000Z');
const SERVICE_END='2026-12-01T03:30:00.000Z';
const CANCELLED={state:'CONFIRMED',endAt:SERVICE_END,phoneReleaseAt:'2026-12-31T03:30:00.000Z',exportUntilAt:'2027-03-01T03:30:00.000Z'};
const CANCEL_SENTENCE='Cancel before your next charge using Cancel plan below.';
const buttonNamed=(d,name)=>[...d.querySelectorAll('button')].find(n=>n.textContent===name);
async function mountBilling(t,{query='',status={},cancellation=null,failures={}}){
  const window=jsdom(t,'https://synthetic.invalid/settings/billing'+query),calls=[];window.Date.now=()=>NOW;
  window.__transport=async (path,options={})=>{
    calls.push({path,method:options.method||'GET'});
    if(path==='/api/onboarding/state')return {account:{timezone:'America/Moncton'}};
    if(path==='/api/billing/lifecycle')return {notices:[],cancellation};
    if(path==='/api/dashboard')return {minuteUsage:null};
    if(path==='/api/billing/status')return {plan:'Operator',planStatus:'active',billingEnabled:true,providerAvailable:true,canCheckout:false,canManageBilling:true,cancelAtPeriodEnd:false,checkoutState:'NONE',billingInterval:'monthly',...status};
    if(failures[path])throw Object.assign(Error('[SYNTHETIC] refused'),failures[path]);
    throw Error('[PLACEHOLDER] unexpected request '+path);
  };
  window.eval(billingBundle);
  const d=window.document;
  await waitFor(()=>buttonNamed(d,'Refresh billing status')&&billingReady(d),'billing loaded');
  return {d,calls};
}
const billingReady=d=>{const button=buttonNamed(d,'Refresh billing status');return Boolean(button&&!button.disabled);};
const alertText=d=>d.querySelector('[role="alert"]')?.textContent||null;
const lifecycleText=d=>d.querySelector('[aria-label="Plan lifecycle"]')?.textContent||'';

test('billing: a Cancel plan answered BILLING_CANCELLATION_UNCONFIRMED keeps its message after the refresh',async t=>{
  const {d,calls}=await mountBilling(t,{failures:{'/api/billing/cancel':{code:'BILLING_CANCELLATION_UNCONFIRMED',status:502}}});
  buttonNamed(d,'Cancel plan').click();
  await waitFor(()=>calls.filter(c=>c.path==='/api/billing/status').length===2&&billingReady(d),'refresh after cancel');
  await pause();
  assert.equal(alertText(d),'The change is awaiting confirmation. Refresh or retry; your request is saved.');
  // A manual refresh afterwards clears it as before.
  buttonNamed(d,'Refresh billing status').click();
  await waitFor(()=>calls.filter(c=>c.path==='/api/billing/status').length===3&&billingReady(d),'manual refresh');await pause();
  assert.equal(alertText(d),null);
});

test('billing: a refused Reactivate keeps its message after the refresh',async t=>{
  const {d,calls}=await mountBilling(t,{status:{planStatus:'canceled',serviceEndsAt:'2027-10-20T12:00:00.000Z',canCheckout:false},cancellation:CANCELLED,
    failures:{'/api/billing/reactivate':{code:'BILLING_NEW_SUBSCRIPTION_REQUIRED',status:409}}});
  buttonNamed(d,'Reactivate').click();
  await waitFor(()=>calls.filter(c=>c.path==='/api/billing/status').length===2&&billingReady(d),'refresh after reactivate');await pause();
  assert.equal(alertText(d),'Start a new subscription below to reactivate retained data.');
});

test('billing: a successful Cancel plan shows no error',async t=>{
  const {d,calls}=await mountBilling(t,{});
  // Replace the cancel request with a success for this mount.
  d.defaultView.__transport=(original=>async(path,options={})=>path==='/api/billing/cancel'?(calls.push({path,method:'POST'}),{}):original(path,options))(d.defaultView.__transport);
  buttonNamed(d,'Cancel plan').click();
  await waitFor(()=>calls.filter(c=>c.path==='/api/billing/status').length===2&&billingReady(d),'refresh after cancel');await pause();
  assert.equal(alertText(d),null);
});

for(const [label,options,shown] of [
  ['active plan with the Cancel plan button',{query:'?billingAction=cancel'},true],
  ['already cancelled',{query:'?billingAction=cancel',status:{serviceEndsAt:SERVICE_END,cancelAtPeriodEnd:true},cancellation:CANCELLED},false],
  ['billing provider off',{query:'?billingAction=cancel',status:{providerAvailable:false,canManageBilling:false}},false],
  ['billing portal unavailable for this account',{query:'?billingAction=cancel',status:{canManageBilling:false}},false],
  ['no cancel link',{query:''},false]
]){
  test(`billing: "Cancel plan below" appears only with the Cancel plan button (${label})`,async t=>{
    const {d}=await mountBilling(t,options);
    assert.equal(lifecycleText(d).includes(CANCEL_SENTENCE),shown);
    if(lifecycleText(d).includes(CANCEL_SENTENCE))assert.ok(buttonNamed(d,'Cancel plan'));
    if(options.query&&!shown)assert.equal(buttonNamed(d,'Cancel plan'),undefined);
  });
}
