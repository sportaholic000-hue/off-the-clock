import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {startApplication} from './application-harness.mjs';
import {mowingFixture} from './repair-fixture.mjs';
const [root,evidence]=process.argv.slice(2).map(v=>path.resolve(v)),app=await startApplication(root,evidence,{port:4517});
const require=createRequire(path.join(root,'package.json')),{chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE),Database=require('better-sqlite3');
const ui='http://127.0.0.1:4518',rows=[],wire=[],logs=[];let browser,vite,db;
try{
 const f=await mowingFixture(app,'normal-intake-browser',[ui]);db=new Database(path.join(evidence,'application.sqlite'));
 const stored=body=>db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,body.requestId);
 const count=()=>db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n;
 vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4518','--strictPort'],{cwd:path.join(root,'client'),env:{...app.env,VITE_API_URL:app.base},windowsHide:true,stdio:['ignore','pipe','pipe']});
 vite.stdout.on('data',b=>logs.push(String(b)));vite.stderr.on('data',b=>logs.push(String(b)));
 let live=false;for(let i=0;i<1200;i++){if(vite.exitCode!==null)throw Error(logs.join(''));try{if((await fetch(ui)).ok){live=true;break;}}catch{}await delay(100);}assert.ok(live);
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE});
 async function page(){const p=await browser.newPage({viewport:{width:1440,height:1250}});p.setDefaultTimeout(60000);p.setDefaultNavigationTimeout(120000);p.on('pageerror',e=>logs.push('PAGE ERROR '+e.stack));p.on('console',m=>logs.push('BROWSER '+m.type()+': '+m.text()));p.on('request',r=>logs.push('REQUEST '+r.method()+' '+r.url()));p.on('response',r=>logs.push('RESPONSE '+r.status()+' '+r.url()));p.on('requestfailed',r=>logs.push('FAILED '+r.url()+' '+r.failure()?.errorText));return p;}
 const identity={Name:'[SYNTHETIC] Alex Smith',Email:'synthetic@example.invalid',Phone:'+1 (902) 555-0123','Project location':'[SYNTHETIC] 123 Example Street',City:'Example City','State / province':'NS','Postal / ZIP code':'B3H 0A1',Country:'CA'};
 async function fill(p,changes={}){
  await p.goto(ui+'/quote/'+f.access.publicKey);await p.getByLabel('Service',{exact:true}).selectOption(f.id);
  for(const [key,value]of Object.entries(f.inputs)){const field=f.meta.services.find(s=>s.serviceType==='LANDSCAPING_MOWING').customerFields.find(v=>v.name===key);if(field.type==='number')await p.getByLabel(field.label,{exact:true}).fill(String(value));else await p.getByLabel(field.label,{exact:true}).selectOption(String(value));}
  for(const [label,value]of Object.entries({...identity,...changes}))await p.getByLabel(label,{exact:true}).fill(value);
  await p.getByLabel('Urgency',{exact:true}).selectOption('flexible');
 }
 async function check(p,status=200){
  const before=count(),waiting=p.waitForResponse(r=>r.url().endsWith(f.url+'/prepare')&&r.request().method()==='POST');
  await p.getByRole('button',{name:'Submit estimate request',exact:true}).click();const response=await waiting,body=response.request().postDataJSON(),result=await response.json();
  wire.push({phase:'prepare',status:response.status(),body,result});assert.equal(response.status(),status);assert.equal(count(),before,'Checking details is not a saved quote');
  if(status===200){await p.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();assert.equal(await p.getByRole('heading',{name:'Estimate',exact:true}).count(),0);for(const key of ['lowEstimate','midEstimate','highEstimate','options'])assert.equal(Object.hasOwn(result,key),false);}
  return {body,result};
 }
 async function finish(p,prepared,status=201){
  const waiting=p.waitForResponse(r=>r.url().endsWith(f.url)&&r.request().method()==='POST');
  await p.getByRole('button',{name:prepared.result.status==='ready'?'Get estimate':'Send request for review',exact:true}).click();const response=await waiting,body=response.request().postDataJSON(),result=await response.json();
  wire.push({phase:'submit',status:response.status(),body,result});assert.equal(response.status(),status);
  if(status===201){assert.deepEqual(JSON.parse(stored(body).originalSubmissionJson),body);assert.deepEqual(JSON.parse(stored(body).customerResponseJson),result);}
  return {body,result};
 }
 const p=await page();await fill(p);const normal=await check(p);assert.equal(normal.result.status,'ready');
 await p.getByText(identity.Name,{exact:true}).waitFor();await p.getByText(identity['Project location'],{exact:true}).waitFor();await p.screenshot({path:path.join(evidence,'named-addressed-job-summary.png'),fullPage:true});
 const quoted=await finish(p,normal);assert.equal(quoted.result.midEstimate,50);assert.equal(quoted.body.contact.name,identity.Name);assert.equal(quoted.body.location.addressLine1,identity['Project location']);assert.equal(quoted.body.urgency,'flexible');await p.getByText('$50',{exact:true}).waitFor();await p.screenshot({path:path.join(evidence,'named-addressed-50-estimate.png'),fullPage:true});rows.push({name:'Ordinary name address and timing quote $50 after the full job summary',normal,quoted,passed:true});
 const phone=await page();await fill(phone,{Name:'',Email:''});const phoneDetails=await check(phone),phoneQuote=await finish(phone,phoneDetails);assert.equal(phoneQuote.result.midEstimate,50);assert.ok(phoneQuote.body.contact.name===undefined||phoneQuote.body.contact.name==='','An omitted optional name does not prevent a quote');rows.push({name:'A name is optional; phone-only callback still quotes',phoneDetails,phoneQuote,passed:true});await phone.close();
 for(const [name,field,value]of [
  ['Additional work','Additional project details','Include hedge trimming and removal in this same estimate.'],
  ['Measurement uncertainty','Measurements or facts you do not know','The 10000 square feet is a guess; it has not been measured.']
 ]){
  const q=await page();await fill(q);await q.getByLabel(field,{exact:true}).fill(value);const details=await check(q);
  assert.equal(details.result.status,'needs_details');assert.equal(details.result.confirmation,undefined);assert.equal(await q.getByRole('button',{name:'Get estimate',exact:true}).count(),0);
  const saved=await finish(q,details);assert.equal(saved.result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(saved.result.midEstimate,undefined);
  assert.equal(saved.body[field==='Additional project details'?'context':'explicitUnknowns'],value);assert.equal(saved.body.contact.name,identity.Name);assert.equal(saved.body.location.addressLine1,identity['Project location']);
  await q.getByText('Request saved for review',{exact:true}).waitFor();rows.push({name:name+' blocks the subtotal and preserves all named site details',details,saved,passed:true});await q.close();
 }
 const correct=await page();await fill(correct);await correct.getByLabel('Measurements or facts you do not know',{exact:true}).fill('The entered area is not measured.');
 const uncertain=await check(correct);assert.equal(uncertain.result.status,'needs_details');
 await correct.getByRole('button',{name:'Change details',exact:true}).click();
 const area=f.meta.services.find(s=>s.serviceType==='LANDSCAPING_MOWING').customerFields.find(v=>v.name==='yardSqft').label;
 await correct.getByLabel(area,{exact:true}).fill('12000');const stillUnknown=await check(correct);assert.equal(stillUnknown.result.status,'needs_details','Changing a number alone cannot erase a recorded uncertainty');
 await correct.getByRole('button',{name:'Change details',exact:true}).click();await correct.getByLabel('Measurements or facts you do not know',{exact:true}).fill('');
 const clarified=await check(correct);assert.equal(clarified.result.status,'ready');const clarifiedQuote=await finish(correct,clarified);assert.equal(clarifiedQuote.result.midEstimate,60);
 rows.push({name:'Explicit measurement correction can quote; a number change alone cannot waive unknowns',uncertain,stillUnknown,clarified,clarifiedQuote,passed:true});await correct.close();
 const callback=await page();await fill(callback,{Email:'',Phone:''});const rejected=await check(callback,422);assert.equal(stored(rejected.body),undefined);
 await callback.reload();await callback.getByLabel('Name',{exact:true}).waitFor();assert.equal(await callback.getByLabel('Name',{exact:true}).inputValue(),identity.Name);assert.equal(await callback.getByLabel('Project location',{exact:true}).inputValue(),identity['Project location']);
 await callback.getByLabel('Phone',{exact:true}).fill('555-0123');const fixed=await check(callback),fixedQuote=await finish(callback,fixed);assert.notEqual(fixedQuote.body.requestId,rejected.body.requestId);assert.equal(fixedQuote.result.midEstimate,50);
 rows.push({name:'Actual 422 callback correction preserves name address and work across reload',rejected,fixed,fixedQuote,passed:true});await callback.close();
 for(const [label,value,field,correction]of [['Phone','555-x123','phone','555-0123'],['Email','customer.example.invalid','email','synthetic@example.invalid']]){
  const q=await page();await fill(q,{[label]:value});const rejected=await check(q,422);assert.deepEqual(rejected.result.details.fields,[field]);assert.equal(stored(rejected.body),undefined);
  await q.getByText(rejected.result.error,{exact:true}).waitFor();await q.reload();await q.getByLabel(label,{exact:true}).waitFor();assert.equal(await q.getByLabel(label,{exact:true}).inputValue(),value);assert.equal(await q.getByLabel('Name',{exact:true}).inputValue(),identity.Name);
  await q.getByLabel(label,{exact:true}).fill(correction);const details=await check(q),quoted=await finish(q,details);assert.equal(quoted.result.midEstimate,50);assert.notEqual(quoted.body.requestId,rejected.body.requestId);assert.deepEqual(quoted.body.customerInputs,rejected.body.customerInputs);assert.deepEqual(quoted.body.location,rejected.body.location);
  rows.push({name:'Malformed optional '+field+' gets a targeted correction and then quotes',rejected,details,quoted,passed:true});await q.close();
 }
 const stalePage=await page();await fill(stalePage);const staleDetails=await check(stalePage),before=count();
 const book=await f.read();book.services[0].pricing.mowingBaseRatePerSqft=.01;await f.call('POST','/api/pricebook/save',book);await f.approve();
 const stale=await finish(stalePage,staleDetails,409);assert.equal(count(),before);assert.equal(stored(stale.body),undefined);
 await stalePage.getByLabel('Name',{exact:true}).waitFor();assert.equal(await stalePage.getByLabel('Name',{exact:true}).inputValue(),identity.Name);await stalePage.reload();await stalePage.getByLabel('Name',{exact:true}).waitFor();assert.equal(await stalePage.getByLabel('Project location',{exact:true}).inputValue(),identity['Project location']);
 const refreshed=await check(stalePage),newQuote=await finish(stalePage,refreshed);assert.equal(newQuote.result.midEstimate,100);assert.notEqual(newQuote.body.requestId,stale.body.requestId);
 rows.push({name:'Actual stale-pricing 409 remains editable and a new confirmed price is used',staleDetails,stale,refreshed,newQuote,passed:true});await stalePage.close();
 const owner=await page();await owner.goto(ui);await owner.getByRole('button',{name:'Sign in',exact:true}).first().click();await owner.getByLabel('Email',{exact:true}).fill(f.owner.email);await owner.getByLabel('Password',{exact:true}).fill(f.owner.password);await owner.locator('button[type=submit]').click();await owner.waitForFunction(()=>!!localStorage.getItem('otc_token'));await owner.goto(ui+'/leads');await owner.getByText('Customer',{exact:true}).first().waitFor();
 const leadText=await owner.locator('body').innerText();assert.ok(leadText.includes(identity.Name));assert.ok(leadText.includes(identity['Project location']));assert.ok(leadText.includes('Include hedge trimming and removal'));await owner.screenshot({path:path.join(evidence,'owner-original-details.png'),fullPage:true});
 rows.push({name:'Owner CRM retains name site details extra work and uncertainty',passed:true});
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,checks:rows.length,rows},null,2));console.log(JSON.stringify({passed:true,checks:rows.length},null,2));
}catch(error){if(browser)for(const [i,p]of browser.contexts().flatMap(c=>c.pages()).entries()){fs.writeFileSync(path.join(evidence,'failure-'+i+'.txt'),await p.locator('body').innerText().catch(()=>''));await p.screenshot({path:path.join(evidence,'failure-'+i+'.png'),fullPage:true}).catch(()=>{});}fs.writeFileSync(path.join(evidence,'failed-results.json'),JSON.stringify({passed:false,rows,error:String(error.stack)},null,2));throw error;}
finally{if(browser)await browser.close();if(vite&&vite.exitCode===null){const closed=new Promise(r=>vite.once('close',r));vite.kill();await closed;}if(db)db.close();await app.stop();fs.writeFileSync(path.join(evidence,'browser-responses.json'),JSON.stringify(wire,null,2));fs.writeFileSync(path.join(evidence,'browser-vite.log'),logs.join('\n'));}
