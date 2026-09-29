import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {startApplication} from './application-harness.mjs';
import {mowingFixture} from './repair-fixture.mjs';
const [root,evidence]=process.argv.slice(2).map(v=>path.resolve(v)),app=await startApplication(root,evidence,{port:4525});
const require=createRequire(path.join(root,'package.json')),{chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE),Database=require('better-sqlite3');
const ui='http://127.0.0.1:4526',rows=[],wire=[],logs=[];let browser,vite,db;
try{
 const f=await mowingFixture(app,'clarification-browser',[ui]);db=new Database(path.join(evidence,'application.sqlite'));
 const stored=body=>db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,body.requestId);
 const count=()=>db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n;
 vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4526','--strictPort'],{cwd:path.join(root,'client'),env:{...app.env,VITE_API_URL:app.base},windowsHide:true,stdio:['ignore','pipe','pipe']});
 vite.stdout.on('data',b=>logs.push(String(b)));vite.stderr.on('data',b=>logs.push(String(b)));
 let live=false;for(let i=0;i<1200;i++){if(vite.exitCode!==null)throw Error(logs.join(''));try{if((await fetch(ui)).ok){live=true;break;}}catch{}await delay(100);}assert.ok(live);
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE});
 const meta=f.meta.services.find(s=>s.serviceType==='LANDSCAPING_MOWING'),area=meta.customerFields.find(v=>v.name==='yardSqft').label;
 async function page(){const p=await browser.newPage({viewport:{width:1440,height:1250}});p.setDefaultTimeout(60000);p.setDefaultNavigationTimeout(120000);p.on('pageerror',e=>logs.push('PAGE ERROR '+e.stack));p.on('console',m=>logs.push(m.type()+': '+m.text()));return p;}
 async function fill(p,changes={}){
  await p.goto(ui+'/quote/'+f.access.publicKey);await p.getByLabel('Service',{exact:true}).selectOption(f.id);
  for(const [key,value]of Object.entries(f.inputs)){const field=meta.customerFields.find(v=>v.name===key);if(field.type==='number')await p.getByLabel(field.label,{exact:true}).fill(String(value));else await p.getByLabel(field.label,{exact:true}).selectOption(String(value));}
  for(const [label,value]of Object.entries({Name:'[SYNTHETIC] Alex Smith',Email:'synthetic@example.invalid','Project location':'[SYNTHETIC] 123 Example Street',...changes}))await p.getByLabel(label,{exact:true}).fill(value);
  await p.getByLabel('Urgency',{exact:true}).selectOption('flexible');
 }
 async function prepare(p,button='Submit estimate request'){
  const before=count(),waiting=p.waitForResponse(r=>r.url().endsWith(f.url+'/prepare')&&r.request().method()==='POST');
  await p.getByRole('button',{name:button,exact:true}).click();const response=await waiting,body=response.request().postDataJSON(),result=await response.json();
  wire.push({phase:'prepare',status:response.status(),body,result});assert.equal(response.status(),200,JSON.stringify(result));assert.equal(count(),before);
  await p.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();assert.equal(await p.getByRole('heading',{name:'Estimate',exact:true}).count(),0);
  for(const key of ['lowEstimate','midEstimate','highEstimate','options'])assert.equal(Object.hasOwn(result,key),false);
  return {body,result};
 }
 async function answer(p,details,answers){
  for(const question of details.result.clarification.questions)await p.getByLabel(question.text,{exact:true}).selectOption(answers[question.field]);
  return prepare(p,'Check answers');
 }
 async function finish(p,details){
  const waiting=p.waitForResponse(r=>r.url().endsWith(f.url)&&r.request().method()==='POST');
  await p.getByRole('button',{name:details.result.status==='ready'?'Get estimate':'Send request for review',exact:true}).click();const response=await waiting,body=response.request().postDataJSON(),result=await response.json();
  wire.push({phase:'submit',status:response.status(),body,result});assert.equal(response.status(),201,JSON.stringify(result));const receipt=stored(body);
  assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),body);assert.deepEqual(JSON.parse(receipt.customerResponseJson),result);
  return {body,result,receipt};
 }
 for(const c of [
  {name:'Courtesy note',fields:{'Additional project details':'Thanks'},answers:{context:'message_only'},price:50},
  {name:'No unknown facts',fields:{'Measurements or facts you do not know':'none'},answers:{explicitUnknowns:'resolved'},price:50},
  {name:'Message and complete facts',fields:{'Additional project details':'Please email the estimate.','Measurements or facts you do not know':'I now have all the measurements.'},answers:{context:'message_only',explicitUnknowns:'resolved'},price:50},
  {name:'Additional work',fields:{'Additional project details':'Include hedge trimming and removal.'},answers:{context:'work_changes'}},
  {name:'Unknown measurement',fields:{'Measurements or facts you do not know':'The area is not measured.'},answers:{explicitUnknowns:'still_unknown'}}
 ]){
  const p=await page();await fill(p,c.fields);const initial=await prepare(p);assert.equal(initial.result.status,'needs_details');
  assert.equal(await p.getByRole('button',{name:'Check answers',exact:true}).isDisabled(),true,'No answers are preselected');
  const clarified=await answer(p,initial,c.answers);assert.equal(clarified.result.status,c.price===undefined?'needs_details':'ready');
  const saved=await finish(p,clarified);if(c.price===undefined){assert.equal(saved.result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(saved.result.midEstimate,undefined);}else assert.equal(saved.result.midEstimate,c.price);
  for(const key of ['context','explicitUnknowns','customerInputs','contact','location'])assert.deepEqual(saved.body[key],initial.body[key]);
  assert.deepEqual(saved.body.intakeClarification.answers,c.answers);await p.screenshot({path:path.join(evidence,c.name.toLowerCase().replaceAll(' ','-')+'.png'),fullPage:true});
  rows.push({name:c.name,initial,clarified,saved,passed:true});await p.close();
 }
 const p=await page();await fill(p,{'Measurements or facts you do not know':'The entered area still needs measuring.'});
 const original=await prepare(p);await p.getByRole('button',{name:'Change details',exact:true}).click();await p.getByLabel(area,{exact:true}).fill('12000');
 const updated=await prepare(p);assert.equal(updated.result.status,'needs_details');assert.equal(updated.body.customerInputs.yardSqft,12000);
 assert.deepEqual(updated.body.previousIntake.submission,original.body);assert.equal(updated.body.explicitUnknowns,original.body.explicitUnknowns);
 const question=updated.result.clarification.questions[0];await p.getByLabel(question.text,{exact:true}).selectOption('resolved');await p.reload();
 await p.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();assert.equal(await p.getByLabel(question.text,{exact:true}).inputValue(),'resolved');
 const corrected=await prepare(p,'Check answers');assert.equal(corrected.result.status,'ready');const saved=await finish(p,corrected);assert.equal(saved.result.midEstimate,60);
 assert.equal(saved.body.previousIntake.submission.customerInputs.yardSqft,10000);assert.equal(saved.body.customerInputs.yardSqft,12000);assert.equal(saved.body.explicitUnknowns,original.body.explicitUnknowns);
 await p.getByText('$60',{exact:true}).waitFor();await p.screenshot({path:path.join(evidence,'corrected-measurement-60.png'),fullPage:true});
 rows.push({name:'Customer correction quotes the current measurement, retaining original facts and reload state',original,updated,corrected,saved,passed:true});await p.close();
 // A clarification cannot turn an actually absent measurement into a quote.
 const missing=await page();await fill(missing,{'Measurements or facts you do not know':'none'});await missing.getByLabel(area,{exact:true}).fill('');
 const absent=await prepare(missing),claimed=await answer(missing,absent,{explicitUnknowns:'resolved'});assert.equal(claimed.result.status,'needs_details');assert.equal(await missing.getByRole('button',{name:'Get estimate',exact:true}).count(),0);
 const review=await finish(missing,claimed);assert.equal(review.result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(review.result.midEstimate,undefined);rows.push({name:'Missing actual measurement still prevents a subtotal',absent,claimed,review,passed:true});await missing.close();
 assert.equal(logs.some(line=>line.startsWith('PAGE ERROR')),false,logs.join('\n'));
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,checks:rows.length,rows},null,2));console.log(JSON.stringify({passed:true,checks:rows.length,controls:'$50 complete jobs; $60 corrected area; unresolved work and missing area review'},null,2));
}catch(error){fs.writeFileSync(path.join(evidence,'failed-results.json'),JSON.stringify({passed:false,rows,error:String(error.stack)},null,2));throw error;}
finally{fs.writeFileSync(path.join(evidence,'browser-http.json'),JSON.stringify(wire,null,2));fs.writeFileSync(path.join(evidence,'browser.log'),logs.join('\n'));if(browser)await browser.close();if(db)db.close();if(vite&&vite.exitCode===null){const done=new Promise(resolve=>vite.once('close',resolve));vite.kill();await done;}await app.stop();}
