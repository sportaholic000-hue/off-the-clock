import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {convertApplicationBook,applicationMetadata,quoteDoneMoneyKind} from '../../server/src/quoteDoneBridge.js';
import {starterFields,validateInterviewValue} from '../../server/src/priceBookAI.js';
import {cases} from './fixtures.mjs';
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
   row.storedBook=JSON.parse(fs.readFileSync(path.join(out,'private/pricebooks',owner.id+'.json'),'utf8'));
   row.records={submissions:db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').all(owner.id),quotes:db.prepare('SELECT * FROM quotes WHERE ownerId=?').all(owner.id),leads:db.prepare('SELECT * FROM leads WHERE ownerId=?').all(owner.id)};
  }catch(e){row.error=e.stack||e.message;}
  console.log('READINESS_CASE '+JSON.stringify({id:row.id,error:row.error,status:row.status?.statuses?.[0]?.status,listed:row.catalog?.services?.length,preview:row.preview?.resultType,public:row.public?.response?.result?.resultType,staff:row.staff?.response?.result?.resultType,minimum:row.storedBook?.services[0]?.pricing?.minimumJob,mid:row.public?.response?.result?.midEstimate,low:row.public?.response?.result?.lowEstimate,high:row.public?.response?.result?.highEstimate}));
 }
 const metadata=applicationMetadata();
 const findings={roofMinimumKind:quoteDoneMoneyKind('ROOFING_REPLACEMENT','minimumJob'),metadata,starters:Object.fromEntries(metadata.services.map(s=>[s.serviceType,starterFields(s.serviceType)])),interview:{}};
 for(const [service,field,value] of [['INTERIOR_PAINTING','laborPerWallSqftPerCoat',1],['INTERIOR_PAINTING','laborPerFloorSqft',1],['ROOFING_REPLACEMENT','minimumJob',2500],['ROOFING_REPLACEMENT','laborPerSquare',{asphalt_shingle:90}],['ROOFING_REPLACEMENT','laborPerSquare',90]]){
  try{findings.interview[service+'.'+field+'.'+JSON.stringify(value)]={accepted:validateInterviewValue(service,field,value)};}catch(e){findings.interview[service+'.'+field+'.'+JSON.stringify(value)]={error:e.message};}
 }
 fs.writeFileSync(path.join(out,'public/result.json'),JSON.stringify({source:process.env.GITHUB_SHA||'local-'+process.env.READINESS_SOURCE,rows,findings},null,2));
}finally{db.close();await app.stop();fs.copyFileSync(path.join(out,'private/http.json'),path.join(out,'public/http.json'));}
if(rows.some(r=>r.error))process.exitCode=1;
