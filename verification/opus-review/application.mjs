import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import Database from 'better-sqlite3';
import {startApplication,quoteReceiptResponse} from '../../client/test/widget-application-harness.mjs';
import {mulch,roof,mowing,concrete,fence,coverageCases} from '../../test/opusQuoteFixtures.mjs';
const root=path.resolve(process.argv[2]),evidence=path.resolve(process.argv[3]),origin='http://127.0.0.1:4740';
const {convertApplicationBook}=await import(pathToFileURL(path.join(root,'server/src/quoteDoneBridge.js')).href);
const app=await startApplication(root,evidence,{port:4742,browserOrigins:[origin]});
const db=new Database(path.join(evidence,'application.sqlite')),rows=[];
const tests=[
 {name:'decking-unknown',input:roof(),total:231000,decking:true},
 {name:'decking-two',input:roof(2),total:248800,decking:true},
 ...[['TAX_NONE',45000],['TAX_MATERIALS',45767],['TAX_ALL',51750]].map(([mode,total])=>({name:'minimum-'+mode,input:mulch(mode),total,floor:true})),
 ...['installed','itemized'].map(mode=>({name:'fence-5.5-'+mode,input:fence(5.5,mode),total:mode==='installed'?450000:392000,fence:true})),
 {name:'mowing-biweekly',input:mowing(),total:12000,mowing:true},
 ...[['stamped','difficult',443889],['smooth','difficult',356389],['stamped','easy',398889]].map(([finish,access,total])=>({name:'concrete-'+finish+'-'+access,input:concrete(finish,access),total})),
 ...coverageCases().map(c=>({name:'lead-only-'+c.id,input:c.input,review:true,scopeKey:c.key})),
 ...coverageCases(true).map(c=>({name:'configured-'+c.id,input:c.input,scopeKey:c.key}))
];
const forbidden=new Set(['lineItems','rateCents','costCents','offeringRates','bookSnapshot','markupPercent','priceBasisByCategory','calculationRecord']);
function publicSafe(value){if(value&&typeof value==='object')for(const[k,v]of Object.entries(value)){assert.equal(forbidden.has(k),false,'Public field '+k);publicSafe(v);}}
try{
 for(const t of tests){
  const row={name:t.name,input:t.input,expected:t.total,review:t.review===true};rows.push(row);
  try{
   const owner=await app.owner('opus-'+t.name),call=async(method,url,body,status=200)=>{const r=await app.request(method,url,body,owner.token);assert.equal(r.status,status,JSON.stringify(r));return r.result;};
   const converted=convertApplicationBook({services:[t.input.ownerPricing],defaults:t.input.businessDefaults},'toDollars');
   const service=converted.services[0];delete service.origin;delete service.confirmedFields;delete service.approvedValues;service.id=crypto.randomUUID();service.service='[SYNTHETIC] '+t.name;
   let book=await call('GET','/api/pricebook/'+owner.id);book.services=[service];book.defaults=converted.defaults;
   row.save=await call('POST','/api/pricebook/save',book);book=await call('GET','/api/pricebook/'+owner.id);
   row.approval=await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:book.revision,confirmConfiguration:true});book=await call('GET','/api/pricebook/'+owner.id);
   const access=await call('POST','/api/quotedone/access',{allowedOrigins:[origin]}),url='/api/public/quote/'+access.publicKey,headers={Origin:origin};
   row.preview=await call('POST','/api/pricebook/preview',{serviceId:service.id,revision:book.revision,customerInputs:t.input.customerInputs});
   const request=()=>({serviceId:service.id,serviceRequest:service.service,customerInputs:structuredClone(t.input.customerInputs),contact:{email:'synthetic-opus@example.invalid'},requestId:crypto.randomUUID(),intakeFlow:'job-details-v1'});
   async function submit(auth,body){
    const target=auth?'/api/quote':url,prepared=await app.request('POST',target+'/prepare',body,auth?owner.token:undefined,auth?{}:headers);
    assert.equal(prepared.status,200,JSON.stringify(prepared));
    const payload={...body,...(prepared.result.status==='ready'?{intakeConfirmation:prepared.result.confirmation}:{reviewRequested:true})};
    const r=await app.request('POST',auth?'/api/quote/calculate':url,payload,auth?owner.token:undefined,auth?{}:headers);
    assert.equal(r.status,201,JSON.stringify(r));return {prepared,payload,response:r};
   }
   row.authenticated=await submit(true,request());row.public=await submit(false,request());
   row.receipt=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner.id,row.public.payload.requestId);
   assert.ok(row.receipt);assert.deepEqual(JSON.parse(row.receipt.originalSubmissionJson),row.public.payload);assert.deepEqual(quoteReceiptResponse(app,row.receipt),row.public.response.result);
   row.storedQuotes=db.prepare('SELECT * FROM quotes WHERE ownerId=?').all(owner.id);row.storedLeads=db.prepare('SELECT * FROM leads WHERE ownerId=?').all(owner.id);
   const results=[row.preview,row.authenticated.response.result,row.public.response.result];
   publicSafe(row.public.response.result);
   for(const result of results){
    assert.equal(result.resultType,t.review?'ESTIMATE_REQUIRES_REVIEW':'INSTANT_ESTIMATE_READY',JSON.stringify(result));
    if(!t.review){
     if(t.total!==undefined)assert.equal(Math.round(result.midEstimate*100),t.total);
     assert.equal(result.taxTreatment,t.input.businessDefaults.taxMode==='TAX_NONE'?'No tax added.':'Includes applicable tax.');
     if(t.decking){assert.doesNotMatch(JSON.stringify(result),/billed at|\$89\.00\/sheet/);assert.match(result.priceDrivers.join(' '),/decking.*per sheet.*confirmed on site/i);}
     if(t.mowing){assert.equal(result.priceUnit,'per visit');assert.ok(result.options.every(o=>o.priceUnit==='per visit'));}
     if(t.floor)assert.ok(result.lowEstimate*100>=t.total);
    }else assert.equal(result.midEstimate,undefined);
   }
   assert.deepEqual(results.map(r=>r.midEstimate),[results[0].midEstimate,results[0].midEstimate,results[0].midEstimate]);
   if(t.scopeKey){const status=await call('POST','/api/pricebook/validate',book);row.validation=status;const serviceStatus=status.services?.[0]||status.statuses?.[0];if(serviceStatus?.scopeCoverage)assert.equal(serviceStatus.scopeCoverage.find(c=>c.key===t.scopeKey).configurationComplete,!t.review);}
   if(t.fence){const unsupported=request();unsupported.customerInputs.fenceHeight=5.75;row.unoffered=await submit(false,unsupported);assert.equal(row.unoffered.response.result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(row.unoffered.response.result.midEstimate,undefined);}
   const retry=await app.request('POST',url,row.public.payload,undefined,headers);assert.equal(retry.status,200);assert.deepEqual(retry.result,row.public.response.result);row.retry=retry;
   row.passed=true;
  }catch(error){row.passed=false;row.error=String(error.stack);}
  console.log(JSON.stringify({name:row.name,passed:row.passed,error:row.error?.slice(0,1600)}));
 }
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
}finally{fs.writeFileSync(path.join(evidence,'application-results.json'),JSON.stringify({rows,liveProviderTraffic:false},null,2));db.close();await app.stop();}
const passed=rows.filter(r=>r.passed).length;console.log(JSON.stringify({passed,failed:rows.length-passed,total:rows.length}));process.exitCode=passed===rows.length?0:1;
