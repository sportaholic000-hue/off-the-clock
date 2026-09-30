import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {startApplication} from './application-harness.mjs';
import {mowingFixture} from './repair-fixture.mjs';
const [root,evidence]=process.argv.slice(2).map(v=>path.resolve(v));
const app=await startApplication(root,evidence,{port:4523}),require=createRequire(path.join(root,'package.json'));
const Database=require('better-sqlite3'),rows=[],ready='INSTANT_ESTIMATE_READY',review='ESTIMATE_REQUIRES_REVIEW';
let db;
try{
 const f=await mowingFixture(app,'clarification'),other=await mowingFixture(app,'clarification-other');
 db=new Database(path.join(evidence,'application.sqlite'));
 const saved=await f.read(),counts=()=>Object.fromEntries(['quotes','leads','quoteRequests','quoteSubmissions'].map(t=>[t,db.prepare('SELECT count(*) n FROM '+t+' WHERE ownerId=?').get(f.owner.id).n]));
 const normal=patch=>f.submission({intakeFlow:'job-details-v1',contact:{name:'[SYNTHETIC] Alex Smith',email:'synthetic@example.invalid'},location:{addressLine1:'[SYNTHETIC] 123 Example Street'},urgency:'flexible',...patch});
 const prepare=(body,channel='authenticated')=>app.request('POST',channel==='public'?f.url+'/prepare':'/api/quote/prepare',body,channel==='public'?null:f.owner.token,channel==='public'?f.headers:{});
 // Expected amounts are specified independently: 10,000 x $0.005 = $50;
 // the customer's corrected 12,000 x $0.005 = $60. All modifiers are neutral.
 const cases=[
  {name:'complete ordinary request',patch:{},price:50},
  {name:'optional name with phone callback',patch:{contact:{phone:'555-0123'}},price:50},
  {name:'courtesy note explicitly clarified as a message',patch:{context:'Thanks'},answers:{context:'message_only'},price:50},
  {name:'message wording is not a keyword whitelist',patch:{context:'Please send a copy of the estimate to my email.'},answers:{context:'message_only'},price:50},
  {name:'none clarified as no remaining unknown facts',patch:{explicitUnknowns:'none'},answers:{explicitUnknowns:'resolved'},price:50},
  {name:'customer resolves both questions',patch:{context:'Thank you.',explicitUnknowns:'No missing details.'},answers:{context:'message_only',explicitUnknowns:'resolved'},price:50},
  {name:'additional work remains unresolved',patch:{context:'Include hedge trimming and removal.'},answers:{context:'work_changes'}},
  {name:'measurement uncertainty remains unresolved',patch:{explicitUnknowns:'The area is not measured.'},answers:{explicitUnknowns:'still_unknown'}},
  {name:'unknown input is not waived by a clarification answer',patch:{explicitUnknowns:'I have the area now.',customerInputs:{...f.inputs,yardSqft:null}},answers:{explicitUnknowns:'resolved'}},
  {name:'unpriced selected extra is not waived',patch:{context:'Thanks',customerInputs:{...f.inputs,bagClippings:true}},answers:{context:'message_only'}},
  {name:'unsupported nested contact fields are not waived',patch:{context:'Thanks',contact:{name:'[SYNTHETIC] Alex Smith',email:'synthetic@example.invalid',moreWork:['hedges']}},answers:{context:'message_only'}},
  {name:'unsupported nested site fields are not waived',patch:{context:'Thanks',location:{addressLine1:'[SYNTHETIC] 123 Example Street',moreWork:['hedges']}},answers:{context:'message_only'}},
  {name:'unsupported unknowns shape is not interpreted',patch:{explicitUnknowns:{area:false}}},
 ];
 const retries=[];
 async function execute(c,channel,original){
  const body=original||normal(c.patch),before=counts(),initial=await prepare(body,channel==='public'?'public':'authenticated');
  assert.equal(initial.status,200,JSON.stringify(initial));assert.deepEqual(counts(),before);
  let submitted=body,details=initial;
  if(c.answers){
   assert.equal(initial.result.status,'needs_details');assert.equal(initial.result.confirmation,undefined);
   submitted={...body,intakeClarification:{receipt:initial.result.clarification.receipt,answers:c.answers}};
   details=await prepare(submitted,channel==='public'?'public':'authenticated');assert.equal(details.status,200,JSON.stringify(details));
  }
  assert.deepEqual(counts(),before,'Preparing and answering questions cannot save a quote or lead');
  const expected=c.price===undefined?review:ready;
  assert.equal(details.result.status,c.price===undefined?'needs_details':'ready',c.name);
  assert.equal(!!details.result.confirmation,c.price!==undefined);
  for(const preparation of [initial,details])for(const key of ['lowEstimate','midEstimate','highEstimate','options','ownerPricing','internalResult'])assert.equal(Object.hasOwn(preparation.result,key),false);
  submitted={...submitted,...(c.price===undefined?{reviewRequested:true}:{intakeConfirmation:details.result.confirmation})};
  if(channel==='preview')submitted={...submitted,revision:saved.revision};
  const response=await app.request('POST',channel==='preview'?'/api/pricebook/preview':channel==='public'?f.url:'/api/quote/calculate',submitted,channel==='public'?null:f.owner.token,channel==='public'?f.headers:{});
  assert.equal(response.status,channel==='preview'?200:201,JSON.stringify(response));assert.equal(response.result.resultType,expected,c.name);
  if(c.price!==undefined)for(const key of ['lowEstimate','midEstimate','highEstimate'])assert.equal(response.result[key],c.price);
  else for(const key of ['lowEstimate','midEstimate','highEstimate','options'])assert.equal(Object.hasOwn(response.result,key),false);
  const row={name:c.name,channel,original:body,initial,clarified:details,submitted,response,expectedPrice:c.price??null,passed:true};rows.push(row);
  if(channel==='preview'){assert.deepEqual(counts(),before);return row;}
  const receipt=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,submitted.requestId);
  assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),submitted);assert.deepEqual(JSON.parse(receipt.customerResponseJson),response.result);
  const internal=JSON.parse(receipt.internalOutcomeJson);assert.deepEqual(internal.originalSubmission,submitted);
  if(c.answers){assert.equal(internal.customerClarifications.length,Object.keys(c.answers).length);assert.ok(internal.customerClarifications.every(answer=>answer.question&&answer.answer));}
  if(expected===review){const lead=await f.call('GET','/api/leads/'+receipt.recordId);assert.deepEqual(lead.clarifications,internal.customerClarifications||[]);}
  row.receipt=receipt;
  const after=counts(),retry=await f.call('POST','/api/quote/calculate',submitted,200);assert.deepEqual(retry,response.result);assert.deepEqual(counts(),after);
  retries.push({submitted,response:response.result});return row;
 }
 for(const c of cases)for(const channel of ['public','authenticated','preview'])await execute(c,channel);
 for(const channel of ['public','authenticated','preview']){
  const original=normal({explicitUnknowns:'The entered area still needs measuring.'}),initial=await prepare(original);
  const corrected=normal({customerInputs:{...f.inputs,yardSqft:12000},explicitUnknowns:original.explicitUnknowns,previousIntake:{submission:original,receipt:initial.result.historyReceipt}});
  const row=await execute({name:'corrected measurement retains the earlier answer',answers:{explicitUnknowns:'resolved'},price:60},channel,corrected);
  assert.deepEqual(row.submitted.previousIntake.submission,original);assert.equal(row.submitted.customerInputs.yardSqft,12000);
 }
 const body=normal({context:'Thanks'}),preparation=await prepare(body),before=counts();
 const clarified={...body,intakeClarification:{receipt:preparation.result.clarification.receipt,answers:{context:'message_only'}}};
 for(const request of [
  {...clarified,intakeClarification:{answers:{context:'message_only'}}},
  {...clarified,intakeClarification:{...clarified.intakeClarification,answers:{context:'message_only',unknown:'resolved'}}},
  {...clarified,context:'Changed request'},
  {...clarified,customerInputs:{...f.inputs,yardSqft:12000}},
  {...clarified,intakeClarification:{...clarified.intakeClarification,receipt:{...clarified.intakeClarification.receipt,signature:'0'.repeat(64)}}},
  {...body,previousIntake:{submission:{...body,context:'Changed past answer'},receipt:preparation.result.historyReceipt}}
 ]){const response=await prepare(request);assert.equal(response.status,409);assert.deepEqual(counts(),before);rows.push({name:'Changed or forged clarification/history is editable and saves nothing',request,response,passed:true});}
 const foreign=await app.request('POST',other.url+'/prepare',clarified,null,other.headers);assert.equal(foreign.status,409);rows.push({name:'Clarification cannot cross tenants',request:clarified,response:foreign,passed:true});
 const unconfirmed=await app.request('POST','/api/quote/calculate',clarified,f.owner.token);assert.equal(unconfirmed.status,409);assert.deepEqual(counts(),before);rows.push({name:'Answering a question cannot skip the final current-details confirmation',request:clarified,response:unconfirmed,passed:true});
 const current=await f.read();current.services[0].pricing.mowingBaseRatePerSqft=.01;await f.call('POST','/api/pricebook/save',current);
 const stale=await prepare(clarified);assert.equal(stale.status,409);assert.deepEqual(counts(),before);
 const unapproved=await prepare(normal({}));assert.equal(unapproved.result.status,'needs_details');
 rows.push({name:'Changed pricing invalidates pending clarification and still requires owner approval',stale,unapproved,passed:true});
 const endCounts=counts();db.close();db=null;await app.restart();db=new Database(path.join(evidence,'application.sqlite'));
 for(const row of retries)assert.deepEqual(await f.call('POST',f.url,row.submitted,200,null,f.headers),row.response);
 assert.deepEqual(counts(),endCounts);rows.push({name:'Clarified original requests and responses survive restart and exact retry',passed:true});
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,checks:rows.length,rows,limitation:'Customer answers are explicit clarification, not automatic prose interpretation. Existing mixed-purpose name/address concern is not closed by these tests.'},null,2));
 console.log(JSON.stringify({passed:true,checks:rows.length,normalPrice:50,correctedPrice:60,originalDetails:'preserved',scope:'Clarification and correction workflows only'},null,2));
}catch(error){fs.writeFileSync(path.join(evidence,'failed-results.json'),JSON.stringify({passed:false,rows,error:String(error.stack)},null,2));throw error;}
finally{if(db)db.close();await app.stop();}
