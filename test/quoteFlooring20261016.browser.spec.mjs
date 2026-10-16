import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
import {carpet} from './quoteFlooring20261016Fixture.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook} from '../server/priceBookService.js';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {webQuote,publicCopy} from './quoteDeliveryBatch20261015Fixture.mjs';
import {installQuoteEmailRoutes} from '../server/src/quoteEmailRoutes.js';
const date={timeZone:'UTC',quoteInstant:'2026-10-16T15:00:00.000Z'};
let browser,ownerScript,customerScript;
before(async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
  const bundle=async contents=>(await build({bundle:true,write:false,format:'iife',platform:'browser',define:{'import.meta.env.VITE_API_URL':'"http://floor-owner.test"','import.meta.env':'{}','process.env.NODE_ENV':'"production"'},stdin:{loader:'jsx',resolveDir:process.cwd(),contents}})).outputFiles[0].text;
  ownerScript=await bundle("import React from'react';import{createRoot}from'react-dom/client';import PriceBook from'./client/src/pricebook.jsx';createRoot(document.getElementById('root')).render(<PriceBook/>);");
  customerScript=await bundle(`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{CustomerMeasurements}from'./client/src/quoteDoneControls.jsx';import{QuoteResult}from'./client/src/quotedone.jsx';function Form({fields,inputs,result}){const[v,set]=useState(inputs);return result?<QuoteResult result={result}/>:<><CustomerMeasurements fields={fields} value={v} onChange={set}/><output>{JSON.stringify(v)}</output></>;}window.mount=props=>createRoot(document.getElementById('root')).render(<Form {...props}/>);`);
});
after(async()=>{await browser?.close();});
async function customerPage(t,f,result){const page=await browser.newPage();t.after(()=>page.close());await page.setContent('<div id="root"></div>');await page.addScriptTag({content:customerScript});await page.evaluate(props=>window.mount(props),{fields:bridge.applicationServiceDefinition(f.ownerPricing).customerFields,inputs:f.customerInputs,result});return page;}
const output=async page=>JSON.parse(await page.locator('output').textContent());
function seed(){const f=flooring(),owner='floor-browser-'+randomUUID(),service=structuredClone(f.ownerPricing);delete service.origin;
  const draft=bridge.convertApplicationBook({services:[service],defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');bridge.saveApplicationBook(owner,{...draft,revision:bridge.readApplicationBook(owner).revision},date);return owner;}
async function ownerPage(t,owner){
 const page=await browser.newPage();t.after(()=>page.close());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());assert.equal(u.origin,'http://floor-owner.test');if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+ownerScript.replaceAll('</script','<\\/script')+'</script>'});
  const body=r.postData()?JSON.parse(r.postData()):undefined;let payload,status=200;
  try{if(u.pathname==='/api/dashboard')payload={ownerId:owner,operator:{simulated:true,enabled:false}};else if(u.pathname==='/api/onboarding/state')payload={account:{id:owner,plan:'QuoteDone'},profile:{businessTypes:['FLOORING_INSTALL']}};else if(u.pathname==='/api/pricebook/meta')payload=bridge.applicationMetadata();else if(u.pathname==='/api/pricebook/'+owner)payload=bridge.readApplicationBook(owner);else if(u.pathname==='/api/pricebook/validate')payload=bridge.validateApplicationDraft(owner,body,date);else if(u.pathname==='/api/pricebook/save')payload=bridge.saveApplicationBook(owner,body,date);else if(u.pathname==='/api/pricebook/preview')payload=bridge.previewApplicationQuote(owner,body,date);else throw Error('Unexpected endpoint '+u.pathname);}catch(e){status=e.statusCode||400;payload={error:e.message,details:e.details};}await route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
 });await page.goto('http://floor-owner.test');await page.getByRole('heading',{name:'Price book',exact:true}).waitFor();return{page,errors};
}

test('flooring Chromium owner: per-type waste is entered as percent; new prices, roll widths and furniture units save and reload',async t=>{
 // Expected BEFORE execution:4%=>.04;1.75=>1.75;$2.50=>250c;
 // $35=>3500c;$75=>7500c;$125=>12500c;$4=>400c;roll12/repeat1.5 unscaled.
 const owner=seed(),{page,errors}=await ownerPage(t,owner);await page.getByRole('button',{name:/Optional prices and add-on charges/}).click();
 await page.getByLabel('Vinyl plank Diagonal additional waste by flooring type',{exact:true}).fill('4');
 await page.getByLabel('Vinyl plank Herringbone or chevron labor adjustment by flooring type',{exact:true}).fill('1.75');
 for(const [field,value] of [['baseboardReinstallPerLF','2.50'],['transitionPriceEach','35'],['furnitureMovingPrice','75'],['toiletPullResetEach','125'],['floorLevelingPerSqft','4'],['carpetRollWidthFt','12'],['carpetPatternRepeatFt','1.5']])await page.locator('#field-'+field+' input').fill(value);
 await page.locator('#field-furnitureMovingPriceUnit select').selectOption('per_room');
 const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/pricebook/save')&&r.request().method()==='POST'),page.getByRole('button',{name:'Save & validate',exact:true}).click()]);assert.equal(response.ok(),true,await response.text());
 const p=loadPricebook(owner).services[0].pricing;assert.deepEqual([p.baseboardReinstallPerLF,p.transitionPriceEach,p.furnitureMovingPrice,p.toiletPullResetEach,p.floorLevelingPerSqft],[250,3500,7500,12500,400]);assert.equal(p.diagonalWasteAdderByType.vinyl_plank,.04);assert.equal(p.herringboneLaborMultiplierByType.vinyl_plank,1.75);assert.equal(p.carpetRollWidthFt,12);assert.equal(p.carpetPatternRepeatFt,1.5);assert.equal(p.furnitureMovingPriceUnit,'per_room');assert.deepEqual(errors,[]);
 await page.reload();await page.getByRole('button',{name:/Optional prices and add-on charges/}).click();assert.equal(await page.getByLabel('Vinyl plank Diagonal additional waste by flooring type',{exact:true}).inputValue(),'4');assert.equal(await page.locator('#field-carpetRollWidthFt input').inputValue(),'12');
});

test('flooring Chromium customer: estimated room dimensions replace area questions and quote labor on measured area',async t=>{
 // Expected BEFORE execution:13x14=182 floor;324 boughtsqft=97,200c material,
 // labor182*300*1.10=60,060c;underlayment182c;total157,442c.
 const f=carpet([{lengthFt:13,widthFt:14}]);for(const k of ['carpetRooms','carpetConnectedAreas','sqft','roomCount'])delete f.customerInputs[k];f.customerInputs.carpetMeasurementMethod='rooms';
 const page=await customerPage(t,f);await page.getByLabel('Room 1 length, front to back',{exact:true}).fill('13');await page.getByLabel('Room 1 width, side to side',{exact:true}).fill('14');const inputs=await output(page);assert.equal(inputs.sqft,182);assert.equal(inputs.roomCount,1);
 assert.equal(await page.getByLabel('Measured flooring area',{exact:true}).count(),0);assert.equal(await page.getByLabel('Rooms in scope',{exact:true}).count(),0);assert.equal(await page.getByLabel('Carpet room connections',{exact:true}).count(),0);
 const q=generateQuoteVNext({...f,customerInputs:inputs});assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,1574.42);assert.equal(q.lineItems.find(l=>l.name==='Flooring labor').calculation.quantity,182);
});

test('flooring Chromium customer: connection selection supports Not sure, separate and manually grouped rooms',async t=>{
 // Expected BEFORE execution:connected/Not sure426 boughtsqft;separate348.
 // Switching from Not sure into manual groups must retain the incomplete draft.
 const f=carpet([{lengthFt:10,widthFt:14},{lengthFt:14,widthFt:10}]);f.customerInputs.carpetMeasurementMethod='rooms';const page=await customerPage(t,f);
 await page.getByLabel('Carpet room connections',{exact:true}).selectOption('separate');let inputs=await output(page);assert.deepEqual(inputs.carpetConnectedAreas,[[1],[2]]);assert.equal(generateQuoteVNext({...f,customerInputs:inputs}).lineItems.find(l=>l.name==='Flooring materials').calculation.quantity,348);
 await page.getByLabel('Carpet room connections',{exact:true}).selectOption('unknown');await page.getByLabel('Carpet room connections',{exact:true}).selectOption('groups');await page.getByLabel('Room 1 connected area',{exact:true}).selectOption('1');await page.getByLabel('Room 2 connected area',{exact:true}).selectOption('1');inputs=await output(page);assert.deepEqual(inputs.carpetConnectedAreas,[[1,2]]);assert.equal(generateQuoteVNext({...f,customerInputs:inputs}).lineItems.find(l=>l.name==='Flooring materials').calculation.quantity,426);
});

test('flooring Chromium actual widget and saved public page keep the carpet seaming qualification',async t=>{
 // Expected BEFORE execution:13x14 on12ft roll157,442c;both actual rendered
 // customer surfaces retain the exact seaming-diagram confirmation sentence.
 const f=carpet([{lengthFt:13,widthFt:14}]),saved=webQuote(f);assert.equal(saved.result.midEstimate,1574.42);const page=await customerPage(t,f,saved.result);await page.getByText('The carpet quantity is confirmed on site from the seaming diagram.',{exact:false}).waitFor();
 saved.email.enqueueSavedQuote({ownerId:saved.owner,quoteId:saved.row.recordId,email:'caller@example.invalid',customerConfirmed:true});const{token}=publicCopy(saved.email,saved.rows()[0]),app=express();installQuoteEmailRoutes(app,{service:saved.email});const server=app.listen(0,'127.0.0.1');t.after(()=>new Promise(r=>server.close(r)));await new Promise(r=>server.once('listening',r));await page.goto(`http://127.0.0.1:${server.address().port}/quote-copy/${saved.owner}/${token}`);await page.getByText('The carpet quantity is confirmed on site from the seaming diagram.',{exact:false}).waitFor();
});
