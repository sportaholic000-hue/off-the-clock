import './pricebookTestEnv.mjs';
import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM, VirtualConsole} from 'jsdom';
import {fixture} from '../verification/engine-independent/fixtures.mjs';
import {surfaceGeometry} from '../server/quote-engine-vnext/surfacePricing.js';
import {exactToNumber} from '../server/quote-engine-vnext/exactMath.js';
import {customerContractForVNext, validateCustomerInputs} from '../server/quote-engine-vnext/contracts.js';
import {generateQuoteVNext} from '../server/quote-engine-vnext/engine.js';
import {fixture as voiceFixture, at, secret} from './leadCaptureRepair20261006Fixture.mjs';
import {savePricebook, loadPricebook} from '../server/priceBookService.js';
import {approveApplicationService, bookRevision} from '../server/src/quoteDoneBridge.js';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {projectVoiceToolResult} from '../server/src/voice/toolDispatcher.js';

// Handwritten expectations, before execution: see the owned EXPECTED.md.
// This suite uses synthetic owner prices and no live providers.
const guidance='Room dimensions assume a rectangular room, one wall height and a flat ceiling. For sloped ceilings, irregular rooms or walls with different heights, enter the measured wall and ceiling surface areas directly.';
const previousGuidance="Changing measurement methods clears the other method's measurements. Enter gables separately only when they are not included in the direct area.";
const room={lengthFeet:12,widthFeet:12,heightFeet:8,doorCount:1,windowCount:2};
function painting(){
 const f=fixture('INTERIOR_PAINTING',{
  laborPerWallSqftPerCoat:100, materialPerWallSqftPerCoat:30,
  ceilingLaborPerSqftPerCoat:60, ceilingMaterialPerSqftPerCoat:20, minimumJob:0
 },{
  areaInputMethod:'room_dimensions',rooms:[structuredClone(room)],wallHeight:'standard',
  surfaceCondition:'good',coats:2,ceilingsIncluded:true,ceilingCoats:1,
  ceilingSurfaceCondition:'good',trimIncluded:false
 });
 f.ownerPricing.priceBasisByCategory.material='sell_price';return f;
}
const geometry=f=>surfaceGeometry(f.serviceType,f.customerInputs,f.ownerPricing.pricing);
const numeric=(g,key)=>exactToNumber(g[key]);
function quote(f){const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));return q;}
const pricedLines=q=>q.options[0].lineItems.filter(l=>l.calculation?.ratePath).map(l=>({
 path:l.calculation.ratePath,quantity:l.calculation.quantity,exactQuantity:l.calculation.exactQuantity,amountCents:l.amountCents
}));
const amounts=(q,path)=>q.options[0].lineItems.filter(l=>l.calculation?.ratePath===path).map(l=>l.amountCents);

test('painting geometry Oct18: rectangular walls 384 and flat ceiling 144 are independently calculated',()=>{
 // Expected: 2*(12+12)*8=384; 12*12=144; no openings => paint384.
 const f=painting();Object.assign(f.customerInputs.rooms[0],{doorCount:0,windowCount:0});
 const g=geometry(f);assert.equal(numeric(g,'gross'),384);assert.equal(numeric(g,'labor'),384);
 assert.equal(numeric(g,'paint'),384);assert.equal(numeric(g,'ceiling'),144);
});

test('painting geometry Oct18: ordinary openings leave labor384 and paint334',()=>{
 // Expected:384-20-2*15=334 paint; door/windows do not reduce labor384.
 const g=geometry(painting());assert.equal(numeric(g,'gross'),384);assert.equal(numeric(g,'labor'),384);
 assert.equal(numeric(g,'paint'),334);assert.equal(numeric(g,'ceiling'),144);
});

test('painting geometry Oct18: eligible direct areas preserve every quantity and 110652 cents',()=>{
 // Expected BEFORE execution:76800+22044+8640+3168=110652 cents.
 const dimensions=painting(),direct=structuredClone(dimensions);
 delete direct.customerInputs.rooms;
 Object.assign(direct.customerInputs,{areaInputMethod:'wall_sqft',wallAreaSqft:384,
  wallScopeUniform:true,ceilingAreaSqft:144,doorCount:1,windowCount:2});
 const before=structuredClone(dimensions.customerInputs),a=quote(dimensions),b=quote(direct);
 for(const q of [a,b]){
  assert.equal(q.options[0].midEstimate,1106.52);
  for(const [path,cents] of [['laborPerWallSqftPerCoat',76800],['materialPerWallSqftPerCoat',22044],
   ['ceilingLaborPerSqftPerCoat',8640],['ceilingMaterialPerSqftPerCoat',3168]])assert.deepEqual(amounts(q,path),[cents]);
 }
 // Material receipt quantities include waste:668*1.10=734.8 and144*1.10=158.4.
 for(const q of [a,b])assert.deepEqual(pricedLines(q).map(l=>l.quantity),[768,734.8,144,158.4]);
 assert.deepEqual(pricedLines(a),pricedLines(b));assert.deepEqual(dimensions.customerInputs,before);
 const g=geometry(direct);for(const [key,value] of [['gross',384],['labor',384],['paint',334],['ceiling',144]])assert.equal(numeric(g,key),value);
});

test('painting geometry Oct18: separate rooms retain their dimensions and existing height treatment',()=>{
 // Expected: walls744/paint694/ceiling224; labor78000+13920; material22902+4928 =>119750c.
 const f=painting();f.customerInputs.coats=1;delete f.customerInputs.wallHeight;
 f.customerInputs.rooms.push({lengthFeet:10,widthFeet:8,heightFeet:10,doorCount:0,windowCount:0});
 f.ownerPricing.pricing.paintingSettings={heightBands:{standardMaxFeet:8,highMaxFeet:10,vaultedMaxFeet:20}};
 const before=structuredClone(f.customerInputs.rooms),g=geometry(f);
 for(const [key,value] of [['gross',744],['labor',744],['paint',694],['ceiling',224]])assert.equal(numeric(g,key),value);
 assert.deepEqual(g.groups.map(group=>({height:group.height,area:numeric(group,'area'),ceiling:numeric(group,'ceiling')})),[
  {height:'standard',area:384,ceiling:144},{height:'high',area:360,ceiling:80}
 ]);
 const q=quote(f);assert.equal(q.options[0].midEstimate,1197.50);
 assert.deepEqual(amounts(q,'laborPerWallSqftPerCoat'),[38400,39600]);
 assert.deepEqual(amounts(q,'ceilingLaborPerSqftPerCoat'),[8640,5280]);
 assert.equal(amounts(q,'materialPerWallSqftPerCoat').reduce((a,b)=>a+b,0),22902);
 assert.equal(amounts(q,'ceilingMaterialPerSqftPerCoat').reduce((a,b)=>a+b,0),4928);
 assert.deepEqual(f.customerInputs.rooms,before);
});

test('painting geometry Oct18: a directly measured sloped ceiling surface remains available',()=>{
 // Expected: supplied ceiling180, not floor144;98844+10800+3960=113604c.
 const f=painting();delete f.customerInputs.rooms;
 Object.assign(f.customerInputs,{areaInputMethod:'wall_sqft',wallAreaSqft:384,wallScopeUniform:true,
  ceilingAreaSqft:180,doorCount:1,windowCount:2});
 assert.equal(numeric(geometry(f),'ceiling'),180);
 const q=quote(f);assert.equal(q.options[0].midEstimate,1136.04);
 assert.deepEqual(amounts(q,'ceilingLaborPerSqftPerCoat'),[10800]);
 assert.deepEqual(amounts(q,'ceilingMaterialPerSqftPerCoat'),[3960]);
});

test('painting geometry Oct18: vaulted is a labor category and does not establish a sloped ceiling area',()=>{
 // Expected: ceiling144 regardless of category;96000+10800+22044+3168=132012c.
 const f=painting();f.customerInputs.wallHeight='vaulted';
 assert.equal(numeric(geometry(f),'ceiling'),144);
 const q=quote(f);assert.equal(q.options[0].midEstimate,1320.12);
 assert.deepEqual(amounts(q,'laborPerWallSqftPerCoat'),[96000]);
 assert.deepEqual(amounts(q,'ceilingLaborPerSqftPerCoat'),[10800]);
 assert.deepEqual(amounts(q,'ceilingMaterialPerSqftPerCoat'),[3168]);
});

test('painting geometry Oct18: contradictory direct and room inputs retain existing protections',()=>{
 // Expected: each competing direct field is refused, never silently preferred.
 for(const [key,value] of [['wallAreaSqft',384],['ceilingAreaSqft',144],['wallHeightFeet',8]]){
  const f=painting();f.customerInputs[key]=value;
  assert.equal(validateCustomerInputs(f.serviceType,f.customerInputs,f.ownerPricing.pricing).ok,false,key);
  assert.notEqual(generateQuoteVNext(f).resultType,'INSTANT_ESTIMATE_READY',key);
 }
});

let widgetBundle;
before(async()=>{
 const root=fileURLToPath(new URL('..',import.meta.url));
 const result=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',
  define:{'process.env.NODE_ENV':'"development"'},stdin:{resolveDir:root,loader:'jsx',contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {CustomerMeasurements} from './client/src/quoteDoneControls.jsx';
import {customerContractForVNext} from './server/quote-engine-vnext/contracts.js';
function App(){const [inputs,setInputs]=useState({areaInputMethod:'wall_sqft',wallAreaSqft:384,wallHeight:'standard',wallScopeUniform:true,ceilingsIncluded:true,ceilingAreaSqft:180});window.__inputs=inputs;
const fields=Object.entries(customerContractForVNext('INTERIOR_PAINTING',{}).fields).map(([name,d])=>({name,...d}));
return <CustomerMeasurements fields={fields} value={inputs} onChange={setInputs}/>;}
window.__root=createRoot(document.getElementById('root'));window.__root.render(<App/>);`}});
 widgetBundle=result.outputFiles[0].text;
});
const pause=()=>new Promise(r=>setTimeout(r,10));
async function waitFor(fn){for(let n=0;n<200;n++){if(fn())return;await pause();}assert.fail('Widget condition did not complete');}

test('painting geometry Oct18: actual widget displays guidance at selection and room entry, retaining direct entry',async t=>{
 // Expected: exact authorized help in visible field-help paragraphs; original help retained.
 // Real React components in JSDOM; this is not a Chromium or speech-recognition claim.
 const errors=[],dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid',
  runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
 const w=dom.window,d=w.document;w.structuredClone=structuredClone;
 t.after(()=>{w.__root?.unmount();w.close();});w.eval(widgetBundle);await waitFor(()=>w.__inputs);
 const help=()=>[...d.querySelectorAll('p.field-help')].filter(p=>p.textContent===guidance);
 const method=d.querySelector('[aria-label="Wall area measurement method"]');assert.ok(method);
 assert.ok([...method.options].some(o=>o.value==='wall_sqft'&&o.textContent==='Enter wall area directly'));
 assert.equal(help().length,1);assert.ok([...d.querySelectorAll('p.field-help')].some(p=>p.textContent===previousGuidance));
 method.value='room_dimensions';method.dispatchEvent(new w.Event('change',{bubbles:true}));
 await waitFor(()=>w.__inputs.areaInputMethod==='room_dimensions');
 assert.equal(help().length,2);
 for(const p of help()){assert.equal(p.hidden,false);assert.equal(p.closest('[hidden]'),null);assert.notEqual(w.getComputedStyle(p).display,'none');}
 assert.ok([...d.querySelectorAll('button')].some(b=>b.textContent==='Add room measurements'));
 assert.equal(w.__inputs.wallAreaSqft,undefined);assert.equal(w.__inputs.ceilingAreaSqft,undefined);
 method.value='wall_sqft';method.dispatchEvent(new w.Event('change',{bubbles:true}));
 await waitFor(()=>w.__inputs.areaInputMethod==='wall_sqft');
 const ceiling=d.querySelector('[aria-label="Measured ceiling area"]');assert.ok(ceiling);
 Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(ceiling,'180');
 ceiling.dispatchEvent(new w.Event('input',{bubbles:true}));await waitFor(()=>w.__inputs.ceilingAreaSqft===180);
 assert.equal(help().length,1);assert.deepEqual(errors,[]);
});

test('painting geometry Oct18: Chromium shows the widget guidance at both measurement steps',async t=>{
 // Expected: visible selector help, then visible room-entry help as well;
 // explicitly selecting direct measurement allows a supplied180-sqft ceiling.
 // Uses the existing CI Playwright dependency; no new application dependency.
 const {chromium}=await import('playwright');
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:widgetBundle});
 await page.waitForFunction(()=>window.__inputs);
 const help=page.locator('p.field-help').filter({hasText:guidance});
 assert.equal(await help.count(),1);assert.equal(await help.first().isVisible(),true);
 assert.equal(await page.getByText(previousGuidance,{exact:true}).isVisible(),true);
 await page.getByLabel('Wall area measurement method',{exact:true}).selectOption('room_dimensions');
 await page.waitForFunction(()=>window.__inputs.areaInputMethod==='room_dimensions');
 assert.equal(await help.count(),2);for(const p of await help.all())assert.equal(await p.isVisible(),true);
 assert.equal(await page.getByRole('button',{name:'Add room measurements',exact:true}).isVisible(),true);
 await page.getByLabel('Wall area measurement method',{exact:true}).selectOption('wall_sqft');
 await page.getByLabel('Measured ceiling area',{exact:true}).fill('180');
 await page.waitForFunction(()=>window.__inputs.ceilingAreaSqft===180);
 assert.equal(await help.count(),1);assert.deepEqual(errors,[]);
});

test('painting geometry Oct18: actual voice tool contract carries guidance and saved receipts replay unchanged',async t=>{
 // Expected: matchService exposes the same help/choices; quote1106.52 persists.
 // Replaying that receipt after a synthetic price change must not recalculate it.
 const h=voiceFixture(t),c=h.context(),f=painting();delete f.ownerPricing.origin;
 savePricebook(c.ownerId,{services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'CAD'}});
 const book=loadPricebook(c.ownerId);
 approveApplicationService(c.ownerId,book.services[0].id,{revision:bookRevision(book),confirmConfiguration:true,
  confirmLegacySettings:true},{timeZone:'UTC',quoteInstant:at});
 process.env.JWT_SECRET='SYNTHETIC_GEOMETRY_GUIDANCE_NEVER_LIVE'.padEnd(64,'x');
 const runtime=createVoiceToolRuntime({database:h.db,callContext:c,handleSecret:secret,clock:()=>new Date(at)});
 const invoke=async(name,args)=>projectVoiceToolResult(name,await runtime.handlers[name]({context:c,args}));
 const matched=await invoke('matchService',{query:f.ownerPricing.service});assert.equal(matched.status,'matched');
 const fields=matched.questionContract.fields,method=fields.find(q=>q.field==='areaInputMethod'),rooms=fields.find(q=>q.field==='rooms');
 assert.ok(method.details.includes(previousGuidance));assert.ok(method.details.includes(guidance));
 assert.ok(rooms.details.includes(guidance));assert.match(rooms.details.join(' '),/lengthFeet.*widthFeet.*heightFeet/);
 assert.ok(method.choices.some(v=>v.value==='wall_sqft'));
 assert.ok(fields.some(q=>q.field==='ceilingAreaSqft'));
 assert.doesNotMatch(JSON.stringify(matched),/laborPerWallSqftPerCoat|ceilingMaterialPerSqftPerCoat|exactUnroundedCents/);
 const args={serviceHandle:matched.serviceHandle,customerInputs:f.customerInputs,customerConfirmed:true,callerMeasurementsEstimated:true};
 const first=await invoke('getQuote',args);assert.equal(first.status,'quoted',JSON.stringify(first));assert.equal(first.midEstimate,1106.52);
 const stored=()=>h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? ORDER BY requestId').all(c.ownerId);
 const original=stored();assert.equal(original.length,1);
 const changed=loadPricebook(c.ownerId);changed.services[0].pricing.laborPerWallSqftPerCoat=999;
 savePricebook(c.ownerId,changed);
 assert.deepEqual(await invoke('getQuote',args),first);assert.deepEqual(stored(),original);
});

test('painting geometry Oct18: guidance is confined to interior customer details',()=>{
 const f=painting(),contract=customerContractForVNext(f.serviceType,f.ownerPricing.pricing);
 assert.deepEqual(contract.fields.areaInputMethod.details,[previousGuidance,guidance]);
 assert.deepEqual(contract.fields.rooms.details,[guidance]);
 for(const type of ['EXTERIOR_PAINTING','SIDING_REPLACEMENT']){
  const other=customerContractForVNext(type,{});assert.deepEqual(other.fields.areaInputMethod.details,[previousGuidance]);
  assert.equal(other.fields.rooms,undefined);
 }
});
