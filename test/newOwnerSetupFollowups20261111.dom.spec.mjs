import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';

// New-owner setup follow-ups, through the whole owner app (client/src/main.jsx)
// with its real router and api.js; only window.fetch answers like the server.
// - Setup asks every new owner for the business time zone, own zone preselected,
//   at step 2 (where checkout lands) and again at steps 8 and 9 while it is UTC.
// - The Dashboard sends an owner who never started a trial to the trial screen.
// - On the trial screen, the plan choice and checkout come first.
// - /login opens on Sign in; / and /signup stay on Create account.
const root=fileURLToPath(new URL('..',import.meta.url));
let bundle;
before(async()=>{
  const result=await build({absWorkingDir:root,entryPoints:['client/src/main.jsx'],bundle:true,write:false,platform:'browser',format:'iife',
    loader:{'.css':'empty','.js':'jsx'},define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},logLevel:'silent'});
  bundle=result.outputFiles[0].text;
});

const pause=(ms=10)=>new Promise(r=>setTimeout(r,ms));
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt=(role,sub)=>b64({alg:'HS256'})+'.'+b64({sub,role,sid:'S'.repeat(43),exp:4102444800})+'.[PLACEHOLDER]';
const OWNER_TOKEN=jwt('owner','synthetic-owner');
const TIME_ZONE_HELP='Your business time zone. Call times, transfer windows and bookings use it.';

function server({planStatus='trialing',plan='Operator',timezone='UTC',profile={},failAccount=false}={}){
  const calls=[];
  const account={firstName:'[PLACEHOLDER] Pat',businessName:'[PLACEHOLDER] Cedar Co',plan,planStatus,timezone,
    trialNotStarted:planStatus==='pending_payment',trialEligible:planStatus==='pending_payment',...(planStatus==='trialing'?{trialEndsAt:'2026-11-25T12:00:00.000Z'}:{})};
  const state={account,priceBookAccess:planStatus==='trialing',operator:{missing:[]},preview:{},
    profile:{onboardingStep:2,knowledgeBase:{},calendar:{},businessTypes:[],country:'CA',region:'NB',...profile}};
  const reply=(code,body)=>({ok:code<400,status:code,json:async()=>body,blob:async()=>new Blob([])});
  async function fetch(url,{method='GET',body}={}){
    const path=String(url).replace(/^https?:\/\/[^/]+/,'').split('?')[0],parsed=body?JSON.parse(body):undefined;
    calls.push({path,method,body:parsed});
    if(path==='/api/dashboard')return reply(200,{role:'owner',ownerId:'synthetic-owner',operator:{},onboardingStep:1,sections:[],minuteUsage:null,pricebookStatuses:[],quoteRequestCount:0});
    if(path==='/api/onboarding/state')return reply(200,state);
    if(path==='/api/pricebook/meta')return reply(200,{services:[]});
    if(path==='/api/auth/account')return reply(200,{emailVerified:true});
    if(path==='/api/onboarding/account'&&method==='POST'){
      if(failAccount)return reply(400,{error:'Choose a valid time zone.'});
      account.timezone=parsed.timezone;return reply(200,{account});
    }
    if(['/api/onboarding/business-types','/api/onboarding/calendar','/api/onboarding/voice'].includes(path)&&method==='POST')return reply(200,{profile:state.profile});
    if(path==='/api/billing/status')return reply(200,{billingEnabled:true,providerAvailable:true,plan,planStatus,billingInterval:planStatus==='trialing'?'monthly':null,
      trialEndsAt:account.trialEndsAt??null,paymentFailedAt:null,graceEndsAt:null,currentPeriodEndAt:null,cancelAtPeriodEnd:false,checkoutState:'NONE',
      canCheckout:planStatus==='pending_payment'||planStatus==='canceled',canManageBilling:planStatus!=='pending_payment',trialNotStarted:account.trialNotStarted,trialEligible:account.trialEligible});
    if(path==='/api/billing/lifecycle')return reply(200,{notices:[],cancellation:null});
    if(method!=='GET')return reply(403,{error:'[PLACEHOLDER] unexpected write '+path});
    return reply(200,{});
  }
  return {fetch,calls,account,writes:()=>calls.filter(c=>c.method==='POST').map(c=>c.path)};
}
async function mount(t,{path,backend,token=OWNER_TOKEN,browserZone='America/Moncton'}){
  const errors=[],dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://app.synthetic.invalid'+path,runScripts:'dangerously',pretendToBeVisual:true,
    virtualConsole:new VirtualConsole().on('jsdomError',e=>{if(!/Not implemented: navigation/.test(String(e)))errors.push(String(e));})});
  const {window}=dom;
  window.structuredClone=structuredClone;window.scrollTo=()=>{};window.TextEncoder=TextEncoder;
  Object.defineProperty(window.crypto,'subtle',{value:webcrypto.subtle});
  if(!window.crypto.randomUUID)window.crypto.randomUUID=()=>webcrypto.randomUUID();
  // The browser's own zone; every other date formatting is untouched.
  const Real=window.Intl.DateTimeFormat;
  const Fake=function(...args){const format=new Real(...args);if(args.length)return format;
    return {resolvedOptions:()=>({...format.resolvedOptions(),timeZone:browserZone}),format:value=>format.format(value),formatToParts:value=>format.formatToParts(value)};};
  Fake.supportedLocalesOf=Real.supportedLocalesOf;window.Intl.DateTimeFormat=Fake;
  window.fetch=backend.fetch;
  if(token)window.localStorage.setItem('otc_token',token);
  t.after(()=>{window.close();assert.deepEqual(errors,[]);});
  window.eval(bundle);
  return {window,document:window.document,where:()=>window.location.pathname+window.location.search};
}
async function waitFor(check,label,limit=600){for(let n=0;n<limit;n++){const value=check();if(value)return value;await pause();}assert.fail('Timed out: '+label);}
const button=(document,label)=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
const zoneField=document=>[...document.querySelectorAll('label.field')].find(l=>l.querySelector('.field-label')?.textContent==='Time zone');
function choose(window,select,value){Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(select,value);select.dispatchEvent(new window.Event('change',{bubbles:true}));}
const precedes=(a,b)=>Boolean(a.compareDocumentPosition(b)&4);

// 2. Time zone during setup
test('step 2 asks for the time zone with the owner\'s own zone preselected, and saves it before the business type',async t=>{
  const backend=server();
  const app=await mount(t,{path:'/onboarding?step=2',backend});
  const field=await waitFor(()=>zoneField(app.document),'time zone field on step 2');
  assert.equal(field.querySelector('select').value,'America/Moncton');
  assert.match(field.textContent,new RegExp(TIME_ZONE_HELP.replace(/\./g,'\\.')));
  button(app.document,'Roofing').click();
  await waitFor(()=>!button(app.document,'Continue').disabled,'continue enabled');
  button(app.document,'Continue').click();
  await waitFor(()=>app.where()==='/onboarding?step=3','advance to step 3');
  assert.deepEqual(backend.writes(),['/api/onboarding/account','/api/onboarding/business-types']);
  assert.deepEqual(backend.calls.find(c=>c.path==='/api/onboarding/account').body,
    {firstName:'[PLACEHOLDER] Pat',businessName:'[PLACEHOLDER] Cedar Co',timezone:'America/Moncton',plan:'Operator'});
});

test('step 2 keeps a saved zone and posts a changed one',async t=>{
  const backend=server({timezone:'America/Toronto'});
  const app=await mount(t,{path:'/onboarding?step=2',backend});
  const select=(await waitFor(()=>zoneField(app.document),'time zone field')).querySelector('select');
  assert.equal(select.value,'America/Toronto');
  choose(app.window,select,'America/Halifax');await waitFor(()=>select.value==='America/Halifax','changed');
  button(app.document,'Painting').click();await pause();button(app.document,'Continue').click();
  await waitFor(()=>backend.writes().length===2,'saved');
  assert.equal(backend.calls.find(c=>c.path==='/api/onboarding/account').body.timezone,'America/Halifax');
});

test('step 2 stays put and shows the error when the time zone cannot be saved',async t=>{
  const backend=server({failAccount:true});
  const app=await mount(t,{path:'/onboarding?step=2',backend});
  await waitFor(()=>zoneField(app.document),'field');
  button(app.document,'Roofing').click();await pause();button(app.document,'Continue').click();
  await waitFor(()=>app.document.querySelector('.step-panel .notice-error'),'error');
  assert.match(app.document.querySelector('.step-panel .notice-error').textContent,/Choose a valid time zone\./);
  assert.deepEqual(backend.writes(),['/api/onboarding/account'],'the business type is not saved');
  assert.equal(app.where(),'/onboarding?step=2');
});

test('step 1 still asks for the time zone with the same field',async t=>{
  const backend=server();
  const app=await mount(t,{path:'/onboarding?step=1',backend});
  assert.equal((await waitFor(()=>zoneField(app.document),'field')).querySelector('select').value,'America/Moncton');
});

test('step 8 asks for the time zone while it is UTC and saves it before the calendar',async t=>{
  const backend=server();
  const app=await mount(t,{path:'/onboarding?step=8',backend});
  const select=(await waitFor(()=>zoneField(app.document),'field on step 8')).querySelector('select');
  assert.equal(select.value,'America/Moncton');
  button(app.document,'Skip for now').click();
  await waitFor(()=>backend.writes().length===2,'saved');
  assert.deepEqual(backend.writes(),['/api/onboarding/account','/api/onboarding/calendar']);
  assert.equal(backend.calls.find(c=>c.path==='/api/onboarding/account').body.timezone,'America/Moncton');
});

test('step 8 with a chosen zone is unchanged: no time zone field, calendar only',async t=>{
  const backend=server({timezone:'America/Toronto'});
  const app=await mount(t,{path:'/onboarding?step=8',backend});
  await waitFor(()=>button(app.document,'Skip for now'),'step 8');
  assert.equal(zoneField(app.document),undefined);
  button(app.document,'Skip for now').click();
  await waitFor(()=>backend.writes().length===1,'saved');
  assert.deepEqual(backend.writes(),['/api/onboarding/calendar']);
});

test('step 9 asks for the time zone while it is UTC: transfers show the chosen zone, never UTC',async t=>{
  const backend=server();
  const app=await mount(t,{path:'/onboarding?step=9',backend});
  const select=(await waitFor(()=>zoneField(app.document),'field on step 9')).querySelector('select');
  assert.equal(select.value,'America/Moncton');
  assert.match(app.document.body.textContent,/Transfers use America\/Moncton\./);
  assert.doesNotMatch(app.document.body.textContent,/Transfers use UTC/);
  choose(app.window,select,'America/Halifax');
  await waitFor(()=>/Transfers use America\/Halifax\./.test(app.document.body.textContent),'text follows the choice');
  const finish=await waitFor(()=>button(app.document,'Finish setup'),'finish');
  if(finish.disabled){const name=[...app.document.querySelectorAll('label.field')].find(l=>l.querySelector('.field-label')?.textContent==='Agent name')?.querySelector('input');
    Object.getOwnPropertyDescriptor(app.window.HTMLInputElement.prototype,'value').set.call(name,'Sam');name.dispatchEvent(new app.window.Event('input',{bubbles:true}));}
  await waitFor(()=>!button(app.document,'Finish setup').disabled,'finish enabled');
  button(app.document,'Finish setup').click();
  await waitFor(()=>backend.writes().includes('/api/onboarding/voice'),'saved');
  assert.deepEqual(backend.writes(),['/api/onboarding/account','/api/onboarding/voice']);
  assert.equal(backend.calls.find(c=>c.path==='/api/onboarding/account').body.timezone,'America/Halifax');
});

test('step 9 with a chosen zone, and Settings, are unchanged: no time zone field',async t=>{
  const chosen=await mount(t,{path:'/onboarding?step=9',backend:server({timezone:'America/Toronto'})});
  await waitFor(()=>button(chosen.document,'Finish setup'),'step 9');
  assert.equal(zoneField(chosen.document),undefined);
  assert.match(chosen.document.body.textContent,/Transfers use America\/Toronto\./);
  const settings=await mount(t,{path:'/settings',backend:server()});
  await waitFor(()=>button(settings.document,'Save'),'settings');
  assert.equal(zoneField(settings.document),undefined,'Settings never asks');
});

// 3. Dashboard prompt
test('the Dashboard sends an owner who never started a trial to the trial screen',async t=>{
  const backend=server({planStatus:'pending_payment'});
  const app=await mount(t,{path:'/dashboard',backend});
  const prompt=await waitFor(()=>app.document.querySelector('[aria-label="Start your trial"]'),'trial prompt');
  assert.equal(prompt.querySelector('h2').textContent,'Start your 14-day trial');
  assert.equal(prompt.querySelector('p').textContent,'Choose your plan and add a card to start your 14-day trial. Setup continues with your business type after checkout.');
  assert.ok(precedes(prompt,app.document.querySelector('.dashboard-page .operator-hero')||app.document.querySelector('.dashboard-page > button')),'at the top');
  button(app.document,'Choose your plan').click();
  await waitFor(()=>app.where()==='/settings/billing','trial screen');
  await waitFor(()=>app.document.querySelector('[aria-label="Start subscription"]'),'trial screen loaded');await pause(200);
});

test('the Dashboard for an owner with a trial has no trial prompt',async t=>{
  const app=await mount(t,{path:'/dashboard',backend:server({planStatus:'trialing'})});
  await waitFor(()=>app.document.querySelector('.dashboard-page'),'dashboard');await pause(50);
  assert.equal(app.document.querySelector('[aria-label="Start your trial"]'),null);
  assert.equal(button(app.document,'Choose your plan'),undefined);  await pause(200);
});

// 4. Plan choice and checkout first
test('trial screen: plan choice and Continue to checkout come before the subscription and minutes cards',async t=>{
  const app=await mount(t,{path:'/settings/billing',backend:server({planStatus:'pending_payment'})});
  const start=await waitFor(()=>app.document.querySelector('[aria-label="Start subscription"]'),'checkout section');
  const current=app.document.querySelector('[aria-label="Current subscription"]');
  const checkout=button(app.document,'Continue to checkout');
  assert.ok(current&&checkout);
  assert.ok(precedes(start,current),'checkout section first');
  assert.ok(precedes(checkout,current),'Continue to checkout before Current subscription');
  assert.ok(precedes(start,app.document.querySelector('.billing-settings-nav')),'before the account buttons');
  assert.equal(app.document.querySelector('h1').textContent,'Start your 14-day trial');
});

test('billing for an owner who had service keeps its order: subscription first',async t=>{
  const app=await mount(t,{path:'/settings/billing',backend:server({planStatus:'canceled'})});
  const start=await waitFor(()=>app.document.querySelector('[aria-label="Start subscription"]'),'checkout section');
  assert.ok(precedes(app.document.querySelector('[aria-label="Current subscription"]'),start));
  assert.ok(precedes(app.document.querySelector('.billing-settings-nav'),start));
});

// 5. /login
const selectedTab=document=>[...document.querySelectorAll('.segmented button')].find(b=>b.classList.contains('selected'))?.textContent;
for(const [path,tab] of [['/login','Sign in'],['/','Create account'],['/signup','Create account'],['/onboarding?mode=login','Sign in']])
  test(`signed out, ${path} opens on ${tab}`,async t=>{
    const app=await mount(t,{path,backend:server(),token:null});
    assert.equal(await waitFor(()=>selectedTab(app.document),'auth tabs'),tab);
  });
