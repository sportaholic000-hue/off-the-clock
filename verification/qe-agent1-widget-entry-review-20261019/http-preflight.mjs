// Supplemental fixture/expectation check only. This is not browser evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {serviceApplication} from './application.mjs';
import {CASES,fixtures,ADDITIONAL} from './cases.mjs';
const root=process.cwd(),out=path.resolve(process.argv[2]);assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=fixtures(),results=[];let cursor=0;
await Promise.all(Array.from({length:2},async()=>{while(cursor<CASES.length){
 const spec=CASES[cursor++],dir=path.join(out,spec.type);fs.mkdirSync(dir);let app;
 try{
  app=await serviceApplication(root,dir,spec.type,f.get(spec.type),f.get('CUSTOM').businessDefaults);
  const inputs=Object.fromEntries(Object.entries(f.get(spec.type).customerInputs).filter(([key])=>app.catalog.customerFields.some(field=>field.name===key)));
  for(const mobile of [false,true]){
   const view=mobile?'mobile-scope':'desktop-scope',body={requestId:crypto.randomUUID(),serviceId:app.catalog.id,serviceRequest:app.catalog.name,customerInputs:structuredClone(inputs),customerFeeSelections:{},additionalWork:mobile?[ADDITIONAL]:[],contact:{email:'synthetic-widget-preflight@example.invalid'},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'};
   async function check(stage,fn){const row={type:spec.type,view,stage};try{await fn(row);row.status='passed';}catch(error){row.status='failed';row.error=error.stack;}results.push(row);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({type:row.type,view,stage,status:row.status,error:row.error}));}
   await check('required',async row=>{const missing=structuredClone(body);delete missing.customerInputs[spec.required];const before=app.counts();row.result=await app.app.request(app.publicPath+'/prepare',{method:'POST',body:missing,publicRequest:true});assert.equal(row.result.status,200);assert.equal(row.result.body.status,'needs_details');assert.deepEqual(app.counts(),before);});
   let original;
   await check('valid',async row=>{row.prepare=await app.app.request(app.publicPath+'/prepare',{method:'POST',body,publicRequest:true});assert.equal(row.prepare.status,200);assert.equal(row.prepare.body.status,'ready');const submitted={...body,intakeConfirmation:row.prepare.body.confirmation};row.result=await app.app.request(app.publicPath,{method:'POST',body:submitted,publicRequest:true});assert.equal(row.result.status,201);assert.equal(row.result.body.resultType,mobile?'PARTIAL_ESTIMATE_READY':'INSTANT_ESTIMATE_READY');const receipt=app.receipt(body.requestId),quote=app.quote(receipt);original={body:submitted,response:row.result.body,receipt,quote};row.original=original;const internal=JSON.parse(receipt.internalOutcomeJson).internalResult;assert.deepEqual((internal.options?.length?internal.options:[internal]).map(o=>o.calculationRecord.scenarios.mid.finalTotalCents),[spec.cents]);});
   await check('replay',async row=>{assert.ok(original);const before=app.counts();row.result=await app.app.request(app.publicPath,{method:'POST',body:original.body,publicRequest:true});assert.equal(row.result.status,200);assert.deepEqual(row.result.body,original.response);assert.deepEqual(app.receipt(body.requestId),original.receipt);assert.deepEqual(app.quote(original.receipt),original.quote);assert.deepEqual(app.counts(),before);assert.deepEqual(await app.api('GET','/api/pricebook/'+app.owner),app.approved);});
  }
 }catch(error){results.push({type:spec.type,stage:'setup',status:'failed',error:error.stack});}finally{await app?.stop();}
}}));
const failed=results.filter(r=>r.status!=='passed').length;fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({scope:'HTTP only; not rendered execution',cases:results.length,passed:results.length-failed,failed},null,2));if(failed)process.exitCode=1;
