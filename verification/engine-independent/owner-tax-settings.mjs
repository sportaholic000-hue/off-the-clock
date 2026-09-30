import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {createRequire} from 'node:module';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {mowingFixture} from '../quotedone/repair-fixture.mjs';
const root=path.resolve(process.argv[2]),evidence=path.resolve(process.argv[3]),site='http://127.0.0.1:4720';
// Input-authority probes, not tax advice. $50 base; round each tax amount to cents.
const cases=[
 {id:'US-AK-explicit',body:{country:'US',region:'AK',taxMode:'TAX_ALL',taxPercent:'5'},mode:'TAX_ALL',rate:5,total:52.50},
 {id:'CA-NS-explicit-rate',body:{country:'CA',region:'NS',taxMode:'TAX_ALL',taxPercent:'13'},mode:'TAX_ALL',rate:13,total:56.50},
 {id:'CA-NS-explicit-none',body:{country:'CA',region:'NS',taxMode:'TAX_NONE',taxPercent:'0'},mode:'TAX_NONE',rate:0,total:50},
 {id:'US-NY-control',body:{country:'US',region:'NY',taxMode:'TAX_ALL',taxPercent:'8.875'},mode:'TAX_ALL',rate:8.875,total:54.44},
 {id:'CA-NS-prefill-control',body:{country:'CA',region:'NS'},mode:'TAX_ALL',rate:14,total:57},
 {id:'US-AK-prefill-control',body:{country:'US',region:'AK'},mode:'TAX_NONE',rate:0,total:50}
];
const rows=[],failures=[],wire=[];let browser,server,db;
const app=await startApplication(root,evidence,{port:4722,browserOrigins:[site]});
const require=createRequire(path.join(root,'package.json')),Database=require('better-sqlite3');
async function check(id,fn){try{await fn();rows.push({id,passed:true});}catch(error){rows.push({id,passed:false,error:String(error.stack)});failures.push(id);}console.log(JSON.stringify(rows.at(-1)));}
try{
 fs.writeFileSync(path.join(evidence,'expected.json'),JSON.stringify(cases,null,2));
 const f=await mowingFixture(app,'tax-settings',[site]);db=new Database(path.join(evidence,'application.sqlite'));
 const other=await mowingFixture(app,'tax-other-tenant',[site]),otherBefore=await other.read();
 async function verify(c,response){
  const book=await f.read();
  await check(c.id+'/settings',()=>{assert.equal(response.status,200);assert.equal(response.result.taxMode,c.mode);assert.equal(response.result.taxPercent,c.rate);assert.equal(book.defaults.taxMode,c.mode);assert.equal(book.defaults.taxPercent,c.rate);});
  await f.approve();const approved=await f.read();
  for(const channel of ['public','authenticated','preview']){
   const body=f.submission({intakeFlow:'job-details-v1'});
   const prep=await app.request('POST',channel==='public'?f.url+'/prepare':'/api/quote/prepare',body,channel==='public'?null:f.owner.token,channel==='public'?f.headers:{});
   const submission={...body,...(prep.result.status==='ready'?{intakeConfirmation:prep.result.confirmation}:{reviewRequested:true})};
   const response=await app.request('POST',channel==='public'?f.url:channel==='preview'?'/api/pricebook/preview':'/api/quote/calculate',channel==='preview'?{...submission,revision:approved.revision}:submission,channel==='public'?null:f.owner.token,channel==='public'?f.headers:{});
   const receipt=channel==='preview'?null:db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,body.requestId);
   fs.writeFileSync(path.join(evidence,c.id+'-'+channel+'.json'),JSON.stringify({submission,prep,response,receipt},null,2));
   await check(c.id+'/'+channel,()=>{assert.equal(prep.status,200);assert.equal(response.status,channel==='preview'?200:201);assert.equal(response.result.resultType,'INSTANT_ESTIMATE_READY');assert.equal(response.result.midEstimate,c.total);if(receipt)assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),submission);});
  }
 }
 if(process.argv[4]!=='browser'){
 for(const c of cases)await verify(c,await app.request('POST','/api/business/jurisdiction',c.body,f.owner.token));
 for(const [id,body]of Object.entries({badMode:{taxMode:'SOMETHING',taxPercent:'5'},nestedMode:{taxMode:{value:'TAX_ALL'},taxPercent:'5'},nestedRate:{taxMode:'TAX_ALL',taxPercent:{value:5}},blankRate:{taxMode:'TAX_ALL',taxPercent:''},invalidRate:{taxMode:'TAX_ALL',taxPercent:'5 percent'},rateWithoutMode:{taxPercent:'5'}})){
  const before=await f.read(),response=await app.request('POST','/api/business/jurisdiction',{country:'US',region:'AK',...body},f.owner.token),after=await f.read();
  await check('reject/'+id,()=>{assert.equal(response.status,400);assert.deepEqual(after,before);});
 }
 await check('tenant-isolation',async()=>assert.deepEqual(await other.read(),otherBefore));
 }
 const dist=path.join(root,'client/dist');
 server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,site);
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks),headers={};
   for(const key of ['origin','content-type','authorization','referer'])if(req.headers[key])headers[key]=req.headers[key];
   const response=await fetch(app.base+req.url,{method:req.method,headers,redirect:'manual',...(!['GET','HEAD'].includes(req.method)&&body.length?{body}:{})});const text=await response.text();
   wire.push({method:req.method,path:req.url,body:body.length?JSON.parse(body):null,status:response.status,response:JSON.parse(text)});
   res.statusCode=response.status;res.setHeader('content-type','application/json');res.end(text);return;
  }
  const file=path.resolve(dist,!path.extname(url.pathname)?'index.html':'.'+url.pathname);assert.ok(file.startsWith(dist+path.sep));
  res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
 }catch(error){res.writeHead(500,{'content-type':'text/plain'}).end(String(error));}});
 await new Promise(resolve=>server.listen(4720,'127.0.0.1',resolve));
 const {chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE);
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,timeout:180000});
 for(const original of [cases[0],cases[1],cases[3]]){
  const c={...original,id:'browser-'+original.id},page=await browser.newPage();page.setDefaultTimeout(45000);
  await page.addInitScript(token=>localStorage.setItem('otc_token',token),f.owner.token);await page.goto(site+'/onboarding?step=3');
  await page.getByRole('heading',{name:'Set your jurisdiction',exact:true}).waitFor();
  fs.writeFileSync(path.join(evidence,c.id+'-loaded.html'),await page.content());
  await page.getByLabel(/^Country/).selectOption(c.body.country);
  await page.getByLabel(c.body.country==='US'?'State code':'Province code',{exact:true}).fill(c.body.region);
  if(c.body.country==='US')await page.getByRole('radio',{name:'I charge sales tax on the entire job.',exact:true}).check();
  await page.getByLabel(c.body.country==='US'?'Sales tax rate (%)':'Confirmed combined tax rate (%)',{exact:true}).fill(c.body.taxPercent);
  await page.screenshot({path:path.join(evidence,c.id+'-entered.png'),fullPage:true});
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/business/jurisdiction')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Continue',exact:true}).click();const response=await pending;
  await verify(c,{status:response.status(),result:await response.json()});await page.close();
 }
}finally{
 fs.writeFileSync(path.join(evidence,'summary.json'),JSON.stringify({checks:rows.length,passed:rows.filter(r=>r.passed).length,failures,rows},null,2));
 fs.writeFileSync(path.join(evidence,'browser-http.json'),JSON.stringify(wire,null,2));
 if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(db)db.close();await app.stop();
}
if(failures.length)process.exitCode=1;
