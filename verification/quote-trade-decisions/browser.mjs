// October 3 trade decisions: real isolated HTTP + built owner editor.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import Database from '../../node_modules/better-sqlite3/lib/index.js';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {convertApplicationBook,applicationMetadata} from '../../server/src/quoteDoneBridge.js';
import {wallPainting} from '../../verification/quote-readiness/fixtures.mjs';
const root=process.cwd(),out=path.resolve(process.argv[2]),pub=path.join(out,'public');
fs.mkdirSync(pub,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE);
const base='http://127.0.0.1:5210',checks=[],wire=[],errors=[],dependencies=[];
const safe=v=>JSON.parse(JSON.stringify(v,(k,v)=>['password','passwordHash','token','bookingToken','bookingTokenReceipt','bookingTokenHash'].includes(k)?'[SYNTHETIC SECRET OMITTED]':v));
const save=(n,v)=>fs.writeFileSync(path.join(pub,n),JSON.stringify(safe(v),null,2));
let app,browser,proxy,db,page;
async function check(name,fn){try{await fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.stack});}finally{if(page&&!page.isClosed()){const focus=/^R0[567]/.test(name)?page.locator('.interview-field'):name.startsWith('R04')?page.locator('#field-laborPerWallSqftPerCoat'):null;if(focus&&await focus.count())await focus.first().scrollIntoViewIfNeeded().catch(()=>{});await page.screenshot({path:path.join(pub,name+'.png')}).catch(()=>{});save(name+'-screen.json',{text:await page.locator('body').innerText(),inputs:await page.locator('input,select').evaluateAll(nodes=>nodes.map(n=>({label:n.getAttribute('aria-label'),value:n.value,invalid:n.getAttribute('aria-invalid')})))});}}console.log('EDITOR_CHECK '+JSON.stringify(checks.at(-1)));}
async function fixture(label,fee='not_applicable',selection){
 const owner=await app.owner(label),call=async(method,url,body,status=200)=>{const r=await app.request(method,url,body,owner.token);assert.equal(r.status,status,JSON.stringify(r));return r.result;};
 const f=globalThis.tradeFixture||wallPainting(),converted=convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars');
 const services=['A','B'].map(name=>{const s=structuredClone(converted.services[0]);for(const k of ['origin','confirmedFields','approvedValues'])delete s[k];s.id=crypto.randomUUID();s.service='[SYNTHETIC] '+name;s.validationInputs=f.customerInputs;s.feeRules.travel=fee;if(selection!==undefined)s.ownerFeeSelections={travel:selection};return s;});
 let book=await call('GET','/api/pricebook/'+owner.id);Object.assign(book,{services,defaults:{...converted.defaults,travelFee:10}});await call('POST','/api/pricebook/save',book);
 for(const service of services){book=await call('GET','/api/pricebook/'+owner.id);await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:book.revision,confirmConfiguration:true});}
 await call('GET','/api/onboarding/state');db.prepare('UPDATE businessProfiles SET businessTypesJson=? WHERE ownerId=?').run(JSON.stringify(['INTERIOR_PAINTING','ROOFING_REPLACEMENT','ROOFING_REPAIR','FLOORING_INSTALL','LANDSCAPING_CLEANUP','CUSTOM','SIDING_REPLACEMENT','LANDSCAPING_PLANTING','FENCING_INSTALL','FENCING_REPLACEMENT','EXTERIOR_PAINTING']),owner.id);
 return {owner,services,read:()=>call('GET','/api/pricebook/'+owner.id),call};
}
async function useOwner(f,url='/pricebook',{clear=true}={}){
 await page.goto(base+'/login');await page.evaluate(({token,clear})=>{localStorage.setItem('otc_token',token);if(clear)sessionStorage.clear();},{token:f.owner.token,clear});await page.goto(base+url);
 if(url==='/pricebook')await page.locator('.service-pick').filter({hasText:'[SYNTHETIC] A'}).click();
}
async function bookState(){return page.evaluate(()=>{
 function walk(node){if(!node)return null;for(let h=node.memoizedState;h&&typeof h==='object';h=h.next){const v=h.memoizedState;if(v&&Array.isArray(v.services)&&v.defaults&&'revision'in v)return v;}return walk(node.child)||walk(node.sibling);}
 const root=document.getElementById('root'),key=Object.keys(root).find(k=>k.startsWith('__reactContainer$'));return walk(root[key]?.stateNode?.current||root[key]);
});}
async function openSection(name){const btn=page.getByRole('button',{name:new RegExp('^'+name)}).first();if(await btn.getAttribute('aria-expanded')==='false')await btn.click();}
async function pick(name){await page.locator('.service-pick').filter({hasText:'[SYNTHETIC] '+name}).click();}
async function approve(id){await page.getByRole('button',{name:'Review saved configuration',exact:true}).click();await page.getByLabel('I confirm these exact saved prices, units, factors and rules.',{exact:true}).check();const received=page.waitForResponse(r=>r.url().endsWith('/'+id+'/approve'));await page.getByRole('button',{name:'Confirm saved configuration',exact:true}).click();assert.equal((await received).status(),200);await page.waitForFunction(()=>!document.querySelector('fieldset[disabled]'));}
async function newInterview(f,type,field,value){
 const created=await f.call('POST','/api/pricebook/interview',{mode:'browser',serviceTypes:[type]},201);
 await f.call('PUT','/api/pricebook/interview/'+created.draft.id,{currentField:type+'.'+field,...(value===undefined?{}:{fields:{[type]:{[field]:value}}})});
 await useOwner(f,'/onboarding?step=7');await page.getByRole('button',{name:'Resume saved draft',exact:true}).click();await page.locator('.interview-field').waitFor();return created.draft.id;
}
try{
 app=await startApplication(root,path.join(out,'private'),{port:5212,browserOrigins:[base]});db=new Database(path.join(out,'private/application.sqlite'));
 const dist=path.join(root,'client/dist');
 proxy=http.createServer(async(req,res)=>{try{
  if(req.url.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const b=Buffer.concat(chunks),headers={};for(const k of ['origin','content-type','authorization','cookie','referer','sec-fetch-site','idempotency-key'])if(req.headers[k])headers[k]=req.headers[k];
   const r=await fetch(app.base+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&b.length?{body:b}:{})}),text=await r.text();
   wire.push({method:req.method,path:req.url,request:b.length?JSON.parse(b):null,status:r.status,response:JSON.parse(text||'null')});
   res.statusCode=r.status;r.headers.forEach((v,k)=>{if(!['content-length','content-encoding','connection','transfer-encoding'].includes(k))res.setHeader(k,v);});res.end(text);return;}
  const pathname=new URL(req.url,base).pathname,file=!path.extname(pathname)?path.join(dist,'index.html'):path.resolve(dist,'.'+pathname);
  if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
 }catch(e){res.writeHead(500).end('{}');errors.push(e.message);}});await new Promise(r=>proxy.listen(5210,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));

 async function apiApprove(f,id){const book=await f.read();const validation=await f.call('POST','/api/pricebook/validate',book);const status=validation.statuses.find(s=>s.serviceId===id);return f.call('POST','/api/pricebook/services/'+id+'/approve',{revision:book.revision,confirmConfiguration:true,confirmLegacySettings:true,fields:status?.confirmationFields||[]});}
 async function uiSave(){const wait=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/save')&&r.request().method()==='POST');await page.getByRole('button',{name:'Save & validate',exact:true}).click();assert.equal((await wait).status(),200);await page.waitForFunction(()=>!document.querySelector('fieldset[disabled]'));}


 const {offeringFixture}=await import('../../test/configuredOfferingsFixtures.mjs');
 const {flooring}=await import('../engine-independent/fixtures.mjs');
 await check('B01-installed-labor-surcharge-save-approve-public-quote',async()=>{
  const original=offeringFixture('FENCING_INSTALL','installed');original.customerInputs.gates={};original.ownerPricing.pricing.offeringRates.installedFencePerLF=1000;
  original.ownerPricing.pricing.terrainLaborMultiplier.moderate=1.25;original.customerInputs.terrainSlope='moderate';
  delete original.ownerPricing.pricing.installedLaborPercent;delete original.ownerPricing.pricing.installedMaterialsPercent;
  globalThis.tradeFixture=original;const f=await fixture('trade-installed');await useOwner(f);
  await page.getByLabel('Labor portion offeringRates.installedFencePerLF',{exact:true}).fill('60');await page.getByLabel('Materials share offeringRates.installedFencePerLF',{exact:true}).fill('40');
  // Gate remains an offered optional bundle; explicit shares are owner fixture input.
  await page.getByLabel('Labor portion offeringRates.gate_walk',{exact:true}).fill('60');await page.getByLabel('Materials share offeringRates.gate_walk',{exact:true}).fill('40');
  await openSection('Quote configuration');await page.getByLabel('This service labor surcharge (%)',{exact:true}).fill('10');await page.getByRole('button',{name:'Apply to this service every month',exact:true}).click();await page.getByLabel('Business time zone for quotes',{exact:true}).selectOption('America/Los_Angeles');
  await uiSave();await apiApprove(f,f.services[0].id);let b=await f.read();assert.equal(b.defaults.quoteTimeZone,'America/Los_Angeles');assert.equal(b.services[0].pricing.installedLaborPercent['offeringRates.installedFencePerLF'],60);
  b.defaults.taxMode='TAX_MATERIALS';b.defaults.taxPercent=8;await f.call('POST','/api/pricebook/save',b);await apiApprove(f,f.services[0].id);b=await f.read();
  const access=await f.call('POST','/api/quotedone/access',{allowedOrigins:[base]});const body={requestId:crypto.randomUUID(),serviceId:f.services[0].id,customerInputs:original.customerInputs,contact:{email:'synthetic-trade@example.invalid'}};
  const publicQuote=await app.request('POST','/api/public/quote/'+access.publicKey,body,undefined,{Origin:base});assert.equal(publicQuote.status,201,JSON.stringify(publicQuote));assert.equal(publicQuote.result.midEstimate,1257);
  for(const key of ['rangeBufferUsed','bookRevision','serviceId','lineItems','installedLaborPercent','installedMaterialsPercent'])assert.equal(JSON.stringify(publicQuote.result).includes('"'+key+'"'),false,key);
  const staff=await f.call('POST','/api/quote/calculate',{...body,requestId:crypto.randomUUID()},201);assert.equal(staff.midEstimate,1257);
  // Inject only the old public metadata into this synthetic historical receipt.
  const row=db.prepare('SELECT customerResponseJson FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,body.requestId),old=JSON.parse(row.customerResponseJson);old.rangeBufferUsed=10;old.options[0].rangeBufferUsed=10;old.pricedScope.serviceId=f.services[0].id;old.pricedScope.bookRevision='[SYNTHETIC] old revision';db.prepare('UPDATE quoteSubmissions SET customerResponseJson=? WHERE ownerId=? AND requestId=?').run(JSON.stringify(old),f.owner.id,body.requestId);
  const retry=await app.request('POST','/api/public/quote/'+access.publicKey,body,undefined,{Origin:base});assert.equal(retry.status,200);assert.equal(retry.result.midEstimate,1257);assert.equal(JSON.stringify(retry.result).includes('rangeBufferUsed'),false);assert.equal(retry.result.pricedScope.serviceId,undefined);
  const second=await app.owner('trade-other');assert.equal((await app.request('GET','/api/pricebook/'+f.owner.id,undefined,second.token)).status,403);
  await useOwner(f);assert.equal(await page.getByLabel('Labor portion offeringRates.installedFencePerLF',{exact:true}).inputValue(),'60');save('B01-evidence.json',{saved:b,publicQuote,staff,retry});
 });
 await check('B02-fence-waste-percent-spacing-and-new-questions',async()=>{
  const original=offeringFixture('FENCING_INSTALL','itemized');Object.assign(original.customerInputs,{cornerCount:2,gates:{walk:1}});globalThis.tradeFixture=original;const f=await fixture('trade-fence');await useOwner(f);await openSection('Quantity assumptions');
  const waste=page.getByLabel('Fence infill material waste',{exact:true});assert.equal(await waste.inputValue(),'10');await waste.fill('20');await page.getByLabel('Distance between fence posts',{exact:true}).fill('10');await uiSave();await apiApprove(f,f.services[0].id);
  const b=await f.read();assert.equal(b.services[0].pricing.fenceWasteFactor,.2);assert.equal(b.services[0].pricing.postSpacingLF,10);assert.deepEqual(b.services[0].pricing.offeringRates,f.services[0].pricing.offeringRates);
  const q=await f.call('POST','/api/pricebook/preview',{revision:b.revision,serviceId:f.services[0].id,customerInputs:original.customerInputs});assert.equal(q.midEstimate,4100);
  const access=await f.call('POST','/api/quotedone/access',{allowedOrigins:[base]}),catalog=await app.request('GET','/api/public/quote/'+access.publicKey,undefined,undefined,{Origin:base});assert.equal(catalog.status,200);const text=JSON.stringify(catalog.result);assert.ok(text.includes('cornerCount'));assert.equal(text.includes('postCount'),false);save('B02-evidence.json',{saved:b,quote:q,catalog});
  await useOwner(f);await openSection('Quantity assumptions');assert.equal(await page.getByLabel('Fence infill material waste',{exact:true}).inputValue(),'20');
 });
 await check('B03-paint-condition-coats-save-approve',async()=>{
  const original=offeringFixture('INTERIOR_PAINTING','itemized');Object.assign(original.ownerPricing.pricing.offeringRates,{prepLaborPerSqft_poor:200,prepMaterialPerSqft_poor:40});Object.assign(original.customerInputs,{surfaceCondition:'poor',coats:3});globalThis.tradeFixture=original;const f=await fixture('trade-paint');await useOwner(f);
  const b=await f.read(),q=await f.call('POST','/api/pricebook/preview',{revision:b.revision,serviceId:f.services[0].id,customerInputs:original.customerInputs});assert.equal(q.midEstimate,5021);
  const access=await f.call('POST','/api/quotedone/access',{allowedOrigins:[base]}),catalog=await app.request('GET','/api/public/quote/'+access.publicKey,undefined,undefined,{Origin:base});assert.equal(catalog.status,200);assert.equal(JSON.stringify(catalog.result).includes('prepAreaSqft'),false);save('B03-evidence.json',{saved:b,quote:q,catalog});
 });
 await check('B04-incomplete-product-keeps-complete-product-live',async()=>{
  const original=flooring();Object.assign(original.ownerPricing.pricing.laborPerSqft,{vinyl_plank:300});Object.assign(original.ownerPricing.pricing.materialPerSqft,{vinyl_plank:500});original.ownerPricing.pricing.vinylPlankUnderlaymentRule='owner_review';globalThis.tradeFixture=original;const f=await fixture('trade-floor');await useOwner(f);await page.getByRole('region',{name:'Product pricing coverage'}).waitFor();
  const b=await f.read(),q=await f.call('POST','/api/quote/calculate',{requestId:crypto.randomUUID(),serviceId:f.services[0].id,customerInputs:original.customerInputs,contact:{email:'synthetic-floor@example.invalid'}},201);assert.equal(q.midEstimate,1780);save('B04-evidence.json',{saved:b,quote:q});
 });

}catch(e){checks.push({name:'setup',passed:false,error:e.stack});}
finally{
 if(browser)await browser.close();if(proxy)await new Promise(r=>proxy.close(r));if(db)db.close();if(app){await app.stop();save('http.json',app.requests);fs.copyFileSync(path.join(out,'private/source-binding.json'),path.join(pub,'source-binding.json'));}
 save('browser-wire.json',wire);const result={scope:'October 3 quote-engine and price-book acceptance checks',checks,errors,passed:checks.every(c=>c.passed)&&errors.length===0};save('result.json',result);console.log('AUDIT_BROWSER_RESULT '+JSON.stringify(result));if(!result.passed)process.exitCode=1;
}
