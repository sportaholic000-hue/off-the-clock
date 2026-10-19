// Public-HTTP controls only. This never represents a Chromium execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {application} from '../../test/fixtures/bookingCalendarApplication20261006.mjs';
import {convertApplicationBook} from '../../server/src/quoteDoneBridge.js';
import {CASES,fixtures,corrected,invalid} from './cases.mjs';
const out=path.resolve(process.argv[2]);if(fs.existsSync(out))throw Error('Evidence exists');fs.mkdirSync(out,{recursive:true});
const cleanup=[],t={after:fn=>cleanup.unshift(fn)},results=[],http=[],f=fixtures(),owner='synthetic-a';
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2));let app;
let nextPublicAt=0,syntheticStart,wallStart;
async function api(method,url,body,status=200,publicRequest=false){if(publicRequest){const delay=Math.max(0,nextPublicAt-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));nextPublicAt=Date.now()+1100;app.changeProvider({now:new Date(syntheticStart+Date.now()-wallStart).toISOString()});}const r=await app.request(url,{method,body,owner:publicRequest?null:owner,publicRequest});http.push({method,url,request:body,...r});assert.equal(r.status,status,JSON.stringify(r.body));return r.body;}
try{
 app=await application(t);syntheticStart=Date.parse(app.provider().now);wallStart=Date.now();const initial=await api('GET','/api/pricebook/'+owner);
 const services=CASES.map(({type})=>{const s=structuredClone(f.get(type).ownerPricing);for(const key of ['origin','quoteDoneApproval','startingValueState','startingValueAdoptions','dependentLineState'])delete s[key];s.service='[SYNTHETIC PUBLIC INTAKE] '+type;s.validationInputs=structuredClone(f.get(type).customerInputs);s.tiers=[];return s;});
 const converted=convertApplicationBook({services,defaults:{...f.get('CUSTOM').businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
 await api('POST','/api/pricebook/save',{...initial,services:converted.services,defaults:converted.defaults});let saved=await api('GET','/api/pricebook/'+owner);
 for(let pass=0;pass<3;pass++){if(!saved.services.some(s=>Object.keys(s.startingValueState||{}).length||Object.keys(s.dependentLineState||{}).some(id=>!s.dependentLineState[id]?.confirmed||!s.dependentLineState[id]?.reentered)))break;for(const s of saved.services){const start=Object.keys(s.startingValueState||{}),dep=Object.keys(s.dependentLineState||{});if(start.length)s.startingValueActions={confirmPaths:start};if(dep.length)s.dependentLineActions={reenteredIds:dep,confirmIds:dep};}await api('POST','/api/pricebook/save',saved);saved=await api('GET','/api/pricebook/'+owner);}
 for(const {type} of CASES){saved=await api('GET','/api/pricebook/'+owner);const s=saved.services.find(x=>x.serviceType===type),v=await api('POST','/api/pricebook/validate',saved),status=v.statuses.find(x=>x.serviceId===s.id);await api('POST','/api/pricebook/services/'+s.id+'/approve',{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true,fields:status.confirmationFields||[]});}
 const approved=await api('GET','/api/pricebook/'+owner);write('approved-book.json',approved);
 const access=await api('POST','/api/quotedone/access',{allowedOrigins:[app.base]}),route='/api/public/quote/'+access.publicKey,catalog=await api('GET',route,undefined,200,true);write('catalog.json',catalog);
 for(const row of CASES)for(const variant of ['valid','corrected','invalid']){
  const result={type:row.type,variant};try{
   const s=catalog.services.find(x=>x.serviceType===row.type);assert.ok(s);const base=f.get(row.type).customerInputs,inputs=variant==='valid'?base:variant==='corrected'?corrected(row,base):invalid(row,base);
   const body={requestId:crypto.randomUUID(),serviceId:s.id,serviceRequest:s.name,customerInputs:inputs,customerFeeSelections:{},additionalWork:[],contact:{email:'synthetic-preflight@example.invalid'},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'};
   const p=await api('POST',route+'/prepare',body,200,true);assert.equal(p.status,variant==='invalid'?'needs_details':'ready',JSON.stringify(p));
   if(variant!=='invalid'){const original={...body,intakeConfirmation:p.confirmation},response=await api('POST',route,original,201,true),stored=app.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner,body.requestId),internal=JSON.parse(stored.internalOutcomeJson).internalResult;
    const cents=(internal.options?.length?internal.options:[internal]).map(x=>x.calculationRecord.scenarios.mid.finalTotalCents),expected=variant==='valid'?row.cents:row.correctedCents;result.cents=cents;assert.deepEqual(cents,[expected]);const replay=await api('POST',route,original,200,true);assert.deepEqual(replay,response);
   }result.status='passed';
  }catch(error){result.status='failed';result.error={message:error.message,stack:error.stack};process.exitCode=1;}
  results.push(result);console.log(JSON.stringify(result));
 }
}catch(error){write('fatal.json',{message:error.message,stack:error.stack});console.error(error.stack);process.exitCode=1;}
finally{write('results.json',results);write('http.json',http);for(const fn of cleanup)await fn();}
