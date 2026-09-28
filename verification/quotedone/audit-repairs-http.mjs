import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {startApplication} from './application-harness.mjs';import {mowingFixture} from './repair-fixture.mjs';
const [root,evidence]=process.argv.slice(2).map(v=>path.resolve(v));
const app=await startApplication(root,evidence,{port:4491});
const require=createRequire(path.join(root,'package.json')),Database=require('better-sqlite3'),bcrypt=require('bcrypt');
const checks=[],wireResults=[];let database;
const safeReview=result=>{assert.equal(result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(Object.keys(result).sort(),['customerMessage','quoteId','resultType']);};
try {
 const f=await mowingFixture(app,'repair-http'),{owner,id,call,read,approve,meta,url,headers,inputs,submission}=f;
 database=new Database(path.join(evidence,'application.sqlite'));
 const post=(body,token=null)=>call('POST',token?'/api/quote/calculate':url,body,201,token,token?{}:headers);
 const book=await read();
 // Independent price before any request mutation: 10000 * .005 = $50.
 for(const body of [submission(),submission({context:' ',explicitUnknowns:[]})]) assert.equal((await post(body)).midEstimate,50);
 for(const extra of [{explicitUnknowns:['yardSqft']},{explicitUnknowns:'10000 is a guess.'},{context:'Trim and remove the hedge too.'},{context:'Bag all clippings and haul them away.'},{context:{gate:'Contact before entering'}},{serviceRequest:'Mow AND remove all hedges.'},{additionalServices:['hedge removal']}]) {
  const body=submission(extra);
  safeReview(await post(body));safeReview(await post({...body,requestId:crypto.randomUUID()},owner.token));
  const preview=await call('POST','/api/pricebook/preview',{...body,revision:book.revision});assert.equal(preview.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(preview.midEstimate,undefined);assert.equal(preview.applicationReview.stage,'whole_request_scope');
  const saved=database.prepare('SELECT originalSubmissionJson,internalOutcomeJson FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner.id,body.requestId);
  assert.deepEqual(JSON.parse(saved.originalSubmissionJson),body);assert.equal(JSON.parse(saved.internalOutcomeJson).internalResult,null);
 }
 assert.deepEqual(await read(),book);safeReview(await post(submission({customerInputs:{...inputs,bagClippings:true}})));
 checks.push('Whole request: public, authenticated and preview gates; all prose/unknowns preserved; known complete $50 control stays available; preview writes nothing');
 // Every lossy raw number must fail before write, including nested maps, tiers,
 // factors, percentages, preview and customer measurements. No regex replacement
 // in production: RAW here is only an explicit synthetic wire fixture.
 const wire=async(endpoint,body,tokenText,expected)=>{
  const before=await read(),bodyText=typeof body==='string'?body:JSON.stringify(body).replace('"RAW"',tokenText);
  const reply=await fetch(app.base+endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+owner.token},body:bodyText});const response=await reply.json();
  assert.equal(reply.status,expected,JSON.stringify(response));if(expected>=400)assert.deepEqual(await read(),before);
  wireResults.push({endpoint,tokenText,bodyText,status:reply.status,response});return response;
 };
 for(const tokenText of ['90071992547409.91','70368744177664.01']) {
  for(const route of ['save','validate']) {const draft=await read();draft.defaults.minimumJobPrice='RAW';await wire('/api/pricebook/'+route,draft,tokenText,400);}
 }
 for(const change of [d=>d.services[0].pricing.mowingBaseRatePerSqft='RAW',d=>d.services[0].pricing.frequencyMultipliers.weekly='RAW',d=>d.defaults.markupPercent='RAW',d=>d.services[0].tiers=[{name:'Synthetic',overrides:{minimumServiceCharge:'RAW'}}]]) {const draft=await read();change(draft);await wire('/api/pricebook/save',draft,'1.0000000000000001',400);}
 const p=await read();p.services[0].pricing.minimumServiceCharge='RAW';await wire('/api/pricebook/preview',{serviceId:id,revision:p.revision,service:p.services[0],defaults:p.defaults,customerInputs:inputs},'70368744177664.01',400);
 await wire('/api/quote/calculate',submission({customerInputs:{...inputs,yardSqft:'RAW'}}),'10000.0000000000001',400);
 await wire('/api/business/jurisdiction',{country:'US',region:'XX',taxMode:'TAX_ALL',taxPercent:'RAW'},'1.0000000000000001',400);
 for(const raw of ['1.0000000000000001','7.5000000000000001','1e-400'])await wire('/api/business/jurisdiction',{country:'US',region:'NY',taxMode:'TAX_ALL',taxPercent:raw},raw,400);
 await wire('/api/quote/calculate','{"requestId":"'+crypto.randomUUID()+'","context":"hedges","context":""}',null,400);
 {const draft=await read();draft.defaults.minimumJobPrice='RAW';await wire('/api/pricebook/save','\uFEFF'+JSON.stringify(draft).replace('"RAW"','90071992547409.91'),'BOM + 90071992547409.91',400);}
 for(const [tokenText,expectedCents] of [['200.01',20001],['90071992547409.90',9007199254740990]]) {
  const draft=await read();draft.defaults.minimumJobPrice='RAW';await wire('/api/pricebook/save',draft,tokenText,200);await approve();
  const disk=JSON.parse(fs.readFileSync(path.join(evidence,'pricebooks',owner.id+'.json')));assert.equal(disk.defaults.minimumJobPrice,expectedCents);assert.equal((await post(submission())).midEstimate,expectedCents/100);
 }
 let draft=await read();draft.defaults.minimumJobPrice=0;await call('POST','/api/pricebook/save',draft);await approve();
 checks.push('Raw HTTP precision: lossy amounts/maps/factors/tiers/measurements and duplicate keys rejected with no price-book write; representable large/ordinary money saved and quoted exactly');
 // Tax jurisdiction is the other active price-book writer. It must invalidate
 // approval and stale revisions, while an exact retry returns the old receipt.
 const original=submission(),receipt=await post(original),old=await read();
 await call('POST','/api/business/jurisdiction',{country:'US',region:'NY',taxMode:'TAX_ALL',taxPercent:'7.5'});assert.equal((await read()).defaults.taxPercent,7.5);
 await call('POST','/api/business/jurisdiction',{country:'CA',region:'ON'});
 const changed=await read();assert.notEqual(changed.revision,old.revision);assert.notEqual(changed.defaults.taxPercent,old.defaults.taxPercent);
 const statuses=await call('POST','/api/pricebook/validate',changed);assert.equal(statuses.statuses[0].approvalCurrent,false);
 safeReview(await post(submission()));await call('POST','/api/pricebook/save',old,409);
 assert.deepEqual(await call('POST',url,original,200,null,headers),receipt);
 draft=await read();draft.defaults=old.defaults;await call('POST','/api/pricebook/save',draft);await approve();
 checks.push('Alternate jurisdiction writer invalidates approval and revision; new request reviews, exact retry retains historical receipt');
 draft=await read();draft.services[0].service='';await call('POST','/api/pricebook/save',draft);await approve();const catalog=await call('GET',url,undefined,200,null,headers);assert.equal(catalog.services[0].name,'Mowing');assert.equal((await post(submission({serviceRequest:catalog.services[0].name}))).midEstimate,50);
 checks.push('Catalog and whole-request gate share the same display-name fallback; an unnamed saved mowing service still quotes its complete $50 control');
 // The origin fallback is read-only, requires Fetch Metadata and an allowed
 // Referer, and never trusts arbitrary Host/X-Forwarded-* header claims.
 await call('GET',url,undefined,200,null,{'Sec-Fetch-Site':'same-origin',Referer:headers.Origin+'/quote/example'});
 for(const bad of [{},{Referer:headers.Origin+'/'},{'Sec-Fetch-Site':'same-origin'},{'Sec-Fetch-Site':'cross-site',Referer:headers.Origin+'/'},{Origin:'null','Sec-Fetch-Site':'same-origin',Referer:headers.Origin+'/'},{Origin:'https://wrong.example.invalid','Sec-Fetch-Site':'same-origin',Referer:headers.Origin+'/'},{'Sec-Fetch-Site':'same-origin',Referer:'https://wrong.example.invalid/'},{'X-Forwarded-Host':new URL(headers.Origin).host,'X-Forwarded-Proto':'http'}]) await call('GET',url,undefined,403,null,bad);
 await call('POST',url,submission(),403,null,{'Sec-Fetch-Site':'same-origin',Referer:headers.Origin+'/'});
 checks.push('Origin allowlist: authorized cross/same origin reads; wrong/null/missing/spoofed origin controls denied; POST still requires explicit Origin');
 // Plan and tenant boundaries: real accounts/tokens, no mocked auth decisions.
 const other=await app.owner('repair-other'),leads=(await call('GET','/api/leads')).leads,lead=leads[0];
 const staff={id:crypto.randomUUID(),email:'synthetic-repair-staff@example.invalid',password:crypto.randomBytes(18).toString('hex')};
 database.prepare('INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(staff.id,owner.id,staff.email,await bcrypt.hash(staff.password,12),'Synthetic','Synthetic staff','QuoteDone','trialing','staff',new Date().toISOString());
 const staffToken=(await call('POST','/api/auth/login',{email:staff.email,password:staff.password},200,null)).token;
 database.prepare('UPDATE users SET plan=? WHERE id=?').run('Operator',owner.id);
 for(const token of [owner.token,staffToken]) {
  await call('GET','/api/leads',undefined,200,token);const detail=await call('GET','/api/leads/'+lead.id,undefined,200,token);assert.equal(Object.hasOwn(detail,'internal'),token===owner.token);
  await call('PATCH','/api/leads/'+lead.id,{status:'DISMISSED'},200,token);
  await call('POST','/api/quote/calculate',submission(),403,token);await call('GET','/api/pricebook/'+owner.id,undefined,403,token);
 }
 for(const method of ['GET','PATCH']) {await call(method,'/api/leads/'+lead.id,method==='PATCH'?{status:'NEEDS REVIEW'}:undefined,404,other.token);await call(method,'/api/leads/'+lead.id,method==='PATCH'?{status:'NEEDS REVIEW'}:undefined,401,null);}
 checks.push('Operator CRM works for existing authorized owner/staff roles; customer/private projections and tenant isolation remain; quote/pricing restrictions unchanged; no extra seat provisioning');
 fs.writeFileSync(path.join(evidence,'wire-results.json'),JSON.stringify(wireResults,null,2));
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
} finally {if(database)database.close();await app.stop();}
