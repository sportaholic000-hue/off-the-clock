import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

// Deliberate booking-response fixtures. These exercise browser behavior only:
// no real quote calculation, provider connection, or calendar write is claimed.
const [rootArg,evidenceArg,mode='final']=process.argv.slice(2),root=path.resolve(rootArg),evidence=path.resolve(evidenceArg);
if(fs.existsSync(evidence))throw Error('Use a fresh evidence directory.');
fs.mkdirSync(evidence,{recursive:true});
fs.copyFileSync(fileURLToPath(import.meta.url),path.join(evidence,'executed-test.mjs'));
const require=createRequire(path.join(root,'package.json')),{chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE);
const origin='http://127.0.0.1:4595',publicKey='syntheticbookingpublickey12345678',token='2'.repeat(64),quoteId=crypto.randomUUID();
const api='/api/public/bookings/'+token,cacheKey='otc-widget:'+origin+':'+publicKey+':pending-'+publicKey;
const original={requestId:crypto.randomUUID(),serviceId:'synthetic-service',serviceRequest:'[SYNTHETIC] Service',customerInputs:{yardSqft:10000},contact:{email:'synthetic@example.invalid'},intakeFlow:'job-details-v1',additionalWork:[]};
const result={resultType:'INSTANT_ESTIMATE_READY',quoteId,bookingToken:token,lowEstimate:50,midEstimate:50,highEstimate:50,disclaimer:'[SYNTHETIC] Booking interface fixture; this test does not calculate prices.'};
const catalog={contractVersion:'2026-09-29.1',capabilities:{quoteEnvelope:'pricing-only-v2',booking:'booking-v1',postQuoteIdentity:true,serverPricingOnly:true},branding:{businessName:'[SYNTHETIC] Booking UI fixture',accentColor:'#00E676'},services:[{id:'synthetic-service',name:'[SYNTHETIC] Service',customerFields:[{name:'yardSqft',label:'Yard area',type:'number'}],customerFees:[]}]};
const a={slotId:'synthetic-slot-a',label:'[SYNTHETIC] First time',startUtc:'2030-10-02T13:00:00.000Z',endUtc:'2030-10-02T13:45:00.000Z'};
const b={slotId:'synthetic-slot-b',label:'[SYNTHETIC] Refreshed time',startUtc:'2030-10-02T15:00:00.000Z',endUtc:'2030-10-02T15:45:00.000Z'};
const schedule=slot=>({status:'AVAILABLE',timezone:'America/Halifax',bookingMode:'site_visit_first',durationMinutes:45,slots:[slot]});
const rows=[],wire=[],errors=[];let handler,browser,current='startup',nextFollowUp=null;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin),send=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));return {status,response:value};};
  if(url.pathname==='/api/public/quote/'+publicKey){send(200,catalog);return;}
  if(url.pathname.startsWith(api)){
   const chunks=[];for await(const part of req)chunks.push(part);const raw=Buffer.concat(chunks).toString();
   const row={scenario:current,method:req.method,path:url.pathname,body:raw?JSON.parse(raw):null,key:req.headers['idempotency-key']||null};wire.push(row);
   assert.equal(req.headers.authorization,undefined);
   const answer=await handler(row,res);
   if(answer==='abort'){row.response='[SYNTHETIC] acknowledgement lost';res.destroy();return;}
   Object.assign(row,send(answer.status||200,answer.body));return;
  }
  if(url.pathname==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><h1>[SYNTHETIC] Booking UI fixtures</h1><script src="/widget.js" data-key="'+publicKey+'"></script>');return;}
  const dist=path.join(root,'client/dist'),file=path.join(dist,url.pathname.slice(1));
  if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('content-type',file.endsWith('.js')?'text/javascript':'text/plain');res.end(fs.readFileSync(file));
 }catch(error){errors.push(String(error.stack));res.writeHead(500).end();}
});
async function fresh(){
 const p=await browser.newPage({viewport:{width:390,height:844}});p.setDefaultTimeout(60000);
 p.on('pageerror',error=>errors.push(String(error.stack)));
 await p.addInitScript(({key,result,original,followUp})=>{sessionStorage.setItem(key,JSON.stringify({kind:'completed',result,submission:original}));if(followUp)sessionStorage.setItem(key+'-followup',JSON.stringify(followUp));},{key:cacheKey,result,original,followUp:nextFollowUp});
 await p.goto(origin);await p.getByRole('button',{name:'Get an estimate',exact:true}).click();await p.getByLabel('Name',{exact:true}).waitFor();return p;
}
async function arrange(p){
 await p.getByLabel('Name',{exact:true}).fill('[SYNTHETIC] Example Customer');
 await p.getByLabel('Project location',{exact:true}).fill('[SYNTHETIC] 123 Example Street');
 await p.getByLabel('Have the work or measurements changed since this estimate?',{exact:false}).selectOption('UNCHANGED');
 await p.getByRole('button',{name:'Book it',exact:true}).click();
}
async function check(name,run){
 current=name;let p;const start=wire.length;
 try{p=await fresh();await run(p);rows.push({name,passed:true,requests:wire.slice(start)});}
 catch(error){rows.push({name,passed:false,error:String(error.stack),requests:wire.slice(start)});if(p){await p.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});fs.writeFileSync(path.join(evidence,name+'.txt'),await p.getByRole('dialog').innerText());}}
 finally{nextFollowUp=null;if(p)await p.close();fs.writeFileSync(path.join(evidence,'progress.json'),JSON.stringify({fixtureOnly:true,rows,wire,errors},null,2));}
}
try{
 await new Promise(resolve=>server.listen(4595,'127.0.0.1',resolve));
 fs.writeFileSync(path.join(evidence,'browser-runtime-requested.json'),JSON.stringify({executable:process.env.PRICEBOOK_BROWSER_EXECUTABLE,module:process.env.PRICEBOOK_BROWSER_MODULE}));
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,timeout:300000});
 fs.writeFileSync(path.join(evidence,'browser-runtime.json'),JSON.stringify({executable:process.env.PRICEBOOK_BROWSER_EXECUTABLE,version:browser.version()}));
 let rejected=false;
 handler=async row=>row.path.endsWith('/availability')?{body:{status:'PREFERRED_TIME_ONLY',reason:'[SYNTHETIC] Owner will confirm a time.'}}:!rejected?(rejected=true,{status:400,body:{code:'INVALID_REQUEST',error:'[SYNTHETIC] Choose a current preferred date.'}}):{body:{status:'REQUESTED',preferenceRequestId:'synthetic-preference',message:'[SYNTHETIC] Requested only.'}};
 await check('definite-preference-rejection-remains-editable',async p=>{
  await arrange(p);await p.getByLabel('Preferred date 1',{exact:true}).fill('2020-01-01');await p.getByLabel('Preferred time 1',{exact:false}).selectOption('morning');
  await p.getByRole('button',{name:'Request preferred time',exact:true}).click();await p.getByText('[SYNTHETIC] Choose a current preferred date.',{exact:true}).waitFor();
  await p.getByLabel('Preferred date 1',{exact:true}).fill('2030-10-03');
  await p.getByRole('button',{name:'Request preferred time',exact:true}).click();await p.getByText('Preferred time requested',{exact:true}).waitFor();
  const requests=wire.filter(row=>row.scenario===current&&row.path.endsWith('/preference'));assert.equal(requests.length,2);assert.notEqual(requests[0].key,requests[1].key);
  assert.equal(requests[1].body.preferredWindows[0].date,'2030-10-03');
 });
 if(mode==='final'){
  handler=async()=>({status:409,body:{code:'REQUOTE_REQUIRED',error:'[SYNTHETIC] The job needs an updated estimate.'}});
  await check('server-requote-returns-to-retained-job-details',async p=>{
   await arrange(p);await p.getByText('[SYNTHETIC] The job needs an updated estimate.',{exact:true}).waitFor();
   assert.equal(await p.getByLabel('Service',{exact:true}).count(),1,'The server requires a new quote, so the job editor must replace the previous result.');
   assert.equal(await p.getByLabel('Service',{exact:true}).inputValue(),'synthetic-service');
   assert.equal(await p.getByRole('heading',{name:'Estimate',exact:true}).count(),0);
  });
  handler=async()=>({body:{status:'PREFERRED_TIME_ONLY'}});
  await check('callback-contact-is-editable-before-booking',async p=>{
   assert.equal(await p.getByLabel('Email',{exact:true}).count(),1,'The customer must be able to correct the callback before booking.');
   await p.getByLabel('Email',{exact:true}).fill('corrected@example.invalid');
   await p.getByLabel('Phone',{exact:true}).fill('+19025550123');
   await arrange(p);await p.getByRole('button',{name:'Request preferred time',exact:true}).waitFor();
   const sent=wire.find(row=>row.scenario===current&&row.path.endsWith('/availability'));
   assert.equal(sent.body.customer.email,'corrected@example.invalid');assert.equal(sent.body.customer.phone,'+19025550123');
   await p.getByRole('button',{name:'Change job details',exact:true}).click();await p.getByLabel('Service',{exact:true}).waitFor();
   const edited=await p.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),cacheKey);
   assert.equal(edited.submission.contact.email,'corrected@example.invalid');assert.equal(edited.submission.contact.phone,'+19025550123');
  });
  nextFollowUp={scopeConfirmation:'CHANGED',tierName:'[SYNTHETIC] Previous option',customer:{name:'[SYNTHETIC] Retained Customer'},location:{addressLine1:'[SYNTHETIC] Retained Address'}};
  await check('new-quote-clears-previous-scope-and-option-decisions',async p=>{
   assert.equal(await p.getByLabel('Name',{exact:true}).inputValue(),'[SYNTHETIC] Retained Customer');
   assert.equal(await p.getByLabel('Project location',{exact:true}).inputValue(),'[SYNTHETIC] Retained Address');
   assert.equal(await p.getByLabel('Have the work or measurements changed since this estimate?',{exact:true}).inputValue(),'','A new quote needs its own scope confirmation.');
   await arrange(p);await p.getByRole('button',{name:'Request preferred time',exact:true}).waitFor();
   assert.equal(Object.hasOwn(wire.find(row=>row.scenario===current&&row.path.endsWith('/availability')).body,'tierName'),false);
  });
  handler=async row=>row.path.endsWith('/availability')?{body:{status:'PREFERRED_TIME_ONLY'}}:{body:{status:'REQUESTED',preferenceRequestId:'synthetic-preference',message:'[SYNTHETIC] The owner will contact you.'}};
  await check('preferred-windows-survive-reload-and-do-not-claim-booking',async p=>{
   await arrange(p);await p.getByLabel('Preferred date 1',{exact:true}).fill('2030-10-03');await p.getByLabel('Preferred time 1',{exact:false}).selectOption('morning');
   await p.getByRole('button',{name:'Add another preferred time',exact:true}).click();await p.getByLabel('Preferred date 2',{exact:true}).fill('2030-10-04');await p.getByLabel('Preferred time 2',{exact:false}).selectOption('afternoon');
   await p.getByLabel('Scheduling note',{exact:true}).fill('[SYNTHETIC] Please call before arriving.');
   await p.reload();await p.getByRole('button',{name:'Get an estimate',exact:true}).click();
   assert.equal(await p.getByLabel('Preferred date 2',{exact:true}).inputValue(),'2030-10-04');
   assert.equal(await p.getByLabel('Scheduling note',{exact:true}).inputValue(),'[SYNTHETIC] Please call before arriving.');
   await p.getByRole('button',{name:'Request preferred time',exact:true}).click();await p.getByText('An appointment has not been booked.',{exact:true}).waitFor();
   assert.equal(await p.getByText('Site visit booked',{exact:true}).count(),0);
  });
  handler=async()=>({body:{status:'EXTERNAL_HANDOFF',externalUrl:'https://booking.example.invalid/synthetic'}});
  await check('external-handoff-is-an-explicit-link-not-a-booking',async p=>{
   await arrange(p);assert.equal(await p.getByRole('link',{name:'Open booking site',exact:true}).getAttribute('href'),'https://booking.example.invalid/synthetic');
   assert.equal(await p.getByText('Site visit booked',{exact:true}).count(),0);
  });
  handler=async()=>{throw Error('Changed scope must return to quoting before any booking request.');};
  await check('changed-scope-retains-the-job-for-requote',async p=>{
   await p.getByLabel('Have the work or measurements changed since this estimate?',{exact:false}).selectOption('CHANGED');
   await p.getByRole('button',{name:'Update job details',exact:true}).click();await p.getByLabel('Service',{exact:true}).waitFor();
   assert.equal(await p.getByLabel('Service',{exact:true}).inputValue(),'synthetic-service');
   await p.getByRole('button',{name:'Continue',exact:true}).click();await p.getByRole('button',{name:'Continue',exact:true}).click();
   assert.equal(await p.getByLabel('Yard area',{exact:true}).inputValue(),'10000');
  });
  let availability=0;const holdId='synthetic-hold';
  handler=async row=>row.path.endsWith('/availability')?{body:schedule(++availability===1?a:b)}:row.path.endsWith('/holds')?{status:201,body:{status:'HELD',holdId,expiresAtUtc:'2030-10-02T12:55:00.000Z',slot:a}}:{status:410,body:{code:'HOLD_EXPIRED',error:'[SYNTHETIC] This hold expired.'}};
  await check('expired-hold-refreshes-server-times-without-booking',async p=>{
   await arrange(p);await p.getByRole('radio').check();await p.getByRole('button',{name:'Review appointment',exact:true}).click();
   await p.getByLabel('I confirm this appointment, contact information and job site.',{exact:true}).check();await p.getByRole('button',{name:'Confirm appointment',exact:true}).click();
   await p.getByRole('radio',{name:b.label,exact:true}).waitFor();assert.equal(await p.getByText('Site visit booked',{exact:true}).count(),0);
  });
  let releases=0,allowRelease=false;
  handler=async row=>row.path.endsWith('/availability')?{body:schedule(a)}:row.method==='DELETE'?(!allowRelease?(releases++,'abort'):{body:{status:'RELEASED',holdId}}):{status:201,body:{status:'HELD',holdId,expiresAtUtc:'2030-10-02T12:55:00.000Z',slot:a}};
  await check('release-retry-is-identical-and-restores-editing',async p=>{
   await arrange(p);await p.getByRole('radio').check();await p.getByRole('button',{name:'Review appointment',exact:true}).click();
   assert.equal(await p.getByRole('button',{name:'Start another request',exact:true}).isDisabled(),true);
   await p.getByRole('button',{name:'Change appointment details',exact:true}).click();await p.getByRole('button',{name:'Retry booking request',exact:true}).waitFor();
   await p.reload();await p.getByRole('button',{name:'Get an estimate',exact:true}).click();allowRelease=true;await p.getByRole('button',{name:'Retry booking request',exact:true}).click();
   await p.getByLabel('Project location',{exact:true}).fill('[SYNTHETIC] 456 Corrected Street');
   const requests=wire.filter(row=>row.scenario===current&&row.method==='DELETE');assert.ok(requests.length>=2);assert.ok(releases>=1);
   for(const attempt of requests)assert.deepEqual({path:attempt.path,key:attempt.key,body:attempt.body},{path:requests[0].path,key:requests[0].key,body:requests[0].body});assert.equal(requests.at(-1).status,200);
   assert.equal(requests[0].body,null);assert.equal(requests[0].path,api+'/holds/'+holdId);
   assert.equal(await p.getByText('Site visit booked',{exact:true}).count(),0);
  });
 }
 const passed=rows.every(row=>row.passed)&&errors.length===0;
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed,fixtureOnly:true,realBookingVerified:false,root,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'client/dist/widget-app.js'))).digest('hex'),rows,wire,errors},null,2));
 console.log(JSON.stringify({passed,checks:rows.length,failed:rows.filter(row=>!row.passed).map(row=>({name:row.name,error:row.error}))}));
 if(!passed)process.exitCode=1;
}catch(error){fs.writeFileSync(path.join(evidence,'harness-failure.json'),JSON.stringify({passed:false,fixtureOnly:true,root,error:String(error.stack),rows,wire,errors},null,2));throw error;}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
