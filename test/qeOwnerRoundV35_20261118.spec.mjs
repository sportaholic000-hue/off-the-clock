// November 18, 2026 owner round on 33b8dd3a: seven decided items, engine v35.
// Expected values are worked by hand in the comments before each run.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,readFile as readFileCb} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateQuoteVNext,ENGINE_VERSION} from '../server/quote-engine-vnext/engine.js';
import {vNextServiceStatus} from '../server/quote-engine-vnext/priceBook.js';
import {customerContractForVNext} from '../server/quote-engine-vnext/contracts.js';
import {BUILDING_AGE_OWNER_COPY,PAINTING_COUNTRY_REVIEW,CANADIAN_LEAD_EXCLUSION} from '../server/quote-engine-vnext/buildingAgeRules.js';
import {migrateRoofLowSlopeVNext} from '../server/quote-engine-vnext/roofSlopeRules.js';
import {businessCountryOf,knownBusinessCountry,BUSINESS_COUNTRY_TAX_MESSAGE,FIXED_PROVINCE_RATES,CANADIAN_PROVINCES} from '../server/taxJurisdiction.js';
import {EXPECTED_QUOTE_ENGINE_VERSION} from '../server/src/runtimeConfig.js';
import {corpusInputs,engineFingerprint} from '../verification/engine-fingerprint/fingerprint.mjs';
import {flooring,custom} from '../verification/engine-independent/fixtures.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {db,migrate} from '../server/src/db.js';
import {saveJurisdictionProfile,getBusinessProfile} from '../server/src/onboardingService.js';
import {registerQuoteDateDatabase} from '../server/src/quoteDate.js';
import {loadPricebook,savePricebook,pricebookDirectory} from '../server/priceBookService.js';
import {saveBusinessJurisdiction,countryChangeMessage} from '../server/src/businessCountry.js';
import {publish} from './quoteDeliveryBatch20261015Fixture.mjs';
import {synchronizeDependentLinesVNext,roofFlashingVentDefinitionVNext} from '../server/quote-engine-vnext/priceGroundwork.js';

const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const corpus=id=>structuredClone(corpusInputs().find(r=>r.id===id).input);
const line=(q,name)=>q.lineItems?.find(l=>l.name===name);
const total=q=>q.options?.[0]?.calculationRecord.scenarios.mid.finalTotalCents;
const root=fileURLToPath(new URL('..',import.meta.url));
migrate();registerQuoteDateDatabase(db);
function owner(country,region=country==='CA'?'ON':'NY'){
  const id='synthetic-v35-'+randomUUID();
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active','UTC','owner','2026-11-18T00:00:00Z')").run(id,id+'@example.invalid');
  db.prepare("INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,'{}','2026-11-18T00:00:00Z')").run(id);
  if(country)saveJurisdictionProfile(id,{country,region});
  return id;
}
const date={timeZone:'UTC',quoteInstant:'2026-10-15T12:00:00.000Z'};

test('v35 version literals agree and the fingerprint is recorded',async()=>{
  assert.equal(ENGINE_VERSION,'quote-engine-vnext-accuracy-20261119-v37');assert.equal(EXPECTED_QUOTE_ENGINE_VERSION,ENGINE_VERSION);
  const history=JSON.parse(await readFile(new URL('../verification/engine-fingerprint/history.json',import.meta.url),'utf8'));
  assert.equal(history[ENGINE_VERSION],engineFingerprint());
});

// ---------------------------------------------------------------------------
// 1. Business country required
// ---------------------------------------------------------------------------
test('1: the currency never stands in for the country',()=>{
  for(const currency of ['CAD','USD',undefined]){
    assert.equal(businessCountryOf({currency}),null);assert.equal(knownBusinessCountry({currency}),null);
    for(const country of ['CA','US'])assert.equal(businessCountryOf({currency,businessCountry:country}),country);
  }
});
test('1: lead-paint screening for every policy, year, saved country and job code; an unknown country goes to review, never to the lenient rule',()=>{
  // Written before execution, for a painting job (2,650.00 when priced):
  //  included: never asks, always priced.
  //  review_before_1990: before 1978, 1978-1990 and not sure go to review in either country.
  //  review_before_1978: before 1978 and not sure go to review; 1978-1990 is priced in the US,
  //    priced with the Canadian lead exclusion in Canada, and reviewed when the country is unknown.
  //  blank: before 1978 and not sure go to review; 1978-1990 is reviewed in Canada, priced in the US,
  //    reviewed when the country is unknown.
  // The country is the job's postal or ZIP code, else the saved business country.
  const base=corpus('v29:priced-exterior-itemized-three-story-built-1985');let checks=0;
  for(const policy of [undefined,'review_before_1978','review_before_1990','included'])for(const age of ['before_1978','1978_to_1989','1990_or_later','not_sure'])
  for(const saved of ['CA','US',undefined])for(const code of [undefined,'M5V 2T6','10001']){
    const f=structuredClone(base),p=f.ownerPricing.pricing;
    if(policy===undefined)delete p.leadSafePainting;else p.leadSafePainting=policy;
    f.customerInputs.buildingAge=age;if(code)f.customerInputs.postalCode=code;else delete f.customerInputs.postalCode;
    if(saved)f.businessDefaults.businessCountry=saved;else delete f.businessDefaults.businessCountry;
    const country=code?(code==='10001'?'US':'CA'):saved??null;
    let want;
    if(policy==='included'||age==='1990_or_later')want='priced';
    else if(policy==='review_before_1990'||age!=='1978_to_1989')want='review';
    else if(country===null)want='country';
    else if(policy==='review_before_1978')want=country==='CA'?'priced with exclusion':'priced';
    else want=country==='CA'?'review':'priced';
    if(policy===undefined&&age!=='1990_or_later'&&age!=='1978_to_1989')want='review';
    const q=generateQuoteVNext(f);checks++;
    const got=q.resultType==='INSTANT_ESTIMATE_READY'?(q.options[0].calculationRecord.disclosures||[]).includes(CANADIAN_LEAD_EXCLUSION)?'priced with exclusion':'priced':q.reviewReason===PAINTING_COUNTRY_REVIEW?'country':'review';
    assert.equal(got,want,`${policy} ${age} saved ${saved} code ${code}: ${q.reviewReason}`);
    if(got.startsWith('priced'))assert.equal(total(q),265000);
  }
  assert.equal(checks,4*4*3*3);
});
test('1: an outside-country tax decision with no saved country goes to review; with a country it is decided as before',()=>{
  for(const currency of ['CAD','USD'])for(const code of ['M5V 2T6','10001'])for(const saved of [undefined,'CA','US']){
    const f=flooring('tile',200);Object.assign(f.businessDefaults,{taxMode:'TAX_ALL',taxPercent:13,currency,taxByJobLocation:true,...(saved?{businessCountry:saved}:{}),taxOutsideZones:'business_rate'});f.customerInputs.postalCode=code;
    const q=generateQuoteVNext(f),job=code==='10001'?'US':'CA';
    if(!saved){assert.equal(q.reviewReason,BUSINESS_COUNTRY_TAX_MESSAGE,`${currency} ${code}`);assert.deepEqual(q.missingOwnerFields,['businessDefaults.businessCountry']);}
    // Fix A2 (2026-11-19): a job outside the saved country is quoted with no tax and a note (was review, "priced by the business directly").
    else if(saved!==job){assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.options[0].calculationRecord.scenarios.mid.tax.taxCents,0);assert.match(q.options[0].disclaimer,/the business will confirm the tax for this location\./);}
    else assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
  }
});
test('1: a service cannot go live until a business country is saved; the wording changes are in place',async()=>{
  for(const country of [undefined,'CA','US']){
    const id=owner(country),f=corpus('explanation:catalog-LANDSCAPING_CLEANUP');
    const raw={...f.ownerPricing,id:randomUUID(),active:true};delete raw.origin;
    savePricebook(id,{services:[raw],defaults:{...f.businessDefaults,currency:'CAD'}});
    const book=loadPricebook(id),status=bridge.applicationStatus(book.services[0],book);
    assert.equal(status.applicationIssues.includes(bridge.BUSINESS_COUNTRY_REQUIRED),country===undefined,String(country));
    if(country===undefined)assert.equal(status.status,'NEEDS PRICING');
  }
  assert.equal(bridge.BUSINESS_COUNTRY_REQUIRED,'Choose your business country before customer quotes start.');
  assert.ok(BUILDING_AGE_OWNER_COPY.leadSafePainting.help.endsWith('The job’s postal or ZIP code decides the country; without one, your business country does.'));
  const onboarding=await readFile(new URL('../client/src/onboarding.jsx',import.meta.url),'utf8');
  assert.ok(onboarding.includes('Your quotes use this country for sales tax, for which jobs you quote directly, for lead-paint screening on painting jobs and for your roofing building code.'));
  assert.ok(!onboarding.includes('The price book uses this only to apply the tax mode and rate you confirm.'));
  const pricebook=await readFile(new URL('../client/src/pricebook.jsx',import.meta.url),'utf8');
  assert.match(pricebook,/!\['CA','US'\]\.includes\(onboarding\.profile\?\.country\) && <BusinessCountryPrompt/);
});
test('1: the price book asks once for the country through the jurisdiction route, keeping the saved tax settings',()=>{
  const id=owner(undefined),f=corpus('explanation:catalog-LANDSCAPING_CLEANUP');
  const raw={...f.ownerPricing,id:randomUUID(),active:true};delete raw.origin;
  savePricebook(id,{services:[raw],defaults:{...f.businessDefaults,currency:'CAD',taxMode:'TAX_ALL',taxPercent:13}});
  // What BusinessCountryPrompt sends: the country, region and the book's own tax settings.
  const result=saveBusinessJurisdiction(id,{country:'CA',region:'ON',taxMode:'TAX_ALL',taxPercent:'13'});
  assert.equal(result.taxMode,'TAX_ALL');assert.equal(getBusinessProfile(id).country,'CA');
  const book=loadPricebook(id);assert.equal(book.defaults.taxMode,'TAX_ALL');assert.equal(book.defaults.taxPercent,13);
  assert.equal(bridge.applicationStatus(book.services[0],book).applicationIssues.includes(bridge.BUSINESS_COUNTRY_REQUIRED),false);
});

// ---------------------------------------------------------------------------
// 2. Country in approvals and the country-change confirmation
// ---------------------------------------------------------------------------
function approvedOwner(country='CA'){
  const id=owner(country),f=flooring('tile',200);publish(id,f);
  return {id,book:loadPricebook(id)};
}
const current=id=>{const book=loadPricebook(id);return bridge.bookStatuses(book,date).map(s=>s.approvalCurrent);};
// A copy of a saved service as a new one: the server generates its receipts.
function newCopy(service){const copy=structuredClone(service);copy.id=randomUUID();copy.source='MANUAL';for(const k of ['origin','quoteDoneApproval','approvedValues','zeroPricePolicy','startingValueState','startingValueAdoptions','dependentLineState','confirmedFields'])delete copy[k];return copy;}
const conflict=fn=>{try{fn();}catch(error){return error;}assert.fail('expected a confirmation request');};
test('2: new receipts record the country; a receipt with a country holds only for it',()=>{
  const {id,book}=approvedOwner('CA');
  assert.equal(book.services[0].quoteDoneApproval.businessCountry,'CA');
  assert.deepEqual(current(id),[true]);
  // The country saved some other way than the confirmed change: the receipt no longer holds.
  saveJurisdictionProfile(id,{country:'US',region:'NY'});assert.deepEqual(current(id),[false]);
  saveJurisdictionProfile(id,{country:'CA',region:'ON'});assert.deepEqual(current(id),[true]);
});
test('2: changing the country with approved services asks once, tied to both countries and the revision; confirming keeps them approved',()=>{
  const {id,book}=approvedOwner('CA'),before=bridge.bookRevision(book);
  const asked=conflict(()=>saveBusinessJurisdiction(id,{country:'US',region:'NY',taxMode:'TAX_NONE',taxPercent:'0'}));
  assert.equal(asked.statusCode,409);assert.equal(asked.code,'COUNTRY_CHANGE_CONFIRMATION_REQUIRED');
  // Message replaced November 18, 2026 (country-change tax round).
  const message='Changing your country to the United States changes how your quotes handle sales tax, which jobs are outside your country, and lead-paint screening on painting jobs. Your approved prices stay approved. Confirm your sales tax for the United States below.';
  assert.equal(asked.message,message);assert.equal(countryChangeMessage('US'),message);
  assert.deepEqual(asked.details,{countryChange:{from:'CA',to:'US',revision:before},message,action:'Change country',tax:{taxMode:null,taxPercent:null}});
  // Nothing changed while asking.
  assert.equal(getBusinessProfile(id).country,'CA');assert.equal(bridge.bookRevision(loadPricebook(id)),before);
  // A confirmation for other countries, or another revision, is stale and asks again.
  for(const wrong of [{from:'US',to:'US',revision:before},{from:'CA',to:'CA',revision:before},{from:'CA',to:'US',revision:'0'.repeat(64)}]){
    const stale=conflict(()=>saveBusinessJurisdiction(id,{country:'US',region:'NY',taxMode:'TAX_NONE',taxPercent:'0',countryChange:wrong}));
    assert.equal(stale.code,'COUNTRY_CHANGE_CONFIRMATION_STALE');assert.equal(getBusinessProfile(id).country,'CA');
  }
  const done=saveBusinessJurisdiction(id,{country:'US',region:'NY',taxMode:'TAX_NONE',taxPercent:'0',countryChange:asked.details.countryChange});
  assert.equal(done.countryChanged,true);assert.equal(getBusinessProfile(id).country,'US');
  const after=loadPricebook(id);assert.equal(after.services[0].quoteDoneApproval.businessCountry,'US');
  assert.deepEqual(current(id),[true],'approved prices stay approved');
  // The confirmed tax is saved (the keep-old-tax rule was removed in the country-change tax round).
  assert.equal(after.defaults.taxMode,'TAX_NONE');assert.equal(after.defaults.taxPercent,0);
});
test('2: a concurrent edit or approval makes the confirmation stale',()=>{
  const {id}=approvedOwner('CA');
  const asked=conflict(()=>saveBusinessJurisdiction(id,{country:'US',region:'NY',taxMode:'TAX_NONE',taxPercent:'0'}));
  // A racing approval (a second service saved and approved after the confirmation was shown).
  const draft=bridge.readApplicationBook(id),extra=newCopy(draft.services[0]);
  bridge.saveApplicationBook(id,{...draft,services:[...draft.services,extra]},date);
  bridge.approveApplicationService(id,extra.id,{revision:bridge.readApplicationBook(id).revision,confirmConfiguration:true,confirmLegacySettings:true},date);
  const stale=conflict(()=>saveBusinessJurisdiction(id,{country:'US',region:'NY',taxMode:'TAX_NONE',taxPercent:'0',countryChange:asked.details.countryChange}));
  assert.equal(stale.code,'COUNTRY_CHANGE_CONFIRMATION_STALE');assert.equal(getBusinessProfile(id).country,'CA');
  // Confirming the fresh request stamps both receipts.
  saveBusinessJurisdiction(id,{country:'US',region:'NY',taxMode:'TAX_NONE',taxPercent:'0',countryChange:stale.details.countryChange});
  assert.deepEqual(loadPricebook(id).services.map(s=>s.quoteDoneApproval.businessCountry),['US','US']);assert.deepEqual(current(id),[true,true]);
});
test('2: approvals already stale stay stale; receipts without a country hold only until the country changes',()=>{
  const {id}=approvedOwner('CA');
  // Second service approved, then edited (stale), and a third service whose receipt has no country (an earlier receipt).
  let draft=bridge.readApplicationBook(id);const second=newCopy(draft.services[0]);
  bridge.saveApplicationBook(id,{...draft,services:[...draft.services,second]},date);
  bridge.approveApplicationService(id,second.id,{revision:bridge.readApplicationBook(id).revision,confirmConfiguration:true,confirmLegacySettings:true},date);
  const book=loadPricebook(id);delete book.services[0].quoteDoneApproval.businessCountry;savePricebook(id,book);
  assert.deepEqual(current(id),[true,true],'a receipt without a country holds while the country is unchanged');
  draft=bridge.readApplicationBook(id);const pricing=draft.services[1].pricing||draft.services[1];const savedRate=pricing.laborPerSqft.tile;pricing.laborPerSqft.tile=savedRate+1;
  bridge.saveApplicationBook(id,draft,date);assert.deepEqual(current(id),[true,false]);
  const asked=conflict(()=>saveBusinessJurisdiction(id,{country:'US',region:'NY',taxMode:'TAX_NONE',taxPercent:'0'}));
  saveBusinessJurisdiction(id,{country:'US',region:'NY',taxMode:'TAX_NONE',taxPercent:'0',countryChange:asked.details.countryChange});
  const after=loadPricebook(id);
  assert.equal(after.services[0].quoteDoneApproval.businessCountry,'US','current just before: stamped with the new country');
  assert.equal(after.services[1].quoteDoneApproval.businessCountry,'CA','stale: keeps the country it was approved under');
  // Reverting the edit does not revive the stale approval in the new country.
  draft=bridge.readApplicationBook(id);(draft.services[1].pricing||draft.services[1]).laborPerSqft.tile=savedRate;bridge.saveApplicationBook(id,draft,date);
  assert.deepEqual(current(id),[true,false]);
});
test('2: no approved services: the country changes without asking',()=>{
  const id=owner('CA'),f=corpus('explanation:catalog-LANDSCAPING_CLEANUP');const raw={...f.ownerPricing,id:randomUUID(),active:true};delete raw.origin;
  savePricebook(id,{services:[raw],defaults:{...f.businessDefaults,currency:'CAD'}});
  saveBusinessJurisdiction(id,{country:'US',region:'NY',taxMode:'TAX_NONE',taxPercent:'0'});assert.equal(getBusinessProfile(id).country,'US');
});
test('2: a failure between the book write and the profile commit leaves profile, book and receipts as they were',()=>{
  const {id}=approvedOwner('CA'),file=resolve(pricebookDirectory(),id+'.json'),before=readFileSync(file,'utf8');
  const asked=conflict(()=>saveBusinessJurisdiction(id,{country:'US',region:'NY',taxMode:'TAX_NONE',taxPercent:'0'}));
  assert.throws(()=>saveBusinessJurisdiction(id,{country:'US',region:'NY',taxMode:'TAX_NONE',taxPercent:'0',countryChange:asked.details.countryChange},{afterBookWrite(){throw new Error('[SYNTHETIC] failure between writes');}}),/failure between writes/);
  assert.equal(getBusinessProfile(id).country,'CA');assert.equal(readFileSync(file,'utf8'),before,'book file restored byte for byte');
  assert.deepEqual(current(id),[true]);
  // The same confirmation still works afterwards: nothing in between was left.
  saveBusinessJurisdiction(id,{country:'US',region:'NY',taxMode:'TAX_NONE',taxPercent:'0',countryChange:asked.details.countryChange});
  assert.equal(getBusinessProfile(id).country,'US');assert.deepEqual(current(id),[true]);
});
test('2: the onboarding step and the price-book prompt show the confirmation and resend it',async()=>{
  const helper=await readFile(new URL('../client/src/businessCountryChange.jsx',import.meta.url),'utf8');
  assert.match(helper,/COUNTRY_CHANGE_CONFIRMATION_REQUIRED','COUNTRY_CHANGE_CONFIRMATION_STALE'/);
  assert.match(helper,/\{pending\.action \|\| 'Change country'\}/);
  const onboarding=await readFile(new URL('../client/src/onboarding.jsx',import.meta.url),'utf8');
  assert.match(onboarding,/countryChange:confirmation, \.\.\.confirmedTax/);assert.match(onboarding,/<CountryChangeConfirmation pending=\{countryChange\} onConfirm=\{confirmedTax => save\(countryChange\.countryChange, confirmedTax\)\} \/>/);
});

// ---------------------------------------------------------------------------
// 3. Low-slope asphalt roofs, per product
// ---------------------------------------------------------------------------
const ROOF=JSON.parse(readFileSync(new URL('../verification/engine-fingerprint/corpus-additions-20261113c.json',import.meta.url),'utf8')).find(r=>r.id==='v33:fix3-nbc-cemented-eave-no-none-measured').input;
const LEGACY=['lowSlopeAssembly','nbcLowSlopeShingleFactor','nbcLowSlopeShingleMaterialPerSquare'];
// The v33 roof: 2,000 sq ft, 20 squares. At 4/12 or steeper: 9,500.00. Underlayment 20 x 20.00 = 400.00.
// Two layers: +400.00 = 9,900.00. Self-adhered at 60.00/sq replaces the underlayment: 9,500 - 400 + 1,200 = 10,300.00.
// Cemented (3-tab): extra shingles 22 x 0.5 = 11 sq x 100.00 = 1,100.00, cement 20 x 12.00 = 240.00,
// labor 20 x 30.00 = 600.00, the ordinary underlayment kept: 9,500 + 1,940 = 11,440.00.
// Fix B1 (Lane B, November 19, 2026): the frozen v33 roof is a full replacement measuring 0 starter
// and 0 drip edge with accessories priced separately, which is now refused. These roofs measure
// 1 LF of each at 1.00 with the 10% accessory waste: 1.10 + 1.10 = 2.20 on every priced total.
const B1_EDGES=220;
function roof({code='nbc',method,threeTab,rise=3,eave='no'}={}){
  const f=structuredClone(ROOF),p=f.ownerPricing.pricing;for(const k of LEGACY)delete p[k];
  Object.assign(p,{starterPerLF:100,dripEdgePerLF:100});Object.assign(f.customerInputs,{starterLengthLF:1,dripEdgeLengthLF:1});
  p.roofBuildingCode=code;p.eaveProtectionRequired=eave;p.selfAdheredUnderlaymentPerSquare=6000;
  if(method)p.lowSlopeAssemblyByProduct={asphalt_shingle:method};
  if(threeTab!==undefined)p.roofProductThreeTab={asphalt_shingle:threeTab};
  Object.assign(p,{nbcLowSlopeShingleFactorByProduct:{asphalt_shingle:1.5},nbcLowSlopeShingleMaterialByProduct:{asphalt_shingle:10000}});
  f.customerInputs.pitchRisePer12=rise;f.customerInputs.pitchBand=rise<4?'under_four':'up_to_six';
  return f;
}
const PRICE={double_underlayment:990000+B1_EDGES,self_adhered_underlayment:1030000+B1_EDGES,nbc_low_slope_application:1144000+B1_EDGES};
test('3: every method under NBC and IRC, 3-tab and laminate products, 2/12, 3/12, 3.99/12 and 4/12, eave protection on and off',()=>{
  const counts={};let checks=0;
  for(const code of ['nbc','irc'])for(const method of [undefined,'double_underlayment','self_adhered_underlayment','nbc_low_slope_application'])for(const threeTab of [true,false,undefined])
  for(const rise of [2,3,3.99,4])for(const eave of ['no','yes']){
    const q=generateQuoteVNext(roof({code,method,threeTab,rise,eave})),low=rise<4;checks++;
    // Written before execution.
    let want;
    if(method==='nbc_low_slope_application'&&code==='irc')want='refused';
    else if(!low)want=eave==='yes'?'eave':950000+B1_EDGES;
    else if(method===undefined)want='method';
    else if(method==='nbc_low_slope_application'&&threeTab!==true)want='three-tab';
    else if(eave==='yes'&&method!=='self_adhered_underlayment')want='eave';
    else want=PRICE[method];
    const got=q.resultType==='INSTANT_ESTIMATE_READY'?total(q):/3-tab shingles only/.test(q.reviewReason)?'three-tab':/Eave protection/.test(q.reviewReason)?'eave':(q.missingOwnerFields||[]).includes('lowSlopeAssemblyByProduct.asphalt_shingle')?'method':(q.invalidOwnerFields||[]).includes('lowSlopeAssemblyByProduct.asphalt_shingle')?'refused':'other: '+q.reviewReason;
    // A product not marked 3-tab on the cemented method waits for that answer; eave protection
    // required with none measured is also a review: either reason is correct.
    const either=['three-tab','method','refused'].includes(want)&&eave==='yes'&&got==='eave';
    if(!either)assert.equal(got,want,`${code} ${method} 3-tab ${threeTab} ${rise}/12 eave ${eave}`);
    counts[String(want)]=(counts[String(want)]||0)+1;
    if(got===1144000+B1_EDGES){assert.ok(line(q,'Underlayment'),'the ordinary underlayment is kept on the cemented method');assert.equal(line(q,'Low-slope extra shingles').calculation.ratePath,'nbcLowSlopeShingleMaterialByProduct.asphalt_shingle');}
  }
  console.log('v35 item 3 roofs',checks,JSON.stringify(counts));
  assert.equal(checks,2*4*3*4*2);
});
function mixed(){
  // Two asphalt products: a 3-tab on the cemented method, a laminate on two layers of underlayment.
  const f=roof({method:'nbc_low_slope_application',threeTab:true}),p=f.ownerPricing.pricing;
  for(const [key,value] of Object.entries(p))if(record(value)&&Object.hasOwn(value,'asphalt_shingle'))p[key]={three_tab:value.asphalt_shingle,laminate:value.asphalt_shingle};
  p.lowSlopeAssemblyByProduct={three_tab:'nbc_low_slope_application',laminate:'double_underlayment'};p.roofProductThreeTab={three_tab:true,laminate:false};
  p.nbcLowSlopeShingleFactorByProduct={three_tab:1.5};p.nbcLowSlopeShingleMaterialByProduct={three_tab:10000};
  const offerings=f.ownerPricing.knownOfferings;for(const field of ['existingRoofType','replacementRoofType'])offerings[field]={three_tab:randomUUID(),laminate:randomUUID()};
  // The itemized flashing and vent lines are confirmed for each product, as for the original one.
  const lines=['three_tab','laminate'].map(product=>roofFlashingVentDefinitionVNext(product));
  f.ownerPricing=synchronizeDependentLinesVNext(f.ownerPricing,lines,{ownerId:f.ownerPricing.origin.ownerId,reenteredIds:lines.map(d=>d.id),confirmIds:lines.map(d=>d.id),now:'2026-11-18T12:00:00.000Z'});
  return f;
}
function asProduct(f,product,rise){
  const g=structuredClone(f);Object.assign(g.customerInputs,{existingRoofType:product,replacementRoofType:product,pitchRisePer12:rise,pitchBand:rise<4?'under_four':'up_to_six'});
  for(const field of ['existingRoofType','replacementRoofType'])if(g.customerInputs.confirmedFacts?.[field])g.customerInputs.confirmedFacts[field]={...g.customerInputs.confirmedFacts[field],value:product,offeringId:g.ownerPricing.knownOfferings[field][product]};
  return g;
}
test('3: a mixed book prices each product by its own method; a cemented product not marked 3-tab holds only its own low-slope roofs',()=>{
  const f=mixed();
  // Written before execution: 3-tab at 3/12 11,440.00; laminate at 3/12 9,900.00; both at 5/12 9,500.00.
  // Fix B1: each + 2.20 starter and drip edge (B1_EDGES).
  assert.equal(total(generateQuoteVNext(asProduct(f,'three_tab',3))),1144000+B1_EDGES);
  assert.equal(total(generateQuoteVNext(asProduct(f,'laminate',3))),990000+B1_EDGES);
  for(const product of ['three_tab','laminate'])assert.equal(total(generateQuoteVNext(asProduct(f,product,5))),950000+B1_EDGES);
  // The laminate moved to the cemented method without a 3-tab answer: only its 2/12-4/12 roofs wait.
  const g=structuredClone(f);g.ownerPricing.pricing.lowSlopeAssemblyByProduct.laminate='nbc_low_slope_application';delete g.ownerPricing.pricing.roofProductThreeTab.laminate;
  const held=generateQuoteVNext(asProduct(g,'laminate',3));assert.equal(held.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(held.missingOwnerFields,['roofProductThreeTab.laminate']);
  assert.equal(total(generateQuoteVNext(asProduct(g,'laminate',5))),950000+B1_EDGES);
  assert.equal(total(generateQuoteVNext(asProduct(g,'three_tab',3))),1144000+B1_EDGES);
  // The cemented method's prices are the 3-tab product's own.
  assert.equal(line(generateQuoteVNext(asProduct(f,'three_tab',3)),'Low-slope extra shingles').calculation.ratePath,'nbcLowSlopeShingleMaterialByProduct.three_tab');
});
test('3: saved books move the service-wide choice and prices onto each asphalt product; the 3-tab answer is never assumed',()=>{
  const legacy={roofProductClass:{a:'asphalt_shingle',b:'asphalt_shingle',t:'concrete_tile'},lowSlopeAssembly:'nbc_low_slope_application',nbcLowSlopeShingleFactor:1.5,nbcLowSlopeShingleMaterialPerSquare:10000,other:1};
  assert.deepEqual(migrateRoofLowSlopeVNext(legacy),{roofProductClass:legacy.roofProductClass,other:1,lowSlopeAssemblyByProduct:{a:'nbc_low_slope_application',b:'nbc_low_slope_application'},nbcLowSlopeShingleFactorByProduct:{a:1.5,b:1.5},nbcLowSlopeShingleMaterialByProduct:{a:10000,b:10000}});
  assert.equal(migrateRoofLowSlopeVNext({roofProductClass:{a:'asphalt_shingle'}}).lowSlopeAssemblyByProduct,undefined);
  // An existing per-product answer wins over the moved one.
  assert.equal(migrateRoofLowSlopeVNext({...legacy,lowSlopeAssemblyByProduct:{a:'double_underlayment'}}).lowSlopeAssemblyByProduct.a,'double_underlayment');
  // Through the editor: a saved legacy book (base and a price option) reaches the editor per product.
  const id=owner('CA'),f=structuredClone(ROOF);const raw={...f.ownerPricing,id:randomUUID(),active:true,tiers:[{name:'Premium',overrides:{lowSlopeAssembly:'double_underlayment'}}]};delete raw.origin;
  savePricebook(id,{services:[raw],defaults:{...f.businessDefaults,currency:'CAD'}});
  const read=bridge.readApplicationBook(id).services[0],pricing=read.pricing||read;
  for(const field of LEGACY)assert.equal(Object.hasOwn(pricing,field),false,field);
  assert.deepEqual(pricing.lowSlopeAssemblyByProduct,{asphalt_shingle:'nbc_low_slope_application'});
  assert.deepEqual(pricing.nbcLowSlopeShingleFactorByProduct,{asphalt_shingle:1.5});
  assert.equal(pricing.roofProductThreeTab,undefined);
  assert.deepEqual(read.tiers[0].overrides,{lowSlopeAssemblyByProduct:{asphalt_shingle:'double_underlayment'}});
  // The engine reads an unsaved legacy book the same way as the moved one.
  const moved=structuredClone(ROOF);moved.ownerPricing.pricing=migrateRoofLowSlopeVNext(moved.ownerPricing.pricing);
  for(const threeTab of [undefined,true]){
    const a=structuredClone(ROOF),b=structuredClone(moved);if(threeTab){a.ownerPricing.pricing.roofProductThreeTab={asphalt_shingle:true};b.ownerPricing.pricing.roofProductThreeTab={asphalt_shingle:true};}
    const qa=generateQuoteVNext(a),qb=generateQuoteVNext(b);assert.equal(qa.resultType,qb.resultType);assert.equal(total(qa),total(qb));
  }
});
test('3: no new customer questions',()=>{
  const names=p=>Object.keys(customerContractForVNext('ROOFING_REPLACEMENT',p,{}).fields).sort();
  const legacy=structuredClone(ROOF).ownerPricing.pricing,current=roof({method:'nbc_low_slope_application',threeTab:true}).ownerPricing.pricing;
  assert.deepEqual(names(current),names(legacy));
});
test('3: the editor offers the cemented method only for products marked 3-tab',async()=>{
  const source=await readFile(new URL('../client/src/pricebook.jsx',import.meta.url),'utf8');
  assert.match(source,/option!=='nbc_low_slope_application'\|\|pricing\?\.roofProductThreeTab\?\.\[key\]===true/);
  const meta=bridge.applicationMetadata().services.find(s=>s.serviceType==='ROOFING_REPLACEMENT'),field=name=>meta.fields.find(f=>f.field===name);
  assert.equal(field('roofProductThreeTab').label,'3-tab shingle');assert.equal(field('roofProductThreeTab').tree.leafType,'boolean');
  assert.equal(field('lowSlopeAssemblyByProduct').tree.leafType,'enum');
  for(const name of LEGACY)assert.equal(field(name),undefined,name);
});

// ---------------------------------------------------------------------------
// 4. A province rate is needed only when the job is taxed
// ---------------------------------------------------------------------------
const POSTAL={NL:'A1A 1A1',NS:'B3H 1A1',PE:'C1A 1A1',NB:'E1C 1A1',QC:'H2X 1A1',ON:'M5V 2T6',MB:'R3C 1A1',SK:'S4P 1A1',AB:'T2P 1J9',BC:'V6B 1A1',NT_NU:'X1A 2P7',YT:'Y1A 1A1'};
function job(kind){
  // labor-only: 125.00 of labor; materials-only: 125.00 of materials; mixed: 200 sq ft tile (660.00 labor, 1,120.00 materials).
  if(kind==='mixed')return flooring('tile',200);
  const f=custom();f.ownerPricing.pricing.customChargeClassification=kind==='labor'?'labor':'material';return f;
}
test('4: every province pairing, TAX_ALL and TAX_MATERIALS, labor-only, materials-only and mixed jobs, owner rates set and blank, tax by location on and off',()=>{
  // Written before execution. The rate is the province's when the job is in another
  // province than the saved one, or when tax follows the job location; else the business rate (9%).
  // A blank Quebec, BC, Manitoba or Saskatchewan rate sends the job to review only when the job
  // has a taxable amount: always under TAX_ALL; under TAX_MATERIALS (materials taxed, labor not)
  // only with materials. A labor-only job is then quoted with no tax.
  const owners={QC:14.975,BC:12,MB:12,SK:11};let checks=0;
  for(const business of [...CANADIAN_PROVINCES,undefined])for(const [province,code] of Object.entries(POSTAL))for(const mode of ['TAX_ALL','TAX_MATERIALS'])
  for(const kind of ['labor','materials','mixed'])for(const rates of [owners,{}])for(const on of [false,true]){
    const f=job(kind);f.ownerPricing.taxabilityByCategory={...f.ownerPricing.taxabilityByCategory,labor:false,material:true};
    Object.assign(f.businessDefaults,{taxMode:mode,taxPercent:9,currency:'CAD',businessCountry:'CA',...(business?{businessProvince:business}:{}),...(on?{taxByJobLocation:true}:{}),...(Object.keys(rates).length?{provinceTaxPercent:rates}:{})});
    f.customerInputs.postalCode=code;
    const home=business===undefined||(['NT','NU'].includes(business)?'NT_NU':business)===province;
    const usesProvince=on||!home,rate=FIXED_PROVINCE_RATES[province]??rates[province];
    const taxable=mode==='TAX_ALL'||kind!=='labor';
    const q=generateQuoteVNext(f);checks++;
    const tag=`${business} ${province} ${mode} ${kind} rates ${Object.keys(rates).length?'set':'blank'} location ${on}`;
    if(usesProvince&&rate===undefined&&taxable){assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',tag);assert.deepEqual(q.missingOwnerFields,['businessDefaults.provinceTaxPercent.'+province],tag);continue;}
    assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',`${tag}: ${q.reviewReason}`);
    const tax=q.options[0].calculationRecord.scenarios.mid.tax;
    if(!taxable)assert.equal(tax.taxCents,0,tag);
    else assert.equal(tax.percent,usesProvince?rate:9,tag);
  }
  assert.equal(checks,14*12*2*3*2*2);
});

// ---------------------------------------------------------------------------
// 5. Tax wording
// ---------------------------------------------------------------------------
test('5: the province paragraph and the "No" option read as decided, by country',async t=>{
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const out=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',logLevel:'silent',define:{'process.env.NODE_ENV':'"development"'},
    stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {TaxLocationSettings} from './client/src/taxLocationEditor.jsx';
      createRoot(document.getElementById('root')).render(<TaxLocationSettings defaults={window.defaults} businessCountry={window.country} onDefault={()=>{}}/>);`}});
  const paragraph="A job in a province other than the one you saved at sign-up is taxed at that province's rate. In the provinces below, enter the combined rate you charge there (GST plus any QST or PST you collect). Jobs there that are taxed go to you for review while the rate is blank.";
  for(const [country,no,shown] of [['CA','No: use my tax rate on jobs in my province',true],['US','No: use my tax rate on every job',false],[null,'No: use my tax rate on every job',false]]){
    const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
    dom.window.eval(`window.structuredClone=x=>JSON.parse(JSON.stringify(x));window.country=${JSON.stringify(country)};window.defaults=${JSON.stringify({taxMode:'TAX_ALL',taxPercent:13,currency:'CAD'})};`);dom.window.eval(out.outputFiles[0].text);
    for(let i=0;i<200&&!dom.window.document.querySelector('option');i++)await new Promise(r=>setTimeout(r,10));
    const text=dom.window.document.body.textContent;
    assert.ok([...dom.window.document.querySelectorAll('option')].some(o=>o.textContent===no),`${country}: ${text.slice(0,200)}`);
    assert.equal(text.includes(paragraph),shown,String(country));
  }
});
