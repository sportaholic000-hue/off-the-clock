import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {application} from '../../test/fixtures/bookingCalendarApplication20261006.mjs';
import {convertApplicationBook} from '../../server/src/quoteDoneBridge.js';
import {SERVICE_TYPES} from '../../server/quote-engine-vnext/contracts.js';
import {auditFixtures,correctionCases,correctedInputs,expectedCents} from './audit-fixtures.mjs';

const root=path.resolve(process.argv[2]||'.');
const out=path.resolve(process.argv[3]||path.join(root,'verification/qe-agent3-public-intake-review-20261019/http-evidence'));
if(fs.existsSync(out))throw Error('Evidence directory already exists: '+out);
fs.mkdirSync(out,{recursive:true});
const safe=value=>JSON.parse(JSON.stringify(value,(key,item)=>['password','passwordHash','token','bookingToken','bookingTokenReceipt','intakeConfirmation'].includes(key)?'[SYNTHETIC SECRET OMITTED]':item));
const write=(name,value)=>fs.writeFileSync(path.join(out,name),typeof value==='string'?value:JSON.stringify(safe(value),null,2));
const cleanup=[];
const t={after:fn=>cleanup.unshift(fn)};
const wire=[];
const matrix=[];
const findings=[];
const boundaryTransitions=[];
const fixtures=auditFixtures();
const privatePattern=/"(?:lineItems|calculationRecord|ratePath|installedMaterialsPercent|installedLaborPercent|priceMetadata|startingValueState|actualLaborCostCents|actualMaterialCostCents|jobMetrics|lowBufferPercent|highBufferPercent)"/;

function priced(result){return result?.resultType==='PARTIAL_ESTIMATE_READY'?result.pricedEstimate:result;}
function mids(result){const p=priced(result);return Array.isArray(p?.options)&&p.options.length?p.options.map(option=>option.midEstimate):[p?.midEstimate];}
function assertPrice(result,cents,label){
  assert.ok(['INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY'].includes(result.resultType),label+' should be priced: '+JSON.stringify(result));
  assert.ok(mids(result).some(value=>value===cents/100),`${label}: expected ${cents/100}; got ${JSON.stringify(mids(result))}`);
}
function findNormalized(internal){
  const candidate=internal?.internalResult||internal?.applicationOutcome?.internalResult;
  if(candidate?.options?.[0]?.calculationRecord?.normalizedCustomerInputs)return candidate.options[0].calculationRecord.normalizedCustomerInputs;
  if(candidate?.calculationRecord?.normalizedCustomerInputs)return candidate.calculationRecord.normalizedCustomerInputs;
  return null;
}
function assertNoPrivate(value,label){assert.doesNotMatch(JSON.stringify(value),privatePattern,label);}
function exactRows(db,owner,requestId){
  return {
    submission:db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner,requestId),
    quote:db.prepare('SELECT * FROM quotes WHERE ownerId=? AND id=(SELECT recordId FROM quoteSubmissions WHERE ownerId=? AND requestId=?)').get(owner,owner,requestId),
    lead:db.prepare('SELECT * FROM leads WHERE ownerId=? AND id=(SELECT recordId FROM quoteSubmissions WHERE ownerId=? AND requestId=?)').get(owner,owner,requestId)
  };
}
function counts(db,owner){return Object.fromEntries(['quoteSubmissions','quotes','leads','quoteRequests'].map(table=>[table,db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ownerId=?`).get(owner).n]));}
function assertCountsEqual(actual,expected,label){assert.deepEqual(actual,expected,label);}

let app;
try{
  app=await application(t);
  const owner='synthetic-a';
  async function call(method,url,body,{status=200,publicRequest=false}={}){
    const response=await app.request(url,{method,body,owner:publicRequest?null:owner,publicRequest});
    wire.push({method,path:url,request:safe(body??null),status:response.status,response:safe(response.body)});
    assert.equal(response.status,status,`${method} ${url}: ${JSON.stringify(response.body)}`);
    return response.body;
  }

  const initial=await call('GET','/api/pricebook/'+owner);
  const rawServices=SERVICE_TYPES.map(type=>{
    const fixture=fixtures.get(type),service=structuredClone(fixture.ownerPricing);
    delete service.origin;delete service.quoteDoneApproval;delete service.startingValueState;delete service.startingValueAdoptions;delete service.dependentLineState;
    service.service='[SYNTHETIC PUBLIC INTAKE] '+type;
    service.validationInputs=structuredClone(fixture.customerInputs);
    service.tiers=[];
    return service;
  });
  const converted=convertApplicationBook({services:rawServices,defaults:{...fixtures.get('CUSTOM').businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
  await call('POST','/api/pricebook/save',{...initial,services:converted.services,defaults:converted.defaults});
  let saved=await call('GET','/api/pricebook/'+owner);
  for(let pass=0;pass<3;pass++){
    const actionable=saved.services.some(service=>Object.keys(service.startingValueState||{}).length||Object.keys(service.dependentLineState||{}).some(id=>!service.dependentLineState[id]?.confirmed||!service.dependentLineState[id]?.reentered));
    if(!actionable)break;
    for(const service of saved.services){
      const start=Object.keys(service.startingValueState||{});
      if(start.length)service.startingValueActions={confirmPaths:start};
      const dependent=Object.keys(service.dependentLineState||{});
      if(dependent.length)service.dependentLineActions={reenteredIds:dependent,confirmIds:dependent};
    }
    await call('POST','/api/pricebook/save',saved);
    saved=await call('GET','/api/pricebook/'+owner);
  }
  const approvalLog=[];
  for(const type of SERVICE_TYPES){
    saved=await call('GET','/api/pricebook/'+owner);
    const service=saved.services.find(item=>item.serviceType===type);
    const validation=await call('POST','/api/pricebook/validate',saved);
    const status=validation.statuses.find(item=>item.serviceId===service.id);
    approvalLog.push({type,before:status});
    await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true,fields:status.confirmationFields||[]});
  }
  saved=await call('GET','/api/pricebook/'+owner);
  const access=await call('POST','/api/quotedone/access',{allowedOrigins:[app.base]});
  const publicPath='/api/public/quote/'+access.publicKey;
  const catalog=await call('GET',publicPath,undefined,{publicRequest:true});
  assert.deepEqual(catalog.services.map(service=>service.serviceType).sort(),[...SERVICE_TYPES].sort());
  assertNoPrivate(catalog,'public catalog leaked private pricing');
  write('approved-book.json',saved);
  write('approval-log.json',approvalLog);
  write('public-catalog.json',catalog);

  const byType=new Map(catalog.services.map(service=>[service.serviceType,service]));
  const bodyFor=(type,inputs,requestId=crypto.randomUUID())=>({
    requestId,serviceId:byType.get(type).id,serviceRequest:byType.get(type).name,
    customerInputs:structuredClone(inputs),customerFeeSelections:{},additionalWork:[],
    contact:{email:`synthetic-${type.toLowerCase().replaceAll('_','-')}@example.invalid`},
    intakeFlow:'job-details-v1',context:'',explicitUnknowns:[]
  });
  async function prepare(body){return call('POST',publicPath+'/prepare',body,{publicRequest:true});}
  async function final(body,status=201){return call('POST',publicPath,body,{status,publicRequest:true});}
  async function freshSubmit(type,inputs,cents,label){
    const body=bodyFor(type,inputs),ready=await prepare(body);
    assert.equal(ready.status,'ready',`${label} prepare: ${JSON.stringify(ready)}`);
    assert.equal(typeof ready.confirmation,'object');assert.ok(ready.confirmation);
    const submitted={...body,intakeConfirmation:ready.confirmation};
    const response=await final(submitted);
    assertPrice(response,cents,label);assertNoPrivate(response,label+' customer response leaked private data');
    const rows=exactRows(app.db,owner,body.requestId);
    assert.ok(rows.submission&&rows.quote&&rows.lead,label+' must persist receipt, quote and lead');
    assert.deepEqual(JSON.parse(rows.submission.originalSubmissionJson),submitted,label+' original submission');
    assert.deepEqual(JSON.parse(rows.quote.customerInputsJson),inputs,label+' quote customer input persistence');
    const internal=JSON.parse(rows.submission.internalOutcomeJson),normalized=findNormalized(internal);
    assert.ok(normalized,label+' normalized customer inputs missing from calculation evidence');
    for(const [key,value] of Object.entries(inputs))if(typeof value==='number'||typeof value==='string'||typeof value==='boolean')assert.deepEqual(normalized[key],value,label+' normalized '+key);
    const receiptBefore=structuredClone(rows.submission),quoteBefore=structuredClone(rows.quote),leadBefore=structuredClone(rows.lead),before=counts(app.db,owner);
    const retry=await final(submitted,200);
    assert.deepEqual(retry,response,label+' exact retry response');
    assertCountsEqual(counts(app.db,owner),before,label+' exact retry row counts');
    const retryRows=exactRows(app.db,owner,body.requestId);
    assert.deepEqual(retryRows.submission,receiptBefore,label+' immutable receipt retry');
    assert.deepEqual(retryRows.quote,quoteBefore,label+' immutable quote retry');
    assert.deepEqual(retryRows.lead,leadBefore,label+' immutable lead retry');
    return {body,submitted,response,ready,rows:{recordId:rows.submission.recordId,resultType:rows.submission.resultType},normalized};
  }

  for(let index=0;index<SERVICE_TYPES.length;index++){
    const type=SERVICE_TYPES[index],fixture=fixtures.get(type),row={serviceType:type,http:{valid:false,correction:false},browser:false};
    const valid=await freshSubmit(type,fixture.customerInputs,expectedCents[type],type+' valid');
    row.http.valid=true;row.valid={requestId:valid.body.requestId,expectedCents:expectedCents[type],actualMid:mids(valid.response),normalized:valid.normalized};

    const correction=correctionCases[type],variants=correctedInputs(type,fixture.customerInputs),base=bodyFor(type,fixture.customerInputs),prepared=await prepare(base);
    assert.equal(prepared.status,'ready',type+' correction base prepare');
    const stale={...base,customerInputs:variants.mutated,intakeConfirmation:prepared.confirmation};
    const before=counts(app.db,owner);
    const rejected=await final(stale,409);
    assert.match(rejected.error,/changed|details|pricing/i,type+' stale proof message');
    assertCountsEqual(counts(app.db,owner),before,type+' stale proof persisted rows');
    const mutationBody=bodyFor(type,variants.mutated),mutationPrepared=await prepare(mutationBody);
    row.correction={kind:correction.kind,staleStatus:409,prepareStatus:mutationPrepared.status,prepare:mutationPrepared};
    if(correction.kind==='invalid'){
      assert.notEqual(mutationPrepared.status,'ready',type+' invalid mutation unexpectedly ready');
      assertCountsEqual(counts(app.db,owner),before,type+' invalid prepare persisted rows');
    }else if(correction.kind==='invalid_then_valid'){
      assert.notEqual(mutationPrepared.status,'ready',type+' hidden stale mutation unexpectedly ready');
      const fixed=await freshSubmit(type,variants.corrected,correction.expectedCents,type+' corrected');
      row.correction.correctedRequestId=fixed.body.requestId;row.correction.correctedMid=mids(fixed.response);
    }else{
      assert.equal(mutationPrepared.status,'ready',type+' corrected prepare');
      const fixed=await freshSubmit(type,variants.corrected,correction.expectedCents,type+' corrected');
      row.correction.correctedRequestId=fixed.body.requestId;row.correction.correctedMid=mids(fixed.response);
      if(correction.scopeText)assert.match(JSON.stringify(fixed.response),correction.scopeText,type+' corrected scope disclosure');
      if(correction.quantity){
        assert.equal(fixed.normalized[correction.quantity.field],correction.quantity.value,type+' corrected quantity');
      }
    }
    row.http.correction=true;matrix.push(row);
    if((index+1)%4===0&&index+1<SERVICE_TYPES.length)await app.restartApplication();
  }

  // The rendered control audit shows that mowing can retain a now-hidden edge
  // length. The public handler must reject that contradiction and persist no
  // receipt; a corrected request without the length is $110.00.
  await app.restartApplication();
  const mowingBase=fixtures.get('LANDSCAPING_MOWING').customerInputs;
  const mowingHidden={...mowingBase,edgingIncluded:false},mowingCorrected={...mowingHidden};
  delete mowingCorrected.edgingLengthLF;
  const mowingBefore=counts(app.db,owner),mowingHiddenBody=bodyFor('LANDSCAPING_MOWING',mowingHidden),mowingHiddenPrepared=await prepare(mowingHiddenBody);
  assert.notEqual(mowingHiddenPrepared.status,'ready','hidden mowing edge length unexpectedly ready');
  assertCountsEqual(counts(app.db,owner),mowingBefore,'hidden mowing edge length persisted rows');
  const mowingFixed=await freshSubmit('LANDSCAPING_MOWING',mowingCorrected,11000,'mowing edge removed');
  boundaryTransitions.push({id:'H01',serviceType:'LANDSCAPING_MOWING',transition:'edging yes to no',invalidRetainedField:'edgingLengthLF',invalidPrepareStatus:mowingHiddenPrepared.status,correctedRequestId:mowingFixed.body.requestId,expectedCents:11000,actualMid:mids(mowingFixed.response)});

  // Declared additional work is separate from the priced service. Adding it
  // produces a partial response, changing/removing it invalidates the old proof,
  // and removing it with a fresh proof returns the complete service estimate.
  await app.restartApplication();
  async function submitExactBody(body,cents,label){
    const ready=await prepare(body);assert.equal(ready.status,'ready',label+' prepare');
    const submitted={...body,intakeConfirmation:ready.confirmation},response=await final(submitted);
    assertPrice(response,cents,label);assertNoPrivate(response,label+' leaked private pricing');
    const rows=exactRows(app.db,owner,body.requestId);assert.ok(rows.submission&&rows.quote&&rows.lead,label+' persistence');
    assert.deepEqual(JSON.parse(rows.submission.originalSubmissionJson),submitted,label+' original receipt body');
    assert.deepEqual(JSON.parse(rows.quote.customerInputsJson),body.customerInputs,label+' persisted inputs');
    return {body,ready,submitted,response,rows};
  }
  const optionalText='Synthetic detached shed inspection',changedText='Synthetic detached garage inspection';
  const optionalBody=bodyFor('FLAT_ROOF_REPAIR',fixtures.get('FLAT_ROOF_REPAIR').customerInputs);optionalBody.additionalWork=[optionalText];
  const optionalAdded=await submitExactBody(optionalBody,expectedCents.FLAT_ROOF_REPAIR,'optional work added');
  assert.equal(optionalAdded.response.resultType,'PARTIAL_ESTIMATE_READY');
  assert.match(JSON.stringify(optionalAdded.response.additionalWork),/Synthetic detached shed inspection/);
  assert.doesNotMatch(JSON.stringify(optionalAdded.response),/Total for all requested work: \$|totalEstimate/i);
  const changeDraft=bodyFor('FLAT_ROOF_REPAIR',fixtures.get('FLAT_ROOF_REPAIR').customerInputs);changeDraft.additionalWork=[optionalText];
  const changePrepared=await prepare(changeDraft),changedWithStaleProof={...changeDraft,additionalWork:[changedText],intakeConfirmation:changePrepared.confirmation};
  const changeBefore=counts(app.db,owner);await final(changedWithStaleProof,409);assertCountsEqual(counts(app.db,owner),changeBefore,'changed optional work reused stale proof');
  const removeDraft=bodyFor('FLAT_ROOF_REPAIR',fixtures.get('FLAT_ROOF_REPAIR').customerInputs);removeDraft.additionalWork=[optionalText];
  const removePrepared=await prepare(removeDraft),removedWithStaleProof={...removeDraft,additionalWork:[],intakeConfirmation:removePrepared.confirmation};
  const removeBefore=counts(app.db,owner);await final(removedWithStaleProof,409);assertCountsEqual(counts(app.db,owner),removeBefore,'removed optional work reused stale proof');
  const removedBody=bodyFor('FLAT_ROOF_REPAIR',fixtures.get('FLAT_ROOF_REPAIR').customerInputs),optionalRemoved=await submitExactBody(removedBody,expectedCents.FLAT_ROOF_REPAIR,'optional work removed');
  assert.equal(optionalRemoved.response.resultType,'INSTANT_ESTIMATE_READY');
  boundaryTransitions.push({id:'H02',serviceType:'FLAT_ROOF_REPAIR',transition:'additional work add/change/remove',added:{requestId:optionalAdded.body.requestId,resultType:optionalAdded.response.resultType,description:optionalText},changedStaleProofStatus:409,removedStaleProofStatus:409,removed:{requestId:optionalRemoved.body.requestId,resultType:optionalRemoved.response.resultType,expectedCents:expectedCents.FLAT_ROOF_REPAIR,actualMid:mids(optionalRemoved.response)}});

  // A proof prepared against one approved revision cannot cross a saved-book
  // revision, even when the service identity is unchanged. Historical saved
  // submissions remain exactly replayable after that revision.
  await app.restartApplication();
  const revisionBody=bodyFor('CUSTOM',fixtures.get('CUSTOM').customerInputs),revisionPrepared=await prepare(revisionBody);
  assert.equal(revisionPrepared.status,'ready');
  let revisedBook=await call('GET','/api/pricebook/'+owner),customService=revisedBook.services.find(service=>service.serviceType==='CUSTOM');
  const priorRevision=revisedBook.revision;customService.service+=' [REVISED SYNTHETIC LABEL]';
  await call('POST','/api/pricebook/save',revisedBook);revisedBook=await call('GET','/api/pricebook/'+owner);
  assert.notEqual(revisedBook.revision,priorRevision,'saved synthetic book revision did not change');
  customService=revisedBook.services.find(service=>service.serviceType==='CUSTOM');
  const revisedValidation=await call('POST','/api/pricebook/validate',revisedBook),customStatus=revisedValidation.statuses.find(status=>status.serviceType==='CUSTOM');
  await call('POST','/api/pricebook/services/'+customService.id+'/approve',{revision:revisedBook.revision,confirmConfiguration:true,confirmLegacySettings:true,fields:customStatus.confirmationFields||[]});
  const revisionBefore=counts(app.db,owner);await final({...revisionBody,intakeConfirmation:revisionPrepared.confirmation},409);assertCountsEqual(counts(app.db,owner),revisionBefore,'old revision proof persisted rows');
  const optionalRetry=await final(optionalAdded.submitted,200);assert.deepEqual(optionalRetry,optionalAdded.response,'historical optional-work retry after book revision');
  assert.deepEqual(exactRows(app.db,owner,optionalAdded.body.requestId).submission,optionalAdded.rows.submission,'historical optional-work receipt changed after book revision');
  boundaryTransitions.push({id:'H03',serviceType:'CUSTOM',transition:'approved saved-book revision changed',priorRevision,newRevision:(await call('GET','/api/pricebook/'+owner)).revision,staleProofStatus:409,historicalOptionalRetryStatus:200,historicalOptionalRequestId:optionalAdded.body.requestId});

  // Existing request IDs cannot be rebound even after a restart and book read.
  const historical=matrix[0],historicalRow=app.db.prepare('SELECT originalSubmissionJson,customerResponseJson FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner,historical.valid.requestId);
  await app.restartApplication();
  const historicalBody=JSON.parse(historicalRow.originalSubmissionJson),historicalRetry=await final(historicalBody,200);
  const storedHistorical=JSON.parse(historicalRow.customerResponseJson),retryStoredShape=structuredClone(historicalRetry);
  assert.equal(typeof retryStoredShape.bookingToken,'string');delete retryStoredShape.bookingToken;
  assert.deepEqual(retryStoredShape,storedHistorical);
  const rebound=structuredClone(historicalBody);rebound.customerInputs.roofSizeInput=999;
  const reboundBefore=counts(app.db,owner);await final(rebound,409);assertCountsEqual(counts(app.db,owner),reboundBefore,'changed historical request ID');

  write('coverage-matrix.json',matrix);
  write('boundary-transitions.json',boundaryTransitions);
  write('public-wire.json',wire.filter(row=>row.path.startsWith('/api/public/')));
  write('authenticated-setup-summary.json',wire.filter(row=>!row.path.startsWith('/api/public/')).map(({method,path,status})=>({method,path,status})));
  write('findings.json',findings);
  write('database-counts.json',counts(app.db,owner));
  write('source-binding.json',{
    head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    branch:execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),
    node:process.version,abi:process.versions.modules,platform:process.platform,arch:process.arch,
    expectedFile:'EXPECTED.md',registeredServices:[...SERVICE_TYPES]
  });
  write('result.json',{status:'passed',httpServices:matrix.length,validSubmissions:matrix.filter(row=>row.http.valid).length,correctionCases:matrix.filter(row=>row.http.correction).length,boundaryTransitions:boundaryTransitions.length,findings});
  console.log(JSON.stringify({status:'passed',httpServices:matrix.length,correctionCases:matrix.length,boundaryTransitions:boundaryTransitions.length}));
}catch(error){
  findings.push({severity:'harness-or-assertion',message:error.message,stack:error.stack});
  write('public-wire.json',wire.filter(row=>row.path.startsWith('/api/public/')));write('authenticated-setup-summary.json',wire.filter(row=>!row.path.startsWith('/api/public/')).map(({method,path,status})=>({method,path,status})));write('coverage-matrix.partial.json',matrix);write('findings.json',findings);write('result.json',{status:'failed',error:error.stack,httpServices:matrix.length});
  console.error(error.stack);process.exitCode=1;
}finally{
  for(const fn of cleanup)try{await fn();}catch(error){console.error('cleanup:',error.stack);process.exitCode=1;}
}
