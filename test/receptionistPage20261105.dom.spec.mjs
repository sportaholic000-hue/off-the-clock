import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';

// Receptionist page, its menu item, and onboarding step 9 on the same fields.
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
      import Receptionist from './client/src/receptionist.jsx';import Onboarding from './client/src/onboarding.jsx';import {AppShell} from './client/src/ui.jsx';
      window.__root=createRoot(document.getElementById('root'),{onUncaughtError:e=>window.__errors.push(String(e))});
      const screens={receptionist:()=><Receptionist/>,onboarding:()=><Onboarding/>,shell:()=><AppShell activePath="/calls"><main>[PLACEHOLDER]</main></AppShell>};
      window.__root.render(screens[window.__screen]());`}});
  bundle=result.outputFiles[0].text;
});

const BUSINESS='[SYNTHETIC] Cedar Co';
const pause=()=>new Promise(r=>setTimeout(r,10));
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=role=>b64({alg:'HS256'})+'.'+b64({sub:'synthetic-'+role,role,sid:'A'.repeat(43)})+'.[PLACEHOLDER]';
function onboardingState(plan,profile={}){
  return {account:{firstName:'[PLACEHOLDER] Pat',businessName:BUSINESS,plan,planStatus:'active',timezone:'America/Moncton'},priceBookAccess:plan!=='Starter',operator:{},preview:{},
    profile:{onboardingStep:9,knowledgeBase:{},calendar:{},businessTypes:['CUSTOM'],country:'CA',region:'NB',...profile}};
}
async function mount(t,{screen,path='/',state,role='owner',voiceReply}){
  const errors=[],dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://synthetic.invalid'+path,runScripts:'dangerously',pretendToBeVisual:true,
    virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
  const {window}=dom,calls=[];
  window.structuredClone=structuredClone;window.scrollTo=()=>{};window.__errors=[];window.__went=[];window.__screen=screen;
  window.localStorage.setItem('otc_token',token(role));
  window.__transport=async(path,options={})=>{
    calls.push({path,method:options.method||'GET',body:options.body&&JSON.parse(JSON.stringify(options.body))});
    if(path==='/api/onboarding/state')return state;
    if(path==='/api/pricebook/meta')return {services:[]};
    if(path==='/api/auth/account')return {emailVerified:true};
    if(path==='/api/onboarding/voice')return voiceReply?voiceReply(options.body):{profile:{...state.profile,...options.body}};
    throw Error('[PLACEHOLDER] auxiliary request unavailable: '+path);
  };
  t.after(()=>{window.__root.unmount();window.close();assert.deepEqual(errors,[]);assert.deepEqual(Array.from(window.__errors),[]);});
  window.eval(bundle);
  return {window,document:window.document,calls};
}
async function waitFor(check,label){for(let n=0;n<400;n++){const value=check();if(value)return value;await pause();}assert.fail('Timed out: '+label);}
const buttonNamed=(document,label)=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
const field=(document,label)=>[...document.querySelectorAll('label.field')].find(l=>l.querySelector('.field-label')?.textContent===label)?.querySelector('input,textarea');
function type(window,element,value){
  const proto=element.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);element.dispatchEvent(new window.Event('input',{bubbles:true}));
}
const withName=name=>`Thanks for calling ${BUSINESS}, this is ${name}. How can I help?`,unnamed=`Thanks for calling ${BUSINESS}, how can I help?`;

// Menu item
for(const plan of ['Starter','Operator','QuoteDone'])test(`menu: Receptionist is in the ${plan} owner sidebar and mobile menu`,async t=>{
  const {document}=await mount(t,{screen:'shell',state:onboardingState(plan)});
  await waitFor(()=>[...document.querySelectorAll('.side-nav .nav-item')].some(n=>n.textContent.trim()==='Receptionist'),'Receptionist menu item');
  assert.ok([...document.querySelectorAll('.mobile-header option')].some(o=>o.value==='/receptionist'&&o.textContent==='Receptionist'));
});
test('menu: staff do not get Receptionist',async t=>{
  const {document}=await mount(t,{screen:'shell',role:'staff',state:onboardingState('Operator')});
  await waitFor(()=>document.querySelector('.side-nav'),'shell');await pause();
  assert.ok(![...document.querySelectorAll('.side-nav .nav-item, .mobile-header option')].some(n=>n.textContent.trim()==='Receptionist'));
});

// Page
for(const [screen,path] of [['receptionist','/receptionist'],['onboarding','/onboarding?step=9']]){
  const where=screen==='receptionist'?'Receptionist page':'step 9';
  test(`${where}: voice buttons say Female voice and Male voice with no names`,async t=>{
    const {document,window}=await mount(t,{screen,path,state:onboardingState('Operator')});
    const group=await waitFor(()=>document.querySelector('[role="group"][aria-label="Voice"]'),'voice buttons');
    assert.deepEqual([...group.querySelectorAll('button')].map(b=>b.textContent.trim()),['Female voice','Male voice']);
    const panel=document.querySelector('main').textContent;
    for(const name of ['Nova','Miles','Kore','Charon'])assert.ok(!panel.includes(name),name+' is not shown');
    buttonNamed(document,'Male voice').click();
    await waitFor(()=>buttonNamed(document,'Male voice').getAttribute('aria-pressed')==='true','male selected');
    assert.equal(buttonNamed(document,'Female voice').getAttribute('aria-pressed'),'false');
    assert.ok(window);
  });
  test(`${where}: greeting prefill follows the name until the owner edits it`,async t=>{
    const {document,window}=await mount(t,{screen,path,state:onboardingState('Operator')});
    const name=await waitFor(()=>field(document,'Agent name'),'agent name');const greeting=field(document,'Greeting');
    assert.equal(name.value,'','no preset name');
    assert.equal(greeting.value,unnamed,'prefill without a name');
    type(window,name,'Sam');await waitFor(()=>greeting.value===withName('Sam'),'prefill with a name: '+greeting.value);
    type(window,name,'Samira');await waitFor(()=>greeting.value===withName('Samira'),'prefill follows the name');
    type(window,name,'');await waitFor(()=>greeting.value===unnamed,'prefill without a name again');
    type(window,greeting,'[SYNTHETIC] Cedar Co, good day.');await waitFor(()=>greeting.value==='[SYNTHETIC] Cedar Co, good day.','owner greeting');
    type(window,name,'Sam');await pause();await pause();
    assert.equal(greeting.value,'[SYNTHETIC] Cedar Co, good day.','an edited greeting is never replaced');
  });
  test(`${where}: a saved greeting and name are shown as saved`,async t=>{
    const {document,window}=await mount(t,{screen,path,state:onboardingState('Operator',{agentName:'Robin',greeting:'[SYNTHETIC] Saved greeting.',voiceId:'male',transcriptionNotice:true})});
    const name=await waitFor(()=>field(document,'Agent name'),'agent name'),greeting=field(document,'Greeting');
    assert.equal(name.value,'Robin');assert.equal(greeting.value,'[SYNTHETIC] Saved greeting.');
    assert.equal(buttonNamed(document,'Male voice').getAttribute('aria-pressed'),'true');
    assert.equal(document.querySelector('[role="switch"]').getAttribute('aria-checked'),'true');
    type(window,name,'Sam');await pause();await pause();
    assert.equal(greeting.value,'[SYNTHETIC] Saved greeting.','a saved greeting is the owner\'s own and stays');
  });
  test(`${where}: has no Preview greeting button`,async t=>{
    const {document}=await mount(t,{screen,path,state:onboardingState('Operator')});
    await waitFor(()=>field(document,'Greeting'),'greeting');
    assert.equal(buttonNamed(document,'Preview greeting'),undefined);
    assert.ok(![...document.querySelectorAll('button')].some(b=>/preview/i.test(b.textContent)));
  });
}

test('Receptionist page: a blank name saves through POST /api/onboarding/voice',async t=>{
  const {document,calls}=await mount(t,{screen:'receptionist',path:'/receptionist',state:onboardingState('Starter')});
  await waitFor(()=>buttonNamed(document,'Save'),'save');
  assert.equal(buttonNamed(document,'Save').disabled,false,'blank name does not block saving');
  buttonNamed(document,'Save').click();
  const post=await waitFor(()=>calls.find(c=>c.path==='/api/onboarding/voice'),'voice save');
  assert.equal(post.method,'POST');
  assert.deepEqual(post.body,{voiceId:'female',agentName:'',greeting:unnamed,transcriptionNotice:false});
  await waitFor(()=>document.querySelector('.notice-success'),'saved notice');
  assert.equal(calls.filter(c=>c.method==='POST').length,1,'one save, no new route');
});
test('Receptionist page: shows the save error and keeps the form',async t=>{
  const {document,window}=await mount(t,{screen:'receptionist',path:'/receptionist',state:onboardingState('QuoteDone'),
    voiceReply:()=>{throw Object.assign(Error('[PLACEHOLDER] Agent name must be non-empty text.'),{status:400});}});
  const name=await waitFor(()=>field(document,'Agent name'),'agent name');type(window,name,'Sam');
  buttonNamed(document,'Save').click();
  await waitFor(()=>document.querySelector('.notice-error'),'error');
  assert.match(document.querySelector('.notice-error').textContent,/Agent name must be non-empty/);
  assert.equal(field(document,'Agent name').value,'Sam');assert.equal(document.querySelector('.notice-success'),null);
});
test('Receptionist page: an empty greeting cannot be saved',async t=>{
  const {document,window}=await mount(t,{screen:'receptionist',path:'/receptionist',state:onboardingState('Operator')});
  const greeting=await waitFor(()=>field(document,'Greeting'),'greeting');type(window,greeting,'   ');
  await waitFor(()=>buttonNamed(document,'Save').disabled,'save disabled');
});
test('step 9: a blank name finishes setup and posts an empty agent name',async t=>{
  const {document,calls,window}=await mount(t,{screen:'onboarding',path:'/onboarding?step=9',state:onboardingState('Starter')});
  await waitFor(()=>buttonNamed(document,'Finish setup'),'finish');
  assert.equal(buttonNamed(document,'Finish setup').disabled,false);
  buttonNamed(document,'Finish setup').click();
  const post=await waitFor(()=>calls.find(c=>c.path==='/api/onboarding/voice'),'voice save');
  assert.deepEqual(post.body,{voiceId:'female',agentName:'',greeting:unnamed,transcriptionNotice:false});
  await waitFor(()=>window.__went.includes('/dashboard'),'go to dashboard');
});
test('step 9: Operator still sends transfer settings with the answering fields',async t=>{
  const state=onboardingState('Operator',{existingPhoneNumber:'+15065550100'});
  const {document,calls}=await mount(t,{screen:'onboarding',path:'/onboarding?step=9',state});
  await waitFor(()=>buttonNamed(document,'Finish setup'),'finish');buttonNamed(document,'Finish setup').click();
  const post=await waitFor(()=>calls.find(c=>c.path==='/api/onboarding/voice'),'voice save');
  assert.equal(post.body.transferNumber,'+15065550100');assert.deepEqual(Object.keys(post.body.transferWindows),['mon','tue','wed','thu','fri','sat','sun']);
  assert.equal(post.body.agentName,'');assert.equal(post.body.greeting,unnamed);
});
