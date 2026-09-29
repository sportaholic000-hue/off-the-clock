import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {startApplication} from './application-harness.mjs';
import {mowingFixture} from './repair-fixture.mjs';
const [rootArg,evidenceArg,mode]=process.argv.slice(2),root=path.resolve(rootArg),evidence=path.resolve(evidenceArg),before=mode==='before';
const app=await startApplication(root,evidence,{port:4529}),require=createRequire(path.join(root,'package.json'));
const {chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE),Database=require('better-sqlite3'),ui='http://127.0.0.1:4530',rows=[],logs=[];let browser,vite,db;
try{
 const f=await mowingFixture(app,'request-recovery',[ui]);db=new Database(path.join(evidence,'application.sqlite'));
 vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4530','--strictPort'],{cwd:path.join(root,'client'),env:{...app.env,VITE_API_URL:app.base},windowsHide:true,stdio:['ignore','pipe','pipe']});vite.stdout.on('data',b=>logs.push(String(b)));vite.stderr.on('data',b=>logs.push(String(b)));
 let live=false;for(let i=0;i<1200;i++){if(vite.exitCode!==null)throw Error(logs.join(''));try{if((await fetch(ui)).ok){live=true;break;}}catch{}await delay(100);}assert.ok(live);
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE});
 const saved=await f.read();
 for(const extra of [false,true]){
  const original=f.submission({intakeFlow:'job-details-v1',serviceRequest:saved.services[0].service+(extra?' and remove the hedge along the driveway':''),contact:{name:'[SYNTHETIC] Alex Smith'},location:{addressLine1:'[SYNTHETIC] 123 Example Street'},urgency:'flexible'});
  const rejected=await app.request('POST',f.url+'/prepare',original,null,f.headers);assert.equal(rejected.status,422);
  const page=await browser.newPage({viewport:{width:1440,height:1250}});page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(120000);page.on('pageerror',e=>logs.push('PAGE ERROR '+e.stack));
  await page.goto(ui+'/quote/'+f.access.publicKey);
  // Restore the exact rejected request into the real form's documented retry
  // cache, then use normal controls and unmodified network requests throughout.
  await page.evaluate(({key,body})=>sessionStorage.setItem(key,JSON.stringify({kind:'editable',submission:body})),{key:'quotedone-pending-'+f.access.publicKey,body:original});
  await page.reload();await page.getByLabel('Email',{exact:true}).fill('synthetic@example.invalid');
  const waiting=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(f.url+'/prepare'));
  await page.getByRole('button',{name:'Submit estimate request',exact:true}).click();const preparedResponse=await waiting,preparedBody=preparedResponse.request().postDataJSON(),details=await preparedResponse.json();assert.equal(preparedResponse.status(),200);
  const lost=preparedBody.serviceRequest!==original.serviceRequest;
  assert.equal(lost,before&&extra,'Requested work must survive callback correction');
  assert.equal(details.status,!before&&extra?'needs_details':'ready');
  await page.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();
  if(!before&&extra){await page.getByText(original.serviceRequest,{exact:true}).waitFor();await page.getByRole('button',{name:'Change details',exact:true}).click();assert.equal(await page.getByLabel('Requested work',{exact:true}).inputValue(),original.serviceRequest);const recheck=page.waitForResponse(r=>r.url().endsWith(f.url+'/prepare')&&r.request().method()==='POST');await page.getByRole('button',{name:'Submit estimate request',exact:true}).click();const checked=await recheck;assert.equal((await checked.json()).status,'needs_details');}
  const submitting=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(f.url));
  await page.getByRole('button',{name:details.status==='ready'?'Get estimate':'Send request for review',exact:true}).click();const response=await submitting,submitted=response.request().postDataJSON(),result=await response.json();assert.equal(response.status(),201);
  assert.equal(result.resultType,!before&&extra?'ESTIMATE_REQUIRES_REVIEW':'INSTANT_ESTIMATE_READY');
  if(!before&&extra)assert.equal(result.midEstimate,undefined);else assert.equal(result.midEstimate,50);
  const receipt=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,submitted.requestId);assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),submitted);
  rows.push({name:extra?'Additional requested work survives rejected-request recovery':'Complete quote positive control',original,rejected,preparedBody,details,submitted,result,receipt,lost,passed:!before||!extra});
  await page.screenshot({path:path.join(evidence,extra?'additional-work.png':'positive-control.png'),fullPage:true});await page.close();
 }
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({mode:before?'before-reproduction':'after-verification',passed:!before,reproduced:before,rows},null,2));console.log(JSON.stringify({mode:before?'before-reproduction':'after-verification',passed:!before,reproduced:before,checks:rows.length},null,2));
}catch(error){fs.writeFileSync(path.join(evidence,'failed-results.json'),JSON.stringify({passed:false,rows,error:String(error.stack)},null,2));throw error;}
finally{fs.writeFileSync(path.join(evidence,'browser.log'),logs.join('\n'));if(browser)await browser.close();if(db)db.close();if(vite&&vite.exitCode===null){const done=new Promise(resolve=>vite.once('close',resolve));vite.kill();await done;}await app.stop();}
