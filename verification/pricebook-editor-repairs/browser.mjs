import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import Database from 'better-sqlite3';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {convertApplicationBook,applicationMetadata} from '../../server/src/quoteDoneBridge.js';
import {wallPainting} from '../quote-readiness/fixtures.mjs';
const root=process.cwd(),out=path.resolve(process.argv[2]),pub=path.join(out,'public');
fs.mkdirSync(pub,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE);
const base='http://127.0.0.1:5010',checks=[],wire=[],errors=[],dependencies=[];
const safe=v=>JSON.parse(JSON.stringify(v,(k,v)=>['password','passwordHash','token','bookingToken','bookingTokenReceipt','bookingTokenHash'].includes(k)?'[SYNTHETIC SECRET OMITTED]':v));
const save=(n,v)=>fs.writeFileSync(path.join(pub,n),JSON.stringify(safe(v),null,2));
let app,browser,proxy,db,page;
async function check(name,fn){try{await fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.stack});}finally{if(page&&!page.isClosed()){await page.screenshot({path:path.join(pub,name+'.png')}).catch(()=>{});save(name+'-screen.json',{text:await page.locator('body').innerText(),inputs:await page.locator('input,select').evaluateAll(nodes=>nodes.map(n=>({label:n.getAttribute('aria-label'),value:n.value,invalid:n.getAttribute('aria-invalid')})))});}}console.log('EDITOR_CHECK '+JSON.stringify(checks.at(-1)));}
async function fixture(label,fee='not_applicable',selection){
 const owner=await app.owner(label),call=async(method,url,body,status=200)=>{const r=await app.request(method,url,body,owner.token);assert.equal(r.status,status,JSON.stringify(r));return r.result;};
 const f=wallPainting(),converted=convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars');
 const services=['A','B'].map(name=>{const s=structuredClone(converted.services[0]);for(const k of ['origin','confirmedFields','approvedValues'])delete s[k];s.id=crypto.randomUUID();s.service='[SYNTHETIC] '+name;s.validationInputs=f.customerInputs;s.feeRules.travel=fee;if(selection!==undefined)s.ownerFeeSelections={travel:selection};return s;});
 let book=await call('GET','/api/pricebook/'+owner.id);Object.assign(book,{services,defaults:{...converted.defaults,travelFee:10}});await call('POST','/api/pricebook/save',book);
 for(const service of services){book=await call('GET','/api/pricebook/'+owner.id);await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:book.revision,confirmConfiguration:true});}
 await call('GET','/api/onboarding/state');db.prepare('UPDATE businessProfiles SET businessTypesJson=? WHERE ownerId=?').run(JSON.stringify(['INTERIOR_PAINTING','ROOFING_REPLACEMENT','ROOFING_REPAIR']),owner.id);
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
 app=await startApplication(root,path.join(out,'private'),{port:5012,browserOrigins:[base]});db=new Database(path.join(out,'private/application.sqlite'));
 const dist=path.join(root,'client/dist');
 proxy=http.createServer(async(req,res)=>{try{
  if(req.url.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const b=Buffer.concat(chunks),headers={};for(const k of ['origin','content-type','authorization','cookie','referer','sec-fetch-site','idempotency-key'])if(req.headers[k])headers[k]=req.headers[k];
   const r=await fetch(app.base+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&b.length?{body:b}:{})}),text=await r.text();
   wire.push({method:req.method,path:req.url,request:b.length?JSON.parse(b):null,status:r.status,response:JSON.parse(text||'null')});
   res.statusCode=r.status;r.headers.forEach((v,k)=>{if(!['content-length','content-encoding','connection','transfer-encoding'].includes(k))res.setHeader(k,v);});res.end(text);return;}
  const pathname=new URL(req.url,base).pathname,file=!path.extname(pathname)?path.join(dist,'index.html'):path.resolve(dist,'.'+pathname);
  if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
 }catch(e){res.writeHead(500).end('{}');errors.push(e.message);}});await new Promise(r=>proxy.listen(5010,'127.0.0.1',r));
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 const f=await fixture('editor-fees','owner_selected',false);
 await check('F04-transition',async()=>{
  await useOwner(f);await openSection('Quote configuration');await page.getByLabel('travel fee rule',{exact:true}).selectOption('not_applicable');
  const draft=await bookState();save('F04-transition-draft.json',draft);assert.ok(draft);assert.equal(Object.hasOwn(draft.services[0].ownerFeeSelections||{},'travel'),false);
  await page.getByLabel('travel fee rule',{exact:true}).selectOption('owner_selected');await page.getByLabel('travel owner fee selection',{exact:true}).selectOption('false');assert.equal((await bookState()).services[0].ownerFeeSelections.travel,false);
 });
 await check('F04-existing-stale',async()=>{
  const file=path.join(out,'private/pricebooks',f.owner.id+'.json'),stored=JSON.parse(fs.readFileSync(file));stored.services[0].feeRules.travel='not_applicable';stored.services[0].ownerFeeSelections={travel:false};fs.writeFileSync(file,JSON.stringify(stored));save('F04-original-stale-record.json',stored);
  await useOwner(f);await openSection('Quote configuration');await page.getByRole('button',{name:'Remove outdated travel answer',exact:true}).click();assert.equal(Object.hasOwn((await bookState()).services[0].ownerFeeSelections||{},'travel'),false);
  const wait=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/save')&&r.request().method()==='POST');await page.getByRole('button',{name:'Save & validate',exact:true}).click();assert.equal((await wait).status(),200);save('F04-corrected-record.json',await f.read());
 });
 const cf=await fixture('preview-fees','customer_selected');
 await check('F05-preview-answers',async()=>{
  await useOwner(cf);await openSection('Project measurements for preview');const choice=page.getByLabel('travel customer fee for preview',{exact:true});assert.equal(await choice.inputValue(),'');
  for(const answer of ['false','true','']){
   const expected=answer===''?undefined:answer==='true';
   const wait=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/preview')&&r.request().postDataJSON()?.customerFeeSelections?.travel===expected);
   await choice.selectOption(answer);const response=await wait,body=response.request().postDataJSON(),result=await response.json();save('F05-'+(answer||'unanswered')+'.json',{body,result,status:response.status()});assert.equal(body.customerFeeSelections.travel,expected);
   if(answer!==''){assert.equal(response.status(),200);assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');assert.equal(result.midEstimate,answer==='true'?310:300);}
   else assert.ok(response.status()!==200||result.resultType==='ESTIMATE_REQUIRES_REVIEW');
  }
  await choice.selectOption('false');await pick('B');await openSection('Project measurements for preview');assert.equal(await choice.inputValue(),'');await pick('A');await openSection('Project measurements for preview');assert.equal(await choice.inputValue(),'');
  await choice.selectOption('true');await openSection('Quote configuration');await page.getByLabel('travel fee rule',{exact:true}).selectOption('not_applicable');await page.getByLabel('travel fee rule',{exact:true}).selectOption('customer_selected');assert.equal(await choice.inputValue(),'');
  const draft=await bookState();assert.equal(draft.customerFeeSelections,undefined);assert.equal(draft.services[0].customerFeeSelections,undefined);
  const wait=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/save')&&r.request().method()==='POST');await page.getByRole('button',{name:'Save & validate',exact:true}).click();assert.equal(JSON.stringify((await wait).request().postDataJSON()).includes('customerFeeSelections'),false);
 });
 const ap=await fixture('approval');
 await check('F07-other-unsaved-service',async()=>{
  await useOwner(ap);await page.locator('#field-laborPerWallSqftPerCoat input').fill('1.2345');await pick('B');await approve(ap.services[1].id);await pick('A');
  const draft=await bookState(),saved=await ap.read();save('F07-other-draft-and-saved.json',{draft,saved});assert.equal(await page.locator('#field-laborPerWallSqftPerCoat input').inputValue(),'1.2345');assert.equal(saved.services[0].pricing.laborPerWallSqftPerCoat,1);assert.equal(draft.services[0].pricing.laborPerWallSqftPerCoat,1.2345);assert.equal(draft.revision,saved.revision);
 });
 await check('F07-edit-during-review',async()=>{
  await useOwner(ap);await page.getByRole('button',{name:'Review saved configuration',exact:true}).click();await page.getByLabel('I confirm these exact saved prices, units, factors and rules.',{exact:true}).check();await page.locator('#field-laborPerWallSqftPerCoat input').fill('1.7777');
  const confirm=page.getByRole('button',{name:'Confirm saved configuration',exact:true}),disabled=await confirm.isDisabled();
  if(!disabled){const wait=page.waitForResponse(r=>r.url().endsWith('/'+ap.services[0].id+'/approve'));await confirm.click();await wait;await page.waitForFunction(()=>!document.querySelector('fieldset[disabled]'));}
  save('F07-open-review-edited.json',{draft:await bookState(),saved:await ap.read(),disabled});assert.equal(await page.locator('#field-laborPerWallSqftPerCoat input').inputValue(),'1.7777');assert.equal(disabled,true);
 });
 await check('F07-revision-conflict',async()=>{
  await useOwner(ap);await page.getByRole('button',{name:'Review saved configuration',exact:true}).click();await page.getByLabel('I confirm these exact saved prices, units, factors and rules.',{exact:true}).check();
  const external=await ap.read();external.services[1].pricing.laborPerWallSqftPerCoat=2;await ap.call('POST','/api/pricebook/save',external);
  const wait=page.waitForResponse(r=>r.url().endsWith('/'+ap.services[0].id+'/approve'));await page.getByRole('button',{name:'Confirm saved configuration',exact:true}).click();assert.equal((await wait).status(),409);save('F07-conflict.json',{draft:await bookState(),saved:await ap.read()});assert.equal((await bookState()).services[1].pricing.laborPerWallSqftPerCoat,1);
 });
 const ia=await fixture('interview-a'),ib=await fixture('interview-b');
 await check('F08-legacy-cross-owner',async()=>{
  await useOwner(ib);await page.evaluate(()=>sessionStorage.setItem('otc_pricebook_draft',JSON.stringify({services:[{serviceType:'INTERIOR_PAINTING',service:'OWNER A PRIVATE DRAFT',pricing:{laborPerWallSqftPerCoat:77}}]})));await page.reload();await page.locator('.service-pick').first().waitFor();
  const draft=await bookState();save('F08-legacy-result.json',draft);assert.equal(draft.services.some(s=>s.service==='OWNER A PRIVATE DRAFT'),false);assert.match(await page.locator('body').innerText(),/could not verify.*owner|owner.*could not.*verify|unbound|belongs to another/i);
 });
 await check('F08-bound-same-and-cross-owner',async()=>{
  const id=await newInterview(ia,'INTERIOR_PAINTING','laborPerWallSqftPerCoat',1.2345);await page.route('**/api/dashboard',route=>route.abort());await page.getByRole('button',{name:'Review captured values in editor',exact:true}).click();await page.waitForFunction(()=>sessionStorage.getItem('otc_pricebook_draft'));const payload=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('otc_pricebook_draft')));await page.unroute('**/api/dashboard');
  await useOwner(ia,'/pricebook',{clear:false});const same=await bookState();assert.ok(same.services.some(s=>s.source==='AI_INTERVIEW'&&s.pricing.laborPerWallSqftPerCoat===1.2345));assert.ok(same.services.filter(s=>s.source==='AI_INTERVIEW').every(s=>s.active===false&&Object.keys(s.confirmedFields).length===0));
  await page.evaluate(p=>sessionStorage.setItem('otc_pricebook_draft',JSON.stringify(p)),payload);await useOwner(ib,'/pricebook',{clear:false});const other=await bookState();save('F08-bound-results.json',{payload,same,other,id});assert.equal(other.services.some(s=>s.source==='AI_INTERVIEW'),false);assert.equal(payload.ownerId,ia.owner.id);
 });
 await check('F11-three-level-repair',async()=>{
  const type='ROOFING_REPAIR',field='repairHours',id=await newInterview(ia,type,field),def=applicationMetadata().services.find(s=>s.serviceType===type).fields.find(f=>f.field===field);assert.equal(def.tree.depth,3);
  if(!(await page.getByLabel(def.label+' offering key',{exact:true}).count())){const old=page.locator('.structured-add input');if(await old.count()){await old.fill('asphalt_shingle');await page.locator('.structured-add').getByRole('button',{name:'Add',exact:true}).click();}assert.fail('Current metadata requires '+JSON.stringify(def.tree)+' but the legacy interview renders '+await page.locator('.interview-field').innerText());}
  await page.getByLabel(def.label+' offering key',{exact:true}).fill('asphalt_shingle');await page.getByRole('button',{name:'Add offering',exact:true}).first().click();
  await page.getByLabel(def.label+' asphalt shingle offering key',{exact:true}).fill('leak_patch');await page.getByRole('button',{name:'Add offering',exact:true}).first().click();
  for(const [size,v]of [['small','0'],['medium','1.2345'],['large','3']])await page.getByLabel(def.label+' asphalt shingle leak patch '+size,{exact:true}).fill(v);
  await page.getByRole('button',{name:'Read it back',exact:true}).click();await page.getByRole('button',{name:'Yes, save these prices',exact:true}).waitFor();assert.doesNotMatch(await page.locator('.readback-confirm').innerText(),/\[object Object\]/);
  const wait=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/interview/'+id)&&r.request().method()==='PUT');await page.getByRole('button',{name:'Yes, save these prices',exact:true}).click();const r=await wait,request=r.request().postDataJSON(),response=await r.json();save('F11-repair-request.json',{request,status:r.status(),response});assert.deepEqual(request.fields[type][field],{asphalt_shingle:{leak_patch:{small:0,medium:1.2345,large:3}}});
  if(r.status()===422){dependencies.push({id:'F14',case:'three-level-repair',status:422,response});assert.equal(await page.getByLabel(def.label+' asphalt shingle leak patch medium',{exact:true}).inputValue(),'1.2345');}else assert.equal(r.status(),200);
 });
 await check('F11-enum-leaf',async()=>{
  const type='ROOFING_REPLACEMENT',field='underlaymentPriceBasis',id=await newInterview(ia,type,field),def=applicationMetadata().services.find(s=>s.serviceType===type).fields.find(f=>f.field===field);
  if(!(await page.getByLabel(def.label+' offering key',{exact:true}).count())){const old=page.locator('.structured-add input');if(await old.count()){await old.fill('asphalt_shingle');await page.locator('.structured-add').getByRole('button',{name:'Add',exact:true}).click();}assert.fail('Current metadata requires '+JSON.stringify(def.tree)+' but the legacy interview renders '+await page.locator('.interview-field').innerText());}
  await page.getByLabel(def.label+' offering key',{exact:true}).fill('asphalt_shingle');await page.getByRole('button',{name:'Add offering',exact:true}).click();await page.getByLabel(def.label+' asphalt shingle',{exact:true}).selectOption('installed_area_sell_price');await page.getByRole('button',{name:'Read it back',exact:true}).click();
  const wait=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/interview/'+id)&&r.request().method()==='PUT');await page.getByRole('button',{name:'Yes, save these prices',exact:true}).click();const r=await wait;save('F11-enum-request.json',{request:r.request().postDataJSON(),status:r.status(),response:await r.json()});assert.equal(r.status(),200);
 });
 await check('F13-scalar-exactness',async()=>{
  const id=await newInterview(ia,'INTERIOR_PAINTING','laborPerWallSqftPerCoat'),input=page.locator('.interview-field input').first();await input.fill('1.0000000000000001');await page.getByRole('button',{name:'Read it back',exact:true}).click();
  const hasConfirm=await page.getByRole('button',{name:'Yes, save this number',exact:true}).count();save('F13-scalar-rejection.json',{raw:await input.inputValue(),hasConfirm,text:await page.locator('.interview-field').innerText()});assert.equal(hasConfirm,0);assert.equal(await input.inputValue(),'1.0000000000000001');assert.equal(await input.getAttribute('aria-invalid'),'true');
  await input.fill('0.0051');await page.getByRole('button',{name:'Read it back',exact:true}).click();const wait=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/interview/'+id)&&r.request().method()==='PUT');await page.getByRole('button',{name:'Yes, save this number',exact:true}).click();const r=await wait;assert.equal(r.status(),200);assert.equal(r.request().postDataJSON().fields.INTERIOR_PAINTING.laborPerWallSqftPerCoat,0.0051);save('F13-fractional-cent.json',{request:r.request().postDataJSON(),response:await r.json()});
 });
 await check('F13-map-exactness',async()=>{
  const type='ROOFING_REPLACEMENT',field='laborPerSquare';await newInterview(ia,type,field);const def=applicationMetadata().services.find(s=>s.serviceType===type).fields.find(f=>f.field===field),add=page.getByLabel(def.label+' offering key',{exact:true});let input;
  if(await add.count()){await add.fill('asphalt_shingle');await page.getByRole('button',{name:'Add offering',exact:true}).click();input=page.getByLabel(def.label+' asphalt shingle',{exact:true});}
  else{if(await page.locator('.structured-add input').count()){await page.locator('.structured-add input').fill('asphalt_shingle');await page.locator('.structured-add').getByRole('button',{name:'Add',exact:true}).click();}else await page.locator('.structured-toggle').filter({hasText:/asphalt/i}).locator('input').check();input=page.getByRole('spinbutton').first();}
  await input.fill('1.0000000000000001');await page.getByRole('button',{name:'Read it back',exact:true}).click();save('F13-map-rejection.json',{raw:await input.inputValue(),text:await page.locator('.interview-field').innerText()});assert.equal(await page.getByRole('button',{name:'Yes, save these prices',exact:true}).count(),0);assert.equal(await input.inputValue(),'1.0000000000000001');
 });
 await check('positive-normal-preview',async()=>{
  const normal=await fixture('positive-normal');await useOwner(normal);const result=await normal.call('POST','/api/pricebook/preview',{serviceId:normal.services[0].id,revision:(await normal.read()).revision,customerInputs:wallPainting().customerInputs});save('positive-preview.json',result);console.log('POSITIVE_PREVIEW '+JSON.stringify(result));assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');assert.equal(result.midEstimate,300);
 });
 save('stored-records.json',{drafts:db.prepare('SELECT * FROM priceBookDrafts').all(),books:fs.readdirSync(path.join(out,'private/pricebooks')).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(out,'private/pricebooks',f))))});
}catch(e){checks.push({name:'setup',passed:false,error:e.stack});}
finally{
 if(browser)await browser.close();if(proxy)await new Promise(r=>proxy.close(r));if(db)db.close();if(app){await app.stop();save('http.json',app.requests);fs.copyFileSync(path.join(out,'private/source-binding.json'),path.join(pub,'source-binding.json'));}
 save('browser-wire.json',wire);const result={source:process.env.EDITOR_TEST_SOURCE||process.env.GITHUB_SHA,checks,errors,dependencies,passed:checks.every(c=>c.passed)&&errors.length===0};save('result.json',result);console.log('EDITOR_BROWSER_RESULT '+JSON.stringify(result));if(!result.passed)process.exitCode=1;
}
