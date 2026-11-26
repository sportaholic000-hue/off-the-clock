import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';

// One business hours editor under Settings, Business knowledge. The receptionist
// settings transfer during those hours unless the owner chooses different hours.
// The real app router with a synthetic transport; no server or provider is contacted.
// HANDWRITTEN EXPECTATIONS, before execution:
// - Business knowledge shows a "Business hours" week; hours saved earlier as text
//   appear in "Anything else about your hours";
// - adding Monday 08:00–17:00 and pressing "Copy Monday to Tuesday–Friday" shows
//   "Monday to Friday: 8:00 AM to 5:00 PM. Saturday and Sunday: closed." and saves
//   weeklyHours with those five days and the note, and no free-text hours;
// - a Monday row left blank is not saved; the message names Monday;
// - with business hours saved and no transfer windows, "Transfer during my business
//   hours" is ticked, the day rows are hidden and Save sends transferUsesBusinessHours
//   true and no windows; unticked, the rows return and Save sends the windows and false;
// - with no business hours, the box is unticked and disabled, and Save sends the
//   windows without the choice, as before.
const root=fileURLToPath(new URL('..',import.meta.url));
let appBundle;
const fakeApi='export const api=(...args)=>window.__transport(...args);'+
  'export function go(path){window.__went.push(path);window.history.pushState({},"",path);window.dispatchEvent(new PopStateEvent("popstate"));}'+
  'export const logout=async()=>{};export const getToken=()=>window.localStorage.getItem("otc_token");export const setToken=()=>{};'+
  'export const getSessionKey=()=>"[PLACEHOLDER]";export const refreshSession=async()=>{};';
before(async()=>{
  appBundle=(await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',loader:{'.css':'empty'},
    define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},
    plugins:[{name:'synthetic-owner-transport',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({loader:'js',contents:fakeApi}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:"import './client/src/main.jsx';"}})).outputFiles[0].text;
});
const WEEK={mon:[{start:'08:00',end:'17:00'}],tue:[{start:'08:00',end:'17:00'}],wed:[{start:'08:00',end:'17:00'}],thu:[{start:'08:00',end:'17:00'}],fri:[{start:'08:00',end:'17:00'}],sat:[],sun:[]};
const pause=()=>new Promise(r=>setTimeout(r,10));
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=b64({alg:'HS256'})+'.'+b64({sub:'synthetic-owner',role:'owner',sid:'A'.repeat(43)})+'.[PLACEHOLDER]';
async function mount(t,{path,knowledgeBase}){
  const errors=[],dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://synthetic.invalid'+path,runScripts:'dangerously',pretendToBeVisual:true,
    virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
  const {window}=dom,calls=[];
  window.structuredClone=structuredClone;window.scrollTo=()=>{};window.__errors=[];window.__went=[];
  Object.defineProperty(window,'crypto',{value:webcrypto,configurable:true});window.TextEncoder=TextEncoder;
  window.speechSynthesis={speak(){},cancel(){},getVoices:()=>[]};window.HTMLMediaElement.prototype.play=()=>Promise.resolve();window.HTMLMediaElement.prototype.pause=()=>{};
  window.localStorage.setItem('otc_token',token);
  const state={account:{firstName:'[PLACEHOLDER] Pat',businessName:'[SYNTHETIC] Cedar Co',plan:'Operator',planStatus:'active',timezone:'America/Moncton'},priceBookAccess:true,operator:{},preview:{},
    profile:{onboardingStep:10,knowledgeBase:{about:'[SYNTHETIC] About',reviewContact:{name:'[PLACEHOLDER] Pat',role:'owner'},serviceArea:{mode:'all',cities:[]},transferNumber:'+15065550188',...knowledgeBase},calendar:{},businessTypes:['CUSTOM'],country:'CA',region:'NB'}};
  window.__transport=async(path,options={})=>{
    calls.push({path,method:options.method||'GET',body:options.body&&JSON.parse(JSON.stringify(options.body))});
    if(path==='/api/onboarding/state')return state;
    if(path==='/api/pricebook/meta')return {services:[]};
    if(path==='/api/auth/account')return {emailVerified:true};
    if(path==='/api/onboarding/voice')return {profile:state.profile};
    if(path==='/api/onboarding/knowledge-base')return {profile:state.profile};
    if(path==='/api/billing/status')return {billingEnabled:false,plan:'Operator',planStatus:'active',checkoutState:'NONE'};
    if(path==='/api/billing/lifecycle')return {notices:[]};
    throw Error('[PLACEHOLDER] auxiliary request unavailable: '+path);
  };
  t.after(()=>{window.close();assert.deepEqual(errors,[]);assert.deepEqual(Array.from(window.__errors),[]);});
  window.eval(appBundle);
  return {window,document:window.document,calls};
}
async function waitFor(check,label){for(let n=0;n<400;n++){const value=check();if(value)return value;await pause();}assert.fail('Timed out: '+label);}
const buttonNamed=(document,label)=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
const field=(document,label)=>[...document.querySelectorAll('label.field')].find(l=>l.querySelector('.field-label')?.textContent===label)?.querySelector('input,textarea');
const type=(window,input,value)=>{const proto=input.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));};
const checkbox=(document,label)=>[...document.querySelectorAll('label.calendar-checkbox')].find(l=>l.textContent.trim()===label)?.querySelector('input');
const dayLegends=document=>[...document.querySelectorAll('legend')].filter(l=>l.textContent==='Monday').length;

test('business knowledge: one week of hours, copied across weekdays, saved as the week and the note',async t=>{
  const {window,document,calls}=await mount(t,{path:'/settings?section=knowledge',knowledgeBase:{hours:'[SYNTHETIC] Weekdays, emergencies any time'}});
  await waitFor(()=>buttonNamed(document,'Add Monday hours'),'hours editor');
  assert.ok([...document.querySelectorAll('legend')].some(l=>l.textContent==='Business hours'));
  assert.equal(field(document,'Anything else about your hours').value,'[SYNTHETIC] Weekdays, emergencies any time','earlier text kept as the note');
  buttonNamed(document,'Add Monday hours').click();
  const opens=await waitFor(()=>field(document,'Monday opens 1'),'Monday row');
  type(window,opens,'08:00');type(window,field(document,'Monday closes 1'),'17:00');
  await waitFor(()=>buttonNamed(document,'Copy Monday to Tuesday–Friday'),'copy button');buttonNamed(document,'Copy Monday to Tuesday–Friday').click();
  await waitFor(()=>document.body.textContent.includes('Monday to Friday: 8:00 AM to 5:00 PM. Saturday and Sunday: closed.'),'hours preview');
  buttonNamed(document,'Save').click();
  const post=await waitFor(()=>calls.find(c=>c.path==='/api/onboarding/knowledge-base'),'knowledge save');
  assert.deepEqual(post.body.weeklyHours,WEEK);
  assert.equal(post.body.hoursNote,'[SYNTHETIC] Weekdays, emergencies any time');
  assert.equal(Object.hasOwn(post.body,'hours'),false,'no free-text hours sent');
});
test('business knowledge: a blank Monday row is not saved and the message names Monday',async t=>{
  const {document,calls}=await mount(t,{path:'/settings?section=knowledge',knowledgeBase:{weeklyHours:WEEK,hoursNote:'',hours:'x'}});
  await waitFor(()=>buttonNamed(document,'Add Monday hours'),'hours editor');
  buttonNamed(document,'Add Monday hours').click();await waitFor(()=>field(document,'Monday opens 2'),'second Monday row');
  buttonNamed(document,'Save').click();
  await waitFor(()=>document.body.textContent.includes('Enter an opening and closing time for Monday, or remove that row.'),'blank row message');
  assert.equal(calls.some(c=>c.path==='/api/onboarding/knowledge-base'),false);
});
test('receptionist: transfers follow business hours by default, or use different hours',async t=>{
  const {document,calls}=await mount(t,{path:'/settings',knowledgeBase:{weeklyHours:WEEK,hoursNote:'',hours:'x'}});
  const box=await waitFor(()=>checkbox(document,'Transfer during my business hours'),'transfer choice');
  assert.equal(box.checked,true);assert.equal(box.disabled,false);assert.equal(dayLegends(document),0,'day rows hidden');
  assert.ok(document.body.textContent.includes('Monday to Friday: 8:00 AM to 5:00 PM. Saturday and Sunday: closed. Change these under Settings, Business knowledge.'));
  buttonNamed(document,'Save').click();
  const first=await waitFor(()=>calls.find(c=>c.path==='/api/onboarding/voice'),'voice save');
  assert.equal(first.body.transferUsesBusinessHours,true);assert.equal(Object.hasOwn(first.body,'transferWindows'),false);
  await waitFor(()=>document.querySelector('.notice-success'),'first save finished');
  box.click();await waitFor(()=>dayLegends(document)===1,'day rows shown');
  await waitFor(()=>buttonNamed(document,'Save')&&!buttonNamed(document,'Save').disabled,'ready');buttonNamed(document,'Save').click();
  const second=await waitFor(()=>calls.filter(c=>c.path==='/api/onboarding/voice')[1],'second voice save');
  assert.equal(second.body.transferUsesBusinessHours,false);assert.ok(second.body.transferWindows&&Array.isArray(second.body.transferWindows.mon));
});
test('receptionist: own transfer windows stay; with no business hours the choice is unavailable and saves as before',async t=>{
  const own={mon:[{start:'10:00',end:'11:00'}],tue:[],wed:[],thu:[],fri:[],sat:[],sun:[]};
  const kept=await mount(t,{path:'/settings',knowledgeBase:{weeklyHours:WEEK,hoursNote:'',hours:'x',transferWindows:own}});
  assert.equal((await waitFor(()=>checkbox(kept.document,'Transfer during my business hours'),'transfer choice')).checked,false,'own windows kept');
  const {document,calls}=await mount(t,{path:'/settings',knowledgeBase:{hours:'[SYNTHETIC] Hours'}});
  const box=await waitFor(()=>checkbox(document,'Transfer during my business hours'),'transfer choice');
  assert.equal(box.checked,false);assert.equal(box.disabled,true);assert.equal(dayLegends(document),1);
  buttonNamed(document,'Save').click();
  const post=await waitFor(()=>calls.find(c=>c.path==='/api/onboarding/voice'),'voice save');
  assert.equal(Object.hasOwn(post.body,'transferUsesBusinessHours'),false);assert.ok(post.body.transferWindows);
});

// 2026-11-26: transfers and booking that follow business hours keep the hours they
// had when the owner clears the week (server test "a note-only week leaves transfers
// and booking on the hours they had"). Nothing on screen said so.
// HANDWRITTEN EXPECTATIONS, before execution:
// - with a week set and both following, no notice;
// - after removing Monday to Friday, this exact sentence shows: "With no opening hours
//   set here, transfers and booking keep the hours they have now. Change them under
//   Settings, Receptionist and under Calendar.";
// - only transfers following: "With no opening hours set here, transfers keep the hours
//   they have now. Change them under Settings, Receptionist.";
// - neither following: no notice.
const KEPT_BOTH='With no opening hours set here, transfers and booking keep the hours they have now. Change them under Settings, Receptionist and under Calendar.';
const KEPT_TRANSFERS='With no opening hours set here, transfers keep the hours they have now. Change them under Settings, Receptionist.';
async function clearWeek(document){
  for(const day of ['Monday','Tuesday','Wednesday','Thursday','Friday']){
    const remove=await waitFor(()=>document.querySelector('button[aria-label="Remove '+day+' hours 1"]'),'remove '+day);remove.click();
    await waitFor(()=>!document.querySelector('button[aria-label="Remove '+day+' hours 1"]'),day+' removed');
  }
}
test('business knowledge: clearing the week says transfers and booking keep their hours',async t=>{
  const {document}=await mount(t,{path:'/settings?section=knowledge',knowledgeBase:{weeklyHours:WEEK,hoursNote:'',transferUsesBusinessHours:true,bookingUsesBusinessHours:true}});
  await waitFor(()=>document.querySelector('button[aria-label="Remove Monday hours 1"]'),'hours editor');
  assert.equal(document.body.textContent.includes('keep the hours they have now'),false,'no notice while the week has hours');
  await clearWeek(document);
  await waitFor(()=>document.body.textContent.includes(KEPT_BOTH),'notice for transfers and booking');
});
test('business knowledge: the notice names only what follows the hours',async t=>{
  const one=await mount(t,{path:'/settings?section=knowledge',knowledgeBase:{weeklyHours:WEEK,hoursNote:'',transferUsesBusinessHours:true,bookingUsesBusinessHours:false}});
  await clearWeek(one.document);
  await waitFor(()=>one.document.body.textContent.includes(KEPT_TRANSFERS),'notice for transfers only');
  assert.equal(one.document.body.textContent.includes('booking keep'),false);
  const none=await mount(t,{path:'/settings?section=knowledge',knowledgeBase:{weeklyHours:WEEK,hoursNote:'',transferUsesBusinessHours:false,bookingUsesBusinessHours:false}});
  await clearWeek(none.document);await pause();await pause();
  assert.equal(none.document.body.textContent.includes('With no opening hours set here'),false,'nothing follows, so no notice');
});
