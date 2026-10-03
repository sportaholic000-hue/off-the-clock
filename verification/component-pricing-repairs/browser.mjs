// Actual built editor and authenticated/public HTTP workflows; synthetic local data only.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import Database from 'better-sqlite3';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {convertApplicationBook} from '../../server/src/quoteDoneBridge.js';
import {mowing,flatRoof} from '../engine-independent/fixtures.mjs';
import {measuredScopeCases} from '../../test/measuredScopeFixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';

const root=process.cwd(),out=path.resolve(process.argv[2]),pub=path.join(out,'public'),base='http://127.0.0.1:5310';
fs.mkdirSync(pub,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE);
const checks=[],errors=[],wire=[];
const safe=value=>JSON.parse(JSON.stringify(value,(k,v)=>['password','passwordHash','token','bookingToken','bookingTokenReceipt','bookingTokenHash'].includes(k)?'[SYNTHETIC SECRET OMITTED]':v));
const save=(name,value)=>fs.writeFileSync(path.join(pub,name),JSON.stringify(safe(value),null,2));
let app,db,browser,page,proxy;
async function check(name,fn){try{await fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.stack});}finally{if(page&&!page.isClosed()){await page.screenshot({path:path.join(pub,name+'.png')});save(name+'-screen.json',{text:await page.locator('body').innerText()});}console.log('COMPONENT_REPAIR_BROWSER_CHECK '+JSON.stringify(checks.at(-1)));}}
async function setup(label,input){
 const owner=await app.owner(label),call=async(method,url,body,status=200)=>{const r=await app.request(method,url,body,owner.token);assert.equal(r.status,status,JSON.stringify(r));return r.result;};
 const converted=convertApplicationBook({services:[input.ownerPricing],defaults:input.businessDefaults},'toDollars'),service=converted.services[0];
 for(const key of ['origin','confirmedFields','approvedValues'])delete service[key];service.id=crypto.randomUUID();service.service='[SYNTHETIC] '+label;service.validationInputs=input.customerInputs;
 let book=await call('GET','/api/pricebook/'+owner.id);Object.assign(book,{services:[service],defaults:converted.defaults});await call('POST','/api/pricebook/save',book);
 await call('GET','/api/onboarding/state');db.prepare('UPDATE businessProfiles SET businessTypesJson=? WHERE ownerId=?').run(JSON.stringify([service.serviceType]),owner.id);
 const result={owner,service,input,call,read:()=>call('GET','/api/pricebook/'+owner.id)};await approve(result);return result;
}
async function approve(f){const book=await f.read(),validation=await f.call('POST','/api/pricebook/validate',book),status=validation.statuses.find(s=>s.serviceId===f.service.id);return f.call('POST','/api/pricebook/services/'+f.service.id+'/approve',{revision:book.revision,confirmConfiguration:true,confirmLegacySettings:true,fields:status.confirmationFields||[]});}
async function open(f){await page.goto(base+'/login');await page.evaluate(token=>{localStorage.setItem('otc_token',token);sessionStorage.clear();},f.owner.token);await page.goto(base+'/pricebook');await page.locator('.service-pick').filter({hasText:f.service.service}).click();}
async function section(name){const button=page.getByRole('button',{name:new RegExp('^'+name)}).first();if(await button.getAttribute('aria-expanded')==='false')await button.click();}
async function uiSave(){const response=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/save')&&r.request().method()==='POST');await page.getByRole('button',{name:'Save & validate',exact:true}).click();assert.equal((await response).status(),200);await page.waitForFunction(()=>!document.querySelector('fieldset[disabled]'));}
async function publicQuote(f){const access=await f.call('POST','/api/quotedone/access',{allowedOrigins:[base]});const r=await app.request('POST','/api/public/quote/'+access.publicKey,{requestId:crypto.randomUUID(),serviceId:f.service.id,customerInputs:f.input.customerInputs,contact:{email:'synthetic-followup@example.invalid'}},undefined,{Origin:base});assert.equal(r.status,201,JSON.stringify(r));return r.result;}
try{
 app=await startApplication(root,path.join(out,'private'),{port:5312,browserOrigins:[base]});db=new Database(path.join(out,'private/application.sqlite'));
 const dist=path.join(root,'client/dist');
 proxy=http.createServer(async(req,res)=>{try{
  if(req.url.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const b=Buffer.concat(chunks),headers={};for(const k of ['origin','content-type','authorization','cookie','referer','sec-fetch-site','idempotency-key'])if(req.headers[k])headers[k]=req.headers[k];const r=await fetch(app.base+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&b.length?{body:b}:{})}),text=await r.text();wire.push({method:req.method,path:req.url,request:b.length?JSON.parse(b):null,status:r.status,response:JSON.parse(text||'null')});res.statusCode=r.status;r.headers.forEach((v,k)=>{if(!['content-length','content-encoding','connection','transfer-encoding'].includes(k))res.setHeader(k,v);});res.end(text);return;}
  const pathname=new URL(req.url,base).pathname,file=!path.extname(pathname)?path.join(dist,'index.html'):path.resolve(dist,'.'+pathname);if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
 }catch(e){errors.push(e.message);res.writeHead(500).end('{}');}});await new Promise(r=>proxy.listen(5310,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));


 await check('B01-fence-fractional-height-and-distinct-names',async()=>{
  const f=await setup('fence',offeringFixture('FENCING_INSTALL','installed'));await open(f);
  await page.getByLabel('Offering name',{exact:true}).fill('Cedar fence 5 ft 3.65 in');await page.getByLabel('Included job description',{exact:true}).fill('[SYNTHETIC] Cedar fence at the specified offering height.');
  await page.getByRole('button',{name:'Enter feet and inches',exact:true}).first().click();
  await page.getByLabel('Offered fence height (ft) whole feet',{exact:true}).fill('5');
  await page.getByLabel('Offered fence height (ft) inches',{exact:true}).fill('3.65');
  await uiSave();await approve(f);let book=await f.read();assert.equal(book.services[0].pricing.offeringDetails.fenceHeight,5+3.65/12);
  f.input.customerInputs.fenceHeight=5+3.65/12;assert.equal((await publicQuote(f)).midEstimate,4500);
  const second=structuredClone(book.services[0]);second.id=crypto.randomUUID();second.service='Cedar fence 6 ft';second.pricing.offeringDetails.fenceHeight=6;for(const key of ['quoteDoneApproval','origin','confirmedFields','approvedValues'])delete second[key];
  book.services.push(second);await f.call('POST','/api/pricebook/save',book);const other={...f,service:second,input:structuredClone(f.input)};other.input.customerInputs.fenceHeight=6;await approve(other);await approve(f);
  assert.equal((await publicQuote(other)).midEstimate,4500);
  f.input.customerInputs.fenceHeight=6;assert.equal((await publicQuote(f)).resultType,'ESTIMATE_REQUIRES_REVIEW');f.input.customerInputs.fenceHeight=5+3.65/12;
  f.service.service='Cedar fence 5 ft 3.65 in';await open(f);await page.locator('.service-pick.active').filter({hasText:'QUOTING LIVE'}).waitFor();await page.locator('.service-pick').filter({hasText:'Cedar fence 6 ft'}).waitFor();
  save('B01-evidence.json',{saved:await f.read(),exact:await publicQuote(f),other:await publicQuote(other)});
 });
 await check('B02-included-flooring-save-approve-quote',async()=>{
  const input=structuredClone(measuredScopeCases().find(c=>c.id==='floor-laminate-installed').input),f=await setup('floor',input);await open(f);await section('Additional priced scope');
  await page.getByLabel('laminate underlayment — Underlayment price meaning',{exact:true}).selectOption('included_in_floor_price');
  await page.getByText('Underlayment is included in your flooring material price.',{exact:false}).waitFor();await uiSave();
  await page.getByRole('button',{name:'Review saved configuration',exact:true}).click();
  const review=page.getByRole('table',{name:'Saved prices and configuration'});await review.waitFor();assert.doesNotMatch(await review.innerText(),/priceBasisByCategory|offeringRates|scopeDetails/);
  await page.getByLabel(/I confirm these exact saved prices/).check();await page.getByLabel(/I confirm these retained legacy settings/).check();await page.getByRole('button',{name:'Confirm saved configuration',exact:true}).click();await review.waitFor({state:'hidden'});
  const book=await f.read();assert.equal(book.services[0].pricing.scopeRates.floor_underlayment_laminate,1);assert.equal((await publicQuote(f)).midEstimate,1740);
  const second=structuredClone(book);second.services[0].priceBasisByCategory.material='sell_price';await f.call('POST','/api/pricebook/save',second);await approve(f);assert.equal((await publicQuote(f)).midEstimate,1740);save('B02-evidence.json',{saved:await f.read(),quote:await publicQuote(f)});
 });
 await check('B03-installed-labor-coverage-notice-and-repair',async()=>{
  const input=offeringFixture('EXTERIOR_PAINTING','installed');input.ownerPricing.pricing.offeringDetails.stories=1;delete input.ownerPricing.pricing.installedLaborPercent;
  const f=await setup('coverage',input);await open(f);await page.locator('.service-pick.active').filter({hasText:'QUOTING LIVE'}).waitFor();
  const coverage=page.getByRole('region',{name:'Labor adjustment coverage'});assert.match(await coverage.innerText(),/2-story building/);assert.match(await coverage.innerText(),/3-story building/);assert.equal((await publicQuote(f)).resultType,'ESTIMATE_REQUIRES_REVIEW');
  await coverage.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(pub,'B03-coverage-before.png')});
  await page.getByLabel('Labor portion offeringRates.installedWallPerSqft',{exact:true}).fill('60');await uiSave();await approve(f);await open(f);await coverage.waitFor({state:'hidden'});assert.equal((await publicQuote(f)).midEstimate,3180);save('B03-evidence.json',{saved:await f.read(),quote:await publicQuote(f)});
 });
 await check('B04-owner-controlled-permit',async()=>{
  const input=mowing();input.businessDefaults.permitFee=5000;input.ownerPricing.feeRules.permit='when_scope_selected';const f=await setup('permit',input);await open(f);await section('Quote configuration');
  await page.getByLabel('permit fee rule',{exact:true}).selectOption('owner_selected');await page.getByLabel('permit owner fee selection',{exact:true}).selectOption('true');await uiSave();await approve(f);
  for(const answer of [false,true]){f.input.customerInputs.permitRequired=answer;assert.equal((await publicQuote(f)).midEstimate,150);}
  const access=await f.call('POST','/api/quotedone/access',{allowedOrigins:[base]}),catalog=await app.request('GET','/api/public/quote/'+access.publicKey,undefined,undefined,{Origin:base});assert.equal(catalog.status,200);assert.equal(catalog.result.services[0].customerFields.some(field=>field.name==='permitRequired'),false);
  await open(f);await section('Project measurements for preview');assert.equal(await page.getByText('Permit required for this measured project',{exact:true}).count(),0);save('B04-evidence.json',{saved:await f.read(),catalog:catalog.result,quote:await publicQuote(f)});
 });
 await check('B05-readable-approval-and-explicit-defaults',async()=>{
  const input=mowing();input.businessDefaults.markupPercent=30;input.businessDefaults.rangeBufferPercent=10;const f=await setup('approval',input);await open(f);
  await page.getByRole('button',{name:'Review saved configuration',exact:true}).click();const table=page.getByRole('table',{name:'Saved prices and configuration'});await table.waitFor();const fits=await table.evaluate(node=>node.getBoundingClientRect().width<=node.parentElement.clientWidth+1);assert.equal(fits,true,'Both approval columns must fit without horizontal scrolling');const text=await table.innerText();assert.doesNotMatch(text,/priceBasisByCategory|taxabilityByCategory|offeringRates|quoteDoneApproval/);assert.match(text,/30%/);assert.match(text,/10%/);assert.match(text,/\$0.02/);
  const ack=page.getByLabel(/I confirm these exact saved prices.*30% markup.*10% estimate range buffer/);await ack.check();await page.getByRole('button',{name:'Confirm saved configuration',exact:true}).click();await table.waitFor({state:'hidden'});assert.equal((await publicQuote(f)).midEstimate,130);
  await page.getByRole('button',{name:'Review saved configuration',exact:true}).click();await table.waitFor();await page.locator('.service-pick.active').filter({hasText:'QUOTING LIVE'}).waitFor();await table.scrollIntoViewIfNeeded();save('B05-evidence.json',{saved:await f.read(),quote:await publicQuote(f)});
 });
 await check('B06-registry-hides-identifiers-and-accepts-product-names',async()=>{
  const f=await setup('registry',flatRoof());await open(f);await section('Quote configuration');
  assert.doesNotMatch(await page.locator('body').innerText(),/Use the exact offering key|epdm [0-9a-f]{8}-/);
  const input=page.getByRole('textbox',{name:'Existing membrane type product name',exact:true});await input.fill('Premium Membrane');await input.locator('..').getByRole('button',{name:'Register offering',exact:true}).click();await uiSave();
  const book=await f.read();assert.ok(Object.values(book.services[0].knownOfferings).some(map=>map.premium_membrane));assert.doesNotMatch(await page.locator('body').innerText(),/premium_membrane/);save('B06-evidence.json',{saved:book});
 });

 await check('B07-included-price-selectors-without-internal-path-entry',async()=>{
  const input=structuredClone(measuredScopeCases().find(c=>c.id==='floor-laminate-installed').input);input.ownerPricing.pricing.scopeRates.floor_underlayment_laminate=0;const f=await setup('inclusion',input);await open(f);
  await page.getByRole('button',{name:'Review saved configuration',exact:true}).click();const table=page.getByRole('table',{name:'Saved prices and configuration'});await table.waitFor();
  await page.getByText('Explicit free offerings and included required prices',{exact:true}).click();await page.getByRole('button',{name:'Edit explicit zero classification',exact:true}).click();
  const from=page.getByLabel('Price included at no extra charge',{exact:true}),to=page.getByLabel('Price that already covers this work',{exact:true});
  await from.selectOption('scopeRates.floor_underlayment_laminate');await to.selectOption('materialPerSqft.laminate');assert.doesNotMatch(await from.locator('option:checked').innerText(),/scopeRates|materialPerSqft/);assert.doesNotMatch(await to.locator('option:checked').innerText(),/scopeRates|materialPerSqft/);
  await page.getByRole('button',{name:'Add explicit inclusion',exact:true}).click();await page.getByLabel(/I confirm these exact saved prices/).check();await page.getByLabel(/I confirm these retained legacy settings/).check();await page.getByRole('button',{name:'Confirm saved configuration',exact:true}).click();await table.waitFor({state:'hidden'});
  assert.equal((await publicQuote(f)).midEstimate,1740);save('B07-evidence.json',{saved:await f.read(),quote:await publicQuote(f)});
 });
}catch(e){checks.push({name:'setup',passed:false,error:e.stack});}
finally{
 if(browser)await browser.close();if(proxy)await new Promise(r=>proxy.close(r));if(db)db.close();if(app){await app.stop();save('http.json',app.requests);fs.copyFileSync(path.join(out,'private/source-binding.json'),path.join(pub,'source-binding.json'));}
 save('browser-wire.json',wire);const result={scope:'Component pricing and price-book controls: built editor with authenticated save/approval and public customer quotes',checks,errors,passed:checks.every(c=>c.passed)&&errors.length===0};save('result.json',result);console.log('COMPONENT_REPAIR_BROWSER_RESULT '+JSON.stringify(result));if(!result.passed)process.exitCode=1;
}
