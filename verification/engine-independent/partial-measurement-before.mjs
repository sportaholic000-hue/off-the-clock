import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {convertApplicationBook} from '../../server/src/quoteDoneBridge.js';
import {cases} from './fixtures.mjs';
const root=path.resolve(process.argv[2]),evidence=path.resolve(process.argv[3]);
const f=cases().find(x=>x.id==='flat-roof-residential-control');const equal=structuredClone(f),conflict=structuredClone(f);equal.id='partial-equal';conflict.id='partial-conflict';Object.assign(equal.input.customerInputs,{serviceScope:'partial',partialPercent:50,partialAreaSqft:500});Object.assign(conflict.input.customerInputs,{serviceScope:'partial',partialPercent:50,partialAreaSqft:499.9});const samples=[equal,conflict,f];
const control=id=>id.endsWith('-control'),rows=[];
const app=await startApplication(root,evidence,{port:4681,browserOrigins:['http://127.0.0.1:4682']});let db;
try{
 fs.writeFileSync(path.join(evidence,'expected-inputs.json'),JSON.stringify(samples.map(f=>({id:f.id,input:f.input,expected:control(f.id)?{ready:true,cents:f.expected.cents}:{ready:false,reason:'Reproduce existing unimplemented scope with original advertised fields.'}})),null,2));
 const owner=await app.owner('remaining-engine-before'),require=createRequire(path.join(root,'package.json')),Database=require('better-sqlite3');db=new Database(path.join(evidence,'application.sqlite'));
 const call=async(method,url,body)=>{const r=await app.request(method,url,body,owner.token);assert.equal(r.status,200,JSON.stringify(r));return r.result;};
 const services=samples.map(f=>{const s=structuredClone(f.input.ownerPricing);s.id=crypto.randomUUID();delete s.origin;delete s.confirmedFields;delete s.approvedValues;s.service='[SYNTHETIC] '+f.id;f.service=s;return s;});
 let book=await call('GET','/api/pricebook/'+owner.id);Object.assign(book,convertApplicationBook({services,defaults:samples[0].input.businessDefaults},'toDollars'));await call('POST','/api/pricebook/save',book);book=await call('GET','/api/pricebook/'+owner.id);
 const approvals=[];for(const s of services){approvals.push(await app.request('POST','/api/pricebook/services/'+s.id+'/approve',{revision:book.revision,confirmConfiguration:true},owner.token));book=await call('GET','/api/pricebook/'+owner.id);}
 fs.writeFileSync(path.join(evidence,'saved-book-and-approvals.json'),JSON.stringify({book,approvals},null,2));
 const access=await call('POST','/api/quotedone/access',{allowedOrigins:['http://127.0.0.1:4682']}),url='/api/public/quote/'+access.publicKey,headers={Origin:'http://127.0.0.1:4682'};
 for(const f of samples)for(const channel of ['public','authenticated','preview']){
  const body={requestId:crypto.randomUUID(),serviceId:f.service.id,serviceRequest:f.service.service,customerInputs:f.input.customerInputs,contact:{email:'synthetic-remaining@example.invalid'},intakeFlow:'job-details-v1'};
  const prep=await app.request('POST',channel==='public'?url+'/prepare':'/api/quote/prepare',body,channel==='public'?null:owner.token,channel==='public'?headers:{});assert.equal(prep.status,200,JSON.stringify(prep));
  const submission={...body,...(prep.result.status==='ready'?{intakeConfirmation:prep.result.confirmation}:{reviewRequested:true})};
  const response=await app.request('POST',channel==='public'?url:channel==='preview'?'/api/pricebook/preview':'/api/quote/calculate',channel==='preview'?{...submission,revision:book.revision}:submission,channel==='public'?null:owner.token,channel==='public'?headers:{});
  const receipt=channel==='preview'?null:db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner.id,body.requestId);rows.push({id:f.id,channel,submission,prep,response,receipt});
  assert.equal(response.status,channel==='preview'?200:201,JSON.stringify(response));assert.equal(response.result.resultType,control(f.id)?'INSTANT_ESTIMATE_READY':'ESTIMATE_REQUIRES_REVIEW',f.id+' '+channel);
  if(control(f.id))assert.equal(response.result.midEstimate,f.expected.cents/100);if(receipt)assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),submission);
  console.log(JSON.stringify({id:f.id,channel,resultType:response.result.resultType,midEstimate:response.result.midEstimate}));
 }
 fs.writeFileSync(path.join(evidence,'summary.json'),JSON.stringify({checks:rows.length,confirmedBlockedPaths:2,positiveControls:1},null,2));
}finally{fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(rows,null,2));if(db)db.close();await app.stop();}
