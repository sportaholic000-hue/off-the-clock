import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {startApplication} from './application-harness.mjs';
import {mowingFixture} from './repair-fixture.mjs';

const [root,evidence]=process.argv.slice(2).map(v=>path.resolve(v));
const app=await startApplication(root,evidence,{port:4509});
const require=createRequire(path.join(root,'package.json')),Database=require('better-sqlite3');
const ready='INSTANT_ESTIMATE_READY',review='ESTIMATE_REQUIRES_REVIEW',rows=[];
const extra='Today please. Include hedge trimming and removal in this same estimate.';
const uncertain='Please call today. The 10000 square feet is a guess; the lawn has not been measured.';
let db;
try {
  const f=await mowingFixture(app,'metadata-intake'),saved=await f.read();
  const other=await app.owner('metadata-intake-other');
  db=new Database(path.join(evidence,'application.sqlite'));
  const counts=()=>Object.fromEntries(['quotes','leads','quoteRequests','quoteSubmissions'].map(t=>[t,db.prepare('SELECT count(*) n FROM '+t+' WHERE ownerId=?').get(f.owner.id).n]));
  const cases=[
    {name:'complete measured email-only quote',patch:{},expected:ready},
    {name:'complete measured phone-only quote',patch:{contact:{phone:'+1 (902) 555-0123'}},expected:ready},
    {name:'complete measured two-channel quote',patch:{contact:{email:'synthetic@example.invalid',phone:'555-0123'}},expected:ready},
    {name:'empty optional metadata',patch:{contact:{email:'synthetic@example.invalid',name:'  ',phone:null},location:null,urgency:'  '},expected:ready},
    {name:'valid identity metadata cannot change trusted tenant or audience',patch:{ownerId:other.id,callerType:'owner'},expected:ready},
    {name:'existing context guard',patch:{context:extra},expected:review},
    {name:'additional scope in urgency',patch:{urgency:extra},expected:review},
    {name:'measurement uncertainty in urgency',patch:{urgency:uncertain},expected:review},
    {name:'additional scope in location',patch:{location:'123 Synthetic Street. '+extra},expected:review},
    {name:'uncertainty in legacy address',patch:{location:{address:'123 Synthetic Street. '+uncertain}},expected:review},
    {name:'additional scope nested in contact',patch:{contact:{email:'synthetic@example.invalid',additionalServices:['hedge removal']}},expected:review},
    {name:'additional scope nested in location',patch:{location:{address:'123 Synthetic Street',additionalServices:['hedge removal']}},expected:review},
    {name:'additional scope in contact name',patch:{contact:{email:'synthetic@example.invalid',name:extra}},expected:review},
    {name:'ordinary name still requires text review',patch:{contact:{email:'synthetic@example.invalid',name:'Synthetic customer'}},expected:review},
    {name:'ordinary address still requires text review',patch:{location:'123 Synthetic Street'},expected:review},
    {name:'ordinary urgency still requires text review',patch:{urgency:'Whenever available'},expected:review},
    {name:'former browser positive retains ordinary name and address for review',patch:{contact:{name:'[SYNTHETIC] R1 browser customer',email:'r1-browser@example.invalid'},location:'123 Synthetic Street',urgency:''},expected:review},
    {name:'uncertainty in alternate phone',patch:{contact:{email:'synthetic@example.invalid',phone:uncertain}},expected:review},
    {name:'scope in alternate email',patch:{contact:{phone:'555-0123',email:extra}},expected:review},
    {name:'nested contact name',patch:{contact:{email:'synthetic@example.invalid',name:{instructions:extra}}},expected:review},
    {name:'nested address value',patch:{location:{address:{instructions:extra}}},expected:review},
    {name:'location array',patch:{location:[extra]},expected:review},
    {name:'urgency object',patch:{urgency:{instructions:extra}},expected:review},
    {name:'urgency boolean',patch:{urgency:false},expected:review},
    {name:'owner identity prose',patch:{ownerId:extra},expected:review},
    {name:'caller category prose',patch:{callerType:uncertain},expected:review},
    {name:'service description unsupported shape',patch:{serviceRequest:[]},expected:review},
    {name:'existing unknown measurement-field guard',patch:{customerInputs:{...f.inputs,instructions:extra}},expected:review,engineGuard:true},
    {name:'existing unknown fee-selection guard',patch:{customerFeeSelections:{additionalWork:extra}},expected:review,engineGuard:true},
  ];
  const retries=[];
  for(const c of cases) for(const channel of ['public','authenticated','preview']) {
    const body=f.submission(c.patch),before=counts();
    const response=channel==='preview'
      ?await app.request('POST','/api/pricebook/preview',{...body,revision:saved.revision},f.owner.token)
      :await app.request('POST',channel==='public'?f.url:'/api/quote/calculate',body,channel==='public'?null:f.owner.token,channel==='public'?f.headers:{});
    assert.equal(response.status,channel==='preview'?200:201,c.name+' '+channel);
    const outcome={name:c.name,channel,request:body,response,expected:c.expected};
    rows.push(outcome);
    assert.equal(response.result.resultType,c.expected,c.name+' '+channel);
    if(c.expected===ready)for(const key of ['lowEstimate','midEstimate','highEstimate'])assert.equal(response.result[key],50);
    else for(const key of ['lowEstimate','midEstimate','highEstimate','options'])assert.equal(Object.hasOwn(response.result,key),false,c.name+' must withhold '+key);
    if(channel==='preview') {
      assert.deepEqual(counts(),before,'Preview cannot create a receipt, quote or lead');
      outcome.passed=true;
      continue;
    }
    for(const key of ['internal','internalResult','applicationReview','ownerPricing','bookSnapshot','reviewReason'])assert.equal(Object.hasOwn(response.result,key),false,'No private '+key);
    const stored=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,body.requestId);
    assert.ok(stored);assert.deepEqual(JSON.parse(stored.originalSubmissionJson),body);
    assert.deepEqual(JSON.parse(stored.customerResponseJson),response.result);
    assert.equal(stored.bookRevision,saved.revision);
    const internal=JSON.parse(stored.internalOutcomeJson);
    assert.deepEqual(internal.originalSubmission,body);
    assert.equal(internal.ownerId,f.owner.id);
    if(c.expected===review&&!c.engineGuard){assert.equal(internal.internalResult,null);assert.equal(internal.applicationReview.stage,'whole_request_scope');}
    if(c.engineGuard)assert.equal(internal.internalResult.resultType,review,'Preserve existing frozen-engine input guards');
    const kind=c.expected===review?'leads':'quotes';
    const record=db.prepare('SELECT * FROM '+kind+' WHERE ownerId=? AND id=?').get(f.owner.id,stored.recordId);
    assert.ok(record);
    if(kind==='leads'){
      assert.deepEqual(JSON.parse(record.collectedInputsJson).originalSubmission,body);
      const detail=await f.call('GET','/api/leads/'+stored.recordId);
      for(const key of ['contact','location','urgency','context','explicitUnknowns'])assert.deepEqual(detail[key],body[key]??null);
    }
    const after=counts();
    for(const table of ['quoteSubmissions','quoteRequests',kind])assert.equal(after[table],before[table]+1);
    assert.equal(after[kind==='quotes'?'leads':'quotes'],before[kind==='quotes'?'leads':'quotes']);
    const retry=await f.call('POST','/api/quote/calculate',body,200);
    assert.deepEqual(retry,response.result);assert.deepEqual(counts(),after);
    await f.call('POST','/api/quote/calculate',{...body,context:'Changed submitted scope'},409);
    assert.deepEqual(counts(),after);
    outcome.stored={...stored,record};outcome.passed=true;
    if(retries.length<2||c.name==='additional scope in urgency')retries.push({body,response:response.result});
  }
  const previewCases=[
    {name:'saved owner preview control',patch:{},expected:ready},
    {name:'complete draft owner preview control',patch:{service:saved.services[0],defaults:saved.defaults},expected:ready},
    {name:'prose in preview request identity',patch:{requestId:uncertain},expected:review},
    {name:'orphaned preview defaults with extra scope',patch:{defaults:{instructions:extra}},expected:review},
    {name:'orphaned preview markup change is not silently ignored',patch:{defaults:{...saved.defaults,markupPercent:100}},expected:review},
    {name:'unsupported false preview service',patch:{service:false},expected:review},
  ];
  for(const c of previewCases){
    const request={...f.submission(c.patch),revision:saved.revision},before=counts();
    const response=await app.request('POST','/api/pricebook/preview',request,f.owner.token);
    rows.push({name:c.name,channel:'preview',request,response,expected:c.expected});
    assert.equal(response.status,200);assert.equal(response.result.resultType,c.expected,c.name);
    if(c.expected===ready)assert.equal(response.result.midEstimate,50);
    else for(const key of ['lowEstimate','midEstimate','highEstimate','options'])assert.equal(Object.hasOwn(response.result,key),false);
    assert.deepEqual(counts(),before);rows.at(-1).passed=true;
  }
  assert.deepEqual(await f.read(),saved);
  const priorCounts=counts();db.close();db=null;await app.restart();
  db=new Database(path.join(evidence,'application.sqlite'));
  for(const r of retries)assert.deepEqual(await f.call('POST',f.url,r.body,200,null,f.headers),r.response);
  assert.deepEqual(counts(),priorCounts);
  const login=await f.call('POST','/api/auth/login',{email:f.owner.email,password:f.owner.password},200,null);
  assert.deepEqual(await f.call('GET','/api/pricebook/'+f.owner.id,undefined,200,login.token),saved);
  const lead=db.prepare('SELECT id FROM leads WHERE ownerId=? LIMIT 1').get(f.owner.id);
  await f.call('GET','/api/leads/'+lead.id,undefined,404,other.token);
  const result={passed:true,checks:rows.length,rows,restart:'Same stores; exact ready/review receipts and book preserved after restart and fresh sign-in',privacy:'Other tenant cannot read retained review lead; customer responses omit internal evidence'};
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({passed:true,checks:rows.length,restart:result.restart,privacy:result.privacy},null,2));
} catch(error) {
  fs.writeFileSync(path.join(evidence,'failed-results.json'),JSON.stringify({passed:false,rows,error:String(error.stack)},null,2));
  throw error;
} finally {
  if(db)db.close();await app.stop();
}
