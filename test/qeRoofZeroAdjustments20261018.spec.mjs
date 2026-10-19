import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {validateClass2FactorsDetailed} from '../server/quote-engine-vnext/contracts.js';
import {roof,pitchBands,setAdder,total} from '../verification/qe-roof-zero-adjustments-20261018/fixture.mjs';

// Independent cents/formulas fixed in EXPECTED.md before base execution.
function ready(f,expected){
  const q=generateQuoteVNext(f);
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify({expected,reason:q.reviewReason,invalid:q.invalidOwnerFields}));
  assert.equal(total(q),expected);
  assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,expected);
  return q;
}
const amount=(q,name)=>q.lineItems.find(l=>l.name===name)?.amountCents;

for(const [label,change,expected] of [
  ['positive control',()=>{},485800],
  ['zero upper installation',f=>setAdder(f,'ten_to_twelve','install',0),423800],
  ['zero upper removal',f=>setAdder(f,'ten_to_twelve','remove',0),453000],
  ['three layers zero factor',f=>{f.customerInputs.pitchBand='up_to_six';f.customerInputs.existingLayers=3;f.ownerPricing.pricing.additionalLayerRemovalFactor=0;},431000],
  ['three layers two stories zero factor',f=>{f.customerInputs.pitchBand='up_to_six';f.customerInputs.existingLayers=3;f.customerInputs.stories=2;f.ownerPricing.pricing.additionalLayerRemovalFactor=0;},457000]
])test('roof zero independent control: '+label,()=>{
  const f=roof();change(f);assert.deepEqual(validateClass2FactorsDetailed(f.serviceType,f.ownerPricing.pricing),[]);
  ready(f,expected);
});

for(const row of pitchBands)for(const scope of ['full','partial-area','partial-percent'])for(const zero of ['install','remove','both']){
  test(`roof zero ${row.band} ${zero} ${scope}`,()=>{
    const customer={pitchBand:row.band,...(scope==='full'?{}:{serviceScope:'partial',...(scope==='partial-area'?{partialAreaSqft:500}:{partialPercent:50})})};
    const f=roof(customer);
    if(zero!=='remove')setAdder(f,row.band,'install',0);
    if(zero!=='install')setAdder(f,row.band,'remove',0);
    const expected=(391000+(zero==='remove'?row.install:0)+(zero==='install'?row.remove:0))/(scope==='full'?1:2);
    const q=ready(f,expected);
    assert.equal(amount(q,'Steep-pitch installation'),zero==='remove'?row.install/(scope==='full'?1:2):0);
    assert.equal(amount(q,'Steep-pitch removal'),zero==='install'?row.remove/(scope==='full'?1:2):0);
    assert.equal(amount(q,'Roofing disposal'),scope==='full'?20000:10000);
  });
}

for(const scope of ['full','partial-area','partial-percent'])for(const selected of [...pitchBands.map(r=>r.band),'all'])for(const zero of ['install','remove','both']){
  test(`roof zero mixed measured ${selected} ${zero} ${scope}`,()=>{
    const f=roof({pitchMethod:'area_by_pitch',pitchAreaUpTo6Sqft:100,pitchArea7To9Sqft:200,pitchArea10To12Sqft:300,pitchAreaOver12Sqft:400,
      ...(scope==='full'?{}:{roofSizeInput:2000,serviceScope:'partial',...(scope==='partial-area'?{partialAreaSqft:1000}:{partialPercent:50})})});
    const deductions={seven_to_nine:[8000,4160],ten_to_twelve:[18600,9840],over_twelve:[40000,19200],all:[66600,33200]};
    for(const {band} of pitchBands)if(selected==='all'||band===selected){
      if(zero!=='remove')setAdder(f,band,'install',0);
      if(zero!=='install')setAdder(f,band,'remove',0);
    }
    ready(f,490800-(zero==='remove'?0:deductions[selected][0])-(zero==='install'?0:deductions[selected][1]));
  });
}

for(const stories of [1,2,3])for(const layers of [2,3,4])for(const partial of [false,true])test(`roof zero additional layers=${layers} stories=${stories} partial=${partial}`,()=>{
  const f=roof({pitchBand:'up_to_six',existingLayers:layers,stories,...(partial?{serviceScope:'partial',partialAreaSqft:500}:{})},{additionalLayerRemovalFactor:0});
  const q=ready(f,(391000+(layers-1)*20000+(stories-1)*26000)/(partial?2:1));
  assert.equal(amount(q,'Additional-layer tear-off'),0);
  if(stories>1)assert.equal(amount(q,'Additional-layer story adjustment'),0);
  assert.equal(amount(q,'Roofing disposal'),layers*20000/(partial?2:1));
});

for(const row of pitchBands)test('roof zero owner-selected unknown band '+row.band,()=>{
  const f=roof({pitchMethod:'not_sure'},{unknownPitchBand:row.band});
  setAdder(f,row.band,'install',0);setAdder(f,row.band,'remove',0);
  assert.ok(ready(f,391000).priceDrivers.some(s=>/owner-selected pitch band/.test(s)));
});
test('roof zero up-to-six ignores inactive steep additions',()=>{
  const f=roof({pitchBand:'up_to_six'});
  for(const {band} of pitchBands){setAdder(f,band,'install',0);setAdder(f,band,'remove',0);}
  ready(f,391000);
});
test('roof zero combined upper pitch and additional layers preserve two-story first tear-off and disposal',()=>{
  const f=roof({existingLayers:3,stories:2},{additionalLayerRemovalFactor:0});
  setAdder(f,'ten_to_twelve','install',0);setAdder(f,'ten_to_twelve','remove',0);
  const q=ready(f,457000);assert.equal(amount(q,'Story tear-off adjustment'),6000);assert.equal(amount(q,'Roofing disposal'),60000);
});
test('roof zero keeps half-cent material rounding and exact remaining pitch charge',()=>{
  const f=roof({roofSizeInput:100.05});setAdder(f,'ten_to_twelve','install',0);
  const q=ready(f,42402);assert.equal(amount(q,'Field materials'),11006);assert.equal(amount(q,'Steep-pitch removal'),3282);
});
test('roof positive additional-layer story factor remains unchanged',()=>{
  const q=ready(roof({pitchBand:'up_to_six',existingLayers:3,stories:2}),549400);
  assert.equal(amount(q,'Additional-layer tear-off'),84000);assert.equal(amount(q,'Additional-layer story adjustment'),8400);
});

for(const target of ['install','remove','extra'])for(const [label,value] of [['missing',undefined],['null',null],['blank',''],['string-zero','0'],['negative',-.01],['infinite',Infinity],['nan',NaN]])test(`roof zero rejects ${target} ${label}`,()=>{
  const f=roof({existingLayers:3,stories:2});
  if(target==='extra')f.ownerPricing.pricing.additionalLayerRemovalFactor=value;else setAdder(f,'ten_to_twelve',target,value);
  assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
for(const target of ['install','remove'])for(const [label,value] of [['missing',undefined],['null',null],['blank',''],['string-zero','0'],['negative',-.01],['infinite',Infinity]])test(`roof zero over12 rejects ${target} ${label}`,()=>{
  const f=roof({pitchBand:'over_twelve'});setAdder(f,'over_twelve',target,value);
  assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('roof zero does not supply missing product confirmation',()=>{
  const f=roof();setAdder(f,'ten_to_twelve','install',0);delete f.customerInputs.confirmedFacts;
  assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});

import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {EXPECTED_QUOTE_ENGINE_VERSION} from '../server/src/runtimeConfig.js';
import {OLD_VERSION} from '../verification/qe-roof-zero-adjustments-20261018/fixture.mjs';
import {webQuote,phone,quoteEmailFixture,fixture as applicationFixture,bridge,date,db} from './quoteDeliveryBatch20261015Fixture.mjs';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';
import {migrate} from '../server/src/db.js';
import {submitQuote} from '../server/src/quoteDoneRoutes.js';

const NEW_VERSION='quote-engine-vnext-geometry-20261019-v12';
const publicOnly=q=>assert.doesNotMatch(JSON.stringify(q),/"(?:lineItems|pricing|pitchInstallationAdder|pitchRemovalAdder|additionalLayerRemovalFactor|rateCents|priceMetadata|installedLaborPercent)"/);
const storedOutcome=row=>JSON.parse(row.internalOutcomeJson).internalResult;

test('roof zero current engine/runtime agree and genuine positive v8 prices stay exact',()=>{
  assert.equal(ENGINE_VERSION,NEW_VERSION);assert.equal(EXPECTED_QUOTE_ENGINE_VERSION,NEW_VERSION);
  const baseline=JSON.parse(readFileSync(new URL('../verification/qe-roof-zero-adjustments-20261018/positive-v8-lines.json',import.meta.url)));
  assert.equal(baseline.base,'1857b7779b83b70f7753b41b72c3677270cd4ffc');assert.equal(baseline.engineVersion,OLD_VERSION);
  for(const row of baseline.controls){
    // Preserve the frozen v8 evidence. v10 corrects only its binary story-delta
    // representation: the sole affected control uses two stories (1.10).
    const expected=structuredClone(row.lineItems);
    for(const line of expected)for(const m of line.calculation.multipliers)if(m.name==='story addition'){
      assert.equal(row.customer.stories,2);assert.equal(m.value,0.10000000000000009);
      assert.deepEqual(m.exactValue,{numerator:'10000000000000009',denominator:'100000000000000000'});
      m.value=.1;m.exactValue={numerator:'1',denominator:'10'};
      const cents={'Story labor adjustment':20000,'Story tear-off adjustment':6000,'Additional-layer story adjustment':8400}[line.name];
      assert.equal(line.amountCents,cents);
      line.calculation.unroundedCents=cents;line.calculation.exactUnroundedCents={numerator:String(cents),denominator:'1'};
    }
    assert.deepEqual(ready(roof(row.customer),row.expected).lineItems,expected);
  }
});

for(const [label,customer,change,expected] of [
  ['upper installation zero',{},f=>setAdder(f,'ten_to_twelve','install',0),423800],
  ['upper removal zero',{},f=>setAdder(f,'ten_to_twelve','remove',0),453000],
  ['upper both zero',{},f=>{setAdder(f,'ten_to_twelve','install',0);setAdder(f,'ten_to_twelve','remove',0);},391000],
  ['over12 both zero partial',{pitchBand:'over_twelve',serviceScope:'partial',partialAreaSqft:500},f=>{setAdder(f,'over_twelve','install',0);setAdder(f,'over_twelve','remove',0);},195500],
  ['three layers two stories zero',{pitchBand:'up_to_six',existingLayers:3,stories:2},f=>{f.ownerPricing.pricing.additionalLayerRemovalFactor=0;},457000],
  ['mixed partial zero upper installation',{pitchMethod:'area_by_pitch',roofSizeInput:2000,serviceScope:'partial',partialAreaSqft:1000,pitchAreaUpTo6Sqft:100,pitchArea7To9Sqft:200,pitchArea10To12Sqft:300,pitchAreaOver12Sqft:400},f=>setAdder(f,'ten_to_twelve','install',0),472200]
])test(`roof zero saved widget and voice parity: ${label}`,async t=>{
  const f=roof(customer);change(f);delete f.ownerPricing.startingValueAdoptions;
  const web=webQuote(f,[],undefined,{roofRuleMode:'new'});
  const h=quoteEmailFixture(t),voice=await phone(h,f,{applicationOptions:{roofRuleMode:'new'}});
  assert.equal(web.result.midEstimate,expected/100);assert.equal(voice.result.status,'quoted',JSON.stringify(voice.result));assert.equal(voice.result.midEstimate,expected/100);
  assert.equal(total(storedOutcome(web.row)),expected);assert.equal(storedOutcome(web.row).engineVersion,NEW_VERSION);
  const voiceRows=h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').all(h.c.ownerId);
  assert.equal(voiceRows.length,1);
  const voiceInternal=JSON.parse(voiceRows[0].internalOutcomeJson).applicationOutcome.internalResult;
  assert.equal(total(voiceInternal),expected);assert.equal(voiceInternal.engineVersion,NEW_VERSION);
  assert.equal(web.service.quoteDoneApproval.engineVersion,NEW_VERSION);assert.equal(voice.service.quoteDoneApproval.engineVersion,NEW_VERSION);
  for(const [key,value] of Object.entries(f.ownerPricing.pricing))assert.deepEqual(web.service.pricing[key],value,'saved '+key);
  publicOnly(web.result);publicOnly(voice.result);
  assert.equal(h.sends(),0);
});

test('roof zero saved new proposals still need explicit setting confirmation and owner approval',()=>{
  const owner='synthetic-zero-confirm-'+randomUUID(),f=roof();
  delete f.ownerPricing.startingValueAdoptions;delete f.ownerPricing.origin;
  // Owner-entered zero remains zero; other new system proposals are unconfirmed.
  delete f.ownerPricing.pricing.pitchRemovalAdder;delete f.ownerPricing.pricing.complexityLaborMultiplier;delete f.ownerPricing.pricing.additionalLayerRemovalFactor;
  f.ownerPricing.pricing.pitchInstallationAdder={seven_to_nine:0,ten_to_twelve:0};
  const draft=bridge.convertApplicationBook({services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'CAD'}},'toDollars');
  bridge.saveApplicationBook(owner,{...draft,revision:bridge.readApplicationBook(owner).revision},date);
  const before=loadPricebook(owner);let shown=bridge.readApplicationBook(owner);
  assert.equal(bridge.bookStatuses(before,date)[0].approvalCurrent,false);
  assert.ok(Object.values(shown.services[0].startingValueState).some(r=>!r.confirmed));
  assert.throws(()=>bridge.approveApplicationService(owner,f.ownerPricing.id,{revision:shown.revision,confirmLegacySettings:true},date),/Explicit confirmation/);
  bridge.approveApplicationService(owner,f.ownerPricing.id,{revision:shown.revision,confirmConfiguration:true,confirmLegacySettings:true},date);
  const unconfirmed=loadPricebook(owner);
  assert.notEqual(bridge.bookStatuses(unconfirmed,date)[0].status,'QUOTING LIVE');
  const blocked=bridge.calculateApplicationQuote(unconfirmed,unconfirmed.services[0],{customerInputs:f.customerInputs,customerFeeSelections:{}},{...date,preparingIntake:true});
  assert.equal(blocked.internalResult.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(blocked.internalResult.invalidOwnerFields.includes('active'));
  assert.match(JSON.stringify(bridge.bookStatuses(unconfirmed,date)[0]),/startingValueState/);
  shown=bridge.readApplicationBook(owner);
  shown.services[0].startingValueActions={confirmPaths:Object.keys(shown.services[0].startingValueState)};
  bridge.saveApplicationBook(owner,shown,date);
  const confirmed=bridge.readApplicationBook(owner);
  assert.deepEqual(loadPricebook(owner).services[0].quoteDoneApproval,unconfirmed.services[0].quoteDoneApproval,'setting confirmation does not rewrite the existing explicit approval');
  bridge.approveApplicationService(owner,f.ownerPricing.id,{revision:confirmed.revision,confirmConfiguration:true,confirmLegacySettings:true},date);
  const saved=loadPricebook(owner);assert.equal(saved.services[0].pricing.pitchInstallationAdder.ten_to_twelve,0);
  assert.equal(bridge.bookStatuses(saved,date)[0].status,'QUOTING LIVE');
  const outcome=bridge.calculateApplicationQuote(saved,saved.services[0],{customerInputs:f.customerInputs,customerFeeSelections:{}},{...date,preparingIntake:true});
  assert.equal(total(outcome.internalResult),423800);
});

test('roof zero genuine v8 approval remains stale through save; explicit current approval and zero correction preserve receipt replay',async t=>{
  const historical=JSON.parse(readFileSync(new URL('../verification/qe-roof-zero-adjustments-20261018/historical-v8.json',import.meta.url)));
  assert.equal(historical.base,'1857b7779b83b70f7753b41b72c3677270cd4ffc');
  assert.equal(historical.response.midEstimate,4858);assert.equal(storedOutcome(historical.submission).engineVersion,OLD_VERSION);
  migrate();const owner=historical.owner,serviceId=historical.book.services[0].id;
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Roof','QuoteDone','active','UTC','owner',?)").run(owner,owner+'@example.invalid',date.quoteInstant);
  db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(owner,'cus_SYNTHETIC_'+owner,date.quoteInstant,date.quoteInstant,date.quoteInstant);
  db.prepare("INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,'{}',?)").run(owner,date.quoteInstant);
  db.prepare("INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,enabled,updatedAt) VALUES(?,?,'SYNTHETIC','site_visit_first',0,?)").run(owner,serviceId,date.quoteInstant);
  for(const [table,row] of [['quotes',historical.quote],['quoteSubmissions',historical.submission]]){
    const keys=Object.keys(row);db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));
  }
  savePricebook(owner,historical.book);
  const base=applicationFixture(t,process.env.DATABASE_PATH),h=quoteEmailFixture(t,{base,context:base.context(owner)});
  const replay=()=>{
    const r=submitQuote(owner,historical.body);assert.equal(r.status,200);assert.deepEqual(r.response,historical.response);
    assert.deepEqual(db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner,historical.body.requestId),historical.submission);
    assert.deepEqual(db.prepare('SELECT * FROM quotes WHERE ownerId=? AND id=?').get(owner,historical.quote.id),historical.quote);
    publicOnly(r.response);
  };
  const stale=()=>{
    const book=loadPricebook(owner);assert.equal(book.services[0].quoteDoneApproval.engineVersion,OLD_VERSION);
    assert.equal(bridge.applicationStatus(book.services[0],book,date).approvalCurrent,false);return book;
  };
  stale();bridge.saveApplicationBook(owner,bridge.readApplicationBook(owner),date);stale();replay();
  const fresh={...structuredClone(historical.body),requestId:randomUUID()};delete fresh.intakeConfirmation;
  assert.equal(bridge.prepareApplicationIntake(owner,fresh,date).status,'needs_details');
  const refused=submitQuote(owner,{...fresh,reviewRequested:true},{clock:()=>new Date(date.quoteInstant)});
  assert.equal(refused.response.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(refused.response.midEstimate,undefined);
  assert.notEqual((await h.tool('matchService',{query:historical.book.services[0].service})).status,'matched');
  const approve=()=>{const shown=bridge.readApplicationBook(owner);bridge.approveApplicationService(owner,serviceId,{revision:shown.revision,confirmConfiguration:true,confirmLegacySettings:true},date);};
  const unchangedPricing=structuredClone(stale().services[0].pricing);approve();
  assert.deepEqual(loadPricebook(owner).services[0].pricing,unchangedPricing);replay();
  let shown=bridge.readApplicationBook(owner);shown.services[0].pricing.pitchInstallationAdder.ten_to_twelve=0;
  bridge.saveApplicationBook(owner,shown,date);
  assert.equal(bridge.applicationStatus(loadPricebook(owner).services[0],loadPricebook(owner),date).approvalCurrent,false);
  assert.equal(bridge.prepareApplicationIntake(owner,{...fresh,requestId:randomUUID()},date).status,'needs_details');
  approve();const approved=loadPricebook(owner);
  assert.equal(approved.services[0].quoteDoneApproval.engineVersion,NEW_VERSION);
  assert.equal(approved.services[0].pricing.pitchInstallationAdder.ten_to_twelve,0);
  fresh.requestId=randomUUID();const prepared=bridge.prepareApplicationIntake(owner,fresh,date);assert.equal(prepared.status,'ready');
  const corrected=submitQuote(owner,{...fresh,intakeConfirmation:prepared.confirmation},{clock:()=>new Date(date.quoteInstant)});
  assert.equal(corrected.status,201);assert.equal(corrected.response.midEstimate,4238);publicOnly(corrected.response);
  const match=await h.tool('matchService',{query:approved.services[0].service});assert.equal(match.status,'matched');
  const inputs=structuredClone(fresh.customerInputs);delete inputs.confirmedFacts;
  const voice=await h.tool('getQuote',{serviceHandle:match.serviceHandle,customerInputs:inputs,customerConfirmed:true,additionalWork:[],productConfirmations:{existingRoofType:true,replacementRoofType:true}});
  assert.equal(voice.status,'quoted',JSON.stringify(voice));assert.equal(voice.midEstimate,4238);publicOnly(voice);
  replay();assert.equal(h.sends(),0);
});
