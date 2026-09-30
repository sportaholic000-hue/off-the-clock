import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import http from 'node:http';import {createRequire} from 'node:module';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {convertApplicationBook} from '../../server/src/quoteDoneBridge.js';
import {cases} from './fixtures.mjs';
import {submitCustomerForm} from '../quotedone/customer-intake-browser-helpers.mjs';
const root=path.resolve(process.argv[2]),evidence=path.resolve(process.argv[3]),ui='http://127.0.0.1:4672';
const app=await startApplication(root,evidence,{port:4671,browserOrigins:[ui]});
const require=createRequire(path.join(root,'package.json')),Database=require('better-sqlite3');
const rows=[],browserRows=[],wire=[],errors=[],approvals=[];let db,browser,frontend;
try{
 const owner=await app.owner('engine-independent'),call=async(method,url,body,expected=200)=>{const r=await app.request(method,url,body,owner.token);assert.equal(r.status,expected,JSON.stringify(r));return r.result;};
 db=new Database(path.join(evidence,'application.sqlite'));
 const samples=cases().filter(c=>/^(mowing-|flat-repair-|floor-tile-|custom-flat$|custom-fixed-|custom-range-)/.test(c.id)&&(!process.argv[4]||c.id.startsWith(process.argv[4])));
 const services=[],byShape=new Map();
 for(const c of samples){
  const raw=structuredClone(c.input.ownerPricing);delete raw.origin;
  if(c.input.serviceType==='CONCRETE_PATIO_SLAB')Object.assign(raw.pricing,{wireReinforcementPerSqft:150,rebarReinforcementPerSqft:200,stampedMaterialPerSqft:300});
  const shape=JSON.stringify([raw.serviceType,raw.pricing,raw.priceBasisByCategory,raw.taxabilityByCategory,raw.feeRules]);
  let s=byShape.get(shape);
  if(!s){raw.service='[SYNTHETIC] '+c.id;delete raw.confirmedFields;delete raw.approvedValues;s=raw;byShape.set(shape,s);services.push(s);}
  c.service=s;c.customerInputs=structuredClone(c.input.customerInputs);
  if(s.serviceType==='CUSTOM')c.customerInputs.service=s.service;
 }
 let book=await call('GET','/api/pricebook/'+owner.id);
 const converted=convertApplicationBook({services,defaults:samples[0].input.businessDefaults},'toDollars');
 book.services=converted.services;book.defaults=converted.defaults;
 await call('POST','/api/pricebook/save',book);book=await call('GET','/api/pricebook/'+owner.id);
 for(const s of services){
  const reply=await app.request('POST','/api/pricebook/services/'+s.id+'/approve',{revision:book.revision,confirmConfiguration:true},owner.token);
  approvals.push({serviceId:s.id,name:s.service,response:reply});book=await call('GET','/api/pricebook/'+owner.id);
 }
 fs.writeFileSync(path.join(evidence,'saved-book-and-approvals.json'),JSON.stringify({book,approvals},null,2));
 const access=await call('POST','/api/quotedone/access',{allowedOrigins:[ui]}),url='/api/public/quote/'+access.publicKey,headers={Origin:ui};
 const catalog=await app.request('GET',url,undefined,null,headers);
 fs.writeFileSync(path.join(evidence,'catalog.json'),JSON.stringify(catalog,null,2));
 for(const c of samples)for(const channel of ['public','authenticated','preview']){
  const body={requestId:crypto.randomUUID(),serviceId:c.service.id,serviceRequest:c.service.service,customerInputs:c.customerInputs,contact:{email:'synthetic-engine@example.invalid'},intakeFlow:'job-details-v1'};
  const preparation=await app.request('POST',channel==='public'?url+'/prepare':'/api/quote/prepare',body,channel==='public'?null:owner.token,channel==='public'?headers:{});
  assert.equal(preparation.status,200,JSON.stringify(preparation));
  const submission={...body,...(preparation.result.status==='ready'?{intakeConfirmation:preparation.result.confirmation}:{reviewRequested:true})};
  const response=await app.request('POST',channel==='public'?url:channel==='preview'?'/api/pricebook/preview':'/api/quote/calculate',channel==='preview'?{...submission,revision:book.revision}:submission,channel==='public'?null:owner.token,channel==='public'?headers:{});
  assert.equal(response.status,channel==='preview'?200:201,JSON.stringify(response));
  assert.equal(response.result.resultType,'INSTANT_ESTIMATE_READY',c.id+' '+channel);
  assert.equal(response.result.midEstimate,c.expected.cents/100,c.id+' '+channel+' amount');
  if(c.expected.excluded)assert.ok(response.result.options[0].disclaimer.toLowerCase().includes(c.expected.excluded),c.id+' exclusion visible');
  const receipt=channel==='preview'?null:db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner.id,body.requestId);
  if(receipt){assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),submission);assert.equal(JSON.parse(receipt.customerResponseJson).resultType,response.result.resultType);}
  rows.push({id:c.id,channel,expectation:c.expected,submission,preparation,response,receipt});
  console.log(JSON.stringify({id:c.id,channel,resultType:response.result.resultType,midEstimate:response.result.midEstimate,expected:c.expected}));
 }
 // Real production browser bundle, with same-origin local API proxy. No provider/network writes.
 const dist=path.join(root,'client/dist'),distHashes={};function bind(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())bind(p);else distHashes[path.relative(root,p).replaceAll('\\','/')]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}}bind(dist);
 fs.writeFileSync(path.join(evidence,'production-bundle-hashes.json'),JSON.stringify(distHashes,null,2));
 frontend=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){const proxy=http.request(app.base+req.url,{method:req.method,headers:{...req.headers,host:new URL(app.base).host}},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res);});proxy.on('error',e=>{res.writeHead(502);res.end(e.message);});req.pipe(proxy);return;}
  if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const pathname=new URL(req.url,ui).pathname,requested=path.resolve(dist,'.'+pathname);let file=requested.startsWith(dist+path.sep)&&fs.existsSync(requested)&&fs.statSync(requested).isFile()?requested:path.join(dist,'index.html');
  const ext=path.extname(file);res.writeHead(200,{'content-type':({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[ext]||'application/octet-stream')});fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>frontend.listen(4672,'127.0.0.1',resolve));
 const {chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE);browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE});
 for(const id of (process.argv[4]?[]:['mowing-control','mowing-unpriced-bagging','mowing-unpriced-edging','mowing-priced-extras-control','flat-repair-control','flat-repair-unpriced-ponding','flat-repair-priced-ponding-control','floor-tile-200-control','floor-tile-150-boundary','floor-tile-300-boundary','custom-flat','custom-fixed-per_hour','custom-fixed-fractional-rate','custom-range-flat'])){
  const c=samples.find(s=>s.id===id),page=await browser.newPage({viewport:{width:1440,height:1400}});page.setDefaultTimeout(45000);page.setDefaultNavigationTimeout(90000);page.on('pageerror',e=>errors.push(e.stack));
  page.on('response',async r=>{if(r.url().includes('/api/public/quote/')&&r.request().method()==='POST'){wire.push({id,body:r.request().postDataJSON(),status:r.status(),result:await r.json()});}});
  await page.goto(ui+'/quote/'+access.publicKey);
  const def=catalog.result.services.find(s=>s.id===c.service.id);
  if(!def){assert.equal(id,'custom-flat');assert.equal(await page.getByLabel('Service',{exact:true}).locator('option[value="'+c.service.id+'"]').count(),0);const text=await page.locator('main').innerText();browserRows.push({id,catalogOmitted:true,text});await page.screenshot({path:path.join(evidence,id+'-unavailable.png'),fullPage:true});console.log(JSON.stringify({browser:id,catalogOmitted:true}));await page.close();continue;}
  await page.getByLabel('Service',{exact:true}).selectOption(c.service.id);
  for(const [key,value]of Object.entries(c.customerInputs)){
   if(key==='confirmedFacts')continue;
   const field=def.customerFields.find(f=>f.name===key);assert.ok(field,key);
   const locator=page.getByLabel(field.label,{exact:true});
   if(['number','slug','string'].includes(field.type))await locator.fill(String(value));else await locator.selectOption(String(value));
  }
  for(const checkbox of await page.getByRole('checkbox',{name:'I have identified this exact offering.',exact:true}).all())await checkbox.check();
  await page.getByLabel('Email',{exact:true}).fill('synthetic-engine-browser@example.invalid');
  const response=await submitCustomerForm(page,url),result=await response.json();
  assert.equal(response.status(),201,JSON.stringify(result));
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY',id);assert.equal(result.midEstimate,c.expected.cents/100,id+' amount');
  if(c.expected.excluded)assert.ok(result.options[0].disclaimer.toLowerCase().includes(c.expected.excluded),id+' exclusion visible');
  const body=response.request().postDataJSON(),receipt=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner.id,body.requestId);assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),body);
  const text=await page.locator('main').innerText();await page.screenshot({path:path.join(evidence,id+'.png'),fullPage:true});
  browserRows.push({id,result,body,receipt,text});console.log(JSON.stringify({browser:id,resultType:result.resultType,midEstimate:result.midEstimate}));
  await page.close();
 }
 fs.writeFileSync(path.join(evidence,'summary.json'),JSON.stringify({httpChecks:rows.length,browserChecks:browserRows.length,errors},null,2));
} finally{
 fs.writeFileSync(path.join(evidence,'application-results.json'),JSON.stringify(rows,null,2));fs.writeFileSync(path.join(evidence,'browser-results.json'),JSON.stringify(browserRows,null,2));fs.writeFileSync(path.join(evidence,'browser-wire.json'),JSON.stringify(wire,null,2));fs.writeFileSync(path.join(evidence,'browser-errors.json'),JSON.stringify(errors,null,2));
 if(browser)await browser.close();if(frontend)await new Promise(resolve=>frontend.close(resolve));if(db)db.close();await app.stop();
}

