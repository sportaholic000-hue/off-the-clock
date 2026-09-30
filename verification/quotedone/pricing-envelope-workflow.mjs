import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {mowingFixture} from './repair-fixture.mjs';

const [root,evidence]=process.argv.slice(2).map(value=>path.resolve(value));
const app=await startApplication(root,evidence,{port:4526});
const require=createRequire(path.join(root,'package.json'));
const Database=require('better-sqlite3');
const rows=[];
let db;

const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

try{
  const f=await mowingFixture(app,'pricing-envelope',['http://127.0.0.1:4492']);
  const saved=await f.read();
  db=new Database(path.join(evidence,'application.sqlite'));
  const counts=()=>Object.fromEntries(['quotes','leads','quoteRequests','quoteSubmissions'].map(table=>[
    table,db.prepare(`SELECT count(*) AS count FROM ${table} WHERE ownerId=?`).get(f.owner.id).count
  ]));
  const base=extra=>f.submission({intakeFlow:'job-details-v1',urgency:'flexible',...extra});
  const channels=[
    {name:'public',prepare:f.url+'/prepare',calculate:f.url,token:null,headers:f.headers,calculateStatus:201},
    {name:'authenticated',prepare:'/api/quote/prepare',calculate:'/api/quote/calculate',token:f.owner.token,headers:{},calculateStatus:201},
    {name:'preview',prepare:'/api/quote/prepare',calculate:'/api/pricebook/preview',token:f.owner.token,headers:{},calculateStatus:200,preview:true}
  ];
  const invalid=[
    {name:'customer name',extra:{contact:{email:'synthetic@example.invalid',name:'The selected mowing area has not been measured'}},fields:['contact.name']},
    {name:'legacy location text',extra:{location:'Include the back yard too'},fields:['location']},
    {name:'invalid location container',extra:{location:['123 Example Street']},fields:['location']},
    {name:'legacy address member',extra:{location:{address:'Use 12,000 square feet instead'}},fields:['location.address']},
    ...['addressLine1','addressLine2','city','region','postalCode','country'].map(field=>({
      name:`structured location ${field}`,extra:{location:{[field]:'The selected mowing area has not been measured'}},fields:[`location.${field}`]
    }))
  ];

  for(const channel of channels)for(const entry of invalid){
    const body=base(entry.extra),before=counts();
    const prepared=await app.request('POST',channel.prepare,body,channel.token,channel.headers);
    assert.equal(prepared.status,400,JSON.stringify({channel:channel.name,entry,prepared}));
    assert.equal(prepared.result.details?.code,'INVALID_REQUEST');
    assert.deepEqual(prepared.result.details?.fields,entry.fields);
    const request=channel.preview?{...body,revision:saved.revision}:body;
    const calculated=await app.request('POST',channel.calculate,request,channel.token,channel.headers);
    assert.equal(calculated.status,400,JSON.stringify({channel:channel.name,entry,calculated}));
    assert.equal(calculated.result.details?.code,'INVALID_REQUEST');
    assert.deepEqual(calculated.result.details?.fields,entry.fields);
    assert.deepEqual(counts(),before);
    rows.push({name:entry.name,channel:channel.name,prepared,calculated,passed:true});
  }

  const unresolved=[
    {name:'additional work in urgency',extra:{urgency:'flexible, also remove the hedge'}},
    {name:'measurement uncertainty in urgency',extra:{urgency:'The back yard has not been measured'}},
    {name:'nested unexpected contact scope',extra:{contact:{email:'synthetic@example.invalid',extra:{work:'Remove the wall',measurement:'unknown'}}}},
    {name:'nested unexpected location scope',extra:{location:{extra:{work:'Remove the wall',measurement:'unknown'}}}}
  ];
  for(const channel of channels)for(const entry of unresolved){
    const body=base(entry.extra),before=counts(),prepared=await app.request('POST',channel.prepare,body,channel.token,channel.headers);
    assert.ok([200,400,422].includes(prepared.status),JSON.stringify(prepared));
    if(prepared.status===200)assert.notEqual(prepared.result.status,'ready',JSON.stringify(prepared));
    const request={...body,...(prepared.status===200?{reviewRequested:true}:{}),...(channel.preview?{revision:saved.revision}:{})};
    const calculated=await app.request('POST',channel.calculate,request,channel.token,channel.headers);
    if([200,201].includes(calculated.status)){
      assert.equal(calculated.result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(calculated.result.midEstimate,undefined);assert.equal(calculated.result.pricedEstimate,undefined);
      if(!channel.preview){const receipt=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,request.requestId);assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),request);}
    }else{assert.ok([400,422].includes(calculated.status),JSON.stringify(calculated));assert.deepEqual(counts(),before);}
    rows.push({name:entry.name,channel:channel.name,request,prepared,calculated,passed:true});
  }

  const emptyLegacy=[
    {name:'absent containers',extra:{}},
    {name:'blank customer name',extra:{contact:{email:'synthetic@example.invalid',name:'   '}}},
    {name:'null location',extra:{location:null}},
    {name:'blank legacy location',extra:{location:'   '}},
    {name:'empty location object',extra:{location:{}}},
    {name:'empty legacy address object',extra:{location:{address:''}}},
    {name:'empty structured address object',extra:{location:{addressLine1:'',addressLine2:null,city:' ',region:'',postalCode:'',country:''}}}
  ];
  for(const entry of emptyLegacy){
    const body=base(entry.extra),prepared=await app.request('POST','/api/quote/prepare',body,f.owner.token);
    assert.equal(prepared.status,200,JSON.stringify({entry,prepared}));
    assert.equal(prepared.result.status,'ready');
    assert.ok(prepared.result.confirmation);
    const calculated=await app.request('POST','/api/quote/calculate',{...body,intakeConfirmation:prepared.result.confirmation},f.owner.token);
    assert.equal(calculated.status,201,JSON.stringify({entry,calculated}));
    assert.equal(calculated.result.resultType,'INSTANT_ESTIMATE_READY');
    assert.equal(calculated.result.midEstimate,50);
    rows.push({name:entry.name,channel:'authenticated-empty-legacy',prepared,calculated,passed:true});
  }

  for(const channel of channels){
    const body=base({}),prepared=await app.request('POST',channel.prepare,body,channel.token,channel.headers);
    assert.equal(prepared.status,200,JSON.stringify({channel:channel.name,prepared}));
    assert.equal(prepared.result.status,'ready');
    const signed={...body,intakeConfirmation:prepared.result.confirmation};
    const request=channel.preview?{...signed,revision:saved.revision}:signed;
    const calculated=await app.request('POST',channel.calculate,request,channel.token,channel.headers);
    assert.equal(calculated.status,channel.calculateStatus,JSON.stringify({channel:channel.name,calculated}));
    assert.equal(calculated.result.resultType,'INSTANT_ESTIMATE_READY');
    assert.equal(calculated.result.midEstimate,50);
    rows.push({name:'callback-only pricing envelope quotes',channel:channel.name,prepared,calculated,passed:true});
  }

  // Exact historical receipts predate this boundary and remain immutable. The
  // retry lookup must run before new-envelope validation.
  const historical=base({contact:{email:'synthetic@example.invalid',name:'[SYNTHETIC] Historical customer'},location:{addressLine1:'[SYNTHETIC] 123 Example Street'}});
  const historicalResponse={resultType:'INSTANT_ESTIMATE_READY',quoteId:crypto.randomUUID(),midEstimate:50,lowEstimate:50,highEstimate:50,options:[]};
  db.prepare(`INSERT INTO quoteSubmissions
    (ownerId,requestId,contentDigest,recordId,resultType,bookRevision,originalSubmissionJson,internalOutcomeJson,customerResponseJson,createdAt)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      f.owner.id,historical.requestId,digest(historical),crypto.randomUUID(),historicalResponse.resultType,saved.revision,
      JSON.stringify(historical),JSON.stringify({historical:true}),JSON.stringify(historicalResponse),new Date().toISOString()
    );
  const afterSeed=counts();
  for(const channel of channels.filter(item=>!item.preview)){
    const retry=await app.request('POST',channel.calculate,historical,channel.token,channel.headers);
    assert.equal(retry.status,200,JSON.stringify({channel:channel.name,retry}));
    assert.deepEqual(retry.result,historicalResponse);
  }
  const conflict=await app.request('POST','/api/quote/calculate',{...historical,location:{addressLine1:'Changed historical site'}},f.owner.token);
  assert.equal(conflict.status,409);
  assert.deepEqual(counts(),afterSeed);
  rows.push({name:'exact historical retry precedes new envelope validation',historicalResponse,conflict,passed:true});

  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,checks:rows.length,rows},null,2));
  console.log(JSON.stringify({passed:true,checks:rows.length,channels:channels.map(item=>item.name)},null,2));
}catch(error){
  fs.writeFileSync(path.join(evidence,'failed-results.json'),JSON.stringify({passed:false,rows,error:String(error.stack)},null,2));
  throw error;
}finally{
  if(db)db.close();
  await app.stop();
}
