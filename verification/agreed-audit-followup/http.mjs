import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.resolve(process.argv[2]||'verification-output/agreed-followup-http');
fs.mkdirSync(output,{recursive:true});
const out=fs.mkdtempSync(path.join(output,'synthetic-store-'));
const fromRoot=relative=>pathToFileURL(path.join(root,relative)).href;
fs.mkdirSync(out,{recursive:true});
Object.assign(process.env,{NODE_ENV:'test',PORT:'4503',JWT_SECRET:crypto.randomBytes(40).toString('hex'),DATABASE_PATH:path.join(out,'synthetic.sqlite'),PRICEBOOK_PATH:path.join(out,'pricebooks'),EMAIL_PROVIDER:'console',LOCAL_PREVIEW:'false',ALLOW_PROVIDER_WRITES:'true',TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),TWILIO_API_KEY_SECRET:'SYNTHETIC-FIXTURE-ONLY',GEMINI_API_KEY:'SYNTHETIC-TEST-KEY',PRICEBOOK_GEMINI_MODEL:'synthetic-text-model',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',DOTENV_CONFIG_PATH:path.join(out,'absent.env')});
process.env.BOOKING_SLOT_TOKEN_SECRET=crypto.randomBytes(40).toString('hex');
const providerRequests=[];
const nativeFetch=globalThis.fetch;
globalThis.fetch=async (input,init)=>{
 const url=String(input);
 if(url.startsWith('https://generativelanguage.googleapis.com/')){
  providerRequests.push(JSON.parse(init.body));
  return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify([{service:'[SYNTHETIC] Mowing',serviceType:'LANDSCAPING_MOWING',fields:{mowingBaseRatePerSqft:.02}}])}]}}]}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(url.startsWith('http://127.0.0.1:4503/'))return nativeFetch(input,init);
 throw Error('Audit blocked an unexpected external request');
};
const {httpServer}=await import(fromRoot('server/src/server.js'));
const {db}=await import(fromRoot('server/src/db.js'));
const {adapterCases}=await import(fromRoot('verification/quotedone/adapter-cases.mjs'));
const results={baseSource:'25fca4812bbc0eb905b1d91124c2aa53aced791a',sourceDescription:'exact base plus agreed m1-m6 local changes; see source manifest',runtime:process.version,requests:[],adapters:[]};
let token,ownerId;
async function call(method,url,body,expected=200,auth=true,headers={}){
 const r=await fetch('http://127.0.0.1:4503'+url,{method,headers:{'Content-Type':'application/json',...(auth&&token?{Authorization:'Bearer '+token}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await r.json();results.requests.push({method,url,status:r.status,...(!url.includes('/auth/')?{response:data}:{})});
 assert.equal(r.status,expected,JSON.stringify({url,data}));return data;
}
try{
 const password=crypto.randomBytes(24).toString('hex'),email='http-audit-'+crypto.randomUUID()+'@example.invalid';
 const registered=await call('POST','/api/auth/register',{email,password,firstName:'Synthetic',businessName:'Synthetic Audit',plan:'QuoteDone'},201);
 ownerId=registered.account.id;
 // Only this isolated synthetic account is granted the entitlement under test. No payment/provider calls.
 const now=new Date().toISOString();
 db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(ownerId,'cus_SYNTHETIC_'+ownerId,now,now,now);
 db.prepare("UPDATE users SET plan='QuoteDone',planStatus='active',emailVerifiedAt=? WHERE id=?").run(new Date().toISOString(),ownerId);
 const login=await call('POST','/api/auth/login',{email,password});token=login.token;

 const {loadPricebook}=await import(fromRoot('server/priceBookService.js'));
 const {convertApplicationBook,quoteDoneMoneyKind,applicationMetadata}=await import(fromRoot('server/src/quoteDoneBridge.js'));
 const {allowedPricingFields}=await import(fromRoot('server/quote-engine-vnext/contracts.js'));
 const meta=await call('GET','/api/pricebook/meta'),map=v=>Object.fromEntries(meta.categories.map(k=>[k,v]));
 const roof=structuredClone(adapterCases.find(e=>e.serviceType==='ROOFING_REPLACEMENT'));
 roof.pricing={laborPerSquare:{asphalt_shingle:90},materialCostPerSquare:{asphalt_shingle:150},tearOffPerSquare:{asphalt_shingle:45},underlaymentPerSquare:{asphalt_shingle:20},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},accessoryPricingMode:'per_square_allin',minimumJob:2500};
 roof.customerInputs={roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitch:'low',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'partial',partialAreaSqft:200};
 const concrete=structuredClone(adapterCases.find(e=>e.serviceType==='CONCRETE_PATIO_SLAB'));delete concrete.pricing.basePrepPerSqft;concrete.customerInputs.baseNeeded=false;
 const paint=structuredClone(adapterCases.find(e=>e.serviceType==='INTERIOR_PAINTING'));for(const k of ['ceilingLaborPerSqftPerCoat','ceilingMaterialPerSqftPerCoat','trimLaborPerLF','trimMaterialPerLF'])delete paint.pricing[k];paint.customerInputs.trimIncluded=false;delete paint.customerInputs.trimLengthLF;
 const siding=structuredClone(adapterCases.find(e=>e.serviceType==='SIDING_REPLACEMENT'));siding.pricing.laborPerSqft.vinyl=2.55;
 let book=await call('GET','/api/pricebook/'+ownerId);
 book.defaults={markupPercent:30,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_ALL',taxPercent:15,rangeBufferPercent:10,markupApplies:map(true),peakMonths:[],peakSurchargePercent:0};
 const entries=[roof,concrete,paint,siding];
 book.services=entries.map(entry=>{
  const rules=meta.services.find(s=>s.serviceType===entry.serviceType),knownOfferings={};
  for(const field of rules.customerFields.filter(f=>f.type==='slug'))if(entry.customerInputs[field.name]!==undefined&&entry.customerInputs[field.name]!=='none'){
   const value=entry.customerInputs[field.name],offeringId=crypto.randomUUID();knownOfferings[field.name]={[value]:offeringId};entry.customerInputs.confirmedFacts={...(entry.customerInputs.confirmedFacts||{}),[field.name]:{field:field.name,value,status:'identified',offeringId}};
  }
  const service={id:crypto.randomUUID(),source:'MANUAL',serviceType:entry.serviceType,service:'Synthetic '+entry.serviceType,active:true,pricing:entry.pricing,knownOfferings,priceBasisByCategory:map('cost'),taxabilityByCategory:map(false),feeRules:Object.fromEntries(meta.feeNames.map(k=>[k,'not_applicable']))};
  if(['INTERIOR_PAINTING'].includes(entry.serviceType))service.priceBasisByCategory.material='sell_price';
  entry.serviceId=service.id;return service;
 });
 results.inputBook=structuredClone(book);
 const saved=await call('POST','/api/pricebook/save',book);book=await call('GET','/api/pricebook/'+ownerId);
 results.savedBook=structuredClone(book);
 for(const service of book.services){const r=await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:book.revision,confirmConfiguration:true,confirmLegacySettings:true});book.revision=r.revision;}
 book=await call('GET','/api/pricebook/'+ownerId);results.approvedBook=structuredClone(book);
 results.minimum={enteredDollars:2500,storedCents:loadPricebook(ownerId).services.find(s=>s.id===roof.serviceId).pricing.minimumJob,reloadedDollars:book.services.find(s=>s.id===roof.serviceId).pricing.minimumJob,expectedCustomerFloor:2875};
 const priorSiding=book.services.find(s=>s.id===siding.serviceId).pricing.laborPerSqft.vinyl;
 const invalid=structuredClone(book);invalid.services.find(s=>s.id===siding.serviceId).pricing.laborPerSqft.vinyl=2.555;
 const refused=await call('POST','/api/pricebook/save',invalid,400);
 assert.match(refused.error,/whole.cent/i);
 const afterRefusal=await call('GET','/api/pricebook/'+ownerId);
 assert.equal(afterRefusal.revision,book.revision);assert.equal(afterRefusal.services.find(s=>s.id===siding.serviceId).pricing.laborPerSqft.vinyl,priorSiding);
 results.invalidSiding={entered:2.555,response:refused,unchangedRevision:true,persisted:priorSiding};
 const access=await call('POST','/api/quotedone/access',{allowedOrigins:['http://127.0.0.1:5173']}),url='/api/public/quote/'+access.publicKey,headers={Origin:'http://127.0.0.1:5173'};
 const catalog=await call('GET',url,undefined,200,false,headers);results.catalog=catalog.services.map(s=>s.serviceType);
 results.quotes=[];
 for(const entry of entries){
  const body={requestId:crypto.randomUUID(),serviceId:entry.serviceId,customerInputs:entry.customerInputs,contact:{email:'customer@example.invalid'}};
  const customer=await call('POST',url,body,201,false,headers);
  const authenticated=await call('POST','/api/quote/calculate',{...body,requestId:crypto.randomUUID()},201);
  const preview=await call('POST','/api/pricebook/preview',{revision:book.revision,serviceId:entry.serviceId,customerInputs:entry.customerInputs});
  results.quotes.push({type:entry.serviceType,input:body,customer,authenticated,preview});
 }
 results.minimumConverters=meta.services.map(s=>{const f=s.fields.find(f=>['minimumJob','minimumServiceCharge','repairMinimum'].includes(f.field));if(!f)return {type:s.serviceType,missing:true};const converted=convertApplicationBook({services:[{serviceType:s.serviceType,pricing:{[f.field]:2500}}],defaults:{}},'toCents');return {type:s.serviceType,field:f.field,kind:quoteDoneMoneyKind(s.serviceType,f.field),metadataMoney:f.money,stored:converted.services[0].pricing[f.field]};});
 assert.equal(results.minimumConverters.length,20);assert.ok(results.minimumConverters.every(row=>row.stored===250000));
 results.roofMinimumLocations=convertApplicationBook({services:[{serviceType:'ROOFING_REPLACEMENT',minimumJob:2500,pricing:{minimumJob:2500},tiers:[{name:'Good',overrides:{minimumJob:2500}}]}],defaults:{minimumJobPrice:2500}},'toCents');
 results.unclassifiedFields=meta.services.flatMap(s=>allowedPricingFields(s.serviceType).filter(f=>quoteDoneMoneyKind(s.serviceType,f,{unit:'flat'})===null).map(f=>({type:s.serviceType,field:f})));
 for(const entry of entries)assert.ok(results.catalog.includes(entry.serviceType));
 for(const quote of results.quotes)for(const lane of ['customer','authenticated','preview'])assert.equal(quote[lane].resultType,'INSTANT_ESTIMATE_READY');
 results.beforeDefaultEdit=book.statuses;
 book.defaults.taxPercent=14;
 const changed=await call('POST','/api/pricebook/save',book);results.afterDefaultEdit=changed;
 const changedQuote=await call('POST',url,{requestId:crypto.randomUUID(),serviceId:roof.serviceId,customerInputs:roof.customerInputs,contact:{email:'customer@example.invalid'}},201,false,headers);results.unapprovedDefaultQuote=changedQuote;assert.equal(changedQuote.resultType,'ESTIMATE_REQUIRES_REVIEW');
 assert.equal(results.minimum.storedCents,250000);assert.equal(results.minimum.reloadedDollars,2500);assert.equal(results.quotes[0].customer.resultType,'INSTANT_ESTIMATE_READY');assert.equal(results.quotes[0].customer.lowEstimate,2875);assert.equal(results.quotes[0].customer.midEstimate,2875);assert.equal(results.quotes[0].customer.highEstimate,3163);
 const {updateBusinessProfile}=await import(fromRoot('server/src/onboardingService.js'));
 results.aiMarkets=[];
 for(const [country,region,currency,forgedCountry] of [['CA','NS','CAD','US'],['US','MA','USD','CA']]){
  updateBusinessProfile(ownerId,{country,region});
  const response=await call('POST','/api/pricebook/suggest',{industry:'[SYNTHETIC]',serviceTypes:['LANDSCAPING_MOWING'],country:forgedCountry,region:'XX'});
  const data=JSON.parse(providerRequests.at(-1).contents[0].parts[0].text);assert.deepEqual(data.market,{country,region,currency});assert.equal(response.suggestions[0].active,false);assert.equal(response.suggestions[0].status,'DRAFT');
  results.aiMarkets.push({savedProfile:{country,region},forgedCountry,providerMarket:data.market,response});
 }
 updateBusinessProfile(ownerId,{country:'',region:''});const count=providerRequests.length;
 results.unknownMarket=await call('POST','/api/pricebook/suggest',{industry:'[SYNTHETIC]',serviceTypes:['LANDSCAPING_MOWING'],country:'CA'},422);
 assert.equal(providerRequests.length,count);results.providerRequestCount=count;
 results.probesComplete=true;
}catch(error){results.error=error.stack;process.exitCode=1;}
finally{
 const quoteSummary=q=>Object.fromEntries(['resultType','lowEstimate','midEstimate','highEstimate','taxTreatment'].map(key=>[key,q[key]]));
 const summary={baseSource:results.baseSource,sourceDescription:results.sourceDescription,runtime:results.runtime,probesComplete:results.probesComplete,error:results.error,requests:results.requests.map(({method,url,status})=>({method,url:url.replace(/\/api\/public\/quote\/[^/]+/,'/api/public/quote/[SYNTHETIC]'),status})),minimum:results.minimum,invalidSiding:results.invalidSiding,catalog:results.catalog,quotes:results.quotes?.map(q=>({type:q.type,customer:quoteSummary(q.customer),authenticated:quoteSummary(q.authenticated),preview:quoteSummary(q.preview)})),minimumConverters:results.minimumConverters,roofMinimumLocations:results.roofMinimumLocations,unapprovedDefaultQuote:results.unapprovedDefaultQuote?.resultType,aiMarkets:results.aiMarkets,unknownMarket:results.unknownMarket,providerRequestCount:results.providerRequestCount};
 fs.writeFileSync(path.join(output,'http.json'),JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({minimum:results.minimum,catalog:results.catalog,quotes:results.quotes?.map(q=>({type:q.type,result:q.customer.resultType,low:q.customer.lowEstimate,mid:q.customer.midEstimate,high:q.customer.highEstimate,preview:q.preview.resultType})),minimumConverters:results.minimumConverters,unapprovedDefaultQuote:results.unapprovedDefaultQuote?.resultType,error:results.error},null,2));
 await new Promise(r=>httpServer.close(r));db.close();
}
