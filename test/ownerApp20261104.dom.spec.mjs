import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';

// Owner app changes of 2026-11-04: account time zone, Starter jurisdiction,
// dashboard order, plan-aware menu, setup rail progress and receptionist wording.
// Real React components with a synthetic transport; no server or provider is contacted.
const root=fileURLToPath(new URL('..',import.meta.url));
let bundle;
before(async()=>{
  const result=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',loader:{'.css':'empty'},
    define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'synthetic-owner-transport',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({loader:'js',contents:
      'export const api=(...args)=>window.__transport(...args);export const go=path=>window.__went.push(path);export const logout=async()=>{};'+
      'export const getToken=()=>window.localStorage.getItem("otc_token");export const setToken=()=>{};export const getSessionKey=()=>"[PLACEHOLDER]";'}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';
      import Dashboard from './client/src/dashboard.jsx';import Onboarding,{StepRail} from './client/src/onboarding.jsx';
      import {AppShell} from './client/src/ui.jsx';import {OwnerAlerts} from './client/src/ownerAlerts.jsx';
      window.__root=createRoot(document.getElementById('root'),{onUncaughtError:e=>window.__errors.push(String(e))});
      const screens={dashboard:()=><Dashboard/>,onboarding:()=><Onboarding/>,
        rail:()=><StepRail step={window.__railStep} state={window.__state} onJump={n=>window.__jumps.push(n)}/>,
        shell:()=><AppShell activePath="/calls"><main>[PLACEHOLDER]</main></AppShell>,
        alerts:()=><OwnerAlerts alerts={[]} configured={true}/>};
      window.__root.render(screens[window.__screen]());`}});
  bundle=result.outputFiles[0].text;
});

const pause=()=>new Promise(r=>setTimeout(r,10));
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=role=>b64({alg:'HS256'})+'.'+b64({sub:'synthetic-'+role,role,sid:'A'.repeat(43)})+'.[PLACEHOLDER]';
function account(plan,extra={}){return {firstName:'[PLACEHOLDER] Pat',businessName:'[PLACEHOLDER] Cedar Co',plan,planStatus:'active',timezone:'UTC',...extra};}
function onboardingState(plan,{accountExtra={},profile={}}={}){
  return {account:account(plan,accountExtra),priceBookAccess:plan!=='Starter',operator:{},preview:{},
    profile:{onboardingStep:1,knowledgeBase:{},calendar:{},businessTypes:['CUSTOM'],country:'US',region:'',...profile}};
}
async function mount(t,{screen,path='/',state,role='owner',transport,browserZone,railStep}){
  const errors=[],dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://synthetic.invalid'+path,runScripts:'dangerously',pretendToBeVisual:true,
    virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
  const {window}=dom,calls=[];
  window.structuredClone=structuredClone;window.scrollTo=()=>{};
  window.__errors=[];window.__went=[];window.__jumps=[];window.__screen=screen;window.__state=state;window.__railStep=railStep;
  if(role)window.localStorage.setItem('otc_token',token(role));
  if(browserZone){const real=window.Intl,fake=Object.create(real);fake.DateTimeFormat=function(){return {resolvedOptions:()=>({timeZone:browserZone})};};window.Intl=fake;}
  window.__transport=async(path,options={})=>{calls.push({path,method:options.method||'GET',body:options.body&&JSON.parse(JSON.stringify(options.body))});return transport(path,options);};
  t.after(()=>{window.__root.unmount();window.close();assert.deepEqual(errors,[]);assert.deepEqual(Array.from(window.__errors),[]);});
  window.eval(bundle);
  return {window,document:window.document,calls};
}
async function waitFor(check,label){for(let n=0;n<400;n++){const value=check();if(value)return value;await pause();}assert.fail('Timed out: '+label);}
const button=(document,label)=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
const text=node=>node.textContent.replace(/\s+/g,' ').trim();
function onboardingTransport(state,overrides={}){
  return async(path,options={})=>{
    if(overrides[path])return overrides[path](options);
    if(path==='/api/onboarding/state')return state;
    if(path==='/api/pricebook/meta')return {services:[]};
    if(path==='/api/auth/account')return {emailVerified:true};
    throw Error('[PLACEHOLDER] auxiliary request unavailable: '+path);
  };
}

// 1. Time zone on step 1
for(const plan of ['Starter','Operator','QuoteDone'])test(`step 1: ${plan} UTC account preselects the browser zone and posts it`,async t=>{
  const state=onboardingState(plan);
  const {document,calls,window}=await mount(t,{screen:'onboarding',path:'/onboarding?step=1',state,browserZone:'America/Moncton',
    transport:onboardingTransport(state,{'/api/onboarding/account':()=>({account:state.account})})});
  const select=await waitFor(()=>[...document.querySelectorAll('label.field')].find(l=>l.querySelector('.field-label')?.textContent==='Time zone')?.querySelector('select'),'time zone select');
  assert.equal(select.value,'America/Moncton');
  assert.ok([...select.options].some(o=>o.value==='UTC'),'UTC stays selectable');
  assert.ok([...select.options].some(o=>o.value==='America/Vancouver'),'IANA zones are listed');
  button(document,'Continue').click();
  const post=await waitFor(()=>calls.find(c=>c.path==='/api/onboarding/account'),'account save');
  assert.equal(post.method,'POST');
  assert.deepEqual(post.body,{firstName:'[PLACEHOLDER] Pat',businessName:'[PLACEHOLDER] Cedar Co',timezone:'America/Moncton',plan});
  await waitFor(()=>window.location.search==='?step=2','advance to step 2');
});
test('step 1: a saved non-UTC zone is preselected and a changed zone is posted',async t=>{
  const state=onboardingState('Operator',{accountExtra:{timezone:'America/Toronto'}});
  const {document,calls,window}=await mount(t,{screen:'onboarding',path:'/onboarding?step=1',state,browserZone:'America/Moncton',
    transport:onboardingTransport(state,{'/api/onboarding/account':()=>({account:state.account})})});
  const select=await waitFor(()=>document.querySelector('.step-panel select'),'time zone select');
  assert.equal(select.value,'America/Toronto');
  const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;
  setter.call(select,'America/Halifax');select.dispatchEvent(new window.Event('change',{bubbles:true}));
  await waitFor(()=>select.value==='America/Halifax','select change');
  button(document,'Continue').click();
  const post=await waitFor(()=>calls.find(c=>c.path==='/api/onboarding/account'),'account save');
  assert.equal(post.body.timezone,'America/Halifax');
});

// 2. Starter jurisdiction
test('step 3: Starter shows country and region only and posts only those',async t=>{
  const state=onboardingState('Starter');
  const {document,calls,window}=await mount(t,{screen:'onboarding',path:'/onboarding?step=3',state,
    transport:onboardingTransport(state,{'/api/business/jurisdiction':()=>({ok:true})})});
  const region=await waitFor(()=>document.querySelector('.step-panel input[maxlength="2"]'),'region input');
  assert.ok(document.querySelector('.step-panel select'),'country select shown');
  assert.equal(document.querySelector('.tax-question'),null);assert.equal(document.querySelector('input[type="radio"]'),null);
  assert.doesNotMatch(text(document.querySelector('.step-panel')),/sales tax|GST|HST|Tax rate/i);
  assert.equal(button(document,'Continue').disabled,true,'region is required');
  const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  setter.call(region,'me');region.dispatchEvent(new window.Event('input',{bubbles:true}));
  await waitFor(()=>!button(document,'Continue').disabled,'Continue enabled');
  button(document,'Continue').click();
  const post=await waitFor(()=>calls.find(c=>c.path==='/api/business/jurisdiction'),'jurisdiction save');
  assert.deepEqual(post.body,{country:'US',region:'ME'});
  await waitFor(()=>window.location.search==='?step=4','advance to step 4');
});
test('step 3: Starter stays on the step and shows the error when the save fails',async t=>{
  const state=onboardingState('Starter',{profile:{country:'CA',region:'NB'}});
  const {document,calls,window}=await mount(t,{screen:'onboarding',path:'/onboarding?step=3',state,
    transport:onboardingTransport(state,{'/api/business/jurisdiction':()=>{throw Object.assign(Error('[PLACEHOLDER] Jurisdiction could not be saved.'),{status:500});}})});
  await waitFor(()=>button(document,'Continue')&&!button(document,'Continue').disabled,'Continue enabled');
  button(document,'Continue').click();
  await waitFor(()=>document.querySelector('.step-panel .notice-error'),'error notice');
  assert.match(text(document.querySelector('.step-panel .notice-error')),/Jurisdiction could not be saved/);
  assert.deepEqual(calls.find(c=>c.path==='/api/business/jurisdiction').body,{country:'CA',region:'NB'});
  assert.equal(window.location.search,'?step=3');
  assert.match(text(document.querySelector('.page-header')),/Step 3 of 9/);
});
test('step 3: Operator keeps the tax question',async t=>{
  const state=onboardingState('Operator');
  const {document}=await mount(t,{screen:'onboarding',path:'/onboarding?step=3',state,transport:onboardingTransport(state)});
  await waitFor(()=>document.querySelector('.tax-question'),'tax question');
});

// 3. Dashboard order
function dashboardTransport(plan,notifications){
  const state=onboardingState(plan);
  return async path=>{
    if(path==='/api/onboarding/state')return state;
    if(path==='/api/dashboard')return {role:'owner',operator:{},pricebookStatuses:[],previewActivity:null,
      minuteUsage:{status:'UNKNOWN',message:'[PLACEHOLDER] Minute usage pending.'},
      callActivity:{total:0,counts:{answered:0,quotes:0,bookings:0,seconds:0},calls:[],notifications,emailAlertsConfigured:true}};
    if(path==='/api/leads/activity')return null;
    if(path.startsWith('/api/reports'))return {counts:{},funnel:[]};
    throw Error('[PLACEHOLDER] auxiliary panel unavailable');
  };
}
test('dashboard: receptionist status and Where to continue first, then call feed, notifications, minutes, reports',async t=>{
  const notifications=[{id:'n1',eventType:'lead.created',status:'ACCEPTED',createdAt:'2026-11-04T12:00:00Z',attemptCount:1,aggregateId:'a1'}];
  const {document}=await mount(t,{screen:'dashboard',path:'/dashboard',transport:dashboardTransport('Operator',notifications)});
  await waitFor(()=>document.querySelector('.dashboard-page [aria-label="Period reports"]'),'dashboard');
  const main=document.querySelector('.dashboard-page');
  const heading=label=>[...main.querySelectorAll('h2')].find(h=>h.textContent.trim()===label);
  const order=[main.querySelector('.operator-hero'),heading('Where to continue'),heading('Call feed'),
    main.querySelector('[aria-label="Owner notification status"]'),main.querySelector('[aria-label="Voice minute usage"]'),
    main.querySelector('[aria-label="Period reports"]'),main.querySelector('.counter-grid'),heading('Services')];
  order.forEach((node,index)=>assert.ok(node,'section '+index+' rendered'));
  for(let i=1;i<order.length;i++)assert.ok(order[i-1].compareDocumentPosition(order[i])&4,`section ${i-1} precedes section ${i}`);
  assert.ok(!text(main).includes('ACCEPTED means the email provider accepted the alert'),'delivery sentence removed from dashboard');
  assert.match(text(main.querySelector('[aria-label="Owner notification status"]')),/ACCEPTED/);
});
test('call detail notifications keep the delivery explanation',async t=>{
  const {document}=await mount(t,{screen:'alerts',transport:async()=>{throw Error('unused');}});
  await waitFor(()=>document.querySelector('[aria-label="Owner notification status"]'),'alerts');
  assert.ok(text(document.body).includes('ACCEPTED means the email provider accepted the alert. Inbox delivery and owner reading are not confirmed.'));
});

// 4. Plan-aware menu
const FULL=['Dashboard','Calls','Reports','Leads','Quotes','Customers','Price Book','Onboarding','Calendar','Team','Settings'];
for(const [plan,expected] of [['Starter',FULL.filter(l=>!['Price Book','Calendar','Team'].includes(l))],['Operator',FULL],['QuoteDone',FULL]])
  test(`menu: ${plan} owner sidebar and mobile menu`,async t=>{
    const state=onboardingState(plan);
    const {document}=await mount(t,{screen:'shell',state,transport:onboardingTransport(state)});
    const labels=()=>[...document.querySelectorAll('.side-nav .nav-item')].map(n=>n.textContent.trim());
    await waitFor(()=>labels().length===expected.length&&labels().join()===expected.join(),'menu for '+plan+': '+labels().join());
    assert.deepEqual([...document.querySelectorAll('.mobile-header option')].map(o=>o.textContent),expected);
  });
test('menu: staff keep their five pages without a plan lookup',async t=>{
  const {document,calls}=await mount(t,{screen:'shell',role:'staff',transport:async()=>{throw Error('unexpected');}});
  await waitFor(()=>document.querySelector('.side-nav'),'shell');await pause();
  assert.deepEqual([...document.querySelectorAll('.side-nav .nav-item')].map(n=>n.textContent.trim()),['Calls','Leads','Quotes','Customers','Calendar']);
  assert.deepEqual(calls,[]);
});

// 5. Setup rail
const railButtons=document=>[...document.querySelectorAll('.rail-step')].map(li=>({state:li.className.replace('rail-step ',''),disabled:li.querySelector('button').disabled}));
test('rail: an empty account at step 6 shows no completed steps',async t=>{
  const {document}=await mount(t,{screen:'rail',railStep:6,state:onboardingState('Operator'),transport:async()=>{throw Error('unused');}});
  await waitFor(()=>document.querySelector('.rail-step'),'rail');
  const rail=railButtons(document);
  assert.deepEqual(rail.map(r=>r.state),['upcoming','upcoming','upcoming','upcoming','upcoming','current','upcoming','upcoming','upcoming']);
  assert.equal(document.querySelectorAll('.rail-step.done').length,0);
  assert.ok(rail.every(r=>r.disabled));
});
test('rail: saved progress marks only passed steps done and each done step can be opened',async t=>{
  const {document,window}=await mount(t,{screen:'rail',railStep:6,state:onboardingState('Operator',{profile:{onboardingStep:4}}),transport:async()=>{throw Error('unused');}});
  await waitFor(()=>document.querySelector('.rail-step'),'rail');
  const rail=railButtons(document);
  assert.deepEqual(rail.map(r=>r.state),['done','done','done','upcoming','upcoming','current','upcoming','upcoming','upcoming']);
  assert.deepEqual(rail.map(r=>r.disabled),[false,false,false,true,true,true,true,true,true]);
  for(const n of [1,2,3])document.querySelectorAll('.rail-step button')[n-1].click();
  assert.deepEqual(Array.from(window.__jumps),[1,2,3]);
});
test('rail: a done step after the current step can be opened',async t=>{
  const {document,window}=await mount(t,{screen:'rail',railStep:2,state:onboardingState('Operator',{profile:{onboardingStep:7}}),transport:async()=>{throw Error('unused');}});
  await waitFor(()=>document.querySelector('.rail-step'),'rail');
  assert.deepEqual(railButtons(document).map(r=>r.state),['done','current','done','done','done','done','upcoming','upcoming','upcoming']);
  document.querySelectorAll('.rail-step button')[5].click();
  assert.deepEqual(Array.from(window.__jumps),[6]);
});

// 6. Receptionist wording
for(const [step,description] of [
  [1,'This is the name your receptionist uses when a caller needs you.'],
  [5,'Review what your receptionist can say before it goes live.'],
  [8,'Until a calendar is connected, your receptionist collects preferred times and puts them on the lead card.'],
  [9,'Your receptionist always greets callers with your business name and its own name.']])
  test(`wording: step ${step} description`,async t=>{
    const state=onboardingState('QuoteDone');
    const {document}=await mount(t,{screen:'onboarding',path:'/onboarding?step='+step,state,transport:onboardingTransport(state)});
    const node=await waitFor(()=>document.querySelector('.step-panel .page-description'),'step '+step);
    assert.equal(node.textContent,description);
    assert.doesNotMatch(text(document.querySelector('.step-panel')),/your operator/i);
  });
