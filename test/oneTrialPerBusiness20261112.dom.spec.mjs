import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';

// Owner ruling 2026-11-12: one free trial per business. The whole owner app
// (client/src/main.jsx) with its real router and api.js; only window.fetch
// answers like the server. Expected, written before execution:
// - Billing, Dashboard and setup show "Start your plan" with exactly "Your free
//   trial has already been used, so your card is charged when you check out."
//   for an account the server reports as trialEligible:false;
// - a new account (trialEligible:true) still sees "Start your 14-day trial"
//   and never that sentence;
// - a canceled account that is not trial-eligible is told the same sentence
//   in the checkout section, and is never told its plan starts with a trial.
const root=fileURLToPath(new URL('..',import.meta.url));
let bundle;
before(async()=>{
  const result=await build({absWorkingDir:root,entryPoints:['client/src/main.jsx'],bundle:true,write:false,platform:'browser',format:'iife',
    loader:{'.css':'empty','.js':'jsx'},define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},logLevel:'silent'});
  bundle=result.outputFiles[0].text;
});

const SENTENCE='Your free trial has already been used, so your card is charged when you check out.';
const TRIAL_PROMISE=/14-day trial|trial end/;
const pause=(ms=10)=>new Promise(r=>setTimeout(r,ms));
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const OWNER_TOKEN=b64({alg:'HS256'})+'.'+b64({sub:'synthetic-owner',role:'owner',sid:'S'.repeat(43),exp:4102444800})+'.[PLACEHOLDER]';

function server({planStatus='pending_payment',trialEligible}){
  const calls=[];
  const account={firstName:'[PLACEHOLDER] Pat',businessName:'[PLACEHOLDER] Cedar Co',plan:'Operator',planStatus,timezone:'America/Moncton',
    trialNotStarted:planStatus==='pending_payment',trialEligible};
  const state={account,priceBookAccess:false,operator:{missing:[]},preview:{},
    profile:{onboardingStep:1,knowledgeBase:{},calendar:{},businessTypes:[],country:'CA',region:'NB'}};
  const reply=(code,body)=>({ok:code<400,status:code,json:async()=>body,blob:async()=>new Blob([])});
  async function fetch(url,{method='GET',body}={}){
    const path=String(url).replace(/^https?:\/\/[^/]+/,'').split('?')[0];
    calls.push({path,method,body:body?JSON.parse(body):undefined});
    if(path==='/api/dashboard')return reply(200,{role:'owner',ownerId:'synthetic-owner',operator:{},onboardingStep:1,sections:[],minuteUsage:null,pricebookStatuses:[],quoteRequestCount:0});
    if(path==='/api/onboarding/state')return reply(200,state);
    if(path==='/api/onboarding/account'&&method==='POST')return reply(200,{account});
    if(path==='/api/pricebook/meta')return reply(200,{services:[]});
    if(path==='/api/auth/account')return reply(200,{emailVerified:true});
    if(path==='/api/billing/status')return reply(200,{billingEnabled:true,providerAvailable:true,plan:'Operator',planStatus,billingInterval:null,
      trialEndsAt:null,paymentFailedAt:null,graceEndsAt:null,currentPeriodEndAt:null,cancelAtPeriodEnd:false,checkoutState:'NONE',
      canCheckout:true,canManageBilling:planStatus!=='pending_payment',trialNotStarted:account.trialNotStarted,trialEligible});
    if(path==='/api/billing/lifecycle')return reply(200,{notices:[],cancellation:null});
    if(method!=='GET')return reply(403,{error:'[PLACEHOLDER] unexpected write '+path});
    return reply(200,{});
  }
  return {fetch,calls};
}
async function mount(t,{path,backend}){
  const errors=[],dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://app.synthetic.invalid'+path,runScripts:'dangerously',pretendToBeVisual:true,
    virtualConsole:new VirtualConsole().on('jsdomError',e=>{if(!/Not implemented: navigation/.test(String(e)))errors.push(String(e));})});
  const {window}=dom;
  window.structuredClone=structuredClone;window.scrollTo=()=>{};window.TextEncoder=TextEncoder;
  Object.defineProperty(window.crypto,'subtle',{value:webcrypto.subtle});
  if(!window.crypto.randomUUID)window.crypto.randomUUID=()=>webcrypto.randomUUID();
  window.fetch=backend.fetch;
  window.localStorage.setItem('otc_token',OWNER_TOKEN);
  t.after(()=>{window.close();assert.deepEqual(errors,[]);});
  window.eval(bundle);
  return {window,document:window.document,where:()=>window.location.pathname+window.location.search};
}
async function waitFor(check,label,limit=600){for(let n=0;n<limit;n++){const value=check();if(value)return value;await pause();}assert.fail('Timed out: '+label);}
const button=(document,label)=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
const count=(text,part)=>text.split(part).length-1;

test('Billing: an account that is not trial-eligible sees "Start your plan" and the charged-at-checkout sentence',async t=>{
  const app=await mount(t,{path:'/settings/billing',backend:server({trialEligible:false})});
  await waitFor(()=>app.document.querySelector('[aria-label="Start subscription"]'),'checkout section');
  const header=app.document.querySelector('.page-header');
  assert.equal(header.querySelector('h1').textContent,'Start your plan');
  assert.equal(header.querySelector('.page-description').textContent,SENTENCE);
  assert.doesNotMatch(app.document.body.textContent,TRIAL_PROMISE);
  assert.equal(count(app.document.body.textContent,SENTENCE),1,'said once, before checkout');
  assert.ok(button(app.document,'Continue to checkout'));
});

test('Billing: a new account still sees "Start your 14-day trial" and never the sentence',async t=>{
  const app=await mount(t,{path:'/settings/billing',backend:server({trialEligible:true})});
  await waitFor(()=>app.document.querySelector('[aria-label="Start subscription"]'),'checkout section');
  assert.equal(app.document.querySelector('h1').textContent,'Start your 14-day trial');
  assert.match(app.document.body.textContent,/Your selected plan starts with a 14-day trial and a card on file\. The first payment is at trial end:/);
  assert.equal(count(app.document.body.textContent,SENTENCE),0);
  assert.doesNotMatch(app.document.body.textContent,/Start your plan/);
});

test('Billing: a canceled account that is not trial-eligible is told before checkout, and never offered a trial',async t=>{
  const app=await mount(t,{path:'/settings/billing',backend:server({planStatus:'canceled',trialEligible:false})});
  const section=await waitFor(()=>app.document.querySelector('[aria-label="Start subscription"]'),'checkout section');
  assert.equal(app.document.querySelector('h1').textContent,'Billing');
  assert.equal(count(section.textContent,SENTENCE),1);
  const sentence=[...section.querySelectorAll('p')].find(p=>p.textContent===SENTENCE);
  const submit=button(app.document,'Continue to checkout');
  assert.ok(sentence.compareDocumentPosition(submit)&4,'the sentence comes before the checkout button');
  assert.doesNotMatch(app.document.body.textContent,TRIAL_PROMISE);
  assert.match(app.document.body.textContent,/Complete checkout with a payment method to start your selected plan\. Refresh after checkout to confirm activation\./);
});

test('Dashboard: "Start your plan" with the sentence when not trial-eligible; trial prompt for a new account',async t=>{
  const used=await mount(t,{path:'/dashboard',backend:server({trialEligible:false})});
  const prompt=await waitFor(()=>used.document.querySelector('[aria-label="Start your plan"]'),'plan prompt');
  assert.equal(prompt.querySelector('h2').textContent,'Start your plan');
  assert.equal(prompt.querySelector('p').textContent,SENTENCE);
  assert.doesNotMatch(prompt.textContent,TRIAL_PROMISE);
  assert.ok(button(used.document,'Choose your plan'));
  const fresh=await mount(t,{path:'/dashboard',backend:server({trialEligible:true})});
  const trial=await waitFor(()=>fresh.document.querySelector('[aria-label="Start your trial"]'),'trial prompt');
  assert.equal(trial.querySelector('h2').textContent,'Start your 14-day trial');
  assert.equal(count(fresh.document.body.textContent,SENTENCE),0);
  await pause(100);
});

for(const [label,trialEligible,title] of [['not trial-eligible',false,'Start your plan'],['new account',true,'Start your 14-day trial']])
  test(`Setup: after step 1, a ${label} sees "${title}"`,async t=>{
    const app=await mount(t,{path:'/onboarding?step=1',backend:server({trialEligible})});
    await waitFor(()=>app.document.body.textContent.includes('Step 1 of 9')&&button(app.document,'Continue')&&!button(app.document,'Continue').disabled,'step 1');
    button(app.document,'Continue').click();
    const panel=await waitFor(()=>app.document.querySelector('.step-panel .page-header h1')?.textContent===title&&app.document.querySelector('.step-panel'),'start panel');
    const description=panel.querySelector('.page-description').textContent;
    if(trialEligible){assert.equal(count(app.document.body.textContent,SENTENCE),0);assert.match(description,/14-day trial/);}
    else {assert.equal(description,SENTENCE);assert.doesNotMatch(app.document.body.textContent,TRIAL_PROMISE);}
    assert.ok(button(app.document,'Choose your plan'));
  });

// Owner ruling 2026-11-12: passwords are capped at bcrypt's 72 bytes. Every
// password field allows at most 72 characters, and the server's refusal for a
// longer one (accented letters and emoji count as more than one byte) is shown.
const PASSWORD_MESSAGE='Use a password of 8 to 72 characters. Accented letters and emoji count as more than one.';
function setValue(window,input,value){Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));}
function refusingServer(){
  const calls=[];
  const reply=(code,body)=>({ok:code<400,status:code,json:async()=>body});
  return {calls,async fetch(url,{method='GET',body}={}){
    const path=String(url).replace(/^https?:\/\/[^/]+/,'').split('?')[0];calls.push({path,method,body:body?JSON.parse(body):undefined});
    if(['/api/auth/register','/api/auth/reset-password','/api/auth/staff-invite/accept'].includes(path))return reply(400,{error:PASSWORD_MESSAGE});
    return reply(200,{});
  }};
}
async function mountSignedOut(t,path,backend){
  const errors=[],dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://app.synthetic.invalid'+path,runScripts:'dangerously',pretendToBeVisual:true,
    virtualConsole:new VirtualConsole().on('jsdomError',e=>{if(!/Not implemented: navigation/.test(String(e)))errors.push(String(e));})});
  const {window}=dom;
  window.structuredClone=structuredClone;window.scrollTo=()=>{};window.TextEncoder=TextEncoder;
  Object.defineProperty(window.crypto,'subtle',{value:webcrypto.subtle});
  if(!window.crypto.randomUUID)window.crypto.randomUUID=()=>webcrypto.randomUUID();
  window.fetch=backend.fetch;
  t.after(()=>{window.close();assert.deepEqual(errors,[]);});
  window.eval(bundle);
  return {window,document:window.document};
}
const ACCENTED='é'.repeat(37);  // 37 characters, 74 bytes: passes maxLength, refused by the server

for(const [path,endpoint] of [['/reset-password#token='+'A'.repeat(43),'/api/auth/reset-password'],['/staff-invite#token='+'A'.repeat(43),'/api/auth/staff-invite/accept']])
  test(`${path.split('#')[0]}: password fields allow 72 characters and show the server's length message`,async t=>{
    const backend=refusingServer(),app=await mountSignedOut(t,path,backend);
    const fields=await waitFor(()=>{const list=[...app.document.querySelectorAll('input[type="password"]')];return list.length===2&&list;},'password fields');
    assert.deepEqual(fields.map(input=>input.getAttribute('maxlength')),['72','72']);
    for(const input of fields)setValue(app.window,input,ACCENTED);
    await pause();
    app.document.querySelector('form.auth-form').dispatchEvent(new app.window.Event('submit',{bubbles:true,cancelable:true}));
    await waitFor(()=>app.document.body.textContent.includes(PASSWORD_MESSAGE),'length message');
    assert.equal(backend.calls.find(call=>call.path===endpoint).body.password,ACCENTED);
  });

test('sign-up: the password field allows 72 characters and shows the server\'s length message',async t=>{
  const backend=refusingServer(),app=await mountSignedOut(t,'/signup',backend);
  const password=await waitFor(()=>app.document.querySelector('form.auth-form input[type="password"]'),'sign-up form');
  assert.equal(password.getAttribute('maxlength'),'72');
  const inputs=[...app.document.querySelectorAll('form.auth-form input')];
  setValue(app.window,inputs[0],'[PLACEHOLDER] Pat');setValue(app.window,inputs[1],'[PLACEHOLDER] Cedar Co');
  setValue(app.window,app.document.querySelector('input[type="email"]'),'owner@example.invalid');setValue(app.window,password,ACCENTED);
  await pause();
  app.document.querySelector('form.auth-form').dispatchEvent(new app.window.Event('submit',{bubbles:true,cancelable:true}));
  await waitFor(()=>app.document.body.textContent.includes(PASSWORD_MESSAGE),'length message');
  assert.equal(backend.calls.find(call=>call.path==='/api/auth/register').body.password,ACCENTED);
});
