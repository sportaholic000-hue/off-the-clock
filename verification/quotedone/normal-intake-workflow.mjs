import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {startApplication} from './application-harness.mjs';
import {mowingFixture} from './repair-fixture.mjs';
const [root,evidence]=process.argv.slice(2).map(v=>path.resolve(v));
const app=await startApplication(root,evidence,{port:4515}),require=createRequire(path.join(root,'package.json'));
const Database=require('better-sqlite3'),rows=[],ready='INSTANT_ESTIMATE_READY',review='ESTIMATE_REQUIRES_REVIEW';
let db;
try{
 const f=await mowingFixture(app,'normal-intake'),other=await mowingFixture(app,'normal-intake-other');
 db=new Database(path.join(evidence,'application.sqlite'));
 const saved=await f.read(),counts=()=>Object.fromEntries(['quotes','leads','quoteRequests','quoteSubmissions'].map(t=>[t,db.prepare('SELECT count(*) n FROM '+t+' WHERE ownerId=?').get(f.owner.id).n]));
 const normal=patch=>f.submission({intakeFlow:'job-details-v1',contact:{name:'[SYNTHETIC] Alex Smith',email:'synthetic@example.invalid',phone:'+1 (902) 555-0123'},location:{addressLine1:'[SYNTHETIC] 123 Example Street',city:'Example City',region:'NS',postalCode:'B3H 0A1',country:'CA'},urgency:'flexible',...patch});
 const prepare=(body,channel='authenticated')=>app.request('POST',channel==='public'?f.url+'/prepare':'/api/quote/prepare',body,channel==='public'?null:f.owner.token,channel==='public'?f.headers:{});
 const cases=[
  {name:'ordinary name site and timing',patch:{},expected:ready},
  {name:'service wording differs only in case',patch:{serviceRequest:saved.services[0].service.toLowerCase()},expected:ready},
  {name:'different service wording still needs clarification',patch:{serviceRequest:'mowing'},expected:review},
  {name:'email contact with ordinary name',patch:{contact:{name:'[SYNTHETIC] Alex Smith',email:'synthetic@example.invalid'}},expected:ready},
  {name:'phone contact with ordinary name',patch:{contact:{name:'[SYNTHETIC] Alex Smith',phone:'555-0123'}},expected:ready},
  {name:'name is optional callback is sufficient',patch:{contact:{phone:'555-0123'}},expected:ready},
  {name:'request timing contact without a surcharge or booking',patch:{urgency:'contact_requested'},expected:ready},
  {name:'additional requested work',patch:{context:'Include hedge trimming and removal in this estimate.'},expected:review},
  {name:'uncertain measurement despite entered number',patch:{explicitUnknowns:'The 10000 square feet is a guess.'},expected:review},
  {name:'missing measured area',patch:{customerInputs:{...f.inputs,yardSqft:null}},expected:review},
  {name:'unpriced selected bagging',patch:{customerInputs:{...f.inputs,bagClippings:true}},expected:review},
  {name:'unknown structured measurement member',patch:{customerInputs:{...f.inputs,instructions:'Additional work'}},expected:review},
  {name:'unknown fee-selection member',patch:{customerFeeSelections:{additionalWork:true}},expected:review},
  {name:'unexpected nested contact work',patch:{contact:{name:'[SYNTHETIC] Alex Smith',email:'synthetic@example.invalid',additionalServices:['hedge removal']}},expected:review},
  {name:'unexpected nested location work',patch:{location:{addressLine1:'[SYNTHETIC] 123 Example Street',additionalServices:['hedge removal']}},expected:review},
  {name:'mixed prose location is not converted',patch:{location:'[SYNTHETIC] 123 Example Street. Include hedge removal.'},expected:review},
  {name:'free text urgency is not converted',patch:{urgency:'Please call today. The 10000 square feet is a guess.'},expected:review},
  {name:'invalid alternate callback text',patch:{contact:{name:'[SYNTHETIC] Alex Smith',email:'synthetic@example.invalid',phone:'Include additional work'}},status:422},
  {name:'client confirmation flag cannot clear unknowns',patch:{scopeConfirmed:true,explicitUnknowns:['area']},expected:review}
 ];
 const retries=[];
 for(const c of cases)for(const channel of ['public','authenticated','preview']){
  const body=normal(c.patch),before=counts(),preparation=await prepare(body,channel==='public'?'public':'authenticated');
  if(c.status){assert.equal(preparation.status,c.status);assert.deepEqual(counts(),before);assert.equal(preparation.result.confirmation,undefined);rows.push({name:c.name,channel,original:body,preparation,passed:true});continue;}
  assert.equal(preparation.status,200,JSON.stringify(preparation));const details=preparation.result;
  assert.equal(details.status,c.expected===ready?'ready':'needs_details',c.name);
  assert.equal(!!details.confirmation,c.expected===ready);
  for(const key of ['lowEstimate','midEstimate','highEstimate','options','internalResult','ownerPricing','bookSnapshot'])assert.equal(Object.hasOwn(details,key),false);
  assert.deepEqual(details.summary.contact,body.contact);assert.deepEqual(details.summary.location,body.location);
  assert.deepEqual(details.summary.unknowns,body.explicitUnknowns??'');assert.deepEqual(details.summary.additionalDetails,body.context??'');
  assert.deepEqual(counts(),before,'Preparation cannot save records');assert.deepEqual(await f.read(),saved);
  const submitted=c.expected===ready?{...body,intakeConfirmation:details.confirmation}:{...body,reviewRequested:true};
  const request=channel==='preview'?{...submitted,revision:saved.revision}:submitted;
  const response=await app.request('POST',channel==='preview'?'/api/pricebook/preview':channel==='public'?f.url:'/api/quote/calculate',request,channel==='public'?null:f.owner.token,channel==='public'?f.headers:{});
  assert.equal(response.status,channel==='preview'?200:201,JSON.stringify(response));
  assert.equal(response.result.resultType,c.expected,c.name);
  if(c.expected===ready)for(const key of ['lowEstimate','midEstimate','highEstimate'])assert.equal(response.result[key],50);
  else for(const key of ['lowEstimate','midEstimate','highEstimate','options'])assert.equal(Object.hasOwn(response.result,key),false);
  const row={name:c.name,channel,original:body,preparation,submitted:request,response,expected:c.expected,passed:true};rows.push(row);
  if(channel==='preview'){assert.deepEqual(counts(),before);continue;}
  const receipt=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,submitted.requestId);
  assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),submitted);assert.deepEqual(JSON.parse(receipt.customerResponseJson),response.result);
  const internal=JSON.parse(receipt.internalOutcomeJson);assert.deepEqual(internal.originalSubmission,submitted);assert.equal(internal.bookRevision,saved.revision);
  row.receipt=receipt;
  if(c.expected===review){const lead=await f.call('GET','/api/leads/'+receipt.recordId);for(const key of ['contact','location','urgency','context','explicitUnknowns'])assert.deepEqual(lead[key],submitted[key]??null);}
  const after=counts(),retry=await f.call('POST','/api/quote/calculate',submitted,200);assert.deepEqual(retry,response.result);assert.deepEqual(counts(),after);
  await f.call('POST','/api/quote/calculate',{...submitted,context:'Changed requested work'},409);assert.deepEqual(counts(),after);
  if(channel==='authenticated'&&(c.name==='ordinary name site and timing'||c.name==='additional requested work'))retries.push({submitted,response:response.result});
 }
 // A version marker, guessed signature or cached client summary cannot produce a price.
 const body=normal({}),preparation=await prepare(body),signed={...body,intakeConfirmation:preparation.result.confirmation},before=counts();
 const tampering=[
  {...body},
  {...signed,intakeConfirmation:{...signed.intakeConfirmation,signature:'0'.repeat(64)}},
  {...signed,customerInputs:{...f.inputs,yardSqft:20000}},
  {...signed,context:'Include extra work'},
  {...signed,explicitUnknowns:['area']},
  {...signed,location:{...body.location,city:'Changed city'}},
  {...signed,contact:{...body.contact,name:'Changed name'}},
  {...signed,urgency:'contact_requested'},
  {...signed,intakeConfirmation:{...signed.intakeConfirmation,additionalWork:'Extra work'}}
 ];
 for(const request of tampering){const response=await app.request('POST','/api/quote/calculate',request,f.owner.token);assert.equal(response.status,409);assert.deepEqual(counts(),before);rows.push({name:'Edited or forged summary cannot submit',request,response,passed:true});}
 const foreign=await app.request('POST',other.url,signed,null,other.headers);assert.equal(foreign.status,409);assert.deepEqual(counts(),before);rows.push({name:'Summary cannot cross tenants',request:signed,response:foreign,passed:true});
 const accepted=await f.call('POST','/api/quote/calculate',signed,201);assert.equal(accepted.midEstimate,50);
 // Missing contact rejects before preparation writes; an ordinary name alone is insufficient.
 const missing=normal({contact:{name:'[SYNTHETIC] Alex Smith'}}),missingBefore=counts(),bad=await prepare(missing);
 assert.equal(bad.status,422);assert.deepEqual(counts(),missingBefore);rows.push({name:'Missing callback is editable without saved records',request:missing,response:bad,passed:true});
 const pendingBody=normal({}),pendingPreparation=await prepare(pendingBody),oldSigned={...pendingBody,intakeConfirmation:pendingPreparation.result.confirmation};
 const revised=await f.read();revised.services[0].pricing.mowingBaseRatePerSqft=.01;
 await f.call('POST','/api/pricebook/save',revised);
 const stale=await app.request('POST','/api/quote/calculate',oldSigned,f.owner.token);assert.equal(stale.status,409);
 const unapproved=await prepare(normal({}));assert.equal(unapproved.result.status,'needs_details');assert.equal(unapproved.result.confirmation,undefined);
 await f.approve();const currentBody=normal({}),current=await prepare(currentBody),currentSigned={...currentBody,intakeConfirmation:current.result.confirmation};
 const changedPrice=await f.call('POST','/api/quote/calculate',currentSigned,201);assert.equal(changedPrice.midEstimate,100);
 assert.deepEqual(await f.call('POST','/api/quote/calculate',signed,200),accepted);
 rows.push({name:'Changed price requires current approval and a fresh summary; old receipt stays $50',stale,unapproved,current,changedPrice,oldReceipt:accepted,passed:true});
 const restartCounts=counts(),currentBook=await f.read();db.close();db=null;await app.restart();db=new Database(path.join(evidence,'application.sqlite'));
 for(const r of retries)assert.deepEqual(await f.call('POST',f.url,r.submitted,200,null,f.headers),r.response);
 assert.deepEqual(counts(),restartCounts);
 const login=await f.call('POST','/api/auth/login',{email:f.owner.email,password:f.owner.password},200,null);assert.deepEqual(await f.call('GET','/api/pricebook/'+f.owner.id,undefined,200,login.token),currentBook);
 const lead=db.prepare('SELECT id FROM leads WHERE ownerId=? LIMIT 1').get(f.owner.id);
 await f.call('GET','/api/leads/'+lead.id,undefined,404,other.owner.token);
 db.prepare("UPDATE users SET plan='Operator' WHERE id=?").run(other.owner.id);
 assert.equal((await app.request('POST','/api/quote/prepare',normal({}),other.owner.token)).status,403);
 assert.equal((await app.request('POST',other.url+'/prepare',normal({}),null,other.headers)).status,403);
 rows.push({name:'Persistence, other-tenant privacy and preparation plan permissions preserved',passed:true});
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,checks:rows.length,rows},null,2));
 console.log(JSON.stringify({passed:true,checks:rows.length,normalCustomerDetails:'Named, addressed requests quote $50; callback-only and phone-only remain supported',persistence:'Exact original bodies and outcomes persist through retries, price change and restart'},null,2));
}catch(error){fs.writeFileSync(path.join(evidence,'failed-results.json'),JSON.stringify({passed:false,rows,error:String(error.stack)},null,2));throw error;}
finally{if(db)db.close();await app.stop();}
