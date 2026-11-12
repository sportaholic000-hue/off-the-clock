import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';

// The whole owner app (client/src/main.jsx) with its real router, session
// storage and api.js; only window.fetch answers like the server would.
// Expected, written before execution:
// - A new owner (never started a trial) who signs in goes straight to
//   /settings/billing: "Start your 14-day trial", the sign-up plan selected,
//   monthly billing, and never the words "read-only" or "restore service".
//   Today's code instead runs setup at /onboarding?step=2 (or shows the
//   Dashboard under that address) and the first save is refused read-only.
// - Same from /signup and /login. Opening setup step 2-9 sends them to the trial.
// - Back from checkout (/onboarding?checkout=success, or the billing page) they
//   wait for Stripe, then continue at step 2.
// - Signed out, /team and /customers show the sign-in screen.
// - Owners with a trial or paid plan, and staff, land where they did before.
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
const FORBIDDEN=/read-only|restore service/i;
// Staff sign-in lands on /leads (AuthStep go('/leads')), before and after this change.
const STAFF_LANDING='/leads';
// The app's own session identity for the owner token (client/src/sessionIdentity.js).
const OWNER_SESSION=JSON.stringify(['synthetic-owner','owner','S'.repeat(43)]);

function account(planStatus,extra={}){
  const trial=planStatus==='trialing'?{trialEndsAt:'2026-11-25T12:00:00.000Z'}:{};
  return {firstName:'[PLACEHOLDER] Pat',businessName:'[PLACEHOLDER] Cedar Co',plan:'Operator',planStatus,timezone:'UTC',
    trialNotStarted:planStatus==='pending_payment',trialEligible:planStatus==='pending_payment',...trial,...extra};
}
// confirm() is Stripe's webhook landing: from then on the trial is active.
function server({role='owner',status='pending_payment'}={}){
  const calls=[];let confirmed=false;
  const current=()=>confirmed?account('trialing'):account(status);
  const reply=(code,body)=>({ok:code<400,status:code,json:async()=>body,blob:async()=>new Blob([])});
  async function fetch(url,{method='GET',body}={}){
    const path=String(url).replace(/^https?:\/\/[^/]+/,'').split('?')[0];
    calls.push({path,method,body:body?JSON.parse(body):undefined});
    if(path==='/api/auth/login')return reply(200,{token:jwt(role,'synthetic-'+role),accessExpiresAt:'2099-01-01T00:00:00.000Z',sessionExpiresAt:'2099-01-01T00:00:00.000Z'});
    if(path==='/api/dashboard')return reply(200,{role,ownerId:'synthetic-owner',operator:{},onboardingStep:1,sections:[],minuteUsage:null,pricebookStatuses:[],quoteRequestCount:0});
    if(path==='/api/onboarding/state'){const a=current();return reply(200,{account:a,priceBookAccess:a.planStatus==='trialing',operator:{missing:[]},preview:{},
      profile:{onboardingStep:1,knowledgeBase:{},calendar:{},businessTypes:[],country:'',region:''}});}
    if(path==='/api/pricebook/meta')return reply(200,{services:[]});
    if(path==='/api/auth/account')return reply(200,{emailVerified:true});
    if(path==='/api/billing/status'){const a=current();return reply(200,{billingEnabled:true,providerAvailable:true,plan:a.plan,planStatus:a.planStatus,billingInterval:null,
      trialEndsAt:a.trialEndsAt??null,paymentFailedAt:null,graceEndsAt:null,currentPeriodEndAt:null,cancelAtPeriodEnd:false,checkoutState:'NONE',
      canCheckout:a.planStatus==='pending_payment',canManageBilling:a.planStatus!=='pending_payment',trialNotStarted:a.trialNotStarted,trialEligible:a.trialEligible});}
    if(path==='/api/billing/lifecycle')return reply(200,{notices:[],cancellation:null});
    if(path==='/api/billing/checkout')return reply(201,{url:'https://checkout.stripe.com/c/pay/synthetic'});
    if(method!=='GET')return reply(403,{error:'Your account is read-only. Manage billing to restore service.',code:'ACCOUNT_READ_ONLY'});
    return reply(200,{});
  }
  return {fetch,calls,confirm(){confirmed=true;}};
}
async function mount(t,{path,token,backend,sessionMarker=false}){
  const errors=[],dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://app.synthetic.invalid'+path,runScripts:'dangerously',pretendToBeVisual:true,
    virtualConsole:new VirtualConsole().on('jsdomError',e=>{if(!/Not implemented: navigation/.test(String(e)))errors.push(String(e));})});
  const {window}=dom;
  window.structuredClone=structuredClone;window.scrollTo=()=>{};window.TextEncoder=TextEncoder;
  Object.defineProperty(window.crypto,'subtle',{value:webcrypto.subtle});
  if(!window.crypto.randomUUID)window.crypto.randomUUID=()=>webcrypto.randomUUID();
  window.fetch=backend.fetch;
  if(token)window.localStorage.setItem('otc_token',token);
  if(sessionMarker)window.sessionStorage.setItem('otc_trial_checkout',sessionMarker);
  t.after(()=>{window.close();assert.deepEqual(errors,[]);});
  window.eval(bundle);
  return {window,document:window.document,where:()=>window.location.pathname+window.location.search};
}
async function waitFor(check,label,limit=600){for(let n=0;n<limit;n++){const value=check();if(value)return value;await pause();}assert.fail('Timed out: '+label);}
const button=(document,label)=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
async function signIn(app,email='owner@example.invalid'){
  const {window,document}=app;
  const tab=await waitFor(()=>button(document,'Sign in')&&[...document.querySelectorAll('.segmented button')].find(b=>b.textContent==='Sign in'),'sign-in tab');
  tab.click();await pause();
  const set=(input,value)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));};
  set(document.querySelector('input[type="email"]'),email);set(document.querySelector('input[type="password"]'),'[PLACEHOLDER]-password');
  await pause();
  document.querySelector('form.auth-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
}
async function onTrialStart(app,backend){
  const {document}=app;
  await waitFor(()=>app.where()==='/settings/billing'&&document.querySelector('select[aria-label="Plan"]')?.value,'trial start screen');
  assert.equal(document.querySelector('h1')?.textContent,'Start your 14-day trial');
  assert.equal(document.querySelector('select[aria-label="Plan"]').value,'Operator','plan picked at sign-up');
  assert.equal(document.querySelector('select[aria-label="Billing interval"]').value,'monthly');
  assert.match(document.body.textContent,/Your selected plan starts with a 14-day trial and a card on file\./);
  assert.doesNotMatch(document.body.textContent,FORBIDDEN);
  assert.deepEqual(backend.calls.filter(call=>call.method!=='GET'&&call.path!=='/api/auth/login'),[],'no setup save was attempted');
}

for(const path of ['/onboarding?mode=login','/signup','/login','/'])test(`new owner signing in at ${path} goes straight to starting the trial`,async t=>{
  const backend=server(),app=await mount(t,{path,backend});
  await signIn(app);
  await onTrialStart(app,backend);
  await pause(100);
  assert.equal(app.where(),'/settings/billing','stays on the trial screen');
});

test('new owner: checkout carries the sign-up plan and is remembered for the return',async t=>{
  const backend=server(),app=await mount(t,{path:'/onboarding?mode=login',backend});
  await signIn(app);await onTrialStart(app,backend);
  button(app.document,'Continue to checkout').click();
  await waitFor(()=>backend.calls.some(call=>call.path==='/api/billing/checkout'),'checkout request');
  assert.deepEqual(backend.calls.find(call=>call.path==='/api/billing/checkout').body,{plan:'Operator',billingInterval:'monthly'});
  await waitFor(()=>app.window.sessionStorage.getItem('otc_trial_checkout'),'checkout remembered for the return');
});

test('new owner back from checkout at /onboarding?checkout=success waits for Stripe, then continues at step 2',async t=>{
  const backend=server();
  const app=await mount(t,{path:'/onboarding?checkout=success',token:jwt('owner','synthetic-owner'),backend});
  await waitFor(()=>app.document.body.textContent.includes('Confirming your trial'),'confirming screen');
  assert.doesNotMatch(app.document.body.textContent,FORBIDDEN);
  await pause(300);
  assert.equal(app.where(),'/onboarding?checkout=success','waits while Stripe has not confirmed');
  backend.confirm();
  await waitFor(()=>app.where()==='/onboarding?step=2'&&app.document.body.textContent.includes('Step 2 of 9'),'setup step 2',800);
  assert.doesNotMatch(app.document.body.textContent,FORBIDDEN);
});

test('new owner back from checkout at /settings/billing?checkout=success waits for Stripe, then continues at step 2',async t=>{
  const backend=server();
  const app=await mount(t,{path:'/settings/billing?checkout=success',token:jwt('owner','synthetic-owner'),backend,sessionMarker:OWNER_SESSION});
  await waitFor(()=>app.document.body.textContent.includes('Stripe is confirming your card.'),'confirming notice');
  assert.doesNotMatch(app.document.body.textContent,FORBIDDEN);
  backend.confirm();
  await waitFor(()=>app.where()==='/onboarding?step=2'&&app.document.body.textContent.includes('Step 2 of 9'),'setup step 2',800);
  assert.equal(app.window.sessionStorage.getItem('otc_trial_checkout'),null,'used once');
});

test('billing page with checkout=success and no checkout from this session stays as it was',async t=>{
  const backend=server({status:'trialing'});
  const app=await mount(t,{path:'/settings/billing?checkout=success',token:jwt('owner','synthetic-owner'),backend,sessionMarker:'[PLACEHOLDER] another session'});
  await waitFor(()=>app.document.querySelector('[aria-label="Current subscription"]'),'billing page');
  await pause(100);
  assert.equal(app.where(),'/settings/billing?checkout=success');
  assert.equal(app.document.querySelector('h1')?.textContent,'Billing');
  assert.ok(button(app.document,'Continue setup'),'existing Continue setup button');
});

test('new owner opening setup steps 2-9 is sent to the trial; step 1 stays open',async t=>{
  const backend=server(),app=await mount(t,{path:'/onboarding?step=5',token:jwt('owner','synthetic-owner'),backend});
  await onTrialStart(app,backend);
  const first=await mount(t,{path:'/onboarding?step=1',token:jwt('owner','synthetic-owner'),backend:server()});
  await waitFor(()=>first.document.body.textContent.includes('Step 1 of 9'),'step 1');
  assert.equal(first.where(),'/onboarding?step=1');
});

for(const path of ['/team','/customers'])test(`signed out, ${path} shows the sign-in screen`,async t=>{
  const backend=server(),app=await mount(t,{path,backend});
  const form=await waitFor(()=>app.document.querySelector('form.auth-form'),'sign-in form');
  assert.equal([...form.querySelectorAll('.segmented button')].find(b=>b.classList.contains('selected'))?.textContent,'Sign in');
  assert.doesNotMatch(app.document.body.textContent,/Missing token/);
  assert.equal(app.document.querySelector('.app-shell, aside, nav.sidebar'),null,'no app frame');
  assert.deepEqual(backend.calls,[],'nothing is requested without a session');
});

test('trial owner signing in at /onboarding?mode=login continues setup as before',async t=>{
  const backend=server({status:'trialing'}),app=await mount(t,{path:'/onboarding?mode=login',backend});
  await signIn(app);
  await waitFor(()=>app.where()==='/onboarding?step=2'&&app.document.body.textContent.includes('Step 2 of 9'),'setup step 2');
});

test('trial owner signing in at /login lands on the dashboard',async t=>{
  const backend=server({status:'trialing'}),app=await mount(t,{path:'/login',backend});
  await signIn(app);
  await waitFor(()=>app.where()==='/dashboard','dashboard');
  await pause(100);
  assert.equal(app.where(),'/dashboard');
});

test('staff signing in goes where staff sign-in went before',async t=>{
  const backend=server({role:'staff'}),app=await mount(t,{path:'/onboarding?mode=login',backend});
  await signIn(app,'staff@example.invalid');
  await waitFor(()=>app.where()===STAFF_LANDING,'staff landing');
  await pause(100);
  assert.equal(app.where(),STAFF_LANDING);
  assert.ok(!backend.calls.some(call=>call.path==='/api/onboarding/state'),'staff never read owner setup state');
});
