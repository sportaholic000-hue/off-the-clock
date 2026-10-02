import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {convertApplicationBook,applicationMetadata,quoteDoneMoneyKind} from '../../server/src/quoteDoneBridge.js';
import {starterFields,validateInterviewValue} from '../../server/src/priceBookAI.js';
import {cases} from './fixtures.mjs';
const fixed=process.env.READINESS_ASSERT_FIXED==='true';
const root=process.cwd(),out=path.resolve(process.argv[2]),origin='http://127.0.0.1:4940',rows=[];
const app=await startApplication(root,path.join(out,'private'),{port:4942,browserOrigins:[origin]});
const db=new Database(path.join(out,'private/application.sqlite'));
fs.mkdirSync(path.join(out,'public'),{recursive:true});
try{
 for(const item of cases()){
  const row={id:item.id,expected:item.expected};rows.push(row);
  try{
   const owner=await app.owner('readiness-'+crypto.randomUUID().slice(0,8));
   const call=async(method,url,body,status=200,token=owner.token,headers={})=>{const r=await app.request(method,url,body,token,headers);assert.equal(r.status,status,JSON.stringify(r));return r.result;};
   const converted=convertApplicationBook({services:[item.input.ownerPricing],defaults:item.input.businessDefaults},'toDollars');
   const service=converted.services[0];for(const k of ['origin','confirmedFields','approvedValues'])delete service[k];service.id=crypto.randomUUID();service.service='[SYNTHETIC] '+item.id;
   if(item.minimumDollars!==undefined)service.pricing.minimumJob=item.minimumDollars;
   let book=await call('GET','/api/pricebook/'+owner.id);Object.assign(book,{services:[service],defaults:converted.defaults});
   row.input=structuredClone(book);row.save=await call('POST','/api/pricebook/save',book);book=await call('GET','/api/pricebook/'+owner.id);
   row.approval=await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:book.revision,confirmConfiguration:true});book=await call('GET','/api/pricebook/'+owner.id);
   row.book=book;row.status=await call('POST','/api/pricebook/validate',book);
   row.preview=await call('POST','/api/pricebook/preview',{serviceId:service.id,revision:book.revision,customerInputs:item.input.customerInputs});
   const access=await call('POST','/api/quotedone/access',{allowedOrigins:[origin]}),url='/api/public/quote/'+access.publicKey,headers={Origin:origin};
   row.catalog=await call('GET',url,undefined,200,undefined,headers);
   const staff=db.prepare('SELECT * FROM users WHERE id=?').get(owner.id);staff.id=crypto.randomUUID();staff.ownerId=owner.id;staff.role='staff';staff.email='synthetic-staff-'+staff.id+'@example.invalid';staff.firstName='[SYNTHETIC] Staff';
   const columns=Object.keys(staff);db.prepare('INSERT INTO users ('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')').run(...Object.values(staff));
   const login=await call('POST','/api/auth/login',{email:staff.email,password:owner.password},200,undefined);
   const submission=()=>({serviceId:service.id,serviceRequest:service.service,customerInputs:structuredClone(item.input.customerInputs),contact:{email:'synthetic-customer@example.invalid'},requestId:crypto.randomUUID(),intakeFlow:'job-details-v1'});
   for(const lane of ['public','staff']){
    const body=submission(),token=lane==='staff'?login.token:undefined,h=lane==='staff'?{}:headers,prepare=lane==='staff'?'/api/quote/prepare':url+'/prepare';
    const prepared=await app.request('POST',prepare,body,token,h);assert.equal(prepared.status,200,JSON.stringify(prepared));
    const payload={...body,...(prepared.result.status==='ready'?{intakeConfirmation:prepared.result.confirmation}:{reviewRequested:true})};
    const response=await app.request('POST',lane==='staff'?'/api/quote/calculate':url,payload,token,h);assert.equal(response.status,201,JSON.stringify(response));
    row[lane]={prepared,payload,response};
   }
   row.optional=[];
   const extras={
    'M1-cleanup-no-haul':[{haulAway:true}],
    'M1-sod-no-preparation':[{groundPrepNeeded:true}],
    'M1-planting-no-mulch':[{bedCondition:'needs_weeding',bedSqft:100},{mulchNeeded:true,mulchType:'brown',mulchYards:2}],
    'B2-M1-wall-painting':[{ceilingsIncluded:true,ceilingAreaSqft:100,ceilingCoats:2},{trimIncluded:true,trimLengthLF:20}],
    'B2-M1-M6-paint-packages':[{trimIncluded:true,trimLengthLF:20}],
    'B2-M1-concrete':[{baseNeeded:true},{reinforcement:'wire_mesh'},{reinforcement:'rebar'},{finishType:'stamped'}],
    'B2-M1-mulch':[{edgingNeeded:true,edgeLF:20},{bedCondition:'needs_weeding',bedSqft:96}]
   }[item.id]||[];
   for(const changes of extras)for(const lane of ['public','staff']){
    const body={...submission(),customerInputs:{...item.input.customerInputs,...changes}},token=lane==='staff'?login.token:undefined,h=lane==='staff'?{}:headers;
    const prepared=await app.request('POST',lane==='staff'?'/api/quote/prepare':url+'/prepare',body,token,h);
    assert.equal(prepared.status,200,JSON.stringify(prepared));
    const payload={...body,...(prepared.result.status==='ready'?{intakeConfirmation:prepared.result.confirmation}:{reviewRequested:true})};
    const response=await app.request('POST',lane==='staff'?'/api/quote/calculate':url,payload,token,h);
    row.optional.push({lane,changes,prepared,payload,response});
    assert.equal(response.status,201,JSON.stringify(response));assert.equal(response.result.resultType,'ESTIMATE_REQUIRES_REVIEW');
    for(const field of ['midEstimate','lowEstimate','highEstimate','options'])assert.equal(response.result[field],undefined);
   }
   if(item.id==='B1-roof-minimum'&&fixed){
    const file=path.join(out,'private/pricebooks',owner.id+'.json');
    let historical=await call('GET','/api/pricebook/'+owner.id);historical.services[0].pricing.minimumJob=25;
    await call('POST','/api/pricebook/save',historical);historical=await call('GET','/api/pricebook/'+owner.id);
    await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:historical.revision,confirmConfiguration:true});
    const old=JSON.parse(fs.readFileSync(file,'utf8'));delete old.services[0].quoteDoneApproval.moneyUnitVersion;fs.writeFileSync(file,JSON.stringify(old));
    historical=await call('GET','/api/pricebook/'+owner.id);const status=await call('POST','/api/pricebook/validate',historical);
    assert.equal(historical.services[0].pricing.minimumJob,25);assert.match(status.statuses[0].applicationIssues.join(' '),/100 times too small/);
    const prior={stored:old,displayed:historical,status,attempts:[]};
    for(const lane of ['public','staff']){
      const body={...submission(),reviewRequested:true};
      const response=await app.request('POST',lane==='staff'?'/api/quote/calculate':url,body,lane==='staff'?login.token:undefined,lane==='staff'?{}:headers);
      prior.attempts.push({lane,body,response});assert.equal(response.status,201);assert.equal(response.result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(response.result.midEstimate,undefined);
    }
    const fractional=structuredClone(old);fractional.services[0].pricing.minimumJob=2500.5;fs.writeFileSync(file,JSON.stringify(fractional));
    const fractionalRead=await call('GET','/api/pricebook/'+owner.id);assert.equal(fractionalRead.services[0].pricing.minimumJob,25.005);
    const refused=await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:fractionalRead.revision,confirmConfiguration:true},422);
    fractionalRead.services[0].pricing.minimumJob=2500.5;await call('POST','/api/pricebook/save',fractionalRead);
    let correctedFraction=await call('GET','/api/pricebook/'+owner.id);await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:correctedFraction.revision,confirmConfiguration:true});
    correctedFraction=await call('GET','/api/pricebook/'+owner.id);
    const fractionalPreview=await call('POST','/api/pricebook/preview',{serviceId:service.id,revision:correctedFraction.revision,customerInputs:item.input.customerInputs});
    assert.equal(fractionalPreview.midEstimate,2875.58);
    prior.fractional={stored:fractional,displayed:fractionalRead,rejectedApproval:refused,corrected:correctedFraction,preview:fractionalPreview};
    historical=correctedFraction;
    historical.services[0].pricing.minimumJob=2500;await call('POST','/api/pricebook/save',historical);historical=await call('GET','/api/pricebook/'+owner.id);
    await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:historical.revision,confirmConfiguration:true});
    prior.corrected=await call('GET','/api/pricebook/'+owner.id);row.historical=prior;
   }
   if(fixed){
    const isReview=item.id.startsWith('M2-')&&!item.id.startsWith('M2-configured')||item.id==='B2-unready-safe-integer-range';
    for(const lane of ['public','staff'])assert.equal(row[lane].response.result.resultType,isReview?'ESTIMATE_REQUIRES_REVIEW':'INSTANT_ESTIMATE_READY');
    assert.equal(row.status.statuses[0].status,isReview?'NEEDS PRICING':'QUOTING LIVE');
    assert.equal(row.catalog.services.length,isReview?0:1);
    if(item.expected?.midDollars!==undefined)for(const lane of ['public','staff'])assert.equal(row[lane].response.result.midEstimate,item.expected.midDollars);
    if(item.id==='B1-roof-minimum')for(const lane of ['public','staff']){
      assert.equal(row[lane].response.result.lowEstimate,2875);assert.equal(row[lane].response.result.highEstimate,3163);
    }
   }
   row.storedBook=JSON.parse(fs.readFileSync(path.join(out,'private/pricebooks',owner.id+'.json'),'utf8'));
   row.records={submissions:db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').all(owner.id),quotes:db.prepare('SELECT * FROM quotes WHERE ownerId=?').all(owner.id),leads:db.prepare('SELECT * FROM leads WHERE ownerId=?').all(owner.id)};
  }catch(e){row.error=e.stack||e.message;}
  console.log('READINESS_CASE '+JSON.stringify({id:row.id,error:row.error,status:row.status?.statuses?.[0]?.status,listed:row.catalog?.services?.length,preview:row.preview?.resultType,public:row.public?.response?.result?.resultType,staff:row.staff?.response?.result?.resultType,minimum:row.storedBook?.services[0]?.pricing?.minimumJob,mid:row.public?.response?.result?.midEstimate,low:row.public?.response?.result?.lowEstimate,high:row.public?.response?.result?.highEstimate}));
 }
 const interviewOwner=await app.owner('schema-'+crypto.randomUUID().slice(0,8));
 const created=await app.request('POST','/api/pricebook/interview',{mode:'browser',serviceTypes:['INTERIOR_PAINTING','ROOFING_REPLACEMENT']},interviewOwner.token);
 assert.equal(created.status,201);const interview={created,attempts:[]},draftId=created.result.draft.id;
 for(const [type,field,value,expectedStatus]of [['INTERIOR_PAINTING','laborPerWallSqftPerCoat',1,200],['ROOFING_REPLACEMENT','minimumJob',2500,200],['ROOFING_REPLACEMENT','laborPerSquare',{asphalt_shingle:90},200],['INTERIOR_PAINTING','laborPerFloorSqft',1,422],['ROOFING_REPLACEMENT','laborPerSquare',90,422]]){
  const input={fields:{[type]:{[field]:value}}},response=await app.request('PUT','/api/pricebook/interview/'+draftId,input,interviewOwner.token);interview.attempts.push({input,response});assert.equal(response.status,expectedStatus);
 }
 interview.stored=db.prepare('SELECT * FROM priceBookDrafts WHERE id=?').get(draftId);
 assert.equal(interview.stored.status,'DRAFT');assert.ok(Object.values(JSON.parse(interview.stored.confirmedFieldsJson)).every(fields=>fields.length===0));
 if(fixed)assert.equal(created.result.draft.currentField,'INTERIOR_PAINTING.laborPerWallSqftPerCoat');
 const metadata=applicationMetadata();
 const findings={roofMinimumKind:quoteDoneMoneyKind('ROOFING_REPLACEMENT','minimumJob'),metadata,starters:Object.fromEntries(metadata.services.map(s=>[s.serviceType,starterFields(s.serviceType)])),interview:{}};
 for(const [service,field,value] of [['INTERIOR_PAINTING','laborPerWallSqftPerCoat',1],['INTERIOR_PAINTING','laborPerFloorSqft',1],['ROOFING_REPLACEMENT','minimumJob',2500],['ROOFING_REPLACEMENT','laborPerSquare',{asphalt_shingle:90}],['ROOFING_REPLACEMENT','laborPerSquare',90]]){
  try{findings.interview[service+'.'+field+'.'+JSON.stringify(value)]={accepted:validateInterviewValue(service,field,value)};}catch(e){findings.interview[service+'.'+field+'.'+JSON.stringify(value)]={error:e.message};}
 }
 fs.writeFileSync(path.join(out,'public/result.json'),JSON.stringify({source:process.env.GITHUB_SHA||'local-'+process.env.READINESS_SOURCE,rows,findings,interview},null,2));
}finally{db.close();await app.stop();fs.copyFileSync(path.join(out,'private/http.json'),path.join(out,'public/http.json'));fs.copyFileSync(path.join(out,'private/source-binding.json'),path.join(out,'public/source-binding.json'));}
if(rows.some(r=>r.error))process.exitCode=1;
