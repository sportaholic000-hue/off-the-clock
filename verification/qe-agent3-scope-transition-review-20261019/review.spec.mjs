import '../../test/pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

import {mowingFixture} from '../../test/landscapeLaneB20261016Fixture.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {roofFixture} from '../qe-roof-underlayment-20261018/roof-fixture.mjs';
import {
  bridge,
  date,
  db as applicationDb,
  publish,
  quoteEmailFixture,
  webQuote
} from '../../test/quoteDeliveryBatch20261015Fixture.mjs';
import {submitQuote} from '../../server/src/quoteDoneRoutes.js';

const forbiddenCustomerKeys=/(?:^|\")(?:lineItems|calculationRecord|rateCents|mowingBaseRatePerSqft|offeringRates|scopeRates|bookRevision|ownerId)(?:\"|$)/;

function assertCustomerSafe(value) {
  assert.doesNotMatch(JSON.stringify(value),forbiddenCustomerKeys);
}

function assertEstimate(result,amount,{firstVisit}={}) {
  assert.deepEqual([result.lowEstimate,result.midEstimate,result.highEstimate],[amount,amount,amount],JSON.stringify(result));
  assert.equal(result.options.length,1,JSON.stringify(result));
  assert.deepEqual(
    [result.options[0].lowEstimate,result.options[0].midEstimate,result.options[0].highEstimate],
    [amount,amount,amount]
  );
  if(firstVisit===undefined){
    assert.equal(result.firstVisit,undefined,'No stale top-level first visit');
    assert.equal(result.options[0].firstVisit,undefined,'No stale option first visit');
  }else{
    assert.deepEqual(
      [result.firstVisit.lowEstimate,result.firstVisit.midEstimate,result.firstVisit.highEstimate],
      [firstVisit,firstVisit,firstVisit]
    );
    assert.deepEqual(
      [result.options[0].firstVisit.lowEstimate,result.options[0].firstVisit.midEstimate,result.options[0].firstVisit.highEstimate],
      [firstVisit,firstVisit,firstVisit]
    );
  }
  assertCustomerSafe(result);
}

function publicScopeText(result) {
  return Array.isArray(result.pricedScope)?result.pricedScope.join('\n'):JSON.stringify(result.pricedScope||{});
}

function mowing({extras=false}={}) {
  const f=mowingFixture();
  if(extras)Object.assign(f.ownerPricing.pricing,{baggingSurchargePercent:20,edgingPerLinearFoot:50});
  return f;
}

function mowingInputs(f,{extras=false,frequency=f.customerInputs.serviceFrequency}={}) {
  const inputs=structuredClone(f.customerInputs);
  Object.assign(inputs,{serviceFrequency:frequency,bagClippings:extras,edgingIncluded:extras});
  if(extras)inputs.edgingLengthLF=100;else delete inputs.edgingLengthLF;
  return inputs;
}

function gateFixture() {
  const f=offeringFixture('FENCING_INSTALL','installed'),p=f.ownerPricing.pricing;
  p.offeringDetails.gates.walk.description='[SYNTHETIC] Four-foot walk gate and hardware.';
  p.offeringDetails.gates.drive={widthLF:12,description:'[SYNTHETIC] Twelve-foot drive gate and hardware.',postsAndFootingsIncluded:true};
  p.offeringRates.gate_drive=40000;
  p.installedLaborPercent['offeringRates.gate_drive']=60;
  p.installedMaterialsPercent['offeringRates.gate_drive']=40;
  return f;
}

function roofInputs(f,{method='footprint',scope='partial'}={}) {
  const inputs=structuredClone(f.customerInputs);
  inputs.roofSizeMethod=method;
  inputs.serviceScope=scope;
  if(method==='roof_measured')delete inputs.pitchRisePer12;
  if(scope==='full'){
    delete inputs.partialPercent;
    delete inputs.partialAreaSqft;
  }else inputs.partialPercent=50;
  return inputs;
}

function freshWidgetBody(saved,customerInputs) {
  const body=structuredClone(saved.body);
  body.requestId=randomUUID();
  body.customerInputs=structuredClone(customerInputs);
  delete body.intakeConfirmation;
  delete body.reviewRequested;
  return body;
}

function widgetRows(owner) {
  return applicationDb.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? ORDER BY rowid').all(owner);
}

function widgetQuotes(owner) {
  return applicationDb.prepare('SELECT * FROM quotes WHERE ownerId=? ORDER BY rowid').all(owner);
}

function submitFreshWidget(owner,body) {
  const prepared=bridge.prepareApplicationIntake(owner,body,date);
  assert.equal(prepared.status,'ready',JSON.stringify(prepared));
  const submitted={...body,intakeConfirmation:prepared.confirmation};
  const saved=submitQuote(owner,submitted,{clock:()=>new Date(date.quoteInstant)});
  assert.equal(saved.status,201,JSON.stringify(saved));
  assertCustomerSafe(saved.response);
  const row=applicationDb.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner,body.requestId);
  assert.ok(row);
  return {prepared,submitted,result:saved.response,row};
}

function rejectStaleWidget(owner,body,proof) {
  const before=[widgetRows(owner).length,widgetQuotes(owner).length];
  assert.throws(
    ()=>submitQuote(owner,{...body,intakeConfirmation:proof},{clock:()=>new Date(date.quoteInstant)}),
    /job details or business pricing changed/i
  );
  assert.deepEqual([widgetRows(owner).length,widgetQuotes(owner).length],before,'Rejected widget correction must not persist');
}

function retryWidget(owner,submitted,expected,before) {
  const replay=submitQuote(owner,submitted,{clock:()=>new Date(date.quoteInstant)});
  assert.equal(replay.status,200);
  assert.deepEqual(replay.response,expected);
  assert.deepEqual(
    applicationDb.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner,submitted.requestId),
    before,
    'Historical widget receipt changed during retry'
  );
  return replay.response;
}

function voiceRows(h) {
  return h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? ORDER BY rowid').all(h.c.ownerId);
}

function voiceQuotes(h) {
  return h.db.prepare('SELECT * FROM quotes WHERE ownerId=? ORDER BY rowid').all(h.c.ownerId);
}

function voiceArgs(match,f,customerInputs=f.customerInputs) {
  const inputs=structuredClone(customerInputs),facts=inputs.confirmedFacts||{};
  delete inputs.confirmedFacts;
  return {
    serviceHandle:match.serviceHandle,
    customerInputs:inputs,
    customerConfirmed:true,
    additionalWork:[],
    productConfirmations:Object.fromEntries(Object.keys(facts).map(field=>[field,true]))
  };
}

async function startVoice(t,f,{applicationOptions={}}={}) {
  const h=quoteEmailFixture(t);
  publish(h.c.ownerId,f,applicationOptions);
  const match=await h.tool('matchService',{query:f.ownerPricing.service});
  assert.equal(match.status,'matched',JSON.stringify(match));
  return {h,match};
}

async function quoteVoice(h,args,{allowScopePrompt=true}={}) {
  let effective=structuredClone(args),result=await h.tool('getQuote',effective);
  const tokenFields=(result.questionContract?.fields||[]).filter(field=>field.confirmationToken);
  if(tokenFields.length){
    assert.equal(allowScopePrompt,true,'Unexpected scope confirmation prompt');
    effective.scopeConfirmations={
      ...(effective.scopeConfirmations||{}),
      ...Object.fromEntries(tokenFields.map(field=>[field.field,field.confirmationToken]))
    };
    result=await h.tool('getQuote',effective);
  }
  assert.equal(result.status,'quoted',JSON.stringify(result));
  assertCustomerSafe(result);
  return {args:effective,result,tokens:Object.fromEntries(tokenFields.map(field=>[field.field,field.confirmationToken]))};
}

async function rejectUnconfirmedVoice(h,args) {
  const before=[voiceRows(h).length,voiceQuotes(h).length];
  await assert.rejects(
    h.tool('getQuote',{...structuredClone(args),customerConfirmed:false}),
    error=>error?.code==='CUSTOMER_CONFIRMATION_REQUIRED'
  );
  assert.deepEqual([voiceRows(h).length,voiceQuotes(h).length],before,'Rejected voice correction must not persist');
}

async function retryVoice(h,args,expected,before) {
  const replay=await h.tool('getQuote',args);
  assert.deepEqual(replay,expected);
  assert.deepEqual(voiceRows(h).find(row=>row.requestId===before.requestId),before,'Historical voice receipt changed during retry');
  return replay;
}

function storedInputs(row) {
  return JSON.parse(row.originalSubmissionJson).customerInputs;
}

test('widget transition: optional mowing work is added and removed without stale confirmation, charges or scope',()=>{
  const f=mowing({extras:true}),baseInputs=mowingInputs(f),addedInputs=mowingInputs(f,{extras:true});
  const base=webQuote({...f,customerInputs:baseInputs});
  assertEstimate(base.result,50,{firstVisit:75});
  const originalRow=structuredClone(base.row),originalResponse=structuredClone(base.result),initialCount=widgetRows(base.owner).length;

  const addedBody=freshWidgetBody(base,addedInputs);
  rejectStaleWidget(base.owner,addedBody,base.body.intakeConfirmation);
  assert.throws(
    ()=>submitQuote(base.owner,{...base.body,customerInputs:addedInputs},{clock:()=>new Date(date.quoteInstant)}),
    /request ID already belongs to different submitted details/i
  );
  assert.equal(widgetRows(base.owner).length,initialCount);
  const added=submitFreshWidget(base.owner,addedBody);
  assertEstimate(added.result,110,{firstVisit:140});
  assert.deepEqual(storedInputs(added.row),addedInputs);
  assert.match(publicScopeText(added.result),/Clipping bagging selected.*Yes/i);
  assert.match(publicScopeText(added.result),/Lawn edging selected.*Yes/i);
  assert.deepEqual(added.result.options[0].skippedAddons,[]);

  const removedBody={...freshWidgetBody(base,baseInputs)};
  rejectStaleWidget(base.owner,removedBody,added.prepared.confirmation);
  const removed=submitFreshWidget(base.owner,removedBody);
  assertEstimate(removed.result,50,{firstVisit:75});
  assert.deepEqual(storedInputs(removed.row),baseInputs);
  assert.match(publicScopeText(removed.result),/Clipping bagging selected.*No/i);
  assert.match(publicScopeText(removed.result),/Lawn edging selected.*No/i);

  retryWidget(base.owner,base.body,originalResponse,originalRow);
  retryWidget(base.owner,added.submitted,added.result,added.row);
  assert.deepEqual(widgetRows(base.owner).map(row=>JSON.parse(row.originalSubmissionJson).customerInputs),[baseInputs,addedInputs,baseInputs]);
});

test('voice transition: optional mowing work is added and removed while each saved receipt keeps its own first visit and scope',async t=>{
  const f=mowing({extras:true}),baseInputs=mowingInputs(f),addedInputs=mowingInputs(f,{extras:true}),{h,match}=await startVoice(t,f);
  const base=await quoteVoice(h,voiceArgs(match,f,baseInputs));
  assertEstimate(base.result,50,{firstVisit:75});
  const baseRow=structuredClone(voiceRows(h)[0]);

  const addedArgs={...voiceArgs(match,f,addedInputs)};
  await rejectUnconfirmedVoice(h,addedArgs);
  const added=await quoteVoice(h,addedArgs);
  assertEstimate(added.result,110,{firstVisit:140});
  assert.match(publicScopeText(added.result),/Clipping bagging selected.*Yes/i);
  assert.match(publicScopeText(added.result),/Lawn edging selected.*Yes/i);
  assert.deepEqual(added.result.options[0].skippedAddons,[]);
  const addedRow=structuredClone(voiceRows(h)[1]);
  assert.deepEqual(storedInputs(addedRow),addedInputs);

  await rejectUnconfirmedVoice(h,base.args);
  const removed=await h.tool('getQuote',base.args);
  assert.deepEqual(removed,base.result,'Returning to the exact base scope replays its historical receipt');
  assertEstimate(removed,50,{firstVisit:75});
  assert.match(publicScopeText(removed),/Clipping bagging selected.*No/i);
  assert.match(publicScopeText(removed),/Lawn edging selected.*No/i);
  assert.equal(voiceRows(h).length,2,'Exact removal-to-base replay must not duplicate the receipt');

  await retryVoice(h,base.args,base.result,baseRow);
  await retryVoice(h,added.args,added.result,addedRow);
  assert.deepEqual(voiceRows(h).map(row=>storedInputs(row)),[baseInputs,addedInputs]);
});

test('widget transition: changing a named priced gate option cannot retain the old proof, amount or gate identity',()=>{
  const f=gateFixture(),walkInputs=structuredClone(f.customerInputs),driveInputs={...structuredClone(f.customerInputs),gates:{drive:1}};
  const walk=webQuote({...f,customerInputs:walkInputs});
  assertEstimate(walk.result,4500);
  const walkFact=walk.result.pricedScope.facts.find(row=>row.label==='Gates by measured opening width');
  assert.match(walkFact.value,/Four-foot walk gate/i);
  const walkRow=structuredClone(walk.row);

  const driveBody=freshWidgetBody(walk,driveInputs);
  rejectStaleWidget(walk.owner,driveBody,walk.body.intakeConfirmation);
  const drive=submitFreshWidget(walk.owner,driveBody);
  assertEstimate(drive.result,4400);
  const driveFact=drive.result.pricedScope.facts.find(row=>row.label==='Gates by measured opening width');
  assert.match(driveFact.value,/Twelve-foot drive gate/i);
  assert.doesNotMatch(driveFact.value,/walk gate/i);
  assert.deepEqual(storedInputs(drive.row).gates,{drive:1});

  retryWidget(walk.owner,walk.body,walk.result,walkRow);
  assert.deepEqual(storedInputs(walkRow).gates,{walk:2});
});

test('voice transition: changing a named priced gate option creates a distinct saved identity and preserves the walk-gate retry',async t=>{
  const f=gateFixture(),walkInputs=structuredClone(f.customerInputs),driveInputs={...structuredClone(f.customerInputs),gates:{drive:1}}, {h,match}=await startVoice(t,f);
  const walk=await quoteVoice(h,voiceArgs(match,f,walkInputs));
  assertEstimate(walk.result,4500);
  assert.match(publicScopeText(walk.result),/Four-foot walk gate/i);
  const walkRow=structuredClone(voiceRows(h)[0]);

  const driveArgs=voiceArgs(match,f,driveInputs);
  await rejectUnconfirmedVoice(h,driveArgs);
  const drive=await quoteVoice(h,driveArgs);
  assertEstimate(drive.result,4400);
  assert.match(publicScopeText(drive.result),/Twelve-foot drive gate/i);
  assert.doesNotMatch(publicScopeText(drive.result),/walk gate/i);
  const driveRow=structuredClone(voiceRows(h)[1]);
  assert.deepEqual(storedInputs(driveRow).gates,{drive:1});

  await retryVoice(h,walk.args,walk.result,walkRow);
  await retryVoice(h,drive.args,drive.result,driveRow);
  assert.deepEqual(voiceRows(h).map(row=>storedInputs(row).gates),[{walk:2},{drive:1}]);
});

test('widget transition: footprint partial to measured partial to measured full cannot inherit stale method, percentage or amount',()=>{
  const f=roofFixture({customer:{serviceScope:'partial',partialPercent:50}}),footprint=roofInputs(f),measuredPartial=roofInputs(f,{method:'roof_measured'}),measuredFull=roofInputs(f,{method:'roof_measured',scope:'full'});
  delete f.ownerPricing.startingValueAdoptions;
  const first=webQuote({...f,customerInputs:footprint},[],undefined,{roofRuleMode:'new'});
  assertEstimate(first.result,3155.75);
  const firstRow=structuredClone(first.row);
  assert.match(publicScopeText(first.result),/Roof area method.*Footprint/i);
  assert.match(publicScopeText(first.result),/Replacement scope.*Partial/i);

  const partialBody=freshWidgetBody(first,measuredPartial);
  rejectStaleWidget(first.owner,partialBody,first.body.intakeConfirmation);
  const partial=submitFreshWidget(first.owner,partialBody);
  assertEstimate(partial.result,2213.25);
  assert.equal(storedInputs(partial.row).pitchRisePer12,undefined);
  assert.equal(storedInputs(partial.row).partialPercent,50);
  assert.match(publicScopeText(partial.result),/Roof area method.*Measured roof area/i);

  const fullBody=freshWidgetBody(first,measuredFull);
  rejectStaleWidget(first.owner,fullBody,partial.prepared.confirmation);
  const full=submitFreshWidget(first.owner,fullBody);
  assertEstimate(full.result,4426.5);
  assert.equal(storedInputs(full.row).pitchRisePer12,undefined);
  assert.equal(storedInputs(full.row).partialPercent,undefined);
  assert.match(publicScopeText(full.result),/Replacement scope.*Full/i);
  assert.doesNotMatch(publicScopeText(full.result),/Confirmed affected portion/i);

  retryWidget(first.owner,first.body,first.result,firstRow);
  retryWidget(first.owner,partial.submitted,partial.result,partial.row);
  assert.deepEqual(widgetRows(first.owner).map(row=>[storedInputs(row).roofSizeMethod,storedInputs(row).serviceScope]),[['footprint','partial'],['roof_measured','partial'],['roof_measured','full']]);
});

test('voice transition: footprint partial to measured partial to measured full keeps only the still-applicable underlayment receipt',async t=>{
  const f=roofFixture({customer:{serviceScope:'partial',partialPercent:50}}),footprint=roofInputs(f),measuredPartial=roofInputs(f,{method:'roof_measured'}),measuredFull=roofInputs(f,{method:'roof_measured',scope:'full'});
  delete f.ownerPricing.startingValueAdoptions;
  const {h,match}=await startVoice(t,f,{applicationOptions:{roofRuleMode:'new'}});
  const first=await quoteVoice(h,voiceArgs(match,f,footprint));
  assertEstimate(first.result,3155.75);
  assert.ok(first.tokens.roofUnderlaymentScopeConfirmed);
  const firstRow=structuredClone(voiceRows(h)[0]);

  const partialArgs={...voiceArgs(match,f,measuredPartial),scopeConfirmations:structuredClone(first.args.scopeConfirmations)};
  await rejectUnconfirmedVoice(h,partialArgs);
  const partial=await quoteVoice(h,partialArgs,{allowScopePrompt:false});
  assertEstimate(partial.result,2213.25);
  assert.equal(storedInputs(voiceRows(h)[1]).pitchRisePer12,undefined);
  assert.equal(storedInputs(voiceRows(h)[1]).partialPercent,50);
  assert.match(publicScopeText(partial.result),/Roof area method.*Measured roof area/i);
  const partialRow=structuredClone(voiceRows(h)[1]);

  const fullArgs={...voiceArgs(match,f,measuredFull),scopeConfirmations:structuredClone(first.args.scopeConfirmations)};
  await rejectUnconfirmedVoice(h,fullArgs);
  const full=await quoteVoice(h,fullArgs,{allowScopePrompt:false});
  assertEstimate(full.result,4426.5);
  assert.equal(storedInputs(voiceRows(h)[2]).partialPercent,undefined);
  assert.match(publicScopeText(full.result),/Replacement scope.*Full/i);
  assert.doesNotMatch(publicScopeText(full.result),/Confirmed affected portion/i);

  await retryVoice(h,first.args,first.result,firstRow);
  await retryVoice(h,partial.args,partial.result,partialRow);
  assert.deepEqual(voiceRows(h).map(row=>[storedInputs(row).roofSizeMethod,storedInputs(row).serviceScope]),[['footprint','partial'],['roof_measured','partial'],['roof_measured','full']]);
});

test('widget transition: recurring to one-time and a saved-book revision cannot reuse first-visit data, intake proof or old amounts',()=>{
  const f=mowing(),weekly=mowingInputs(f),oneTime=mowingInputs(f,{frequency:'one_time'});
  const historical=webQuote({...f,customerInputs:weekly});
  assertEstimate(historical.result,50,{firstVisit:75});
  const historicalRow=structuredClone(historical.row);

  const oldOneTimeBody=freshWidgetBody(historical,oneTime);
  rejectStaleWidget(historical.owner,oldOneTimeBody,historical.body.intakeConfirmation);
  const oldOneTime=submitFreshWidget(historical.owner,oldOneTimeBody);
  assertEstimate(oldOneTime.result,75);
  assert.equal(storedInputs(oldOneTime.row).serviceFrequency,'one_time');
  const oldOneTimeRow=structuredClone(oldOneTime.row);

  const revised=structuredClone(f);
  revised.ownerPricing.pricing.mowingBaseRatePerSqft=0.75;
  publish(historical.owner,revised);

  retryWidget(historical.owner,historical.body,historical.result,historicalRow);
  retryWidget(historical.owner,oldOneTime.submitted,oldOneTime.result,oldOneTimeRow);

  const revisedWeeklyBody=freshWidgetBody(historical,weekly);
  rejectStaleWidget(historical.owner,revisedWeeklyBody,historical.body.intakeConfirmation);
  const revisedWeekly=submitFreshWidget(historical.owner,revisedWeeklyBody);
  assertEstimate(revisedWeekly.result,75,{firstVisit:112.5});

  const revisedOneTimeBody={...freshWidgetBody(historical,oneTime)};
  rejectStaleWidget(historical.owner,revisedOneTimeBody,revisedWeekly.prepared.confirmation);
  const revisedOneTime=submitFreshWidget(historical.owner,revisedOneTimeBody);
  assertEstimate(revisedOneTime.result,112.5);

  const rows=widgetRows(historical.owner);
  assert.equal(rows.length,4);
  assert.equal(rows[0].bookRevision,rows[1].bookRevision);
  assert.equal(rows[2].bookRevision,rows[3].bookRevision);
  assert.notEqual(rows[0].bookRevision,rows[2].bookRevision);
  assert.deepEqual(rows.map(row=>[storedInputs(row).serviceFrequency,JSON.parse(row.customerResponseJson).midEstimate,JSON.parse(row.customerResponseJson).firstVisit?.midEstimate]),[
    ['weekly',50,75],['one_time',75,undefined],['weekly',75,112.5],['one_time',112.5,undefined]
  ]);
});

test('voice transition: recurring to one-time and a saved-book revision keep historical first visits while requiring a current handle for new amounts',async t=>{
  const f=mowing(),weekly=mowingInputs(f),oneTime=mowingInputs(f,{frequency:'one_time'}),{h,match}=await startVoice(t,f);
  const historical=await quoteVoice(h,voiceArgs(match,f,weekly));
  assertEstimate(historical.result,50,{firstVisit:75});
  const historicalRow=structuredClone(voiceRows(h)[0]);

  const oldOneTimeArgs=voiceArgs(match,f,oneTime);
  await rejectUnconfirmedVoice(h,oldOneTimeArgs);
  const oldOneTime=await quoteVoice(h,oldOneTimeArgs);
  assertEstimate(oldOneTime.result,75);
  const oldOneTimeRow=structuredClone(voiceRows(h)[1]);

  const revised=structuredClone(f);
  revised.ownerPricing.pricing.mowingBaseRatePerSqft=0.75;
  publish(h.c.ownerId,revised);

  const unseenOldHandle={...voiceArgs(match,f,{...weekly,serviceFrequency:'monthly'})};
  const beforeRevisionFailure=[voiceRows(h).length,voiceQuotes(h).length];
  await assert.rejects(h.tool('getQuote',unseenOldHandle),error=>error?.code==='TOOL_EXECUTION_FAILED');
  assert.deepEqual([voiceRows(h).length,voiceQuotes(h).length],beforeRevisionFailure);

  await retryVoice(h,historical.args,historical.result,historicalRow);
  await retryVoice(h,oldOneTime.args,oldOneTime.result,oldOneTimeRow);

  const currentMatch=await h.tool('matchService',{query:f.ownerPricing.service});
  assert.equal(currentMatch.status,'matched');
  assert.notEqual(currentMatch.serviceHandle,match.serviceHandle);
  const revisedWeekly=await quoteVoice(h,voiceArgs(currentMatch,revised,weekly));
  assertEstimate(revisedWeekly.result,75,{firstVisit:112.5});
  const revisedOneTime=await quoteVoice(h,voiceArgs(currentMatch,revised,oneTime));
  assertEstimate(revisedOneTime.result,112.5);

  const rows=voiceRows(h);
  assert.equal(rows.length,4);
  assert.equal(rows[0].bookRevision,rows[1].bookRevision);
  assert.equal(rows[2].bookRevision,rows[3].bookRevision);
  assert.notEqual(rows[0].bookRevision,rows[2].bookRevision);
  assert.deepEqual(rows.map(row=>[storedInputs(row).serviceFrequency,JSON.parse(row.customerResponseJson).midEstimate,JSON.parse(row.customerResponseJson).firstVisit?.midEstimate]),[
    ['weekly',50,75],['one_time',75,undefined],['weekly',75,112.5],['one_time',112.5,undefined]
  ]);
});
