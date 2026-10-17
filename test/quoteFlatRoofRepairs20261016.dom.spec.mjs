import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import {flatRoof,flatRepair} from '../verification/engine-independent/fixtures.mjs';
import {applicationServiceDefinition,applicationMetadata} from '../server/src/quoteDoneBridge.js';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
let script;
before(async()=>{script=(await build({bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{CustomerMeasurements,PricingTree}from'./client/src/quoteDoneControls.jsx';import{InstalledMaterialsEditor}from'./client/src/installedMaterialsEditor.jsx';window.mount=props=>{function App(){const[v,set]=useState(props.value);const change=next=>{window.value=next;set(next);};window.value=v;return props.mode==='owner'?<InstalledMaterialsEditor service={v} onChange={change}/>:props.mode==='tree'?<PricingTree definition={props.definition} value={v} onChange={change}/>:<CustomerMeasurements fields={props.fields} value={v} onChange={change}/>;}createRoot(document.getElementById('root')).render(<App/>);};`}})).outputFiles[0].text;});
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
async function mount(t,props){const errors=[],dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});dom.window.structuredClone=structuredClone;t.after(()=>dom.window.close());dom.window.eval(script);dom.window.mount(props);await tick();assert.deepEqual(errors,[]);return dom.window;}
function field(w,label){return [...w.document.querySelectorAll('input,select')].find(n=>n.getAttribute('aria-label')===label);}
async function change(w,node,value){assert.ok(node);const prototype=node.tagName==='SELECT'?w.HTMLSelectElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new w.Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));await tick();}

test('rendered flat-roof customer form omits building type and unpriced extras',async t=>{
 // Expected before execution: zero building-type or extra controls for blank
 // prices; a priced drain adds exactly its count control, with no defaults.
 const f=flatRoof();let w=await mount(t,{fields:applicationServiceDefinition(f.ownerPricing).customerFields,value:f.customerInputs});assert.equal(field(w,'Building type'),undefined);assert.equal(field(w,'Drains'),undefined);
 f.ownerPricing.pricing.flatRoofDrainEach=22000;w=await mount(t,{fields:applicationServiceDefinition(f.ownerPricing).customerFields,value:f.customerInputs});assert.equal(field(w,'Drains').value,'');await change(w,field(w,'Drains'),'2');assert.equal(w.value.drainCount,2);
});

test('rendered repair dimension choice clears old area and submits caller dimensions',async t=>{
 // Expected before execution: switching from50sqft to6x10 removes50; engine
 // derives60 and the legacy medium flat band is5*10000+9000=59000c.
 const f=flatRepair();f.customerInputs.affectedArea=50;const w=await mount(t,{fields:applicationServiceDefinition(f.ownerPricing).customerFields,value:f.customerInputs});
 assert.ok(field(w,'Measured affected flat-roof area'));await change(w,field(w,'Affected area measurement'),'dimensions');assert.equal(w.value.affectedArea,undefined);assert.equal(field(w,'Measured affected flat-roof area'),undefined);
 await change(w,field(w,'Affected area length'),'6');await change(w,field(w,'Affected area width'),'10');const q=generateQuoteVNext({...f,customerInputs:JSON.parse(JSON.stringify(w.value))});assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,590);
});

test('installed deck owner editor derives material remainder and clears a stale explicit share',async t=>{
 // Expected before execution: labor60% displaysmaterial40%; changinglabor50
 // displaysmaterial50% and removes the old40% entry, not the deck price.
 const f=flatRoof();Object.assign(f.ownerPricing.pricing,{flatRoofDeckPerSheet:9500,flatRoofDeckPriceBasis:'installed',installedLaborPercent:{flatRoofDeckPerSheet:60},installedMaterialsPercent:{flatRoofDeckPerSheet:40}});
 const w=await mount(t,{mode:'owner',value:f.ownerPricing});assert.match(w.document.body.textContent,/Materials share: 40%/);assert.equal(field(w,'Materials share (%) for Deck replacement'),undefined);
 await change(w,field(w,'Labor portion (%) for Deck replacement'),'50');assert.match(w.document.body.textContent,/Materials share: 50%/);assert.equal(w.value.pricing.installedMaterialsPercent?.flatRoofDeckPerSheet,undefined);assert.equal(w.value.pricing.flatRoofDeckPerSheet,9500);
});

test('repair owner unit selector edits each without money conversion or allocation boilerplate',async t=>{
 // Expected before execution: square_feet becomes each; this selector is not
 // a dollar amount and its empty state never claims no installed prices exist.
 const definition=applicationMetadata().services.find(s=>s.serviceType==='FLAT_ROOF_REPAIR').fields.find(f=>f.field==='repairPricingUnit');
 let w=await mount(t,{mode:'tree',definition,value:{epdm:{seam_patch:'square_feet'}}});const select=w.document.querySelector('select');await change(w,select,'each');assert.equal(w.value.epdm.seam_patch,'each');
 w=await mount(t,{mode:'tree',definition,value:{}});assert.match(w.document.body.textContent,/No entries\. Add only the repair types you price with this setting\./);assert.doesNotMatch(w.document.body.textContent,/No installed prices/);
});
