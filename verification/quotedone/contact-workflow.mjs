import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
import {startApplication} from './application-harness.mjs';import {mowingFixture} from './repair-fixture.mjs';
const [root,evidence]=process.argv.slice(2).map(v=>path.resolve(v)),app=await startApplication(root,evidence,{port:4491});
const require=createRequire(path.join(root,'package.json')),Database=require('better-sqlite3');let database;const checks=[];
try {
 const f=await mowingFixture(app,'required-contact'),{call,owner,url,headers,submission}=f;
 database=new Database(path.join(evidence,'application.sqlite'));
 const counts=()=>Object.fromEntries(['quoteSubmissions','quoteRequests','quotes','leads'].map(table=>[table,database.prepare('SELECT count(*) n FROM '+table+' WHERE ownerId=?').get(owner.id).n]));
 for(const review of [false,true]) for(const contact of [undefined,{}, {name:'Only a name'},{email:'',phone:' '},{email:'not-an-email',phone:'invalid'}]) {
  const body=submission({contact,...(review?{explicitUnknowns:['yardSqft']}:{})}),before=counts();
  await call('POST',url,body,422,null,headers);await call('POST','/api/quote/calculate',body,422);assert.deepEqual(counts(),before);
 }
 checks.push('No-contact, name-only, blank and malformed contact reject with 422 and zero writes on public/authenticated quote and review paths');
 for(const contact of [{email:'synthetic@example.invalid'},{phone:'+1 (902) 555-0123'}])for(const review of [false,true]){
  const body=submission({contact,...(review?{explicitUnknowns:['yardSqft']}:{})});
  const response=await call('POST',url,body,201,null,headers);assert.equal(response.resultType,review?'ESTIMATE_REQUIRES_REVIEW':'INSTANT_ESTIMATE_READY');if(!review)assert.equal(response.midEstimate,50);
  assert.deepEqual(await call('POST',url,body,200,null,headers),response);
  const record=database.prepare('SELECT originalSubmissionJson FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner.id,body.requestId);assert.deepEqual(JSON.parse(record.originalSubmissionJson).contact,contact);
 }
 checks.push('Email-only and phone-only contacts permit both $50 quotes and durable review leads; original contact and exact retries retained');
 const other=await app.owner('contact-other');const lead=(await call('GET','/api/leads')).leads[0];await call('GET','/api/leads/'+lead.id,undefined,404,other.token);
 checks.push('Saved callback remains visible only to the authorized tenant');
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,checks,limit:'Syntax only; email/phone ownership and deliverability are not asserted.'},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}finally{if(database)database.close();await app.stop();}
