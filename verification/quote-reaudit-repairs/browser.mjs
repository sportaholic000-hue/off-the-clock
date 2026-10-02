// Combined PR16 + PR17 verification. Derived from PR17's browser harness;
// F14 must now save and reload successfully, rather than remain a dependency.
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
 const f=wallPainting(),converted=convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars');
 const services=['A','B'].map(name=>{const s=structuredClone(converted.services[0]);for(const k of ['origin','confirmedFields','approvedValues'])delete s[k];s.id=crypto.randomUUID();s.service='[SYNTHETIC] '+name;s.validationInputs=f.customerInputs;s.feeRules.travel=fee;if(selection!==undefined)s.ownerFeeSelections={travel:selection};return s;});
 let book=await call('GET','/api/pricebook/'+owner.id);Object.assign(book,{services,defaults:{...converted.defaults,travelFee:10}});await call('POST','/api/pricebook/save',book);
 for(const service of services){book=await call('GET','/api/pricebook/'+owner.id);await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:book.revision,confirmConfiguration:true});}
 await call('GET','/api/onboarding/state');db.prepare('UPDATE businessProfiles SET businessTypesJson=? WHERE ownerId=?').run(JSON.stringify(['INTERIOR_PAINTING','ROOFING_REPLACEMENT','ROOFING_REPAIR','FLOORING_INSTALL','LANDSCAPING_CLEANUP','CUSTOM','SIDING_REPLACEMENT','LANDSCAPING_PLANTING']),owner.id);
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

 await check('R01-ai-final-tier-reapproval',async()=>{
  const f=await fixture('repair-ai-tier');let b=await f.read(),service=structuredClone(b.services[0]);for(const key of ['origin','approvedValues','confirmedFields','quoteDoneApproval','zeroPricePolicy'])delete service[key];service.id=crypto.randomUUID();service.source='AI_INTERVIEW';service.tiers=[{name:'Good',overrides:{}}];b.services=[service];await f.call('POST','/api/pricebook/save',b);await apiApprove(f,service.id);
  await useOwner(f);await openSection('Good / Better / Best tiers');await page.getByRole('button',{name:'Remove tier',exact:true}).click();await uiSave();
  await page.getByRole('button',{name:'Review saved configuration',exact:true}).click();await page.getByRole('checkbox',{name:/^Confirm /}).first().waitFor();for(const box of await page.getByRole('checkbox',{name:/^Confirm /}).all())if(await box.isVisible())await box.check();await page.getByLabel('I confirm these exact saved prices, units, factors and rules.',{exact:true}).check();const [approved]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/'+service.id+'/approve')),page.getByRole('button',{name:'Confirm saved configuration',exact:true}).click()]);assert.equal(approved.status(),200);await page.waitForFunction(()=>!document.querySelector('fieldset[disabled]'));
  b=await f.read();const after=await f.call('POST','/api/pricebook/validate',b),quote=await f.call('POST','/api/pricebook/preview',{revision:b.revision,serviceId:service.id,customerInputs:wallPainting().customerInputs});assert.equal(after.statuses[0].status,'QUOTING LIVE');assert.equal(Object.hasOwn(b.services[0].confirmedFields,'tiers'),false);assert.equal(Object.hasOwn(b.services[0].approvedValues,'tiers'),false);assert.equal(quote.midEstimate,300);save('R01-evidence.json',{saved:b,after,quote});
 });
 for(const kind of ['offering','scope'])await check('R02-'+kind+'-inclusion-http',async()=>{
  const f=await fixture('repair-included-'+kind);const original=kind==='offering'?(await import('../../test/configuredOfferingsFixtures.mjs')).offeringFixture('FENCING_INSTALL','itemized'):(await import('../../test/measuredScopeFixtures.mjs')).measuredScopeCases().find(r=>r.id==='stairs-itemized').input;
  const p=original.ownerPricing.pricing;if(kind==='offering')p.offeringRates.postMaterialEach=0;else{p.scopeRates.stairs_material=0;p.scopeRates.stairs_underlayment=1000.5;}
  const mapping=kind==='offering'?{'offeringRates.postMaterialEach':'offeringRates.fenceMaterialPerLF'}:{'scopeRates.stairs_material':'scopeRates.stairs_underlayment'};
  const converted=convertApplicationBook({defaults:original.businessDefaults,services:[original.ownerPricing]},'toDollars');for(const key of ['origin','approvedValues','confirmedFields','zeroPricePolicy'])delete converted.services[0][key];let b=await f.read();Object.assign(b,converted);await f.call('POST','/api/pricebook/save',b);b=await f.read();await f.call('POST','/api/pricebook/services/'+b.services[0].id+'/approve',{revision:b.revision,confirmConfiguration:true,zeroClassification:{freeCompleteService:false,freeTiers:[],includedPrices:mapping}});b=await f.read();const q=await f.call('POST','/api/pricebook/preview',{revision:b.revision,serviceId:b.services[0].id,customerInputs:original.customerInputs});assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.midEstimate,kind==='offering'?3640:2255.03);save('R02-'+kind+'-evidence.json',{saved:b,quote:q});
 });
 await check('R03-tax-mode-clears-hidden-rate',async()=>{
  const f=await fixture('repair-tax');let b=await f.read();b.defaults.taxMode='TAX_ALL';b.defaults.taxPercent=15;await f.call('POST','/api/pricebook/save',b);await apiApprove(f,f.services[0].id);
  await useOwner(f);await openSection('Tax');await page.locator('select').filter({has:page.locator('option[value="TAX_NONE"]')}).selectOption('TAX_NONE');assert.equal((await bookState()).defaults.taxPercent,0);await uiSave();await approve(f.services[0].id);
  b=await f.read();const v=await f.call('POST','/api/pricebook/validate',b),q=await f.call('POST','/api/pricebook/preview',{revision:b.revision,serviceId:f.services[0].id,customerInputs:wallPainting().customerInputs});assert.equal(v.statuses[0].status,'QUOTING LIVE');assert.equal(q.midEstimate,300);save('R03-evidence.json',{saved:b,validation:v,quote:q});
 });
 await check('R04-unsupported-rate-retained-and-rejected',async()=>{
  const f=await fixture('repair-precision'),before=await f.read();await useOwner(f);let input=page.locator('#field-laborPerWallSqftPerCoat input');await input.fill('1.005');assert.equal(await input.getAttribute('aria-invalid'),'true');await input.blur();assert.equal(await input.inputValue(),'1.005');await pick('B');await pick('A');input=page.locator('#field-laborPerWallSqftPerCoat input');await page.waitForFunction(()=>document.querySelector('#field-laborPerWallSqftPerCoat input')?.value==='1.005');assert.equal(await input.inputValue(),'1.005');
  await page.getByRole('button',{name:'Save & validate',exact:true}).click();await page.getByText(/Enter the intended value before saving|whole-cent precision/).first().waitFor();assert.deepEqual(await f.read(),before);save('R04-rejected.json',{before,draft:await bookState(),text:await page.locator('body').innerText()});
  await input.fill('1.01');await uiSave();await approve(f.services[0].id);const b=await f.read(),q=await f.call('POST','/api/pricebook/preview',{revision:b.revision,serviceId:f.services[0].id,customerInputs:wallPainting().customerInputs});assert.equal(b.services[0].pricing.laborPerWallSqftPerCoat,1.01);assert.equal(q.midEstimate,302);save('R04-evidence.json',{saved:b,quote:q});
 });
 await check('R05-closed-domain-interview',async()=>{
  const f=await fixture('repair-floor-interview'),type='FLOORING_INSTALL',field='laborPerSqft',id=await newInterview(f,type,field),def=applicationMetadata().services.find(s=>s.serviceType===type).fields.find(d=>d.field===field);
  const choice=page.getByLabel(def.label+' offering key',{exact:true});assert.equal(await choice.evaluate(e=>e.tagName),'SELECT');assert.deepEqual(await choice.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value)),['','hardwood','laminate','vinyl_plank','carpet','tile']);await choice.selectOption('tile');await page.getByRole('button',{name:'Add offering',exact:true}).click();await page.getByLabel(def.label+' tile',{exact:true}).fill('3');await page.getByRole('button',{name:'Read it back',exact:true}).click();const [r]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/pricebook/interview/'+id)&&r.request().method()==='PUT'),page.getByRole('button',{name:'Yes, save these prices',exact:true}).click()]);assert.equal(r.status(),200);const before=await f.call('GET','/api/pricebook/interview/'+id);assert.deepEqual(before.draft.fields.FLOORING_INSTALL.laborPerSqft,{tile:3});await f.call('PUT','/api/pricebook/interview/'+id,{fields:{FLOORING_INSTALL:{laborPerSqft:{unobtainium:3}}}},422);assert.deepEqual(await f.call('GET','/api/pricebook/interview/'+id),before);save('R05-evidence.json',before);
 });
 await check('R06-zero-cleanup-disposal-saves',async()=>{
  const f=await fixture('repair-cleanup-interview'),value={light:{laborMultiplier:1,disposalFlat:0},moderate:{laborMultiplier:1.5,disposalFlat:20},heavy:{laborMultiplier:2,disposalFlat:40}},id=await newInterview(f,'LANDSCAPING_CLEANUP','debrisPricing',value);await page.getByRole('button',{name:'Read it back',exact:true}).click();await page.getByRole('button',{name:'Yes, save these prices',exact:true}).waitFor();await page.locator('.interview-field').screenshot({path:path.join(pub,'R06-readback.png')});const [r]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/pricebook/interview/'+id)&&r.request().method()==='PUT'),page.getByRole('button',{name:'Yes, save these prices',exact:true}).click()]);assert.equal(r.status(),200);const b=await f.call('GET','/api/pricebook/interview/'+id);assert.deepEqual(b.draft.fields.LANDSCAPING_CLEANUP.debrisPricing,value);save('R06-evidence.json',b);
 });
 await check('R07-custom-rate-uses-saved-unit',async()=>{
  const f=await fixture('repair-custom-interview'),created=await f.call('POST','/api/pricebook/interview',{mode:'browser',serviceTypes:['CUSTOM']},201),id=created.draft.id;await f.call('PUT','/api/pricebook/interview/'+id,{fields:{CUSTOM:{unit:'per_sqft'}},currentField:'CUSTOM.price'});await useOwner(f,'/onboarding?step=7');await page.getByRole('button',{name:'Resume saved draft',exact:true}).click();await page.locator('.interview-field').waitFor();const input=page.locator('.interview-field input').first();await input.fill('0.005');assert.notEqual(await input.getAttribute('aria-invalid'),'true');await page.getByRole('button',{name:'Read it back',exact:true}).click();await page.getByRole('button',{name:'Yes, save this number',exact:true}).waitFor();await page.locator('.interview-field').screenshot({path:path.join(pub,'R07-readback.png')});const [r]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/pricebook/interview/'+id)&&r.request().method()==='PUT'),page.getByRole('button',{name:'Yes, save this number',exact:true}).click()]);assert.equal(r.status(),200);const b=await f.call('GET','/api/pricebook/interview/'+id);assert.equal(b.draft.fields.CUSTOM.price,0.005);assert.equal(b.draft.fields.CUSTOM.unit,'per_sqft');save('R07-evidence.json',b);
 });
 await check('R08-interview-http-rejects-invalid-precision-atomically',async()=>{
  const f=await fixture('repair-server-interview'),draft=await f.call('POST','/api/pricebook/interview',{mode:'browser',serviceTypes:['SIDING_REPLACEMENT','LANDSCAPING_CLEANUP']},201),url='/api/pricebook/interview/'+draft.draft.id,before=await f.call('GET',url);
  for(const fields of [{SIDING_REPLACEMENT:{laborPerSqft:{vinyl:1.005}}},{LANDSCAPING_CLEANUP:{debrisPricing:{light:{laborMultiplier:1,disposalFlat:0.005},moderate:{laborMultiplier:1.5,disposalFlat:20},heavy:{laborMultiplier:2,disposalFlat:40}}}}]){await f.call('PUT',url,{fields},422);assert.deepEqual(await f.call('GET',url),before);}save('R08-evidence.json',{unchanged:await f.call('GET',url)});
 });
 await check('R09-occupied-override-retains-quote',async()=>{
  const f=await fixture('repair-tier-collision');let b=await f.read();b.services[0].tiers=[{name:'Good',overrides:{laborPerWallSqftPerCoat:2,materialPerWallSqftPerCoat:0.75}}];await f.call('POST','/api/pricebook/save',b);await apiApprove(f,f.services[0].id);await useOwner(f);await openSection('Good / Better / Best tiers');const before=(await bookState()).services[0].tiers;
  const select=page.locator('.override-row select').first();assert.equal(await select.locator('option[value="materialPerWallSqftPerCoat"]').isDisabled(),true);await select.evaluate(el=>{el.value='materialPerWallSqftPerCoat';el.dispatchEvent(new Event('change',{bubbles:true}));});assert.deepEqual((await bookState()).services[0].tiers,before);await uiSave();await approve(f.services[0].id);b=await f.read();const q=await f.call('POST','/api/pricebook/preview',{revision:b.revision,serviceId:f.services[0].id,customerInputs:wallPainting().customerInputs});assert.deepEqual(b.services[0].tiers,before);assert.equal(q.midEstimate,550);save('R09-override-evidence.json',{saved:b,quote:q});
 });
 await check('R09-delete-add-keeps-unique-tier-names',async()=>{
  const f=await fixture('repair-tier-names');let b=await f.read();b.services[0].tiers=['Good','Better','Best'].map(name=>({name,overrides:{}}));await f.call('POST','/api/pricebook/save',b);await apiApprove(f,f.services[0].id);await useOwner(f);await openSection('Good / Better / Best tiers');await page.getByRole('button',{name:'Remove tier',exact:true}).first().click();await page.getByRole('button',{name:'Add tier',exact:true}).click();assert.deepEqual((await bookState()).services[0].tiers.map(t=>t.name),['Better','Best','Good']);await uiSave();await approve(f.services[0].id);b=await f.read();const v=await f.call('POST','/api/pricebook/validate',b);assert.equal(v.statuses[0].status,'QUOTING LIVE');save('R09-name-evidence.json',{saved:b,validation:v});
 });

}catch(e){checks.push({name:'setup',passed:false,error:e.stack});}
finally{
 if(browser)await browser.close();if(proxy)await new Promise(r=>proxy.close(r));if(db)db.close();if(app){await app.stop();save('http.json',app.requests);fs.copyFileSync(path.join(out,'private/source-binding.json'),path.join(pub,'source-binding.json'));}
 save('browser-wire.json',wire);const result={scope:'Repair acceptance checks against the combined source; pass means repaired behavior was verified',checks,errors,passed:checks.every(c=>c.passed)&&errors.length===0};save('result.json',result);console.log('AUDIT_BROWSER_RESULT '+JSON.stringify(result));if(!result.passed)process.exitCode=1;
}
