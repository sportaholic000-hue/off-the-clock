import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

import {ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {roofFixture,scopeKey} from '../verification/qe-roof-underlayment-20261018/roof-fixture.mjs';
import {sodFixture} from './quoteConcreteLandscape20261016Fixture.mjs';
import {
  bridge,
  date,
  db,
  phone,
  quoteEmailFixture,
  webQuote
} from './quoteDeliveryBatch20261015Fixture.mjs';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';
import {migrate} from '../server/src/db.js';
import {submitQuote} from '../server/src/quoteDoneRoutes.js';

// Expected values were fixed before execution in
// verification/qe-accuracy-integration-20261018/EXPECTED.md.
const V7='quote-engine-vnext-date-context-20261006-v7';
const CURRENT='quote-engine-vnext-accuracy-20261018-v9';
assert.equal(ENGINE_VERSION,CURRENT);

const privateUnderlayment=result=>result.lineItems.find(
  line=>line.calculation?.ratePath===`scopeRates.${scopeKey}`
);
const privateMiddle=result=>result.options[0].calculationRecord.scenarios.mid.finalTotalCents;

for(const row of [
  {scope:'full',rolls:5,underlaymentCents:75000,totalCents:616148},
  {scope:'partial',rolls:3,underlaymentCents:45000,totalCents:315575}
])test(`accuracy integration: ${row.scope} footprint roof keeps corrected underlayment through widget and voice`,async t=>{
  const fixture=roofFixture({customer:{
    serviceScope:row.scope,
    ...(row.scope==='partial'?{partialPercent:50}:{})
  }});
  delete fixture.ownerPricing.startingValueAdoptions;

  const widget=webQuote(fixture,[],undefined,{roofRuleMode:'new'});
  const internal=JSON.parse(widget.row.internalOutcomeJson).internalResult;
  const underlayment=privateUnderlayment(internal);
  assert.equal(internal.engineVersion,CURRENT);
  assert.equal(underlayment.calculation.quantity,row.rolls);
  assert.equal(underlayment.amountCents,row.underlaymentCents);
  assert.equal(privateMiddle(internal),row.totalCents);
  assert.equal(widget.result.midEstimate,row.totalCents/100);

  const harness=quoteEmailFixture(t);
  const voice=await phone(harness,fixture,{applicationOptions:{roofRuleMode:'new'}});
  assert.equal(voice.result.status,'quoted',JSON.stringify(voice.result));
  assert.equal(voice.result.midEstimate,row.totalCents/100);
  for(const output of [widget.result,voice.result]){
    assert.doesNotMatch(JSON.stringify(output),/"(?:lineItems|scopeRates|installedLaborPercent|priceMetadata)"/);
  }
});

test('accuracy integration: sod component disclosure and unchanged cents cross widget and voice',async t=>{
  const fixture=sodFixture();
  Object.assign(fixture.ownerPricing.pricing,{topsoilPerCubicYard:3000,topsoilTargetDepthInches:4});
  fixture.customerInputs.usableTopsoilDepthInches=3;
  const included='Included ground preparation: imported topsoil.';
  const excluded='Excluded ground preparation: old-lawn removal and disposal, grading. Any required excluded work needs a separate on-site estimate.';

  const widget=webQuote(fixture);
  assert.equal(widget.result.midEstimate,2142.59);
  assert.ok(widget.result.priceDrivers.includes('Ground preparation requested'));
  assert.match(widget.result.disclaimer,new RegExp(included.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(widget.result.disclaimer,new RegExp(excluded.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));

  const harness=quoteEmailFixture(t);
  const voice=await phone(harness,fixture);
  assert.equal(voice.result.status,'quoted',JSON.stringify(voice.result));
  assert.equal(voice.result.midEstimate,2142.59);
  assert.ok(voice.result.priceDrivers.includes('Ground preparation requested'));
  for(const field of ['writtenDisclosure','quoteNarration']){
    assert.match(voice.result[field],new RegExp(included.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.match(voice.result[field],new RegExp(excluded.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
  for(const output of [widget.result,voice.result]){
    assert.doesNotMatch(JSON.stringify(output),/topsoilPerCubicYard|sodRemovalPerSqft|sodGradingPerSqft|3000/);
  }
});

test('accuracy integration: genuine v7 sod approval stays stale while frozen retries remain exact',()=>{
  const historical=JSON.parse(readFileSync(
    new URL('../verification/qe-accuracy-integration-20261018/historical-sod-v7.json',import.meta.url),
    'utf8'
  ));
  assert.equal(historical.base,'550728daea4058c37f13952ab78785929bab39b0');
  assert.equal(historical.response.midEstimate,2142.59);
  assert.ok(historical.response.priceDrivers.includes('Existing-ground preparation included'));
  assert.doesNotMatch(historical.response.disclaimer,/Included ground preparation:|Excluded ground preparation:/);
  const oldOutcome=JSON.parse(historical.submission.internalOutcomeJson);
  assert.equal(oldOutcome.internalResult.engineVersion,V7);
  assert.equal(privateMiddle(oldOutcome.internalResult),214259);

  migrate();
  const owner=historical.owner,serviceId=historical.book.services[0].id;
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Sod','QuoteDone','active','UTC','owner',?)")
    .run(owner,`${owner}@example.invalid`,date.quoteInstant);
  db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)')
    .run(owner,`cus_SYNTHETIC_${owner}`,date.quoteInstant,date.quoteInstant,date.quoteInstant);
  db.prepare("INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,'{}',?)")
    .run(owner,date.quoteInstant);
  db.prepare("INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,enabled,updatedAt) VALUES(?,?,'SYNTHETIC','site_visit_first',0,?)")
    .run(owner,serviceId,date.quoteInstant);
  for(const [table,row] of [['quotes',historical.quote],['quoteSubmissions',historical.submission]]){
    const keys=Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`)
      .run(...keys.map(key=>row[key]));
  }
  savePricebook(owner,historical.book);

  const assertStale=()=>{
    const book=loadPricebook(owner),service=book.services[0];
    assert.equal(service.quoteDoneApproval.engineVersion,V7);
    assert.equal(bridge.applicationStatus(service,book).status,'NEEDS PRICING');
    return book;
  };
  assertStale();
  const shown=bridge.readApplicationBook(owner);
  assertStale();
  bridge.saveApplicationBook(owner,{...shown,revision:shown.revision},date);
  const afterSave=assertStale();

  const newRequest={...historical.body,requestId:randomUUID()};
  delete newRequest.intakeConfirmation;
  assert.equal(bridge.prepareApplicationIntake(owner,newRequest,date).status,'needs_details');
  const refused=submitQuote(owner,{...newRequest,reviewRequested:true},{clock:()=>new Date(date.quoteInstant)});
  assert.equal(refused.response.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(refused.response.midEstimate,undefined);

  const replay=()=>{
    const retried=submitQuote(owner,historical.body);
    assert.equal(retried.status,200);
    assert.deepEqual(retried.response,historical.response);
    const storedSubmission=db.prepare('SELECT internalOutcomeJson,customerResponseJson FROM quoteSubmissions WHERE ownerId=? AND requestId=?')
      .get(owner,historical.body.requestId);
    assert.equal(storedSubmission.internalOutcomeJson,historical.submission.internalOutcomeJson);
    assert.equal(storedSubmission.customerResponseJson,historical.submission.customerResponseJson);
    assert.equal(JSON.parse(storedSubmission.internalOutcomeJson).internalResult.engineVersion,V7);
    const storedQuote=db.prepare('SELECT resultJson FROM quotes WHERE ownerId=? AND id=?')
      .get(owner,historical.quote.id);
    assert.equal(storedQuote.resultJson,historical.quote.resultJson);
  };
  replay();

  const savedPricing=structuredClone(afterSave.services[0].pricing);
  const approvalView=bridge.readApplicationBook(owner);
  bridge.approveApplicationService(owner,serviceId,{
    revision:approvalView.revision,
    confirmConfiguration:true,
    confirmLegacySettings:true
  },date);
  const approved=loadPricebook(owner);
  assert.deepEqual(approved.services[0].pricing,savedPricing);
  assert.equal(approved.services[0].quoteDoneApproval.engineVersion,CURRENT);
  assert.equal(bridge.applicationStatus(approved.services[0],approved).status,'QUOTING LIVE');

  newRequest.requestId=randomUUID();
  const prepared=bridge.prepareApplicationIntake(owner,newRequest,date);
  assert.equal(prepared.status,'ready',JSON.stringify(prepared));
  const corrected=submitQuote(owner,{...newRequest,intakeConfirmation:prepared.confirmation},{clock:()=>new Date(date.quoteInstant)});
  assert.equal(corrected.status,201);
  assert.equal(corrected.response.midEstimate,2142.59);
  assert.ok(corrected.response.priceDrivers.includes('Ground preparation requested'));
  assert.match(corrected.response.disclaimer,/Included ground preparation: imported topsoil\./);
  assert.match(corrected.response.disclaimer,/Excluded ground preparation: old-lawn removal and disposal, grading\. Any required excluded work needs a separate on-site estimate\./);
  replay();
});
