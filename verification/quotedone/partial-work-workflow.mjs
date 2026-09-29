import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const [rootArg,evidenceArg,mode]=process.argv.slice(2),root=path.resolve(rootArg),evidence=path.resolve(evidenceArg),before=mode==='before';
const {startApplication}=await import(pathToFileURL(path.join(root,'verification/quotedone/application-harness.mjs')));
const {mowingFixture}=await import(pathToFileURL(path.join(root,'verification/quotedone/repair-fixture.mjs')));
const app=await startApplication(root,evidence,{port:4533}),require=createRequire(path.join(root,'package.json')),Database=require('better-sqlite3'),rows=[];let db;
const ready='INSTANT_ESTIMATE_READY',partial='PARTIAL_ESTIMATE_READY',review='ESTIMATE_REQUIRES_REVIEW';
try{
 fs.copyFileSync(fileURLToPath(import.meta.url),path.join(evidence,'executed-test.mjs'));
 const f=await mowingFixture(app,'partial-work');db=new Database(path.join(evidence,'application.sqlite'));
 const normal=patch=>f.submission({intakeFlow:'job-details-v1',contact:{name:'[SYNTHETIC] Alex Smith',email:'synthetic@example.invalid'},location:{addressLine1:'[SYNTHETIC] 123 Example Street'},urgency:'flexible',...patch});
 const counts=()=>Object.fromEntries(['quotes','leads','quoteRequests','quoteSubmissions'].map(table=>[table,db.prepare('SELECT count(*) n FROM '+table+' WHERE ownerId=?').get(f.owner.id).n]));
 const prepare=(body,channel)=>app.request('POST',channel==='public'?f.url+'/prepare':'/api/quote/prepare',body,channel==='public'?null:f.owner.token,channel==='public'?f.headers:{});
 const cases=[
  {name:'Complete named/addressed control',patch:{},type:ready,price:50},
  {name:'Separate hedge removal retains the mowing estimate',patch:{additionalWork:['[SYNTHETIC] Remove the hedge along the driveway.']},type:partial,price:50},
  {name:'Arbitrary additional description is not a keyword filter',patch:{additionalWork:['[SYNTHETIC] Relocate the old play structure.','[SYNTHETIC] Assess the garden wall.']},type:partial,price:50},
  ...(!before?[
   {name:'Context clarified as separate additional work',patch:{context:'[SYNTHETIC] Remove the hedge along the driveway.'},answers:{context:'additional_work'},type:partial,price:50},
   {name:'Complete description retained with selected-service-only estimate',patch:{serviceRequest:'[SYNTHETIC] Mowing and removal of the hedge.'},answers:{serviceRequest:'additional_work'},type:partial,price:50},
   {name:'A change to the selected job still needs correction',patch:{context:'[SYNTHETIC] The selected mowing area is wrong.',additionalWork:['Remove the hedge.']},answers:{context:'work_changes'},type:review},
   {name:'Unknown main measurement is not waived by separate work',patch:{customerInputs:{...f.inputs,yardSqft:null},additionalWork:['Remove the hedge.']},type:review},
   {name:'Explicit main uncertainty is not waived',patch:{explicitUnknowns:'The mowing area is still unknown.',additionalWork:['Remove the hedge.']},answers:{explicitUnknowns:'still_unknown'},type:review},
   {name:'Unpriced selected engine scope is not silently removed',patch:{customerInputs:{...f.inputs,bagClippings:true},additionalWork:['Remove the hedge.']},type:review},
   {name:'Unsupported nested additional-work shape is retained for review',patch:{additionalWork:[{description:'Remove the hedge.',rate:10}]},type:review},
   {name:'Unexpected nested contact work is not silently discarded',patch:{contact:{email:'synthetic@example.invalid',extra:{work:'Remove the hedge.'}},additionalWork:['Assess the wall.']},type:review},
  ]:[])
 ];
 const retries=[];
 async function execute(c,channel){
  const body=normal(c.patch),initialCounts=counts(),initial=await prepare(body,channel);assert.equal(initial.status,200,JSON.stringify(initial));assert.deepEqual(counts(),initialCounts);
  let submitted=body,checked=initial;
  if(c.answers){submitted={...body,intakeClarification:{receipt:initial.result.clarification.receipt,answers:c.answers}};checked=await prepare(submitted,channel);assert.equal(checked.status,200,JSON.stringify(checked));}
  const expected=before&&c.type===partial?review:c.type;
  assert.equal(checked.result.status,expected===review?'needs_details':'ready',c.name);
  for(const key of ['midEstimate','options','pricedEstimate'])assert.equal(Object.hasOwn(checked.result,key),false);
  submitted={...submitted,...(expected===review?{reviewRequested:true}:{intakeConfirmation:checked.result.confirmation})};
  if(channel==='preview')submitted.revision=(await f.read()).revision;
  const response=await app.request('POST',channel==='preview'?'/api/pricebook/preview':channel==='public'?f.url:'/api/quote/calculate',submitted,channel==='public'?null:f.owner.token,channel==='public'?f.headers:{});
  assert.equal(response.status,channel==='preview'?200:201,JSON.stringify(response));assert.equal(response.result.resultType,expected,c.name);
  if(expected===ready)assert.equal(response.result.midEstimate,c.price);
  if(expected===partial){
   for(const key of ['lowEstimate','midEstimate','highEstimate','options'])assert.equal(Object.hasOwn(response.result,key),false,'No overall job amount');
   for(const key of ['lowEstimate','midEstimate','highEstimate'])assert.equal(response.result.pricedEstimate[key],c.price);
   assert.equal(response.result.fullJobTotal,null);assert.equal(response.result.additionalWorkStatus,'ON_SITE_ESTIMATE_REQUIRED');
   assert.equal(response.result.pricedScope.serviceId,f.id);assert.equal(response.result.pricedScope.facts.find(item=>item.value==='10000')?.value,'10000');
   assert.deepEqual(response.result.additionalWork.map(item=>item.description),c.patch.additionalWork||[c.patch.context||c.patch.serviceRequest]);
   assert.match(response.result.customerMessage,/on site/);assert.match(response.result.customerMessage,/not included/);
   assert.deepEqual(response.result.submittedDetails.contact,body.contact);assert.deepEqual(response.result.submittedDetails.location,body.location);
   if(channel!=='preview'){
    const walk=value=>{if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){assert.ok(!['ownerPricing','bookSnapshot','internalResult','lineItems','approvedValues'].includes(key),key);walk(child);}};walk(response.result);
   }
  }
  if(expected===review)for(const key of ['midEstimate','options','pricedEstimate'])assert.equal(Object.hasOwn(response.result,key),false);
  const row={name:c.name,channel,policy:before?'before-owner-ruling-implementation':'approved-separate-work-policy',body,initial,checked,submitted,response,expected,passed:true};rows.push(row);
  if(channel==='preview'){assert.deepEqual(counts(),initialCounts);return row;}
  const receipt=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,submitted.requestId);
  assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),submitted);assert.deepEqual(JSON.parse(receipt.customerResponseJson),response.result);row.receipt=receipt;
  const internal=JSON.parse(receipt.internalOutcomeJson);assert.deepEqual(internal.originalSubmission,submitted);
  if(expected===review&&Object.hasOwn(submitted,'additionalWork')){
   const viewed=await f.call('GET','/api/leads/'+receipt.recordId);assert.deepEqual(viewed.submittedAdditionalWork,submitted.additionalWork);assert.equal(viewed.linkedQuoteId,undefined);
   if(Array.isArray(submitted.additionalWork)&&submitted.additionalWork.every(item=>typeof item==='string'))assert.deepEqual(viewed.additionalWork.map(item=>item.description),submitted.additionalWork);
   row.leadView=viewed;
  }
  if(expected===partial){
   const quote=db.prepare('SELECT * FROM quotes WHERE ownerId=? AND id=?').get(f.owner.id,receipt.recordId),lead=db.prepare('SELECT * FROM leads WHERE ownerId=? AND id=?').get(f.owner.id,receipt.recordId);
   assert.equal(quote.status,'PARTIAL');assert.equal(lead.type,'additional_work');assert.equal(JSON.parse(lead.collectedInputsJson).linkedQuoteId,quote.id);
   const viewed=await f.call('GET','/api/leads/'+lead.id);assert.deepEqual(viewed.additionalWork,response.result.additionalWork);assert.equal(viewed.linkedQuoteId,quote.id);row.quote=quote;row.lead=lead;row.leadView=viewed;
  }
  const savedCounts=counts(),retry=await f.call('POST','/api/quote/calculate',submitted,200);assert.deepEqual(retry,response.result);assert.deepEqual(counts(),savedCounts);retries.push({submitted,response:response.result});return row;
 }
 for(const c of cases)for(const channel of ['public','authenticated','preview'])await execute(c,channel);
 if(!before){
  const partialRow=rows.find(row=>row.channel==='public'&&row.expected===partial),foreign=await app.owner('partial-work-foreign'),bcrypt=require('bcrypt');
  const staff={id:crypto.randomUUID(),email:'synthetic-partial-staff@example.invalid',password:crypto.randomBytes(18).toString('hex')};
  db.prepare('INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(staff.id,f.owner.id,staff.email,await bcrypt.hash(staff.password,12),'Synthetic','Synthetic staff','QuoteDone','trialing','staff',new Date().toISOString());
  const login=await app.request('POST','/api/auth/login',{email:staff.email,password:staff.password});assert.equal(login.status,200);
  const staffLead=await app.request('GET','/api/leads/'+partialRow.receipt.recordId,undefined,login.result.token),staffQuotes=await app.request('GET','/api/quotes',undefined,login.result.token);
  assert.equal(staffLead.status,200);assert.deepEqual(staffLead.result.additionalWork,partialRow.response.result.additionalWork);assert.equal(staffLead.result.internal,undefined);assert.equal(staffLead.result.estimate,undefined);
  assert.equal(staffQuotes.status,200);assert.deepEqual(staffQuotes.result.quotes.find(row=>row.id===partialRow.receipt.recordId).result,partialRow.response.result);assert.ok(staffQuotes.result.quotes.every(row=>row.internal===undefined));
  const reviewRow=rows.find(row=>row.channel==='public'&&row.name==='Unknown main measurement is not waived by separate work'),staffReviewLead=await app.request('GET','/api/leads/'+reviewRow.receipt.recordId,undefined,login.result.token);
  assert.equal(staffReviewLead.status,200);assert.deepEqual(staffReviewLead.result.submittedAdditionalWork,reviewRow.body.additionalWork);assert.deepEqual(staffReviewLead.result.additionalWork.map(item=>item.description),reviewRow.body.additionalWork);assert.equal(staffReviewLead.result.linkedQuoteId,undefined);assert.equal(staffReviewLead.result.internal,undefined);
  const foreignLead=await app.request('GET','/api/leads/'+partialRow.receipt.recordId,undefined,foreign.token),foreignQuotes=await app.request('GET','/api/quotes',undefined,foreign.token);assert.equal(foreignLead.status,404);assert.deepEqual(foreignQuotes.result.quotes,[]);
  const changedRetry=await app.request('POST','/api/quote/calculate',{...partialRow.submitted,additionalWork:['Changed work']},f.owner.token);assert.equal(changedRetry.status,409);
  db.prepare('UPDATE users SET plan=? WHERE id=?').run('Operator',f.owner.id);
  const gated=await app.request('POST','/api/quote/calculate',normal({additionalWork:['Remove hedge.']}),login.result.token),crm=await app.request('GET','/api/leads/'+partialRow.receipt.recordId,undefined,login.result.token);assert.equal(gated.status,403);assert.equal(crm.status,200);assert.equal(crm.result.estimate,undefined);assert.equal(crm.result.internal,undefined);
  db.prepare('UPDATE users SET plan=? WHERE id=?').run('QuoteDone',f.owner.id);
  rows.push({name:'Partial quote and linked lead preserve staff privacy, tenant boundaries, retry identity and plan gating',staffLead,staffReviewLead,staffQuotes,foreignLead,foreignQuotes,changedRetry,gated,crm,passed:true});
  const book=await f.read();book.services[0].pricing.edgingPerLinearFoot=2;await f.call('POST','/api/pricebook/save',book);await f.approve();
  // Independent expected value: 10,000 sqft x $0.005 + 10 LF x $2 = $70.
  for(const channel of ['public','authenticated','preview'])await execute({name:'Configured selected extra is priced; separate work remains unpriced',patch:{customerInputs:{...f.inputs,edgingIncluded:true,edgingLengthLF:10},additionalWork:['[SYNTHETIC] Remove the hedge.']},type:partial,price:70},channel);
  const body=normal({additionalWork:['[SYNTHETIC] Remove the hedge.']}),details=await prepare(body,'authenticated'),submitted={...body,intakeConfirmation:details.result.confirmation},initialCounts=counts();
  db.exec("CREATE TRIGGER synthetic_additional_work_failure BEFORE INSERT ON leads WHEN NEW.type='additional_work' BEGIN SELECT RAISE(ABORT,'[SYNTHETIC] additional work save failure'); END;");
  const failed=await app.request('POST','/api/quote/calculate',submitted,f.owner.token);assert.equal(failed.status,500);assert.deepEqual(counts(),initialCounts);
  db.exec('DROP TRIGGER synthetic_additional_work_failure');
  const recovered=await f.call('POST','/api/quote/calculate',submitted,201);assert.equal(recovered.resultType,partial);assert.equal(counts().quotes,initialCounts.quotes+1);assert.equal(counts().leads,initialCounts.leads+1);
  const post=counts();assert.deepEqual(await f.call('POST','/api/quote/calculate',submitted,200),recovered);assert.deepEqual(counts(),post);
  rows.push({name:'Quote and additional-work lead commit together; failed save is safely retryable',submitted,failed,recovered,initialCounts,finalCounts:post,passed:true});
  const finalCounts=counts();db.close();db=null;await app.restart();db=new Database(path.join(evidence,'application.sqlite'));
  for(const retry of retries)assert.deepEqual(await f.call('POST',f.url,retry.submitted,200,null,f.headers),retry.response);assert.deepEqual(counts(),finalCounts);
  rows.push({name:'Partial responses and both records survive restart and exact retry',passed:true});
 }
 const result={passed:true,mode:before?'before-characterization':'after-verification',checks:rows.length,verificationSha256:crypto.createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),rows};fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,mode:result.mode,checks:rows.length}));
}catch(error){fs.writeFileSync(path.join(evidence,'failed-results.json'),JSON.stringify({passed:false,rows,error:String(error.stack)},null,2));throw error;}
finally{if(db)db.close();await app.stop();}
