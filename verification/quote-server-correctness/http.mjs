import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.resolve(process.argv[2]||'verification-output/quote-server-correctness');
fs.mkdirSync(output,{recursive:true});
const store=fs.mkdtempSync(path.join(output,'synthetic-store-'));
const fromRoot=p=>pathToFileURL(path.join(root,p)).href;
Object.assign(process.env,{NODE_ENV:'test',PORT:'4513',JWT_SECRET:crypto.randomBytes(40).toString('hex'),DATABASE_PATH:path.join(store,'synthetic.sqlite'),PRICEBOOK_PATH:path.join(store,'pricebooks'),EMAIL_PROVIDER:'console',LOCAL_PREVIEW:'false',ALLOW_PROVIDER_WRITES:'false',TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),TWILIO_API_KEY_SECRET:'SYNTHETIC-FIXTURE-ONLY',GEMINI_API_KEY:'SYNTHETIC-TEST-KEY',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',DOTENV_CONFIG_PATH:path.join(store,'absent.env'),BOOKING_SLOT_TOKEN_SECRET:crypto.randomBytes(40).toString('hex')});
const nativeFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{
 if(!String(input).startsWith('http://127.0.0.1:4513/'))throw Error('Synthetic harness blocked external traffic');
 return nativeFetch(input,init);
};
const {httpServer}=await import(fromRoot('server/src/server.js'));
const {db}=await import(fromRoot('server/src/db.js'));
const {mowing}=await import(fromRoot('verification/engine-independent/fixtures.mjs'));
const {measuredScopeCases}=await import(fromRoot('test/measuredScopeFixtures.mjs'));
const {convertApplicationBook}=await import(fromRoot('server/src/quoteDoneBridge.js'));
const {loadPricebook}=await import(fromRoot('server/priceBookService.js'));
const {getBusinessProfile}=await import(fromRoot('server/src/onboardingService.js'));
let ownerId,token;
const results={baseCommit:'c2e9efcdcc4aaca4a7b8f610e4cdf792cb135010',sourceBinding:'base plus source-manifest.json changes',runtime:process.version,requests:[],checks:[]};
async function call(method,url,body,expected=200,{publicRequest=false,headers={}}={}){
 const response=await fetch('http://127.0.0.1:4513'+url,{method,headers:{'content-type':'application/json',...(!publicRequest&&token?{Authorization:'Bearer '+token}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json();
 results.requests.push({method,url:url.replace(/\/api\/public\/quote\/[^/]+/,'/api/public/quote/[SYNTHETIC]'),status:response.status});
 assert.equal(response.status,expected,JSON.stringify({url,data}));return data;
}
const totals=q=>({resultType:q.resultType,low:q.lowEstimate,mid:q.midEstimate,high:q.highEstimate});
try{
 const email='quote-server-'+crypto.randomUUID()+'@example.invalid',password=crypto.randomBytes(24).toString('hex');
 const account=await call('POST','/api/auth/register',{email,password,firstName:'Synthetic',businessName:'[SYNTHETIC] Quote Server',plan:'QuoteDone'},201);
 ownerId=account.account.id;const now=new Date().toISOString();
 // Entitlement is seeded only for this isolated synthetic account, without provider calls.
 db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(ownerId,'cus_SYNTHETIC_'+ownerId,now,now,now);
 db.prepare("UPDATE users SET plan='QuoteDone',planStatus='active',emailVerifiedAt=? WHERE id=?").run(now,ownerId);
 token=(await call('POST','/api/auth/login',{email,password})).token;
 const lawn=mowing(),slab=measuredScopeCases().find(x=>x.id==='exposed-itemized').input;
 lawn.ownerPricing.feeRules.travel='owner_selected';lawn.ownerPricing.ownerFeeSelections={travel:false};lawn.businessDefaults.travelFee=5000;
 slab.customerInputs.accessDifficulty='difficult';
 for(const f of [lawn,slab])delete f.ownerPricing.origin;
 let book=await call('GET','/api/pricebook/'+ownerId);
 const configured=convertApplicationBook({services:[lawn.ownerPricing,slab.ownerPricing],defaults:lawn.businessDefaults},'toDollars');
 book={...book,...configured};
 const read=()=>call('GET','/api/pricebook/'+ownerId);
 let approvalStatuses;
 async function save(next){await call('POST','/api/pricebook/save',next);return read();}
 async function approve(id){const response=await call('POST','/api/pricebook/services/'+id+'/approve',{revision:book.revision,confirmConfiguration:true,confirmLegacySettings:true});approvalStatuses=response.statuses;book.revision=response.revision;book=await read();}
 book=await save(book);for(const f of [lawn,slab])await approve(f.ownerPricing.id);
 const access=await call('POST','/api/quotedone/access',{allowedOrigins:['http://127.0.0.1:5173']});
 const publicUrl='/api/public/quote/'+access.publicKey,publicOptions={publicRequest:true,headers:{Origin:'http://127.0.0.1:5173'}};
 const publicQuote=(f,extra={})=>call('POST',publicUrl,{requestId:crypto.randomUUID(),serviceId:f.ownerPricing.id,customerInputs:f.customerInputs,contact:{email:'synthetic-customer@example.invalid'},...extra},201,publicOptions);
 const preview=(f,draft)=>call('POST','/api/pricebook/preview',{revision:book.revision,serviceId:f.ownerPricing.id,customerInputs:f.customerInputs,...(draft?{service:draft,defaults:book.defaults}:{})});
 const concretePublic=await publicQuote(slab),concretePreview=await preview(slab);
 const concreteOwner=await call('POST','/api/quote/calculate',{requestId:crypto.randomUUID(),serviceId:slab.ownerPricing.id,customerInputs:slab.customerInputs,contact:{email:'synthetic-customer@example.invalid'}},201);
 for(const q of [concretePublic,concretePreview,concreteOwner]){assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,4613.89);}
 const finish=concretePreview.lineItems.find(x=>x.calculation?.ratePath==='scopeRates.exposed_aggregate_labor');assert.equal(finish.amountCents,37500);assert.equal(concretePublic.lineItems,undefined);
 results.checks.push({id:'F01',public:totals(concretePublic),preview:totals(concretePreview),authenticated:totals(concreteOwner),finishingLaborCents:finish.amountCents,customerHasNoPrivateLines:true});

 for(const choice of [true,false]){
  const current=book.services.find(x=>x.id===lawn.ownerPricing.id),draft={...structuredClone(current),ownerFeeSelections:{travel:choice}};
  const before=loadPricebook(ownerId),shown=await preview(lawn,draft);assert.equal(shown.midEstimate,choice?150:100);assert.equal(shown.customerEligible,false);assert.deepEqual(loadPricebook(ownerId),before);
  const savedPublic=await publicQuote(lawn);assert.equal(savedPublic.midEstimate,choice?100:150);
  book.services=book.services.map(s=>s.id===draft.id?draft:s);book=await save(book);
  const unapproved=await publicQuote(lawn);assert.equal(unapproved.resultType,'ESTIMATE_REQUIRES_REVIEW');
  await approve(lawn.ownerPricing.id);const approved=await publicQuote(lawn);assert.equal(approved.midEstimate,shown.midEstimate);
  results.checks.push({id:'F02',draftChoice:choice,preview:totals(shown),beforeSave:totals(savedPublic),afterSaveBeforeApproval:unapproved.resultType,afterApproval:totals(approved),previewDidNotChangeSavedBook:true});
 }

 delete book.services.find(s=>s.id===lawn.ownerPricing.id).ownerFeeSelections;
 book=await save(book);await approve(lawn.ownerPricing.id);
 const status=approvalStatuses.find(s=>s.serviceId===lawn.ownerPricing.id);
 assert.equal(status.status,'NEEDS PRICING');assert.ok(status.invalidOwnerFields.includes('feeSelections.owner.travel'));
 const catalog=await call('GET',publicUrl,undefined,200,publicOptions);
 assert.ok(!catalog.services.some(s=>(s.id||s.serviceId)===lawn.ownerPricing.id));
 const missing=await publicQuote(lawn);assert.equal(missing.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(missing.midEstimate,undefined);
 results.checks.push({id:'F03',savedStatus:status.status,diagnosticPaths:status.invalidOwnerFields,catalogOmitsService:true,request:totals(missing)});

 const draftCreated=(await call('POST','/api/pricebook/interview',{mode:'browser',serviceTypes:['ROOFING_REPAIR']},201)).draft;
 const hours={asphalt_shingle:{patch:{small:1,medium:2,large:3}}},allowance={asphalt_shingle:{patch:{small:0,medium:25.25,large:40}}};
 const draftUrl='/api/pricebook/interview/'+draftCreated.id;
 const accepted=(await call('PUT',draftUrl,{fields:{ROOFING_REPAIR:{repairHours:hours,repairMaterialAllowance:allowance}}})).draft;
 assert.deepEqual(accepted.fields.ROOFING_REPAIR.repairHours,hours);assert.deepEqual(accepted.fields.ROOFING_REPAIR.repairMaterialAllowance,allowance);
 for(const malformed of [{patch:{small:1,medium:2,large:3}},{patch:1},{asphalt_shingle:{patch:{small:1}}}]){
  await call('PUT',draftUrl,{fields:{ROOFING_REPAIR:{repairHours:malformed}}},422);
  assert.deepEqual((await call('GET',draftUrl)).draft,accepted);
 }
 const review=await call('GET',draftUrl+'/review');assert.deepEqual(review.services[0].fields.repairHours,hours);
 results.checks.push({id:'F14',validHours:hours,validMaterialAllowances:allowance,malformedRequestsRejected:3,savedDraftUnchangedAfterRejection:true,reviewHandoffPreservesCube:true});

 await call('POST','/api/business/jurisdiction',{country:'US',region:'ME',taxMode:'TAX_ALL',taxPercent:7});
 const beforeTax=loadPricebook(ownerId),beforeProfile=getBusinessProfile(ownerId);
 const refused=await call('POST','/api/business/jurisdiction',{country:'US',region:'AK'},400);assert.match(refused.error,/Choose how/);
 assert.deepEqual(loadPricebook(ownerId),beforeTax);assert.deepEqual(getBusinessProfile(ownerId),beforeProfile);
 const taxCases=[];
 for(const [taxMode,taxPercent] of [['TAX_NONE',0],['TAX_MATERIALS',5.25],['TAX_ALL',7.125]]){
  const reply=await call('POST','/api/business/jurisdiction',{country:'US',region:'AK',taxMode,taxPercent});
  assert.equal(reply.needsOwnerConfirmation,false);assert.equal(loadPricebook(ownerId).defaults.taxMode,taxMode);assert.equal(loadPricebook(ownerId).defaults.taxPercent,taxPercent);taxCases.push({taxMode,taxPercent});
 }
 for(const taxPercent of [0,-1,101]){
  const before=loadPricebook(ownerId);await call('POST','/api/business/jurisdiction',{country:'US',region:'AK',taxMode:'TAX_ALL',taxPercent},400);assert.deepEqual(loadPricebook(ownerId),before);
 }
 results.checks.push({id:'F27',implicitZeroRejected:true,bookAndProfileUnchangedAfterRejection:true,explicitSyntheticSettingsAccepted:taxCases,invalidTaxableRatesRejected:3});
 results.passed=true;
}catch(error){results.error=error.stack;process.exitCode=1;}
finally{
 fs.writeFileSync(path.join(output,'http.json'),JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify({passed:results.passed,requests:results.requests.length,checks:results.checks,error:results.error},null,2));
 await new Promise(resolve=>httpServer.close(resolve));db.close();
}
