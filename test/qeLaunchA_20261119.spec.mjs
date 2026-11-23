import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mowing,flooring,withLaneDAnswers} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext,FEE_RULE_MODES,customerContractForVNext,getVNextPriceBookMetadata} from '../server/quote-engine-vnext/index.js';
import {validateServiceRulesDetailed} from '../server/quote-engine-vnext/contracts.js';
import {offeringContract} from '../server/quote-engine-vnext/configuredOfferings.js';
import {BUILDING_AGES,BUILDING_AGE_FIELD,BUILDING_AGE_ALIASES} from '../server/quote-engine-vnext/buildingAgeRules.js';
import {jobTaxPercent,outsideCountryJob,quotedTaxRateAt,sampleTaxLocationCode,serviceTaxPrefill,taxLocationDiagnostics} from '../server/taxJurisdiction.js';
import {checkStoredQuoteBookingAddress} from '../server/src/quoteBookingLocation.js';
import {applyPriceMetadata} from '../server/priceMetadata.js';
import {contractorValidationMessage} from '../server/priceBookService.js';
import {validatePricebookNumericDraft} from '../server/priceBookMoney.js';
import {ALL_OWNER_FIELDS} from '../server/priceBookMetadata.js';
import {applicationMetadata,applicationServiceDefinition,approvalContent} from '../server/src/quoteDoneBridge.js';
import {voiceQuestionContract,bindVoiceQuoteInputs} from '../server/src/voice/voiceQuoteContract.js';
import {reviewRows} from '../client/src/pricebookReview.js';
import {markEditedPriceMetadata} from '../client/src/pricebookPriceMetadata.js';
import {corpusInputs} from '../verification/engine-fingerprint/fingerprint.mjs';
import {fourTypes} from './fenceLaneB20261016Fixture.mjs';

const mid=q=>q.options[0].calculationRecord.scenarios.mid;
const range=q=>[q.options[0].lowEstimate,q.options[0].midEstimate,q.options[0].highEstimate];
function taxed(f,defaults,service={},customer={}){Object.assign(f.businessDefaults,defaults);Object.assign(f.ownerPricing,service);Object.assign(f.customerInputs,customer);return f;}
const SK={taxMode:'TAX_ALL',taxPercent:11,businessCountry:'CA',businessProvince:'SK',currency:'CAD'};
const ON={taxMode:'TAX_ALL',taxPercent:13,businessCountry:'CA',businessProvince:'ON',currency:'CAD'};
const US={taxMode:'TAX_ALL',taxPercent:6,businessCountry:'US',currency:'USD'};
const ZONES=[{name:'[SYNTHETIC] Split ZIP east',codes:['98101-1234'],percent:10.25},{name:'[SYNTHETIC] Downtown',codes:['98101'],percent:9.5},{name:'[SYNTHETIC] Region',codes:['981'],percent:8}];
// The mowing fixture: 5,000 sq ft x 2 cents x weekly 1 x maintained 1 = 10,000 cents ($100) before tax.
// The flooring fixture: 200 sq ft tile: labor 200 x 300 x 1.10 = 66,000; material 200 x 1.12 x 500 = 112,000; 178,000 before tax.
const ready=(q,cents,tax)=>{assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);assert.equal(mid(q).finalTotalCents,cents);assert.equal(mid(q).tax.taxCents,tax);};

// ---------------------------------------------------------------- A1
test('A1 a Saskatchewan mow at the service rate of 5% carries GST only',()=>{
  // Defect case. Before: 10,000 x 11% = 1,100 tax, 11,100 total.
  // Service rate 5: 10,000 x 5% = 500 tax; 10,000 + 500 = 10,500 cents.
  ready(generateQuoteVNext(taxed(mowing(),SK,{taxPercent:5})),10500,500);
  // The business rate is still used without a service rate: 11,100.
  ready(generateQuoteVNext(taxed(mowing(),SK)),11100,1100);
  // Blank (null or empty) means the business rate: 11,100.
  for(const blank of [null,''])ready(generateQuoteVNext(taxed(mowing(),SK,{taxPercent:blank})),11100,1100);
  // A Saskatchewan postal code is the business's own province: 10,500.
  ready(generateQuoteVNext(taxed(mowing(),SK,{taxPercent:5},{postalCode:'S4P 3Y2'})),10500,500);
});

test('A1 boundaries: 0 and 100 are rates; above 100 or negative is refused',()=>{
  // 0%: 10,000 + 0 = 10,000. 100%: 10,000 + 10,000 = 20,000.
  ready(generateQuoteVNext(taxed(mowing(),ON,{taxPercent:0})),10000,0);
  ready(generateQuoteVNext(taxed(mowing(),ON,{taxPercent:100})),20000,10000);
  for(const bad of [100.0001,-1,'5']){
    const q=generateQuoteVNext(taxed(mowing(),ON,{taxPercent:bad}));
    assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(q.invalidOwnerFields,['taxPercent']);
  }
  // A price option cannot carry its own rate.
  const tier=taxed(mowing(),SK);tier.ownerPricing.tiers=[{name:'Good',overrides:{taxPercent:5}}];
  assert.deepEqual(generateQuoteVNext(tier).invalidOwnerFields,['tiers.0.overrides.taxPercent']);
});

test('A1 the service rate replaces the own-province rate; another province, a tax zone and no tax are unchanged',()=>{
  // Ontario postal code with job-location tax off: Ontario 13% stays: 10,000 x 13% = 1,300; 11,300.
  ready(generateQuoteVNext(taxed(mowing(),SK,{taxPercent:5},{postalCode:'K1A 0B1'})),11300,1300);
  // Job-location tax on, Saskatchewan job, owner Saskatchewan rate 11: the service rate replaces it: 500; 10,500.
  ready(generateQuoteVNext(taxed(mowing(),{...SK,taxByJobLocation:true,provinceTaxPercent:{SK:11}},{taxPercent:5},{postalCode:'S4P 3Y2'})),10500,500);
  // Same with no Saskatchewan rate entered: the service rate is used, no review: 10,500.
  ready(generateQuoteVNext(taxed(mowing(),{...SK,taxByJobLocation:true},{taxPercent:5},{postalCode:'S4P 3Y2'})),10500,500);
  // Without the service rate that job still needs the owner's Saskatchewan rate (unchanged review).
  const unset=generateQuoteVNext(taxed(mowing(),{...SK,taxByJobLocation:true},{},{postalCode:'S4P 3Y2'}));
  assert.deepEqual(unset.missingOwnerFields,['businessDefaults.provinceTaxPercent.SK']);
  // Nova Scotia job with job-location tax on: CRA 14%: 1,400; 11,400.
  ready(generateQuoteVNext(taxed(mowing(),{...SK,taxByJobLocation:true},{taxPercent:5},{postalCode:'B3H 1A1'})),11400,1400);
  // United States: a job in a ZIP tax zone keeps the zone rate: 178,000 x 9.5% = 16,910; 194,910.
  // (v45: 98101 holds a ZIP+4 zone at 10.25%, so a ZIP+4 code inside 98101 is used here.)
  ready(generateQuoteVNext(taxed(flooring(),{...US,taxByJobLocation:true,taxZones:ZONES},{taxPercent:4},{postalCode:'98101-9999'})),194910,16910);
  // Outside every zone with the business rate chosen: the service rate is used: 178,000 x 4% = 7,120; 185,120.
  ready(generateQuoteVNext(taxed(flooring(),{...US,taxByJobLocation:true,taxZones:ZONES,taxOutsideZones:'business_rate'},{taxPercent:4},{postalCode:'10001'})),185120,7120);
  // Job-location tax off: 7,120 as well.
  ready(generateQuoteVNext(taxed(flooring(),US,{taxPercent:4})),185120,7120);
  // No tax mode: the service rate charges nothing: 10,000.
  ready(generateQuoteVNext(taxed(mowing(),{...ON,taxMode:'TAX_NONE',taxPercent:0},{taxPercent:5})),10000,0);
});

test('A1 the service rate is used everywhere tax is: minimum and materials-only tax',()=>{
  // Minimum $150: 10,000 subtotal + 5,000 minimum top-up = 15,000; x 5% = 750; 15,750; range 157.50.
  const f=taxed(mowing(),ON,{taxPercent:5});f.ownerPricing.pricing.minimumServiceCharge=15000;
  const q=generateQuoteVNext(f);ready(q,15750,750);assert.deepEqual(range(q),[157.5,157.5,157.5]);
  // Materials-only tax, materials taxed: 112,000 x 4% = 4,480; 182,480 (business 6% would be 6,720).
  const m=taxed(flooring(),{...US,taxMode:'TAX_MATERIALS'},{taxPercent:4});
  m.ownerPricing.taxabilityByCategory=Object.fromEntries(Object.keys(m.ownerPricing.taxabilityByCategory).map(k=>[k,k==='material']));
  ready(generateQuoteVNext(m),182480,4480);
  delete m.ownerPricing.taxPercent;ready(generateQuoteVNext(m),184720,6720);
});

test('A1 price book wiring: validation, save errors, numeric draft, approval content, metadata, review rows, AI confirmation',()=>{
  assert.deepEqual(validateServiceRulesDetailed({...mowing().ownerPricing,taxPercent:5}).filter(d=>d.path==='taxPercent'),[]);
  assert.equal(validateServiceRulesDetailed({...mowing().ownerPricing,taxPercent:101}).find(d=>d.path==='taxPercent').message,'Enter the tax rate for this service from 0 to 100 percent, or leave it blank to use your business tax rate.');
  assert.equal(contractorValidationMessage('services[0].taxPercent must be a finite number.',{services:[{serviceType:'LANDSCAPING_MOWING'}]}),'Tax rate for this service must be a finite number.');
  assert.throws(()=>validatePricebookNumericDraft({services:[{serviceType:'LANDSCAPING_MOWING',taxPercent:'5%'}],defaults:{}}));
  assert.equal(validatePricebookNumericDraft({services:[{serviceType:'LANDSCAPING_MOWING',taxPercent:null}],defaults:{}}),true);
  // The approved content changes with the rate, so a changed rate needs approval again.
  const raw=mowing().ownerPricing,book={ownerId:raw.origin.ownerId,defaults:{...mowing().businessDefaults},services:[raw]};
  assert.equal(approvalContent(raw,book).service.taxPercent,undefined);
  assert.equal(approvalContent({...raw,taxPercent:5},book).service.taxPercent,5);
  const meta=applicationMetadata().services.find(s=>s.serviceType==='LANDSCAPING_MOWING');
  assert.equal(meta.ruleFields.find(f=>f.field==='taxPercent').label,'Tax rate for this service (%)');
  assert.ok(reviewRows({...raw,taxPercent:5},{},meta).some(row=>row.label==='Tax rate for this service'&&row.value==='5%'));
  // An AI-sourced service needs the owner to confirm its tax rate like its other service settings.
  const ai=taxed(mowing(),ON,{taxPercent:5});ai.ownerPricing.source=ai.ownerPricing.origin.source='AI_SUGGESTED';
  ai.ownerPricing.confirmedFields=Object.fromEntries(Object.keys(ai.ownerPricing.pricing).map(k=>[k,true]));
  const unconfirmed=generateQuoteVNext(ai);
  assert.equal(unconfirmed.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(unconfirmed.missingOwnerFields.includes('taxPercent'));
});

test('A1 Saskatchewan mowing offers 5% for the owner to confirm; nothing else does',()=>{
  const prefill=serviceTaxPrefill('CA','SK','LANDSCAPING_MOWING');
  assert.equal(prefill.taxPercent,5);assert.equal(prefill.needsOwnerConfirmation,true);
  for(const args of [['CA','SK','LANDSCAPING_CLEANUP'],['CA','ON','LANDSCAPING_MOWING'],['US','SK','LANDSCAPING_MOWING'],[undefined,undefined,'LANDSCAPING_MOWING']])assert.equal(serviceTaxPrefill(...args),null);
  // The offer is not a saved rate: until confirmed, the mow is taxed at the business rate (11,100).
  ready(generateQuoteVNext(taxed(mowing(),SK)),11100,1100);
});

// ---------------------------------------------------------------- A2
test('A2 a US ZIP on an Ontario business is quoted with no tax under both job-location settings',()=>{
  // Defect case. Before: location off 10,000 x 13% = 11,300; location on: review.
  for(const location of [false,true]){
    const q=generateQuoteVNext(taxed(mowing(),{...ON,taxByJobLocation:location},{},{postalCode:'10001'}));
    ready(q,10000,0);assert.equal(mid(q).tax.mode,'TAX_NONE');
    assert.equal(q.options[0].taxTreatment,'No tax added.');
    assert.match(q.options[0].disclaimer,/This location is outside Canada, so no tax is included; the business will confirm the tax for this location\./);
    const customer=sanitizeForCustomerVNext(q);assert.equal(customer.calculationRecord,undefined);assert.match(customer.disclaimer,/outside Canada/);
  }
  // A United States business with a Canadian postal code: 178,000, no tax.
  const us=generateQuoteVNext(taxed(flooring(),US,{},{postalCode:'K1A 0B1'}));ready(us,178000,0);
  assert.match(us.options[0].disclaimer,/This location is outside the United States, so no tax is included/);
});

test('A2 boundaries: minimum, range and materials-only tax read the job as untaxed',()=>{
  // Minimum $150 with a 10% buffer: 15,000, no tax; the range collapses at the minimum exactly as an untaxed domestic job: 150/150/150.
  const f=taxed(mowing(),{...ON,rangeBufferPercent:10},{},{postalCode:'10001'});f.ownerPricing.pricing.minimumServiceCharge=15000;
  const q=generateQuoteVNext(f);ready(q,15000,0);assert.deepEqual(range(q),[150,150,150]);
  const domestic=taxed(mowing(),{...ON,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:10});domestic.ownerPricing.pricing.minimumServiceCharge=15000;
  assert.deepEqual(range(generateQuoteVNext(domestic)),[150,150,150]);
  // 20,000 sq ft: 40,000 cents; 10% buffer: 36,000 to 44,000 cents.
  const big=taxed(mowing(),{...ON,rangeBufferPercent:10},{},{postalCode:'10001',yardSqft:20000});
  const b=generateQuoteVNext(big);ready(b,40000,0);assert.deepEqual(range(b),[360,400,440]);
  // Materials-only tax: 178,000, no tax.
  ready(generateQuoteVNext(taxed(flooring(),{...ON,taxMode:'TAX_MATERIALS'},{},{postalCode:'10001'})),178000,0);
});

test('A2 domestic jobs, untaxed businesses and an unknown business country are unchanged',()=>{
  ready(generateQuoteVNext(taxed(mowing(),ON,{},{postalCode:'K1A 0B1'})),11300,1300);
  ready(generateQuoteVNext(taxed(mowing(),ON,{},{postalCode:'B3H 1A1'})),11400,1400);
  const none=generateQuoteVNext(taxed(mowing(),{...ON,taxMode:'TAX_NONE',taxPercent:0},{},{postalCode:'10001'}));
  ready(none,10000,0);assert.doesNotMatch(none.options[0].disclaimer,/outside Canada/);
  // No business country saved, job-location tax off: the business rate, as before (11,300).
  const noCountry=taxed(mowing(),{taxMode:'TAX_ALL',taxPercent:13},{},{postalCode:'10001'});
  ready(generateQuoteVNext(noCountry),11300,1300);
  assert.equal(outsideCountryJob('10001',{taxMode:'TAX_ALL',taxPercent:13}),null);
  // An invalid code is still asked again.
  assert.deepEqual(generateQuoteVNext(taxed(mowing(),ON,{},{postalCode:'1234'})).invalidCustomerFields,['postalCode']);
  // Job-location tax on with no code is still asked for.
  assert.deepEqual(generateQuoteVNext(taxed(mowing(),{...ON,taxByJobLocation:true})).missingCustomerFields,['postalCode']);
});

// ---------------------------------------------------------------- A1, A2 at booking
test('A1 A2 a booking address keeps the quote only where the quoted rate applies',()=>{
  const stored=f=>({resultJson:JSON.stringify(generateQuoteVNext(f))});
  const check=(row,code)=>checkStoredQuoteBookingAddress({quoteRow:row,bookingPostalCode:code});
  // Saskatchewan mow at the service rate 5%: another Saskatchewan address keeps it; Ontario (13%) does not.
  let row=stored(taxed(mowing(),SK,{taxPercent:5},{postalCode:'S4P 3Y2'}));
  assert.equal(check(row,'S7K 0A1').ok,true);assert.equal(check(row,'K1A 0B1').reason,'TAX_RATE_MISMATCH');
  // Job-location tax on, Saskatchewan rate 11, service rate 5: the same.
  row=stored(taxed(mowing(),{...SK,taxByJobLocation:true,provinceTaxPercent:{SK:11}},{taxPercent:5},{postalCode:'S4P 3Y2'}));
  assert.equal(check(row,'S7K 0A1').ok,true);assert.equal(check(row,'B3H 1A1').reason,'TAX_RATE_MISMATCH');
  // A US job for an Ontario business, quoted with no tax: another US address keeps it; an Ontario address does not.
  row=stored(taxed(mowing(),ON,{},{postalCode:'10001'}));
  assert.equal(check(row,'90210').ok,true);assert.equal(check(row,'K1A 0B1').reason,'TAX_RATE_MISMATCH');
  // Job-location tax off, Ontario job at 13%: an Ontario address keeps it; Nova Scotia (14%) does not.
  row=stored(taxed(mowing(),ON,{},{postalCode:'K1A 0B1'}));
  assert.equal(check(row,'M5V 2T6').ok,true);assert.equal(check(row,'B3H 1A1').reason,'TAX_RATE_MISMATCH');
  // A quote sent without a code has nothing to compare (unchanged).
  assert.equal(check(stored(taxed(mowing(),ON)),'B3H 1A1').ok,true);
});
test('A1 A2 the booking check works out the rate exactly as the quote does',()=>{
  const cases=[[SK,{taxPercent:5}],[SK,{}],[{...SK,taxByJobLocation:true,provinceTaxPercent:{SK:11}},{taxPercent:5}],[{...SK,taxByJobLocation:true,provinceTaxPercent:{SK:11}},{}],[ON,{}],[ON,{taxPercent:0}],[{...ON,taxByJobLocation:true},{taxPercent:5}],[US,{taxPercent:4}],[{...US,taxByJobLocation:true,taxZones:ZONES,taxOutsideZones:'business_rate'},{taxPercent:4}]];
  let compared=0;
  for(const [defaults,service] of cases)for(const code of ['S4P 3Y2','K1A 0B1','B3H 1A1','98101-1234','98101','10001']){
    const q=generateQuoteVNext(taxed(mowing(),defaults,service,{postalCode:code}));if(q.resultType!=='INSTANT_ESTIMATE_READY')continue;
    const rate=quotedTaxRateAt(code,{...mowing().businessDefaults,...defaults},service.taxPercent??null);
    assert.equal(rate.status,'ok');assert.equal(rate.percent,mid(q).tax.mode==='TAX_NONE'?0:mid(q).tax.percent,JSON.stringify([defaults,service,code]));compared++;
  }
  assert.ok(compared>=40,String(compared));
});

// ---------------------------------------------------------------- A3
test('A3 a ZIP+4 tax zone wins over a 5-digit zone, which wins over a 3-digit prefix',()=>{
  const job=code=>generateQuoteVNext(taxed(flooring(),{...US,taxByJobLocation:true,taxZones:ZONES},{},{postalCode:code}));
  // Defect case. Before: the ZIP+4 zone entry was refused, so every quote went to review.
  // 98101-1234: 178,000 x 10.25% = 18,245; 196,245.
  ready(job('98101-1234'),196245,18245);
  // Another ZIP+4 in 98101: the 5-digit zone, 9.5%: 16,910; 194,910.
  ready(job('98101-9999'),194910,16910);
  // v45: a bare 98101 holds the 10.25% ZIP+4 zone, so the customer is asked for the ZIP+4 code.
  {const q=job('98101');assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(q.invalidCustomerFields,['postalCode']);assert.deepEqual(q.validationMessages,['Sales tax differs within this ZIP code. Enter your full 9-digit ZIP+4 code.']);}
  // 98199: the 981 prefix, 8%: 14,240; 192,240.
  ready(job('98199'),192240,14240);
  // 98200 is outside every zone: review, as before.
  assert.equal(job('98200').resultType,'ESTIMATE_REQUIRES_REVIEW');
});

test('A3 zone entry validation, spacing, duplicates and the activation sample code',()=>{
  assert.deepEqual(taxLocationDiagnostics({taxZones:ZONES}),[]);
  assert.deepEqual(taxLocationDiagnostics({taxZones:[{name:'Spaced',codes:['98101 - 1234'],percent:10}]}),[]);
  for(const bad of ['98101-123','981011234','9810'])
    assert.equal(taxLocationDiagnostics({taxZones:[{name:'Bad',codes:[bad],percent:10}]})[0].message,`Use a ZIP+4 code, 5-digit ZIP code or 3-digit ZIP prefix, not "${bad}".`);
  assert.equal(taxLocationDiagnostics({taxZones:[{name:'A',codes:['98101-1234'],percent:10},{name:'B',codes:['98101-1234'],percent:9}]})[0].message,'98101-1234 is already in another tax zone.');
  assert.equal(taxLocationDiagnostics({taxZones:[{name:'Empty',codes:[],percent:10}]})[0].message,'List at least one ZIP+4 code, 5-digit ZIP code or 3-digit ZIP prefix.');
  assert.equal(sampleTaxLocationCode({businessCountry:'US',taxZones:[{name:'Split',codes:['98101-1234'],percent:10}]}),'98101-1234');
  // 5-digit and 3-digit zones alone match as before.
  assert.equal(jobTaxPercent('98101-1234',{businessCountry:'US',taxZones:[{name:'Five',codes:['98101'],percent:9.5}]}).percent,9.5);
  assert.equal(jobTaxPercent('98150',{businessCountry:'US',taxZones:[{name:'Three',codes:['981'],percent:8}]}).percent,8);
});

// ---------------------------------------------------------------- A4
test('A4 the postal or ZIP code is asked whenever the quote charges tax, without adding a review',()=>{
  const service=mowing().ownerPricing,defaults=mowing().businessDefaults;
  const asked=d=>applicationServiceDefinition(service,{defaults:{...defaults,...d}}).customerFields.some(f=>f.name==='postalCode'&&f.required===true);
  assert.equal(asked({taxMode:'TAX_ALL',taxPercent:13}),true);
  assert.equal(asked({taxMode:'TAX_MATERIALS',taxPercent:13}),true);
  assert.equal(asked({taxMode:'TAX_NONE',taxPercent:0}),false);
  // Voice asks it before quoting.
  const definition=applicationServiceDefinition(service,{defaults:{...defaults,taxMode:'TAX_ALL',taxPercent:13}});
  assert.ok(voiceQuestionContract(service,definition,{}).fields.some(q=>q.field==='postalCode'));
  assert.ok(bindVoiceQuoteInputs(service,definition,{customerInputs:{...mowing().customerInputs}}).followUps.includes('What is the postal or ZIP code for the job?'));
  assert.deepEqual(bindVoiceQuoteInputs(service,definition,{customerInputs:{...mowing().customerInputs,postalCode:'b3h 1a1'}}).followUps,[]);
  // The engine still quotes a taxed job sent without one (no new review): 11,300.
  ready(generateQuoteVNext(taxed(mowing(),ON)),11300,1300);
});

// ---------------------------------------------------------------- A5
const tier=(name,v,metadata)=>({name,overrides:{laborPerSqft:{tile:v}},...(metadata?{priceMetadata:metadata}:{})});
const book=tiers=>({services:[{serviceType:'FLOORING_INSTALL',pricing:{laborPerSqft:{tile:500}},tiers}]});
const AUG='2026-08-01T00:00:00.000Z',NOV='2026-11-19T00:00:00.000Z';
function verifiedStandard(){
  const saved=applyPriceMetadata(book([tier('Standard',600)]),{services:[]},AUG);
  saved.services[0].tiers[0].priceMetadata['laborPerSqft.tile']={...saved.services[0].tiers[0].priceMetadata['laborPerSqft.tile'],verifiedAt:AUG,sourceNote:'Standard supplier invoice'};
  return saved;
}
test('A5 a new tier ahead of Standard does not take Standard\'s verification',()=>{
  // Defect case. Before: New product got Standard's August note and date by position.
  const out=applyPriceMetadata(book([tier('New product',600),tier('Standard',600)]),verifiedStandard(),NOV);
  assert.deepEqual(out.services[0].tiers[0].priceMetadata['laborPerSqft.tile'],{changedAt:NOV});
  assert.deepEqual(out.services[0].tiers[1].priceMetadata['laborPerSqft.tile'],{changedAt:AUG,verifiedAt:AUG,sourceNote:'Standard supplier invoice'});
});
test('A5 boundaries: unnamed tiers by position, a duplicate name, a renamed tier carrying its records',()=>{
  // Unnamed earlier and next tier in the same position: matched by position.
  const unnamed=verifiedStandard();unnamed.services[0].tiers[0].name='';
  let out=applyPriceMetadata(book([tier('',600)]),unnamed,NOV);
  assert.equal(out.services[0].tiers[0].priceMetadata['laborPerSqft.tile'].sourceNote,'Standard supplier invoice');
  // Two tiers named Standard: only the first takes the earlier records.
  out=applyPriceMetadata(book([tier('Standard',600),tier('Standard',600)]),verifiedStandard(),NOV);
  assert.equal(out.services[0].tiers[0].priceMetadata['laborPerSqft.tile'].verifiedAt,AUG);
  assert.deepEqual(out.services[0].tiers[1].priceMetadata['laborPerSqft.tile'],{changedAt:NOV});
  // Renamed in the editor (the tier keeps its records with it): history kept.
  const saved=verifiedStandard(),renamed=structuredClone(saved);renamed.services[0].tiers[0].name='Premium';
  out=applyPriceMetadata(renamed,saved,NOV);
  assert.deepEqual(out.services[0].tiers[0].priceMetadata['laborPerSqft.tile'],{changedAt:AUG,verifiedAt:AUG,sourceNote:'Standard supplier invoice'});
  // A renamed tier with no records of its own, while Standard is gone: no history.
  out=applyPriceMetadata(book([tier('Premium',600)]),verifiedStandard(),NOV);
  assert.deepEqual(out.services[0].tiers[0].priceMetadata['laborPerSqft.tile'],{changedAt:NOV});
});
test('A5 unchanged: reordered named tiers keep their own records',()=>{
  const saved=applyPriceMetadata(book([tier('Good',600),tier('Better',700)]),{services:[]},AUG);
  saved.services[0].tiers[1].priceMetadata['laborPerSqft.tile'].sourceNote='Better quote';
  const out=applyPriceMetadata(book([tier('Better',700),tier('Good',600)]),saved,NOV);
  assert.deepEqual(out.services[0].tiers[0].priceMetadata['laborPerSqft.tile'],{changedAt:AUG,sourceNote:'Better quote'});
  assert.deepEqual(out.services[0].tiers[1].priceMetadata['laborPerSqft.tile'],{changedAt:AUG});
});

test('A5 the same holds for named fence price options inside a service, on save and in the editor draft',()=>{
  const service=fourTypes().ownerPricing,tiers=service.pricing.fenceOfferings.aluminum.tiers;
  const path=i=>`fenceOfferings.aluminum.tiers.${i}.overrides.heightRows.six.offeringRates.installedFencePerLF`;
  const saved=applyPriceMetadata({services:[service]},{services:[]},AUG);
  saved.services[0].priceMetadata[path(0)]={...saved.services[0].priceMetadata[path(0)],verifiedAt:AUG,sourceNote:'First option supplier'};
  const firstName=tiers[0].name;
  // A new named option inserted ahead of the first one, at the same price.
  const draft=structuredClone(saved.services[0]),added=structuredClone(draft.pricing.fenceOfferings.aluminum.tiers[0]);added.name='[SYNTHETIC] New product';
  draft.pricing.fenceOfferings.aluminum.tiers.unshift(added);
  const edited=markEditedPriceMetadata(saved.services[0],draft);
  assert.equal(edited.priceMetadata[path(0)]?.sourceNote,undefined);
  const out=applyPriceMetadata({services:[edited]},saved,NOV).services[0].priceMetadata;
  assert.equal(out[path(0)].sourceNote,undefined);assert.equal(out[path(0)].verifiedAt,undefined);assert.equal(out[path(0)].changedAt,NOV);
  // The first option, now second, keeps its own note and check date.
  assert.equal(out[path(1)].sourceNote,'First option supplier');assert.equal(out[path(1)].verifiedAt,AUG);
  assert.equal(edited.pricing.fenceOfferings.aluminum.tiers[1].name,firstName);
});

// ---------------------------------------------------------------- A6
function verifiedBase(){
  const first=applyPriceMetadata({services:[{serviceType:'FLOORING_INSTALL',pricing:{laborPerSqft:{tile:600}}}]},{services:[]},AUG);
  first.services[0].priceMetadata['laborPerSqft.tile']={...first.services[0].priceMetadata['laborPerSqft.tile'],verifiedAt:AUG,sourceNote:'Supplier invoice 1234'};
  return first;
}
test('A6 a changed price drops its earlier check date and source note',()=>{
  // Defect case. Before: 600 -> 800 kept verifiedAt August 1 and "Supplier invoice 1234".
  const saved=verifiedBase(),edited=structuredClone(saved);edited.services[0].pricing.laborPerSqft.tile=800;
  assert.deepEqual(applyPriceMetadata(edited,saved,NOV).services[0].priceMetadata['laborPerSqft.tile'],{changedAt:NOV});
  // The editor's draft drops the earlier check date as soon as the amount changes.
  const draft=markEditedPriceMetadata(saved.services[0],edited.services[0]);
  assert.equal(draft.priceMetadata['laborPerSqft.tile'].verifiedAt,undefined);
});
test('A6 boundaries: a new note or a re-check with the new amount',()=>{
  const saved=verifiedBase();
  const noted=structuredClone(saved);noted.services[0].pricing.laborPerSqft.tile=800;noted.services[0].priceMetadata['laborPerSqft.tile'].sourceNote='Supplier invoice 5678';
  assert.deepEqual(applyPriceMetadata(noted,saved,NOV).services[0].priceMetadata['laborPerSqft.tile'],{changedAt:NOV,sourceNote:'Supplier invoice 5678'});
  const checked=structuredClone(saved);checked.services[0].pricing.laborPerSqft.tile=800;checked.services[0].priceMetadata['laborPerSqft.tile'].reverified=true;
  assert.deepEqual(applyPriceMetadata(checked,saved,NOV).services[0].priceMetadata['laborPerSqft.tile'],{changedAt:NOV,verifiedAt:NOV,sourceNote:'Supplier invoice 1234'});
});
test('A6 unchanged: an unchanged price keeps its check date and note',()=>{
  const saved=verifiedBase();
  assert.deepEqual(applyPriceMetadata(structuredClone(saved),saved,NOV).services[0].priceMetadata['laborPerSqft.tile'],{changedAt:AUG,verifiedAt:AUG,sourceNote:'Supplier invoice 1234'});
});

// ---------------------------------------------------------------- A7, A8
test('A7 the starting-value prompt says only that the values match',()=>{
  const editor=readFileSync(new URL('../client/src/pricebook.jsx',import.meta.url),'utf8');
  assert.ok(editor.includes('This service still matches earlier starting values: {updates'));
  assert.ok(editor.includes('Values that differ from the earlier starting values are not affected.'));
  assert.equal(editor.includes('you never changed'),false);assert.equal(editor.includes('Values you set yourself'),false);
  const comment=readFileSync(new URL('../server/quote-engine-vnext/startingFactorUpdates.js',import.meta.url),'utf8').split('export')[0];
  assert.equal(/never changed by the owner|set themselves/.test(comment),false);
});
test('A8 the country sentence replaces the currency fallback',()=>{
  const sentence="A job's country comes from its postal or ZIP code; without one, from the business country saved at onboarding. With neither, a decision that depends on the country goes to review.";
  const doc=readFileSync(new URL('../QUOTE_ENGINE.md',import.meta.url),'utf8').replace(/\s+/g,' ');
  assert.ok(doc.includes(sentence+' The lead-paint year rule uses the same order.'));
  assert.equal(/the currency only/.test(doc),false);
  const bridge=readFileSync(new URL('../server/src/quoteDoneBridge.js',import.meta.url),'utf8');
  assert.ok(bridge.includes(sentence));assert.equal(bridge.includes('(saved country, else currency)'),false);
});

// ---------------------------------------------------------------- A9
test('A9 new answers use 1978_to_1990 and 1991_or_later; earlier keys read the same',()=>{
  assert.deepEqual(BUILDING_AGES,['before_1978','1978_to_1990','1991_or_later','not_sure']);
  assert.deepEqual(BUILDING_AGE_ALIASES,{'1978_to_1989':'1978_to_1990','1990_or_later':'1991_or_later'});
  assert.equal(BUILDING_AGE_FIELD.optionLabels['1978_to_1990'],'1978 to 1990');assert.equal(BUILDING_AGE_FIELD.optionLabels['1991_or_later'],'1991 or later');
  // Every frozen input answered with the earlier key gives exactly the same result under the new key.
  const strip=q=>JSON.stringify({...q,quoteId:null,submittedCustomerInputs:null}).replace(/"quoteId":"[^"]*"/g,'').replace(/1978_to_1990/g,'1978_to_1989');
  const rows=corpusInputs().filter(r=>r.input.customerInputs?.buildingAge==='1978_to_1989');
  assert.equal(rows.length,10);
  for(const row of rows){const renamed=structuredClone(row.input);renamed.customerInputs.buildingAge='1978_to_1990';assert.equal(strip(generateQuoteVNext(renamed)),strip(generateQuoteVNext(structuredClone(row.input))),row.id);}
  // Flooring removal in a 1991-or-later building: 1990_or_later and 1991_or_later give the same quote.
  const removal=corpusInputs().find(r=>r.id==='v30:r07-flooring-removal-1978-to-1990').input;
  // Lane D fix D1: the frozen tile job answers what the floor is built on (withLaneDAnswers).
  const at=key=>{const f=withLaneDAnswers(removal);f.customerInputs.buildingAge=key;return generateQuoteVNext(f);};
  assert.equal(at('1991_or_later').resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(strip(at('1991_or_later')).replace(/1991_or_later/g,'1990_or_later'),strip(at('1990_or_later')));
  // The widget and voice offer only the new keys.
  const contract=customerContractForVNext('INTERIOR_PAINTING',{},{}).fields.buildingAge;
  assert.deepEqual(contract.values,BUILDING_AGES);
});

// ---------------------------------------------------------------- A10
test('A10 every save-error message names a field exactly as the editor does',()=>{
  const name=(type,field)=>contractorValidationMessage(`services[0].${field} must be a positive number.`,{services:[{serviceType:type}]}).replace(/ must be a positive number\.$/,'');
  // The six that contradicted the editor.
  assert.equal(name('ROOFING_REPLACEMENT','materialCostPerSquare'),'Roof base material price per square, material only with no labor, for the selected accessory method');
  assert.equal(name('ROOFING_REPLACEMENT','underlaymentPerSquare'),'Installed-area underlayment sell price per roofing square');
  assert.equal(name('FLOORING_INSTALL','underlaymentPerSqft'),'Installed-area underlayment sell price per square foot');
  assert.equal(name('FLOORING_REPLACEMENT','underlaymentPerSqft'),'Installed-area underlayment sell price per square foot');
  assert.equal(name('INTERIOR_PAINTING','trimLaborPerLF'),'Trim painting labor price per measured linear foot, per coat');
  assert.equal(name('INTERIOR_PAINTING','trimMaterialPerLF'),'Trim paint material price per measured linear foot, per coat');
  // Every price field and quantity assumption in the editor: zero differences apart from the review-only marker.
  let checked=0;
  for(const meta of getVNextPriceBookMetadata()){
    for(const field of meta.pricingFields){checked++;assert.equal(name(meta.serviceType,field.field),field.label.replace(/ — review only$/,''),meta.serviceType+'.'+field.field);}
    for(const setting of meta.class2Fields.filter(s=>!s.startingValueOnly)){checked++;assert.equal(name(meta.serviceType,setting.name),setting.label,meta.serviceType+'.'+setting.name);}
  }
  assert.ok(checked>400);
  // The editor metadata carries no older title for a field.
  for(const service of applicationMetadata().services)for(const field of service.fields)if(field.title)assert.equal(field.title,field.label,service.serviceType+'.'+field.field);
  // Fields outside the editor keep their own names (no generic fallback).
  assert.equal(name('INTERIOR_PAINTING','laborPerFloorSqft'),'Wall painting labor price per floor square foot');
  assert.ok(ALL_OWNER_FIELDS.ROOFING_REPLACEMENT.includes('materialCostPerSquare'));
});

// ---------------------------------------------------------------- A11
test('A11 the permit-required field is gone; when_scope_selected stays for other fees',()=>{
  for(const type of ['ROOFING_REPLACEMENT','LANDSCAPING_MOWING','FLOORING_INSTALL'])assert.equal(Object.hasOwn(customerContractForVNext(type,{},{}).fields,'permitRequired'),false);
  for(const mode of ['installed','itemized'])assert.equal(Object.hasOwn(offeringContract('FENCING_INSTALL',{offeringMode:mode}).fields,'permitRequired'),false);
  for(const meta of getVNextPriceBookMetadata())assert.equal(meta.customerFields.some(f=>f.name==='permitRequired'),false);
  assert.ok(FEE_RULE_MODES.includes('when_scope_selected'));
  // A customer answer to it, sent by a caller following earlier instructions, is ignored:
  // the quote is the one without it (10,000), never a refusal.
  for(const answer of [true,false]){const f=mowing();f.customerInputs.permitRequired=answer;const q=generateQuoteVNext(f);ready(q,10000,0);assert.equal(Object.hasOwn(q.submittedCustomerInputs||{},'permitRequired'),false);}
  // Unchanged: the owner-selected permit fee: 10,000 + 5,000 = 15,000 when applied.
  const g=mowing();g.businessDefaults.permitFee=5000;g.ownerPricing.feeRules.permit='owner_selected';g.feeSelections={owner:{permit:true},customer:{}};
  ready(generateQuoteVNext(g),15000,0);
  g.ownerPricing.feeRules.permit='when_scope_selected';
  assert.equal(generateQuoteVNext(g).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
