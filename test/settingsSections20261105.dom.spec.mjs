import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';

// Settings sections (Receptionist, Business knowledge, Billing), the removed
// /receptionist page, step 9 wording and the server-voice greeting preview.
// The real app router (main.jsx) with a synthetic transport; no server or provider is contacted.
const root=fileURLToPath(new URL('..',import.meta.url));
let appBundle,stepBundle;
const fakeApi='export const api=(...args)=>window.__transport(...args);'+
  'export function go(path){window.__went.push(path);window.history.pushState({},"",path);window.dispatchEvent(new PopStateEvent("popstate"));}'+
  'export const logout=async()=>{};export const getToken=()=>window.localStorage.getItem("otc_token");export const setToken=()=>{};'+
  'export const getSessionKey=()=>"[PLACEHOLDER]";export const refreshSession=async()=>{};';
const options=contents=>({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',loader:{'.css':'empty'},
  define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},
  plugins:[{name:'synthetic-owner-transport',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({loader:'js',contents:fakeApi}));}}],
  stdin:{resolveDir:root,loader:'jsx',contents}});
before(async()=>{
  appBundle=(await build(options("import './client/src/main.jsx';"))).outputFiles[0].text;
  stepBundle=(await build(options(`import React from 'react';import {createRoot} from 'react-dom/client';import Onboarding from './client/src/onboarding.jsx';
    createRoot(document.getElementById('root'),{onUncaughtError:e=>window.__errors.push(String(e))}).render(<Onboarding/>);`))).outputFiles[0].text;
});

const BUSINESS='[SYNTHETIC] Cedar Co',NAMED=name=>`Thanks for calling ${BUSINESS}, this is ${name}. How can I help?`,CLIP=Buffer.from('[SYNTHETIC] wav').toString('base64');
const pause=()=>new Promise(r=>setTimeout(r,10));
// Lets React run the router's effects before a click navigates.
const settle=async()=>{for(let n=0;n<20;n++)await pause();};
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=role=>b64({alg:'HS256'})+'.'+b64({sub:'synthetic-'+role,role,sid:'A'.repeat(43)})+'.[PLACEHOLDER]';
function onboardingState(plan,profile={}){
  return {account:{firstName:'[PLACEHOLDER] Pat',businessName:BUSINESS,plan,planStatus:'active',timezone:'America/Moncton'},priceBookAccess:plan!=='Starter',operator:{},preview:{},
    profile:{onboardingStep:10,knowledgeBase:{about:'[SYNTHETIC] About',hours:'[SYNTHETIC] Hours',reviewContact:{name:'[PLACEHOLDER] Pat',role:'owner'}},calendar:{},businessTypes:['CUSTOM'],country:'CA',region:'NB',...profile}};
}
const BILLING={billingEnabled:false,providerAvailable:false,canCheckout:false,canManageBilling:false,cancelAtPeriodEnd:false,plan:'Operator',planStatus:'active',checkoutState:'NONE',billingInterval:null};

async function mount(t,{path,plan='Operator',role='owner',bundle=appBundle,preview,profile}){
  const errors=[],dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://synthetic.invalid'+path,runScripts:'dangerously',pretendToBeVisual:true,
    virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
  const {window}=dom,calls=[],played=[],spoken=[];
  window.structuredClone=structuredClone;window.scrollTo=()=>{};window.__errors=[];window.__went=[];
  Object.defineProperty(window,'crypto',{value:webcrypto,configurable:true});window.TextEncoder=TextEncoder;
  // Browser speech must never be used; record any attempt.
  window.speechSynthesis={speak:value=>spoken.push(value),cancel(){},getVoices:()=>[]};window.SpeechSynthesisUtterance=function(text){this.text=text;};
  window.HTMLMediaElement.prototype.play=function(){played.push(this.src);return Promise.resolve();};
  window.HTMLMediaElement.prototype.pause=function(){};
  window.localStorage.setItem('otc_token',token(role));
  const state=onboardingState(plan,profile);
  window.__transport=async(path,options={})=>{
    calls.push({path,method:options.method||'GET',body:options.body&&JSON.parse(JSON.stringify(options.body))});
    if(path==='/api/onboarding/state')return state;
    if(path==='/api/pricebook/meta')return {services:[]};
    if(path==='/api/auth/account')return {emailVerified:true};
    if(path==='/api/onboarding/voice')return {profile:{...state.profile,...options.body}};
    if(path==='/api/onboarding/knowledge-base')return {profile:state.profile};
    if(path==='/api/onboarding/voice/preview'){if(preview)return preview(options.body);return {audio:CLIP,mimeType:'audio/wav',cached:false};}
    if(path==='/api/billing/status')return BILLING;
    if(path==='/api/billing/lifecycle')return {notices:[]};
    throw Error('[PLACEHOLDER] auxiliary request unavailable: '+path);
  };
  t.after(()=>{window.close();assert.deepEqual(errors,[]);assert.deepEqual(Array.from(window.__errors),[]);assert.deepEqual(spoken,[],'no browser speech');});
  window.eval(bundle);
  return {window,document:window.document,calls,played};
}
async function waitFor(check,label){for(let n=0;n<400;n++){const value=check();if(value)return value;await pause();}assert.fail('Timed out: '+label);}
const buttonNamed=(document,label)=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
const heading=document=>document.querySelector('main .page-header h1')?.textContent;
const tabs=document=>[...document.querySelectorAll('.settings-tabs .settings-tab')].map(b=>({label:b.textContent.trim(),active:b.getAttribute('aria-current')==='page'}));
const field=(document,label)=>[...document.querySelectorAll('label.field')].find(l=>l.querySelector('.field-label')?.textContent===label)?.querySelector('input,textarea');

// Settings sections and both old paths
test('settings: /settings opens Receptionist with the three section tabs and the transfer settings',async t=>{
  const {document}=await mount(t,{path:'/settings'});
  await waitFor(()=>heading(document)==='Receptionist','Receptionist section');
  assert.deepEqual(tabs(document),[{label:'Receptionist',active:true},{label:'Business knowledge',active:false},{label:'Billing',active:false}]);
  assert.ok(document.querySelector('[role="group"][aria-label="Voice"]'));assert.ok(field(document,'Agent name'));assert.ok(field(document,'Greeting'));
  assert.ok(document.querySelector('[role="switch"]'),'transcription notice');
  assert.ok(field(document,'Transfer number'),'Operator gets the transfer number');
  assert.ok([...document.querySelectorAll('legend')].some(l=>l.textContent==='Monday'),'and the transfer windows');
  assert.ok(buttonNamed(document,'Preview'));
  assert.equal(document.querySelector('.side-nav .nav-item.active').textContent.trim(),'Settings');
});
test('settings: Starter Receptionist has no transfer settings',async t=>{
  const {document}=await mount(t,{path:'/settings',plan:'Starter'});
  await waitFor(()=>heading(document)==='Receptionist','Receptionist section');
  assert.equal(field(document,'Transfer number'),undefined);
});
test('settings: Receptionist saves through POST /api/onboarding/voice and stays in Settings',async t=>{
  const {document,calls,window}=await mount(t,{path:'/settings'});
  await waitFor(()=>buttonNamed(document,'Save'),'save');buttonNamed(document,'Save').click();
  const post=await waitFor(()=>calls.find(c=>c.path==='/api/onboarding/voice'),'voice save');
  assert.equal(post.method,'POST');assert.equal(post.body.agentName,'Nova');assert.equal(post.body.greeting,NAMED('Nova'));
  assert.equal(post.body.fromSettings,true,'a Settings save keeps setup progress');
  await waitFor(()=>document.querySelector('.notice-success'),'saved notice');
  assert.match(document.querySelector('.notice-success').textContent,/Receptionist settings saved/);
  assert.equal(window.location.pathname,'/settings');assert.ok(!window.__went.includes('/dashboard'));
});
test('settings: Business knowledge is the step 5 screen with the website import, and saves in place',async t=>{
  const {document,calls,window}=await mount(t,{path:'/settings'});
  await waitFor(()=>heading(document)==='Receptionist','Receptionist section');await settle();buttonNamed(document,'Business knowledge').click();
  await waitFor(()=>heading(document)==='Business knowledge','knowledge section');
  assert.equal(window.location.pathname+window.location.search,'/settings?section=knowledge');
  assert.deepEqual(tabs(document).map(t=>t.active),[false,true,false]);
  assert.ok(field(document,'Business website URL'),'website import field');assert.ok(buttonNamed(document,'Draft from my business'),'website import button');
  assert.ok(field(document,'About & area'));assert.ok(field(document,'Hours'));
  buttonNamed(document,'Save').click();
  const knowledgePost=await waitFor(()=>calls.find(c=>c.path==='/api/onboarding/knowledge-base'&&c.method==='POST'),'knowledge save');
  assert.equal(knowledgePost.body.fromSettings,true,'a Settings save keeps setup progress');
  await waitFor(()=>document.querySelector('.notice-success'),'saved notice');
  assert.equal(window.location.search,'?section=knowledge');assert.equal(heading(document),'Business knowledge');
});
test('settings: the Billing tab is today\'s billing page at /settings/billing, with the tabs',async t=>{
  const {document,window}=await mount(t,{path:'/settings'});
  await waitFor(()=>heading(document)==='Receptionist','Receptionist section');await settle();buttonNamed(document,'Billing').click();
  await waitFor(()=>heading(document)==='Billing','billing page');
  assert.equal(window.location.pathname,'/settings/billing');
  assert.deepEqual(tabs(document).map(t=>t.active),[false,false,true]);
  await waitFor(()=>document.querySelector('[aria-label="Current subscription"]'),'billing status');
  await settle();buttonNamed(document,'Receptionist').click();await waitFor(()=>heading(document)==='Receptionist','back to Receptionist');
});
test('settings: the billing page\'s Voice & greeting button opens Settings > Receptionist',async t=>{
  const {document,window}=await mount(t,{path:'/settings/billing'});
  await waitFor(()=>heading(document)==='Billing','billing page');await settle();
  buttonNamed(document,'Voice & greeting').click();
  await waitFor(()=>heading(document)==='Receptionist','Receptionist section');
  assert.equal(window.location.pathname,'/settings');assert.ok(!window.__went.some(path=>path.startsWith('/onboarding')));
});
for(const path of ['/settings/billing','/settings?billingAction=cancel'])test(`settings: ${path} still opens Billing`,async t=>{
  const {document}=await mount(t,{path});
  await waitFor(()=>document.querySelector('[aria-label="Current subscription"]'),'billing status');
  assert.equal(heading(document),'Billing');assert.equal(tabs(document)[2].active,true);
});
test('settings: staff keep their current access and are sent to Calls',async t=>{
  const {window}=await mount(t,{path:'/settings',role:'staff'});
  await waitFor(()=>window.__went.includes('/calls'),'staff redirect');
});

// /receptionist is gone
test('/receptionist: no page and no menu item; the app sends the owner to the dashboard',async t=>{
  const {document,window}=await mount(t,{path:'/receptionist'});
  await waitFor(()=>window.__went.includes('/dashboard'),'redirect');
  assert.equal(existsSync(new URL('../client/src/receptionist.jsx',import.meta.url)),false);
  const main=readFileSync(new URL('../client/src/main.jsx',import.meta.url),'utf8'),ui=readFileSync(new URL('../client/src/ui.jsx',import.meta.url),'utf8');
  assert.ok(!main.includes('/receptionist'));assert.ok(!ui.includes("path: '/receptionist'"));
  assert.ok(![...document.querySelectorAll('.side-nav .nav-item, .mobile-header option')].some(n=>n.textContent.trim()==='Receptionist'));
});

// Setup saves advance setup progress, so they never send fromSettings.
test('setup: step 9 Finish setup and step 5 save send no fromSettings flag',async t=>{
  const nine=await mount(t,{path:'/onboarding?step=9',bundle:stepBundle,plan:'Starter'});
  await waitFor(()=>buttonNamed(nine.document,'Finish setup'),'finish');buttonNamed(nine.document,'Finish setup').click();
  const voicePost=await waitFor(()=>nine.calls.find(c=>c.path==='/api/onboarding/voice'),'voice save');
  assert.equal(Object.hasOwn(voicePost.body,'fromSettings'),false);
  const five=await mount(t,{path:'/onboarding?step=5',bundle:stepBundle});
  await waitFor(()=>buttonNamed(five.document,'Review and save'),'step 5 save');buttonNamed(five.document,'Review and save').click();
  const knowledgePost=await waitFor(()=>five.calls.find(c=>c.path==='/api/onboarding/knowledge-base'&&c.method==='POST'),'knowledge save');
  assert.equal(Object.hasOwn(knowledgePost.body,'fromSettings'),false);
});

// Step 9 wording
test('step 9: description says how the receptionist answers every call',async t=>{
  const {document}=await mount(t,{path:'/onboarding?step=9',bundle:stepBundle});
  const description=await waitFor(()=>document.querySelector('.step-panel .page-description'),'step 9');
  assert.equal(description.textContent,'This is how your receptionist answers every call.');
  assert.ok(!document.body.textContent.includes('its own name'));
});

// Preview
for(const [where,path,bundle] of [['Settings','/settings',appBundle],['step 9','/onboarding?step=9',stepBundle]]){
  test(`preview (${where}): asks the server for the current voice and greeting and plays its audio`,async t=>{
    const {document,calls,played}=await mount(t,{path,bundle});
    await waitFor(()=>buttonNamed(document,'Preview'),'preview button');
    buttonNamed(document,'Male voice').click();await pause();
    buttonNamed(document,'Preview').click();
    await waitFor(()=>played.includes('data:audio/wav;base64,'+CLIP),'clip played');
    const requests=calls.filter(c=>c.path==='/api/onboarding/voice/preview');
    assert.equal(requests.length,1);assert.equal(requests[0].method,'POST');assert.deepEqual(requests[0].body,{voiceId:'male',greeting:NAMED('Miles')},'the default name followed the voice switch');
    await waitFor(()=>buttonNamed(document,'Preview')&&!buttonNamed(document,'Preview').disabled,'ready again');
    buttonNamed(document,'Preview').click();
    await waitFor(()=>played.filter(src=>src.endsWith(CLIP)).length===2,'replayed');
    assert.equal(calls.filter(c=>c.path==='/api/onboarding/voice/preview').length,2,'the replay is served by the server\'s kept clip');
  });
  test(`preview (${where}): shows the unavailable message and never uses browser speech`,async t=>{
    const {document,played}=await mount(t,{path,bundle,preview:()=>{throw Object.assign(Error("Voice preview isn't available right now."),{status:503});}});
    await waitFor(()=>buttonNamed(document,'Preview'),'preview button');buttonNamed(document,'Preview').click();
    const status=await waitFor(()=>document.querySelector('.greeting-preview [role="status"]'),'message');
    assert.equal(status.textContent,"Voice preview isn't available right now.");
    assert.ok(!played.some(src=>!src.startsWith('data:audio/wav;base64,UklGRggCAABXQVZF')),'only the silent unlock clip was started');
  });
}
test('preview: a network or server failure also shows the unavailable message',async t=>{
  const {document}=await mount(t,{path:'/settings',preview:()=>{throw Object.assign(Error('Internal server error'),{status:500});}});
  await waitFor(()=>buttonNamed(document,'Preview'),'preview button');buttonNamed(document,'Preview').click();
  assert.equal((await waitFor(()=>document.querySelector('.greeting-preview [role="status"]'),'message')).textContent,"Voice preview isn't available right now.");
});
test('preview: the hourly limit message from the server is shown',async t=>{
  const message="You've made 20 new previews in the last hour. Previews you already played still replay; try a new greeting later.";
  const {document}=await mount(t,{path:'/settings',preview:()=>{throw Object.assign(Error(message),{status:429});}});
  await waitFor(()=>buttonNamed(document,'Preview'),'preview button');buttonNamed(document,'Preview').click();
  assert.equal((await waitFor(()=>document.querySelector('.greeting-preview [role="status"]'),'message')).textContent,message);
});
test('preview: disabled while the greeting is empty',async t=>{
  const {document,window}=await mount(t,{path:'/settings'});
  const greeting=await waitFor(()=>field(document,'Greeting'),'greeting');
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(greeting,'  ');greeting.dispatchEvent(new window.Event('input',{bubbles:true}));
  await waitFor(()=>buttonNamed(document,'Preview').disabled,'disabled');
});

// No browser speech anywhere
test('no browser speech: the client source never uses speechSynthesis',()=>{
  const directory=new URL('../client/src/',import.meta.url);
  const hits=readdirSync(directory).filter(name=>/\.(jsx?|tsx?)$/.test(name)).filter(name=>/speechSynthesis|SpeechSynthesisUtterance/.test(readFileSync(new URL(name,directory),'utf8')));
  assert.deepEqual(hits,[]);
});

// Required agent name (both screens). Expected results written before execution:
// - A new account shows Nova (female) and the greeting "Thanks for calling <business>, this is Nova. How can I help?".
// - A saved name is shown; a blank saved name shows the default for the saved voice.
// - Save / Finish setup are disabled while the name is blank or spaces only, and nothing is sent.
// - Switching voice changes a default name to the new voice's default (and the following greeting);
//   a name the owner typed stays.
const type=(window,input,value)=>{const proto=input.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));};
for(const [where,path,bundle,action] of [['Settings','/settings',appBundle,'Save'],['step 9','/onboarding?step=9',stepBundle,'Finish setup']]){
  test(`name (${where}): ${action} is disabled while the agent name is blank or spaces only`,async t=>{
    const {document,window,calls}=await mount(t,{path,bundle});
    const name=await waitFor(()=>field(document,'Agent name'),'agent name');
    await waitFor(()=>buttonNamed(document,action)&&!buttonNamed(document,action).disabled,'enabled with the default name');
    for(const blank of ['','   ']){
      type(window,name,blank);
      await waitFor(()=>buttonNamed(document,action).disabled,JSON.stringify(blank)+' disables '+action);
      buttonNamed(document,action).click();await settle();
      assert.equal(calls.filter(c=>c.path==='/api/onboarding/voice').length,0,'nothing is saved');
    }
    type(window,name,'Sam');
    await waitFor(()=>!buttonNamed(document,action).disabled,'enabled again with a name');
    buttonNamed(document,action).click();
    const post=await waitFor(()=>calls.find(c=>c.path==='/api/onboarding/voice'),'voice save');
    assert.equal(post.body.agentName,'Sam');assert.equal(post.body.greeting,NAMED('Sam'));
    assert.equal(Object.hasOwn(post.body,'fromSettings'),where==='Settings');
  });
  test(`name (${where}): a default name follows the voice switch, with the greeting`,async t=>{
    const {document}=await mount(t,{path,bundle});
    const name=await waitFor(()=>field(document,'Agent name'),'agent name');
    assert.equal(name.value,'Nova');assert.equal(field(document,'Greeting').value,NAMED('Nova'));
    buttonNamed(document,'Male voice').click();
    await waitFor(()=>field(document,'Agent name').value==='Miles','Miles for the male voice');
    assert.equal(field(document,'Greeting').value,NAMED('Miles'));
    buttonNamed(document,'Female voice').click();
    await waitFor(()=>field(document,'Agent name').value==='Nova','Nova again for the female voice');
    assert.equal(field(document,'Greeting').value,NAMED('Nova'));
  });
  test(`name (${where}): a name the owner typed stays through a voice switch`,async t=>{
    const {document,window}=await mount(t,{path,bundle});
    type(window,await waitFor(()=>field(document,'Agent name'),'agent name'),'Sam');
    await waitFor(()=>field(document,'Greeting').value===NAMED('Sam'),'greeting follows the typed name');
    buttonNamed(document,'Male voice').click();await settle();
    assert.equal(buttonNamed(document,'Male voice').getAttribute('aria-pressed'),'true');
    assert.equal(field(document,'Agent name').value,'Sam');assert.equal(field(document,'Greeting').value,NAMED('Sam'));
    // Typing the other voice's default name counts as the owner's own only if it is not that default.
    type(window,field(document,'Agent name'),'Miles');await settle();
    buttonNamed(document,'Female voice').click();
    await waitFor(()=>field(document,'Agent name').value==='Nova','Miles was the male default, so it follows');
  });
  test(`name (${where}): the greeting prefill always has the name and follows it until edited`,async t=>{
    const {document,window}=await mount(t,{path,bundle});
    const name=await waitFor(()=>field(document,'Agent name'),'agent name');
    assert.equal(field(document,'Greeting').value,NAMED('Nova'));
    type(window,name,'Riley');await waitFor(()=>field(document,'Greeting').value===NAMED('Riley'),'follows the name');
    type(window,name,'');await settle();
    assert.equal(field(document,'Greeting').value,NAMED('Riley'),'a blank name leaves the greeting, never "this is ."');
    type(window,field(document,'Greeting'),'[SYNTHETIC] Cedar Co, go ahead.');
    type(window,name,'Sam');await settle();
    assert.equal(field(document,'Greeting').value,'[SYNTHETIC] Cedar Co, go ahead.','an edited greeting no longer follows');
  });
  test(`name (${where}): shows the saved name; a blank saved name shows the default for the saved voice`,async t=>{
    const saved=await mount(t,{path,bundle,profile:{agentName:'Riley',voiceId:'male'}});
    assert.equal((await waitFor(()=>field(saved.document,'Agent name'),'agent name')).value,'Riley');
    assert.equal(field(saved.document,'Greeting').value,NAMED('Riley'));
    for(const [agentName,voiceId,expected] of [['','male','Miles'],['   ','female','Nova'],[null,undefined,'Nova']]){
      const blank=await mount(t,{path,bundle,profile:{agentName,voiceId}});
      assert.equal((await waitFor(()=>field(blank.document,'Agent name'),'agent name')).value,expected,JSON.stringify([agentName,voiceId]));
      assert.equal(field(blank.document,'Greeting').value,NAMED(expected));
    }
  });
}
