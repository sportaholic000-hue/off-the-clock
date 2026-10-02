import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import Database from 'better-sqlite3';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {convertApplicationBook} from '../../server/src/quoteDoneBridge.js';
import {customerFieldVisible} from '../../server/scopeConfiguration.js';
import {roofMinimum,wallPainting,bareConcrete,bareMulch,standardFence,standardExterior} from './fixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
const root=process.cwd(),out=path.resolve(process.argv[2]),pub=path.join(out,'public');
fs.mkdirSync(pub,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.READINESS_BROWSER_MODULE);
const base='http://127.0.0.1:4970',site='http://127.0.0.1:4971',checks=[],wire=[],errors=[];
const safe=v=>JSON.parse(JSON.stringify(v,(k,v)=>['password','passwordHash','token','bookingToken','bookingTokenReceipt','bookingTokenHash'].includes(k)?'[SYNTHETIC SECRET OMITTED]':v));
const save=(n,v)=>fs.writeFileSync(path.join(pub,n),JSON.stringify(safe(v),null,2));
let app,browser,proxy,host,db,page,snippet='';
const listen=(server,port)=>new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
async function check(name,fn){try{await fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.stack});if(page&&!page.isClosed())await page.screenshot({path:path.join(pub,'failure-'+checks.length+'.png')}).catch(()=>{});}console.log('READINESS_BROWSER '+JSON.stringify(checks.at(-1)));}
async function fixture(label,items){
 const owner=await app.owner(label),call=async(method,url,body,status=200)=>{const r=await app.request(method,url,body,owner.token);assert.equal(r.status,status,JSON.stringify(r));return r.result;};
 let book=await call('GET','/api/pricebook/'+owner.id);
 const services=items.map(({name,input,minimum})=>{const s=convertApplicationBook({services:[input.ownerPricing],defaults:input.businessDefaults},'toDollars').services[0];for(const k of ['origin','confirmedFields','approvedValues'])delete s[k];s.id=crypto.randomUUID();s.service=name;if(minimum!==undefined)s.pricing.minimumJob=minimum;return s;});
 const defaults=convertApplicationBook({services:[],defaults:items[0].input.businessDefaults},'toDollars').defaults;
 Object.assign(book,{services,defaults});await call('POST','/api/pricebook/save',book);
 const read=()=>call('GET','/api/pricebook/'+owner.id);
 for(const service of services){book=await read();await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:book.revision,confirmConfiguration:true});}
 const access=await call('POST','/api/quotedone/access',{allowedOrigins:[base,site]});
 return {owner,services,items,read,call,access,url:'/api/public/quote/'+access.publicKey};
}
async function login(f){await page.goto(base+'/login');await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.reload();await page.getByRole('button',{name:'Sign in',exact:true}).first().click();await page.getByLabel('Email',{exact:true}).fill(f.owner.email);await page.getByLabel('Password',{exact:true}).fill(f.owner.password);await page.locator('button[type=submit]').click();await page.waitForFunction(()=>!!localStorage.getItem('otc_token'));await page.goto(base+'/pricebook');}
async function saveAndApprove(f,id){
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/save')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Save & validate',exact:true}).click();assert.equal((await saved).status(),200);
 await page.getByRole('button',{name:'Review saved configuration',exact:true}).click();
 await page.getByLabel('I confirm these exact saved prices, units, factors and rules.',{exact:true}).check();
 const approved=page.waitForResponse(r=>r.url().endsWith('/'+id+'/approve'));await page.getByRole('button',{name:'Confirm saved configuration',exact:true}).click();assert.equal((await approved).status(),200);
 await page.waitForFunction(()=>document.querySelector('.service-pick.active')?.textContent.includes('QUOTING LIVE'));
 await page.getByText('Checking changes',{exact:true}).waitFor({state:'hidden'});
}
async function snapshot(name,width){await page.getByText('Checking changes',{exact:true}).waitFor({state:'hidden'});await page.getByText('CALCULATING',{exact:true}).waitFor({state:'hidden'});await page.setViewportSize({width,height:900});await page.locator(name.startsWith('roof-')?'#field-minimumJob':name.startsWith('optional-')?'.scope-coverage':'.essentials').first().evaluate(el=>window.scrollTo({top:Math.max(0,window.scrollY+el.getBoundingClientRect().top-170)}));const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(geometry.scroll<=width+1,JSON.stringify(geometry));await page.screenshot({path:path.join(pub,name+'-'+width+'.png')});}
async function widget(f,index,changes={},review=false){
 const p=await browser.newPage({viewport:{width:375,height:812}});p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
 try{
  const id=f.services[index].id,inputs={...f.items[index].input.customerInputs,...changes};
  const catalogResponse=await app.request('GET',f.url,undefined,undefined,{Origin:site});assert.equal(catalogResponse.status,200);const catalog=catalogResponse.result,fields=catalog.services.find(s=>s.id===id).customerFields.filter(field=>field.type!=='confirmed_facts');
  await p.goto(site);await p.locator('.launcher').click();const select=p.getByLabel('Service',{exact:true});await select.locator('option[value="'+id+'"]').waitFor({state:'attached'});await select.selectOption(id);await p.getByRole('button',{name:'Continue',exact:true}).click();
  for(const field of fields.filter(field=>customerFieldVisible(field,inputs))){
   const v=inputs[field.name],c=p.getByLabel(field.label,{exact:true});
   if(v!==undefined){if(['number','string','slug'].includes(field.type))await c.fill(String(v));else await c.selectOption(String(v));}
   await p.getByRole('button',{name:'Continue',exact:true}).click();
  }
  await p.getByLabel('Additional project details',{exact:true}).fill('');await p.getByRole('button',{name:'Continue',exact:true}).click();
  await p.getByLabel('Additional work for on-site estimate',{exact:true}).fill('');await p.getByRole('button',{name:'Continue',exact:true}).click();
  await p.getByLabel('Email',{exact:true}).fill('synthetic-readiness@example.invalid');await p.getByRole('button',{name:'Continue',exact:true}).click();await p.getByLabel('Urgency',{exact:true}).selectOption('flexible');
  const prepared=p.waitForResponse(r=>r.url().endsWith('/prepare'));await p.getByRole('button',{name:'Submit estimate request',exact:true}).click();const prep=await (await prepared).json();
  const receive=p.waitForResponse(r=>r.url()===base+f.url&&r.request().method()==='POST');
  if(review)await p.getByRole('button',{name:/request.*review|send.*review|request.*estimate|send.*request/i}).click();
  else await p.getByRole('button',{name:'Get estimate',exact:true}).click();
  const response=await receive,result=await response.json();assert.equal(response.status(),201);
  assert.equal(result.resultType,review?'ESTIMATE_REQUIRES_REVIEW':'INSTANT_ESTIMATE_READY');
  const book=await f.read(),preview=await f.call('POST','/api/pricebook/preview',{serviceId:id,revision:book.revision,customerInputs:inputs});
  if(!review)assert.equal(result.midEstimate,preview.midEstimate);else assert.equal(result.midEstimate,undefined);
  save('widget-'+(review?'review':'base')+'.json',{prep,result,preview,request:response.request().postDataJSON()});await p.screenshot({path:path.join(pub,'widget-'+(review?'review':'base')+'-375.png')});
 }finally{await p.close();}
}
try{
 app=await startApplication(root,path.join(out,'private'),{port:4972,browserOrigins:[base]});db=new Database(path.join(out,'private/application.sqlite'));
 const dist=path.join(root,'client/dist');
 proxy=http.createServer(async(req,res)=>{try{
  if(req.url.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const b=Buffer.concat(chunks),headers={};for(const k of ['origin','content-type','authorization','cookie','referer','sec-fetch-site','idempotency-key'])if(req.headers[k])headers[k]=req.headers[k];
   const r=await fetch(app.base+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&b.length?{body:b}:{})}),text=await r.text();
   wire.push({method:req.method,path:req.url,request:b.length?JSON.parse(b):null,status:r.status,response:JSON.parse(text||'null')});
   res.statusCode=r.status;r.headers.forEach((v,k)=>{if(!['content-length','content-encoding','connection','transfer-encoding'].includes(k))res.setHeader(k,v);});res.end(text);return;}
  const pathname=new URL(req.url,base).pathname,file=!path.extname(pathname)?path.join(dist,'index.html'):path.resolve(dist,'.'+pathname);
  if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('access-control-allow-origin','*');res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
 }catch(e){res.writeHead(500).end('{}');errors.push(e.message);}});await listen(proxy,4970);
 host=http.createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><h1>[SYNTHETIC] Contractor</h1>'+snippet);});await listen(host,4971);
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 const roof=await fixture('roof-editor',[{name:'[SYNTHETIC] Roof minimum',input:roofMinimum(),minimum:25}]);
 await check('B1 roof minimum entered, saved, reloaded and approved through the real editor',async()=>{
  await login(roof);await page.locator('.service-pick').filter({hasText:'[SYNTHETIC] Roof minimum'}).click();await page.locator('#field-minimumJob input').fill('2500');
  await saveAndApprove(roof,roof.services[0].id);await page.reload();await page.locator('.service-pick').filter({hasText:'[SYNTHETIC] Roof minimum'}).click();assert.equal(await page.locator('#field-minimumJob input').inputValue(),'2500');
  const saved=await roof.read(),stored=JSON.parse(fs.readFileSync(path.join(out,'private/pricebooks',roof.owner.id+'.json'),'utf8'));
  assert.equal(stored.services[0].pricing.minimumJob,250000);const preview=await roof.call('POST','/api/pricebook/preview',{serviceId:roof.services[0].id,revision:saved.revision,customerInputs:roof.items[0].input.customerInputs});
  assert.equal(preview.midEstimate,2875);assert.equal(preview.lowEstimate,2875);save('roof-editor.json',{saved,stored,preview});
  for(const width of [375,1280])await snapshot('roof-minimum-editor',width);
 });
 await check('B1 historical fractional-cent minimum opens and is corrected through the real editor',async()=>{
  const file=path.join(out,'private/pricebooks',roof.owner.id+'.json'),historical=JSON.parse(fs.readFileSync(file,'utf8'));
  historical.services[0].pricing.minimumJob=2500.5;delete historical.services[0].quoteDoneApproval.moneyUnitVersion;fs.writeFileSync(file,JSON.stringify(historical));
  await page.reload();await page.locator('.service-pick').filter({hasText:'[SYNTHETIC] Roof minimum'}).click();
  assert.equal(await page.locator('#field-minimumJob input').inputValue(),'25.005');
  await page.locator('#field-minimumJob input').fill('2500.50');await saveAndApprove(roof,roof.services[0].id);
  const saved=await roof.read(),stored=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(stored.services[0].pricing.minimumJob,250050);
  const preview=await roof.call('POST','/api/pricebook/preview',{serviceId:roof.services[0].id,revision:saved.revision,customerInputs:roof.items[0].input.customerInputs});
  assert.equal(preview.midEstimate,2875.58);save('historical-roof-editor.json',{historical,saved,stored,preview});
  await snapshot('roof-historical-editor',375);
 });
 const owner=await fixture('optional-editor',[
  {name:'[SYNTHETIC] Wall painting',input:wallPainting()},{name:'[SYNTHETIC] Concrete',input:bareConcrete()},{name:'[SYNTHETIC] Mulch',input:bareMulch()},
  {name:'[SYNTHETIC] Fence offering',input:standardFence()},{name:'[SYNTHETIC] Exterior offering',input:standardExterior()}
 ]);
 await check('M1 base work and lead-only options are visible in the editor',async()=>{
  await login(owner);await page.locator('.service-pick').filter({hasText:'[SYNTHETIC] Wall painting'}).click();
  await page.getByText('Ceiling painting requests arrive as leads until you configure this scope and its prices.',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.service-pick.active .service-compact-status')?.textContent.trim()==='Standard jobs ready · more scope needs setup');
  for(const name of ['[SYNTHETIC] Wall painting','[SYNTHETIC] Concrete','[SYNTHETIC] Mulch']){
   const pick=page.locator('.service-pick').filter({hasText:name});
   assert.doesNotMatch(await pick.locator('.service-compact-status').innerText(),/prices? needed/);
  }
  for(const width of [375,1280])await snapshot('optional-prices-editor',width);
 });
 await check('M2 fence offering is configured from the editor without unused standard rate fields',async()=>{
  await page.locator('.service-pick').filter({hasText:'[SYNTHETIC] Fence offering'}).click();assert.equal(await page.locator('#field-laborPerLinearFoot').count(),0);
  await page.getByLabel('Offering pricing',{exact:true}).selectOption('installed');
  await page.getByLabel('Included job description',{exact:true}).fill('[SYNTHETIC] Six-foot wood fence');
  await page.getByLabel('Offered fence type',{exact:true}).fill('wood');await page.getByLabel('Offered fence height (ft)',{exact:true}).fill('6');
  await page.getByLabel('Offered terrain',{exact:true}).selectOption('flat');await page.getByLabel('Standard posts, footings and digging included',{exact:true}).fill('[SYNTHETIC] Standard posts and concrete footings included.');
  await page.getByRole('button',{name:'No gates offered',exact:true}).click();await page.getByLabel('Offering price installedFencePerLF',{exact:true}).fill('40');
  await saveAndApprove(owner,owner.services[3].id);const book=await owner.read(),input=offeringFixture('FENCING_INSTALL','installed').customerInputs;input.gates={};
  const preview=await owner.call('POST','/api/pricebook/preview',{serviceId:owner.services[3].id,revision:book.revision,customerInputs:input});assert.equal(preview.resultType,'INSTANT_ESTIMATE_READY');assert.equal(preview.midEstimate,4000);save('fence-editor.json',{book,preview});
  for(const width of [375,1280])await snapshot('fence-offering-editor',width);
 });
 await check('M2 exterior offering is configured from the editor with coats preparation and primer',async()=>{
  await page.locator('.service-pick').filter({hasText:'[SYNTHETIC] Exterior offering'}).click();assert.equal(await page.locator('#field-exteriorLaborPerSqftPerCoat').count(),0);
  await page.getByLabel('Offering pricing',{exact:true}).selectOption('installed');
  for(const [label,value]of [['Included job description','[SYNTHETIC] Defined exterior painting'],['Paintable surface covered','[SYNTHETIC] Wood siding'],['Coating and product system','[SYNTHETIC] Owner coating'],['Preparation work included or measured separately','[SYNTHETIC] Defined full-area preparation']])await page.getByLabel(label,{exact:true}).fill(value);
  for(const [label,value]of [['Wall finish coats','2'],['Surface condition covered','fair'],['Wall primer coats included','1'],['Building stories covered','2']])await page.getByLabel(label,{exact:true}).selectOption(value);
  await page.getByLabel('Offering price installedWallPerSqft',{exact:true}).fill('6');await saveAndApprove(owner,owner.services[4].id);
  const book=await owner.read(),preview=await owner.call('POST','/api/pricebook/preview',{serviceId:owner.services[4].id,revision:book.revision,customerInputs:offeringFixture('EXTERIOR_PAINTING','installed').customerInputs});assert.equal(preview.resultType,'INSTANT_ESTIMATE_READY');assert.equal(preview.midEstimate,3000);save('exterior-editor.json',{book,preview});
  for(const width of [375,1280])await snapshot('exterior-offering-editor',width);
 });
 snippet=await page.getByRole('textbox',{name:/^Widget code/}).inputValue();save('owner-snippet.json',{snippet});
 await check('M1 normal customer widget quotes a configured wall-only job',()=>widget(owner,0));
 await check('M1 normal customer widget captures selected unpriced trim as a lead',()=>widget(owner,0,{trimIncluded:true,trimLengthLF:20},true));
 await check('Browser and persistence boundary',async()=>{assert.deepEqual(errors,[]);save('stored-records.json',{submissions:db.prepare('SELECT * FROM quoteSubmissions').all(),quotes:db.prepare('SELECT * FROM quotes').all(),leads:db.prepare('SELECT * FROM leads').all()});});
}catch(e){checks.push({name:'setup',passed:false,error:e.stack});}
finally{
 if(browser)await browser.close();if(proxy)await new Promise(r=>proxy.close(r));if(host)await new Promise(r=>host.close(r));if(db)db.close();if(app){await app.stop();save('http.json',app.requests);fs.copyFileSync(path.join(out,'private/source-binding.json'),path.join(pub,'source-binding.json'));}
 save('browser-wire.json',wire);const result={source:process.env.GITHUB_SHA,checks,passed:checks.every(c=>c.passed)};save('result.json',result);console.log('READINESS_BROWSER_RESULT '+JSON.stringify(result));if(!result.passed)process.exitCode=1;
}
