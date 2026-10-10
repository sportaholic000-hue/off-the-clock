import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {buildScreens,EXPECTED_AREA,missingConfiguration} from './leadsAreaUI20261010Fixture.mjs';
import {db,seed,knowledgeApp,getBusinessProfile,saveKnowledgeBase} from './namedReviewContact20261006.fixture.mjs';

// HANDWRITTEN before running: Operator/QuoteDone each show the control; Starter
// does not. Typing Halifax / NS / ca and Review and save persists EXPECTED_AREA
// through the real onboarding endpoint, survives reopening and an AI draft.
// Duplicate cities fail without a request or mutation; all areas stores an empty
// city list. Add city stops at 100. Calendar shows every missing requirement,
// removes them when ready, and links to Knowledge base. Lead links target the
// saved quote and the booking's local calendar date, including for staff views.
let bundle;test.before(async()=>{bundle=await buildScreens();});test.after(()=>db.close());
const pause=()=>new Promise(r=>setTimeout(r,10));
async function waitFor(predicate){for(let n=0;n<250;n++){if(predicate())return;await pause();}assert.fail('Timed out waiting for DOM update');}
const button=(d,text)=>[...d.querySelectorAll('button')].find(n=>n.textContent.trim()===text);
function input(d,text){const label=[...d.querySelectorAll('label')].find(n=>n.textContent.trim()===text);return label?.querySelector('input,select')||d.getElementById(label?.htmlFor)||d.querySelector('[aria-label="'+text+'"]');}
async function change(w,node,value){assert.ok(node,'Expected form control');const prototype=node.tagName==='SELECT'?w.HTMLSelectElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new w.Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));await pause();}
async function screen(t,plan='Operator'){
  const owner=seed(),h=await knowledgeApp(t,{draft:{about:'[SYNTHETIC] Draft',hours:'Weekdays',neverSay:[],serviceArea:{mode:'all',cities:[]}}}),requests=[];
  const dom=new JSDOM('<div id="root"></div>',{url:h.origin,runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  const w=dom.window,d=w.document;w.structuredClone=structuredClone;
  w.fetch=async(path,options={})=>{requests.push({path,body:options.body&&JSON.parse(options.body)});return fetch(h.origin+path,{...options,headers:{...options.headers,Authorization:'Bearer '+owner.token}});};
  w.eval(bundle.script);
  async function open(){w.saved=false;w.mountKnowledge({account:{plan,firstName:'Synthetic Casey'},profile:getBusinessProfile(owner.id)});await waitFor(()=>w.readyMountNumber===w.mountNumber);}
  t.after(()=>{w.unmount();w.close();});await open();return {owner,w,d,open,requests};
}
for(const plan of ['Operator','QuoteDone'])test(`${plan} service-area DOM entry, real save, reload and draft preservation`,async t=>{
  const {owner,w,d,open,requests}=await screen(t,plan);
  await change(w,input(d,'Where do you work?'),'cities');
  await change(w,input(d,'City 1'),' Halifax ');await change(w,input(d,'Province/state 1'),' NS ');await change(w,input(d,'Country code 1'),'ca');
  button(d,'Review and save').click();await waitFor(()=>w.saved);
  assert.deepEqual(getBusinessProfile(owner.id).knowledgeBase.serviceArea,EXPECTED_AREA);
  assert.deepEqual(requests.find(r=>r.path==='/api/onboarding/knowledge-base').body.serviceArea,EXPECTED_AREA);
  await open();assert.equal(input(d,'City 1').value,'Halifax');
  button(d,'Draft from my business').click();await waitFor(()=>d.body.textContent.includes('DRAFT'));
  assert.equal(input(d,'Where do you work?').value,'cities');assert.equal(input(d,'City 1').value,'Halifax');
  button(d,'Add city').click();await waitFor(()=>input(d,'City 2'));
  await change(w,input(d,'City 2'),'halifax');await change(w,input(d,'Province/state 2'),'ns');await change(w,input(d,'Country code 2'),'CA');
  const before=requests.length;button(d,'Review and save').click();await waitFor(()=>d.body.textContent.includes('Service-area cities must be unique.'));
  assert.equal(requests.length,before);assert.deepEqual(getBusinessProfile(owner.id).knowledgeBase.serviceArea,EXPECTED_AREA);
  await change(w,input(d,'Where do you work?'),'all');w.saved=false;button(d,'Review and save').click();await waitFor(()=>w.saved);
  assert.deepEqual(getBusinessProfile(owner.id).knowledgeBase.serviceArea,{mode:'all',cities:[]});
  await open();assert.equal(input(d,'Where do you work?').value,'all');assert.equal(input(d,'City 1'),null);
});
test('service-area DOM limits and Starter visibility',async t=>{
  const {owner,w,d,open}=await screen(t);
  saveKnowledgeBase(owner.id,{about:'[SYNTHETIC] Limit',hours:'Weekdays',serviceArea:{mode:'cities',cities:Array.from({length:100},(_,n)=>({city:'Synthetic '+n,region:'NS',country:'CA'}))}});
  await open();await waitFor(()=>input(d,'City 100'));assert.equal(button(d,'Add city').disabled,true);
  assert.equal(input(d,'City 1').maxLength,100);assert.equal(input(d,'Province/state 1').maxLength,64);assert.equal(input(d,'Country code 1').maxLength,2);
  w.mountKnowledge({account:{plan:'Starter'},profile:getBusinessProfile(owner.id)});await waitFor(()=>!input(d,'Where do you work?'));
});
test('Calendar missing requirements and saved lead navigation render in the DOM',async t=>{
  const {w,d}=await screen(t);
  w.mountRequirements(missingConfiguration);await waitFor(()=>d.body.textContent.includes('Booking requirements'));
  for(const text of ['Save booking hours and scheduling rules.','Connect a destination calendar.','Configure a structured service area before direct booking.','Choose a valid service duration.'])assert.ok(d.body.textContent.includes(text),text);
  button(d,'Set service area').click();assert.equal(w.location.pathname+w.location.search,'/onboarding?step=5');
  w.mountRequirements({services:[],directBooking:{ready:true,globalBlockers:[],releaseBlockers:[]}});await waitFor(()=>d.body.textContent.includes('Ready for direct booking'));
  assert.equal(d.querySelectorAll('li').length,0);
  w.mountLinks({linkedQuoteId:'SYNTHETIC-quote',bookings:[{id:'SYNTHETIC-booking',status:'CONFIRMED',startAtUtc:'2026-11-01T13:00:00Z',timezone:'America/Moncton'}]});
  await waitFor(()=>button(d,'Quotes'));button(d,'Quotes').click();assert.equal(w.location.pathname+w.location.search,'/quotes?record=SYNTHETIC-quote');
  button(d,'Calendar').click();assert.equal(w.location.pathname+w.location.search,'/calendar?fromDate=2026-11-01');
});
