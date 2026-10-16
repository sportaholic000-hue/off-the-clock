import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import {fileURLToPath} from 'node:url';
import {fixture} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext} from '../server/quote-engine-vnext/engine.js';

// Expected BEFORE execution: no starting ratios; typing0.8 stores exactly0.8.
// Switching to room dimensions clears stale direct area; 12×12×8, one door,
// two windows sends those exact inputs. Backend quote is76800+22044=98844c.
// This is real React/form interaction in JSDOM, not a Chromium launch claim.
const root=fileURLToPath(new URL('..',import.meta.url));let bundle;
before(async()=>{
 const result=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},stdin:{resolveDir:root,loader:'jsx',contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {SurfacePricingEditor} from './client/src/surfacePricingEditor.jsx';
import {CustomerMeasurements} from './client/src/quoteDoneControls.jsx';
import {customerContractForVNext} from './server/quote-engine-vnext/contracts.js';
function App(){const [service,setService]=useState({serviceType:'INTERIOR_PAINTING',source:'MANUAL',pricing:{laborPerWallSqftPerCoat:1,materialPerWallSqftPerCoat:0.30}});const [inputs,setInputs]=useState({areaInputMethod:'wall_sqft',wallAreaSqft:400,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false});window.__service=service;window.__inputs=inputs;const fields=Object.entries(customerContractForVNext(service.serviceType,service.pricing).fields).map(([name,d])=>({name,...d}));return <><SurfacePricingEditor service={service} onChange={setService}/><CustomerMeasurements fields={fields} value={inputs} onChange={setInputs}/></>;}window.__root=createRoot(document.getElementById('root'));window.__root.render(<App/>);`}});
 bundle=result.outputFiles[0].text;
});
const pause=()=>new Promise(r=>setTimeout(r,10));
async function waitFor(fn){for(let n=0;n<200;n++){if(fn())return;await pause();}assert.fail('DOM condition did not complete');}
async function setup(t){
 const errors=[],dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
 const w=dom.window;w.structuredClone=structuredClone;w.eval(bundle);await waitFor(()=>w.__service);t.after(()=>{w.__root.unmount();w.close();});return {w,d:w.document,errors};
}
async function input(w,d,label,text){const el=d.querySelector('[aria-label="'+label+'"]');assert.ok(el,label);Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,text);el.dispatchEvent(new w.Event('input',{bubbles:true}));await pause();}
test('surface DOM Oct16: owner coat ratios start blank and retain the entered decimal',async t=>{
 const {w,d,errors}=await setup(t);assert.equal(w.__service.pricing.paintingSettings,undefined);
 const labels=['Walls','Ceilings','Trim','Wall primer','Ceiling primer','Trim primer'].map(s=>s+' — additional-coat labor ratio');
 for(const label of labels)assert.equal(d.querySelector('[aria-label="'+label+'"]').value,'');
 await input(w,d,labels[0],'0.8');await waitFor(()=>w.__service.pricing.paintingSettings?.wallAdditionalCoatRatio===0.8);
 assert.equal(w.__service.pricing.paintingSettings.ceilingAdditionalCoatRatio,undefined);assert.match(d.body.textContent,/First-coat labor per unit: 1\.111/);assert.deepEqual(errors,[]);
});
test('surface DOM Oct16: room widget inputs reach the same arithmetic contract',async t=>{
 const {w,d,errors}=await setup(t),method=d.querySelector('[aria-label="Wall area measurement method"]');method.value='room_dimensions';method.dispatchEvent(new w.Event('change',{bubbles:true}));
 await waitFor(()=>w.__inputs.areaInputMethod==='room_dimensions');assert.equal(w.__inputs.wallAreaSqft,undefined);
 const add=[...d.querySelectorAll('button')].find(b=>b.textContent==='Add room measurements');assert.ok(add);add.click();await waitFor(()=>w.__inputs.rooms?.length===1);
 for(const [label,value] of [['Room length','12'],['Room width','12'],['Ceiling height','8'],['Door openings','1'],['Window openings','2']])await input(w,d,'Room measurements 1 '+label,value);
 const c=JSON.parse(JSON.stringify(w.__inputs));assert.deepEqual(c.rooms,[{lengthFeet:12,widthFeet:12,heightFeet:8,doorCount:1,windowCount:2}]);
 const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0},c);f.ownerPricing.priceBasisByCategory.material='sell_price';
 const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.midEstimate,988.44);assert.deepEqual(errors,[]);
});

test('surface DOM Oct16: a large opening stays bound to its room',async t=>{
 // Before execution:384−120=264labor;384−120−20−30=214paint;52800+14124=66924c.
 const {w,d,errors}=await setup(t),method=d.querySelector('[aria-label="Wall area measurement method"]');method.value='room_dimensions';method.dispatchEvent(new w.Event('change',{bubbles:true}));
 await waitFor(()=>w.__inputs.areaInputMethod==='room_dimensions');[...d.querySelectorAll('button')].find(b=>b.textContent==='Add room measurements').click();await waitFor(()=>w.__inputs.rooms?.length===1);
 for(const [label,value] of [['Room length','12'],['Room width','12'],['Ceiling height','8'],['Door openings','1'],['Window openings','2']])await input(w,d,'Room measurements 1 '+label,value);
 const add=[...d.querySelectorAll('button')].find(b=>b.textContent==='Add room measurements 1 — large room openings');assert.ok(add);add.click();await waitFor(()=>w.__inputs.rooms[0].largeOpenings?.length===1);
 await input(w,d,'Room measurements 1 — Large room openings 1 Opening width','15');
 await input(w,d,'Room measurements 1 — Large room openings 1 Opening height','8');
 const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0},JSON.parse(JSON.stringify(w.__inputs)));f.ownerPricing.priceBasisByCategory.material='sell_price';
 const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.midEstimate,669.24);assert.deepEqual(errors,[]);
});

test('surface DOM Oct16: optional selector hides unpriced quantities and selection survives submission',async t=>{
 //Before execution: one four-choice selector, no optional quantities; walls106400c,
 //selected door sides excluded. A priced4-side request adds46000c; deselection clears it.
 const {w,d,errors}=await setup(t);
 assert.equal(d.querySelectorAll('fieldset[aria-label="Which optional painting items would you like?"]').length,1);
 for(const label of ['Door sides to paint','Door frames to paint','Windows to paint','Cabinet doors or drawer faces to paint'])assert.equal(d.querySelector('[aria-label="'+label+'"]'),null);
 d.querySelector('input[aria-label="Door sides"]').click();await waitFor(()=>w.__inputs.surfaceOptionalItems?.includes('doorSides'));
 assert.equal(d.querySelector('[aria-label="Door sides to paint"]'),null);
 const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0},JSON.parse(JSON.stringify(w.__inputs)));f.ownerPricing.priceBasisByCategory.material='sell_price';
 const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,1064);assert.deepEqual(q.options[0].skippedAddons,['Door sides']);
 await input(w,d,'Door sides — complete installed price per each','115');await waitFor(()=>d.querySelector('[aria-label="Door sides to paint"]'));
 await input(w,d,'Door sides to paint','4');assert.equal(w.__inputs.paintDoorSides,4);
 d.querySelector('input[aria-label="Door sides"]').click();await waitFor(()=>!w.__inputs.surfaceOptionalItems.includes('doorSides'));
 assert.equal(w.__inputs.paintDoorSides,undefined);assert.equal(d.querySelector('[aria-label="Door sides to paint"]'),null);assert.deepEqual(errors,[]);
});

test('surface DOM Oct16: floor-to-ceiling answer changes labor but not paint',async t=>{
 //Before execution:630 gross,54 opening; checked labor576x120x2=138240c,
 //unchecked labor630x120x2=151200c. Both paint576x30x2x1.1=38016c.
 const {w,d,errors}=await setup(t),method=d.querySelector('[aria-label="Wall area measurement method"]');
 method.value='room_dimensions';method.dispatchEvent(new w.Event('change',{bubbles:true}));await waitFor(()=>w.__inputs.areaInputMethod==='room_dimensions');
 [...d.querySelectorAll('button')].find(b=>b.textContent==='Add room measurements').click();await waitFor(()=>w.__inputs.rooms?.length===1);
 for(const [label,value] of [['Room length','20'],['Room width','15'],['Ceiling height','9'],['Door openings','0'],['Window openings','0']])await input(w,d,'Room measurements 1 '+label,value);
 [...d.querySelectorAll('button')].find(b=>b.textContent==='Add room measurements 1 — large room openings').click();await waitFor(()=>w.__inputs.rooms[0].largeOpenings?.length===1);
 await input(w,d,'Room measurements 1 — Large room openings 1 Opening width','6');await input(w,d,'Room measurements 1 — Large room openings 1 Opening height','9');
 const choice=d.querySelector('[aria-label="Room measurements 1 — Large room openings 1 Runs floor to ceiling?"]');assert.ok(choice);
 for(const [answer,cents] of [['true',138240],['false',151200]]){
  choice.value=answer;choice.dispatchEvent(new w.Event('change',{bubbles:true}));await waitFor(()=>w.__inputs.rooms[0].largeOpenings[0].runsFloorToCeiling===(answer==='true'));
  const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:120,materialPerWallSqftPerCoat:30,minimumJob:0},JSON.parse(JSON.stringify(w.__inputs)));f.ownerPricing.priceBasisByCategory.material='sell_price';
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
  const amounts=path=>q.options[0].lineItems.filter(l=>l.calculation.ratePath===path).map(l=>l.amountCents);
  assert.deepEqual(amounts('laborPerWallSqftPerCoat'),[cents]);assert.deepEqual(amounts('materialPerWallSqftPerCoat'),[38016]);
 }
 assert.deepEqual(errors,[]);
});
