import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {generateQuoteVNext,ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {roofFixture,scopeKey} from '../verification/qe-roof-underlayment-20261018/roof-fixture.mjs';
import {scopeLines} from '../server/quote-engine-vnext/scopePricing.js';
import {includedFixture} from './quoteEngineVNextFixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {webQuote,phone,quoteEmailFixture,fixture as applicationFixture,bridge,date,db} from './quoteDeliveryBatch20261015Fixture.mjs';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';
import {migrate} from '../server/src/db.js';
import {submitQuote} from '../server/src/quoteDoneRoutes.js';
import {integratedBaselineExpectation} from './finalIntegrationMetadata20261017Fixture.mjs';

test('v9 comparison metadata advances only explicit paths on a clone, including results without options',()=>{
  // Expected before execution: only the four named engineVersion paths move
  // v7 -> v9. Historical inputs, amounts and unrelated version text stay exact.
  const old='quote-engine-vnext-date-context-20261006-v7',current='quote-engine-vnext-accuracy-20261018-v9';
  const record={engineVersion:old,amountCents:97600,unrelated:{engineVersion:old}};
  for(const options of [false,true]){
    const result={engineVersion:old,amountCents:97600,unrelated:{engineVersion:old}};
    if(options){result.options=[{calculationRecord:structuredClone(record)}];result.calculationRecord={...structuredClone(record),options:[structuredClone(record)]};}
    const row={input:{serviceType:'CUSTOM'},result},original=structuredClone(row),expected=structuredClone(result);
    expected.engineVersion=current;
    if(options){expected.calculationRecord.engineVersion=current;expected.options[0].calculationRecord.engineVersion=current;expected.calculationRecord.options[0].engineVersion=current;}
    assert.deepEqual(integratedBaselineExpectation(row),expected);
    assert.deepEqual(row,original);
    const records=[row.result,...(options?[row.result.calculationRecord,row.result.options[0].calculationRecord,row.result.calculationRecord.options[0]]:[])];
    for(const target of records){target.engineVersion='unexpected-version';assert.throws(()=>integratedBaselineExpectation(row),{code:'ERR_ASSERTION'});target.engineVersion=old;}
  }
});

const underlayment=result=>result.lineItems.find(line=>line.calculation.ratePath==='scopeRates.'+scopeKey);
const ready=f=>{const result=generateQuoteVNext(f);assert.equal(result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(result));return result;};
const scenario=result=>result.options[0].calculationRecord.scenarios.mid;
const cents=result=>scenario(result).finalTotalCents;
for(const mode of ['new','adopted'])for(const [scope,rolls,cents] of [['full',5,75000],['partial',3,45000]]) {
  test(`roof underlayment ${mode} ${scope}: footprint uses rounded surface`,()=>{
    // Fixed before running: 2121.32 surface; full ceil(2333.452/500)=5;
    // half ceil(1166.726/500)=3, each roll 15000 cents.
    const f=roofFixture({mode,customer:{serviceScope:scope,...(scope==='partial'?{partialPercent:50}:{})}});
    const result=generateQuoteVNext(f);
    assert.equal(result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(result));
    assert.equal(underlayment(result).calculation.quantity,rolls);
    assert.equal(underlayment(result).amountCents,cents);
  });
}

for(const mode of ['new','adopted'])for(const [scope,rolls,cost] of [['full',5,75000],['partial',3,45000]])test(`roof underlayment ${mode} ${scope}: measured surface equivalence`,()=>{
  // Expected before execution: both measurements describe 2121.32 sqft;
  // full is 5 rolls/75000c, half is 3/45000c. All priced lines must agree.
  const f=roofFixture({mode,customer:{serviceScope:scope,...(scope==='partial'?{partialPercent:50}:{})}});
  const surface=structuredClone(f);surface.customerInputs.roofSizeMethod='roof_measured';surface.customerInputs.roofSizeInput=2121.32;delete surface.customerInputs.pitchRisePer12;
  const a=ready(f),b=ready(surface);
  assert.equal(underlayment(b).calculation.quantity,rolls);assert.equal(underlayment(b).amountCents,cost);
  assert.equal(cents(a),cents(b));
  assert.deepEqual(a.lineItems.map(l=>[l.name,l.amountCents]),b.lineItems.map(l=>[l.name,l.amountCents]));
});

for(const mode of ['new','adopted'])test(`roof underlayment ${mode}: explicit partial surface takes precedence`,()=>{
  // 800 sqft is already the selected surface: ceil(800*1.10/500)=2 rolls.
  const f=roofFixture({mode,customer:{serviceScope:'partial',partialAreaSqft:800}});
  const result=ready(f);assert.equal(underlayment(result).calculation.quantity,2);assert.equal(underlayment(result).amountCents,30000);
  assert.equal(result.lineItems.find(l=>l.name==='Roofing labor').calculation.quantity,8);
  const both={...f.customerInputs,partialPercent:50};
  assert.equal(scopeLines('ROOFING_REPLACEMENT',both,f.ownerPricing.pricing,f.ownerPricing).lines[0].quantity,2);
  // Existing contract still rejects contradictory measurements; this repair
  // preserves precedence inside scope pricing without relaxing that guard.
  assert.equal(generateQuoteVNext({...f,customerInputs:both}).resultType,'ESTIMATE_REQUIRES_REVIEW');
});

for(const [footprint,rolls,cost] of [[707.105,2,30000],[707.111,3,45000]])test(`roof underlayment surface rounding before package boundary ${footprint}`,()=>{
  // Independent sqrt(2) calculations round to 1000.00 and 1000.01 sqft.
  // With 10% waste and 550 sqft/roll these straddle exactly two rolls.
  const f=roofFixture({customer:{roofSizeInput:footprint}});f.ownerPricing.pricing.scopeDetails[scopeKey].coverage=550;
  const result=ready(f);assert.equal(underlayment(result).calculation.quantity,rolls);assert.equal(underlayment(result).amountCents,cost);
});

for(const [scope,rolls,cost] of [['full',4,60000],['partial',2,30000]])test(`roof underlayment legacy ${scope} remains unchanged`,()=>{
  // Legacy measured 1500 sqft: 1650/500 -> 4; half 825/500 -> 2.
  const f=roofFixture({mode:'legacy',customer:{roofSizeMethod:'roof_measured',pitch:'low',serviceScope:scope,...(scope==='partial'?{partialPercent:50}:{})}});
  for(const field of ['pitchRisePer12','pitchMethod','pitchBand'])delete f.customerInputs[field];
  const result=ready(f);assert.equal(underlayment(result).calculation.quantity,rolls);assert.equal(underlayment(result).amountCents,cost);
  // At the isolated scope boundary, absence/legacy mode must never opt in.
  const unsupported={...f.customerInputs,roofSizeMethod:'footprint',pitchRisePer12:12};
  for(const rules of [{},f.ownerPricing])assert.equal(scopeLines('ROOFING_REPLACEMENT',unsupported,f.ownerPricing.pricing,rules).lines[0].quantity,rolls);
});

test('roof underlayment package cost receives existing markup and materials tax once',()=>{
  // Base lines cost 616148c; 20% markup rounds to123230c; taxable materials
  // (233345+75000)*1.2*.1 round to37001c. Total776379c.
  const f=roofFixture();Object.assign(f.businessDefaults,{markupPercent:20,taxMode:'TAX_MATERIALS',taxPercent:10});f.ownerPricing.taxabilityByCategory.material=true;
  const result=ready(f);assert.equal(underlayment(result).amountCents,75000);
  assert.equal(scenario(result).markup.amountCents,123230);
  assert.equal(scenario(result).tax.taxCents,37001);
  assert.equal(cents(result),776379);
});

for(const [scope,expected] of [['full',31820],['partial',15910]])test(`roof underlayment installed-area ${scope} remains surface-based without package waste`,()=>{
  // Installed rate1500c per measured roofing square, independently rounded.
  const f=roofFixture({customer:{serviceScope:scope,...(scope==='partial'?{partialPercent:50}:{})}}),p=f.ownerPricing.pricing;
  p.underlaymentPriceBasis.asphalt_shingle='installed_area_sell_price';p.underlaymentPerSquare={asphalt_shingle:1500};
  p.installedLaborPercent={'underlaymentPerSquare.asphalt_shingle':0};p.installedMaterialsPercent={'underlaymentPerSquare.asphalt_shingle':100};
  delete f.customerInputs.roofUnderlaymentScopeConfirmed;
  // Retained package settings must not become an additional charge.
  const result=ready(f),line=result.lineItems.find(l=>l.name==='Underlayment');
  assert.equal(line.amountCents,expected);assert.equal(underlayment(result),undefined);
});

test('roof underlayment retains included-zero semantics and unrelated measured scope controls',()=>{
  const f=roofFixture();f.ownerPricing.pricing.scopeRates[scopeKey]=0;
  assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
  f.ownerPricing=includedFixture(f.ownerPricing,{['scopeRates.'+scopeKey]:'materialCostPerSquare.asphalt_shingle'});
  assert.equal(underlayment(ready(f)).amountCents,0);
  // These existing fixtures contain their original independent expectations.
  for(const row of measuredScopeCases())assert.equal(cents(ready(row.input)),row.expected.cents,row.id);
});

for(const [scope,expected] of [['full',616148],['partial',315575]])test(`roof underlayment corrected ${scope} saved widget-route and voice-tool parity`,async t=>{
  // Fixed totals are the sum of the six hand-calculated lines in EXPECTED.md.
  const f=roofFixture({customer:{serviceScope:scope,...(scope==='partial'?{partialPercent:50}:{})}});delete f.ownerPricing.startingValueAdoptions;
  const w=webQuote(f,[],undefined,{roofRuleMode:'new'}),h=quoteEmailFixture(t);
  const voice=await phone(h,f,{applicationOptions:{roofRuleMode:'new'}});
  assert.equal(w.result.resultType,'INSTANT_ESTIMATE_READY');assert.equal(w.result.midEstimate,expected/100);
  assert.equal(voice.result.status,'quoted',JSON.stringify(voice.result));assert.equal(voice.result.midEstimate,expected/100);
  const estimated=await h.tool('getQuote',{...voice.args,callerMeasurementsEstimated:true});
  assert.equal(estimated.status,'quoted');assert.equal(estimated.midEstimate,expected/100);
  assert.match(estimated.quoteNarration,/This price is based on the measurements you gave us\. The business will confirm them on site\./);
  assert.equal(JSON.parse(w.row.internalOutcomeJson).internalResult.engineVersion,'quote-engine-vnext-accuracy-20261018-v9');
  for(const result of [w.result,voice.result])assert.doesNotMatch(JSON.stringify(result),/"(?:lineItems|scopeRates|installedLaborPercent|priceMetadata)"/);
});

test('roof underlayment v7 approval reviews new requests; explicit v9 reapproval preserves historical retries',async t=>{
  // Genuine pre-repair saved receipt:601148c/v7. New approved full quote:
  //616148c/v9. No old amount, version or owner rate is rewritten.
  const historical=JSON.parse(readFileSync(new URL('../verification/qe-roof-underlayment-20261018/historical-v7.json',import.meta.url),'utf8'));
  assert.equal(historical.base,'550728daea4058c37f13952ab78785929bab39b0');
  assert.equal(historical.response.midEstimate,6011.48);
  const oldOutcome=JSON.parse(historical.submission.internalOutcomeJson);
  assert.equal(oldOutcome.internalResult.engineVersion,'quote-engine-vnext-date-context-20261006-v7');
  assert.equal(cents(oldOutcome.internalResult),601148);
  migrate();const owner=historical.owner;
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Roof','QuoteDone','active','UTC','owner',?)").run(owner,owner+'@example.invalid',date.quoteInstant);
  db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(owner,'cus_SYNTHETIC_'+owner,date.quoteInstant,date.quoteInstant,date.quoteInstant);
  db.prepare("INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,'{}',?)").run(owner,date.quoteInstant);
  db.prepare("INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,enabled,updatedAt) VALUES(?,?,'SYNTHETIC','site_visit_first',0,?)").run(owner,historical.book.services[0].id,date.quoteInstant);
  for(const [table,row] of [['quotes',historical.quote],['quoteSubmissions',historical.submission]]){
    const keys=Object.keys(row);db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));
  }
  savePricebook(owner,historical.book);
  const base=applicationFixture(t,process.env.DATABASE_PATH),h=quoteEmailFixture(t,{base,context:base.context(owner)});
  const draft={...historical.body,requestId:randomUUID()};delete draft.intakeConfirmation;
  const before=loadPricebook(owner),savedPricing=structuredClone(before.services[0].pricing);
  assert.equal(bridge.applicationStatus(before.services[0],before).status,'NEEDS PRICING');
  assert.equal(bridge.prepareApplicationIntake(owner,draft,date).status,'needs_details');
  const review=submitQuote(owner,{...draft,reviewRequested:true},{clock:()=>new Date(date.quoteInstant)});
  assert.equal(review.response.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(review.response.midEstimate,undefined);
  assert.notEqual((await h.tool('matchService',{query:before.services[0].service})).status,'matched');
  const replay=()=>{
    const result=submitQuote(owner,historical.body);assert.equal(result.status,200);assert.deepEqual(result.response,historical.response);
    assert.equal(db.prepare('SELECT internalOutcomeJson FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner,historical.body.requestId).internalOutcomeJson,historical.submission.internalOutcomeJson);
    assert.equal(db.prepare('SELECT resultJson FROM quotes WHERE ownerId=? AND id=?').get(owner,historical.quote.id).resultJson,historical.quote.resultJson);
  };
  replay();
  const shown=bridge.readApplicationBook(owner);
  bridge.approveApplicationService(owner,shown.services[0].id,{revision:shown.revision,confirmConfiguration:true,confirmLegacySettings:true},date);
  const after=loadPricebook(owner);assert.deepEqual(after.services[0].pricing,savedPricing);
  assert.equal(after.services[0].quoteDoneApproval.engineVersion,ENGINE_VERSION);
  assert.equal(bridge.applicationStatus(after.services[0],after).status,'QUOTING LIVE');
  draft.requestId=randomUUID();const prepared=bridge.prepareApplicationIntake(owner,draft,date);assert.equal(prepared.status,'ready',JSON.stringify(prepared));
  const corrected=submitQuote(owner,{...draft,intakeConfirmation:prepared.confirmation},{clock:()=>new Date(date.quoteInstant)});
  assert.equal(corrected.response.midEstimate,6161.48);
  const match=await h.tool('matchService',{query:after.services[0].service});assert.equal(match.status,'matched');
  const inputs=structuredClone(draft.customerInputs);delete inputs.confirmedFacts;
  const args={serviceHandle:match.serviceHandle,customerInputs:inputs,customerConfirmed:true,callerMeasurementsEstimated:true,additionalWork:[],productConfirmations:{existingRoofType:true,replacementRoofType:true}};
  let voice=await h.tool('getQuote',args);
  if(voice.questionContract?.fields.some(field=>field.confirmationToken)){
    args.scopeConfirmations=Object.fromEntries(voice.questionContract.fields.filter(field=>field.confirmationToken).map(field=>[field.field,field.confirmationToken]));
    voice=await h.tool('getQuote',args);
  }
  assert.equal(voice.status,'quoted',JSON.stringify(voice));assert.equal(voice.midEstimate,6161.48);
  assert.match(voice.quoteNarration,/This price is based on the measurements you gave us\. The business will confirm them on site\./);
  replay();
});
