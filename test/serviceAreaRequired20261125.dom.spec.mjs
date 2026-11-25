import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {buildScreens} from './leadsAreaUI20261010Fixture.mjs';
import {db,seed,knowledgeApp,getBusinessProfile} from './namedReviewContact20261006.fixture.mjs';

// Setup step 5 and Settings > Business knowledge saved without a service area on
// plans with booking; the Calendar page then refused direct booking. Real knowledge
// screen in jsdom against the real onboarding endpoint (fixture from
// test/leadsServiceArea20261010.dom.spec.mjs).
// HANDWRITTEN EXPECTATIONS, before execution:
// - Operator and QuoteDone with no area chosen: "Review and save" shows
//   "Choose where you work under Service area: all areas or specific cities." and sends
//   nothing; after choosing All areas it saves {mode:'all',cities:[]};
// - Starter has no service area control and saves as before.
let bundle;test.before(async()=>{bundle=await buildScreens();});test.after(()=>db.close());
const pause=()=>new Promise(r=>setTimeout(r,10));
async function waitFor(predicate){for(let n=0;n<250;n++){if(predicate())return;await pause();}assert.fail('Timed out waiting for DOM update');}
const button=(d,text)=>[...d.querySelectorAll('button')].find(n=>n.textContent.trim()===text);
function input(d,text){const label=[...d.querySelectorAll('label')].find(n=>n.textContent.trim()===text);return label?.querySelector('input,select')||d.getElementById(label?.htmlFor)||d.querySelector('[aria-label="'+text+'"]');}
async function change(w,node,value){assert.ok(node,'Expected form control');const prototype=node.tagName==='SELECT'?w.HTMLSelectElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new w.Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));await pause();}
const SENTENCE='Choose where you work under Service area: all areas or specific cities.';
async function screen(t,plan){
  const owner=seed(),h=await knowledgeApp(t,{draft:{about:'[SYNTHETIC] Draft',hours:'Weekdays',neverSay:[]}}),requests=[];
  const dom=new JSDOM('<div id="root"></div>',{url:h.origin,runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  const w=dom.window,d=w.document;w.structuredClone=structuredClone;
  w.fetch=async(path,options={})=>{requests.push({path,body:options.body&&JSON.parse(options.body)});return fetch(h.origin+path,{...options,headers:{...options.headers,Authorization:'Bearer '+owner.token}});};
  w.eval(bundle.script);
  w.saved=false;w.mountKnowledge({account:{plan,firstName:'Synthetic Casey'},profile:getBusinessProfile(owner.id)});await waitFor(()=>w.readyMountNumber===w.mountNumber);
  t.after(()=>{w.unmount();w.close();});return {owner,w,d,requests};
}
for(const plan of ['Operator','QuoteDone'])test(plan+': saving needs a service area choice',async t=>{
  const {owner,w,d,requests}=await screen(t,plan);
  assert.equal(input(d,'Where do you work?').value,'');
  button(d,'Review and save').click();await waitFor(()=>d.body.textContent.includes(SENTENCE));
  assert.equal(requests.filter(r=>r.path==='/api/onboarding/knowledge-base').length,0);
  assert.equal(getBusinessProfile(owner.id).knowledgeBase.serviceArea,undefined);
  await change(w,input(d,'Where do you work?'),'all');button(d,'Review and save').click();await waitFor(()=>w.saved);
  assert.deepEqual(getBusinessProfile(owner.id).knowledgeBase.serviceArea,{mode:'all',cities:[]});
});
test('Starter: no service area control, saves as before',async t=>{
  const {w,d,requests}=await screen(t,'Starter');
  assert.ok(!input(d,'Where do you work?'));
  button(d,'Review and save').click();await waitFor(()=>w.saved);
  assert.equal(requests.filter(r=>r.path==='/api/onboarding/knowledge-base').length,1);
  assert.ok(!d.body.textContent.includes(SENTENCE));
});
