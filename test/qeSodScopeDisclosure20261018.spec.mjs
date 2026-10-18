import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {sodFixture} from './quoteConcreteLandscape20261016Fixture.mjs';
import {includedFixture} from './quoteEngineVNextFixtures.mjs';
import {
  ENGINE_VERSION,
  generateQuoteVNext,
  sanitizeForCustomerVNext
} from '../server/quote-engine-vnext/index.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {customerJobSummary} from '../server/src/quoteIntake.js';
import {customerReceiptPresentation} from '../server/src/quoteScopeDisclosure.js';
import {
  projectSavedQuoteContext,
  projectVoiceQuote
} from '../server/src/voice/voiceQuotePresentation.js';
import {
  db,
  phone,
  quoteEmailFixture,
  webQuote
} from './quoteDeliveryBatch20261015Fixture.mjs';

// EXPECTED VALUES WERE WRITTEN BEFORE THIS FILE WAS RUN. See
// verification/qe-sod-scope-disclosure-20261018/EXPECTED.md.
const INCLUDED = 'Included ground preparation: ';
const EXCLUDED = 'Excluded ground preparation: ';
const REQUESTED = 'Ground preparation requested';
const BROAD = 'Existing-ground preparation included';
const components = {
  removal:'old-lawn removal and disposal',
  grading:'grading',
  topsoil:'imported topsoil'
};

function ready(fixture) {
  const result=generateQuoteVNext(fixture);
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(result));
  assert.equal(result.engineVersion,ENGINE_VERSION);
  return result;
}
function cents(result) {
  return result.lineItems.reduce((sum,line)=>sum+line.amountCents,0);
}
function splitFixture(pricing={},customer={}) {
  const fixture=sodFixture();
  Object.assign(fixture.ownerPricing.pricing,pricing);
  Object.assign(fixture.customerInputs,{usableTopsoilDepthInches:3,...customer});
  if(fixture.ownerPricing.pricing.topsoilPerCubicYard===undefined)delete fixture.customerInputs.usableTopsoilDepthInches;
  return fixture;
}
function customer(result) {
  const output=sanitizeForCustomerVNext(result);
  assert.equal(Object.hasOwn(output,'lineItems'),false);
  assert.equal(Object.hasOwn(output,'calculationRecord'),false);
  return output;
}
function assertSplitDisclosure(result,{included=[],excluded=[],noTopsoil=false}={}) {
  const output=customer(result),copy=JSON.stringify(output);
  assert.ok(output.priceDrivers.includes(REQUESTED),copy);
  assert.ok(!copy.includes(BROAD),copy);
  if(included.length)assert.match(output.disclaimer,new RegExp(INCLUDED+included.join(', ').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\.'));
  else assert.doesNotMatch(output.disclaimer,/Included ground preparation:/);
  if(excluded.length)assert.match(output.disclaimer,new RegExp(EXCLUDED+excluded.join(', ').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\. Any required excluded work needs a separate on-site estimate\\.'));
  else assert.doesNotMatch(output.disclaimer,/Excluded ground preparation:/);
  if(noTopsoil)assert.match(output.disclaimer,/No imported topsoil is needed for the supplied depth\./);
  assert.doesNotMatch(copy,/sodRemovalPerSqft|sodGradingPerSqft|topsoilPerCubicYard|groundPrepPerSqft/);
  return output;
}

test('sod disclosure money controls preserve no-prep and legacy combined output',()=>{
  const none=sodFixture();none.customerInputs.groundPrepNeeded=false;
  const noPrep=ready(none);assert.equal(cents(noPrep),205000);
  assert.ok(!customer(noPrep).priceDrivers.some(value=>/ground preparation/i.test(value)));

  const legacy=ready(sodFixture());assert.equal(cents(legacy),355000);
  const publicLegacy=customer(legacy);
  assert.ok(publicLegacy.priceDrivers.includes(BROAD));
  assert.doesNotMatch(publicLegacy.disclaimer,/Included ground preparation:|Excluded ground preparation:/);
});

test('sod disclosure names partial and complete split preparation without changing cents',()=>{
  const cases=[
    {
      name:'topsoil only',fixture:splitFixture({topsoilPerCubicYard:3000,topsoilTargetDepthInches:4}),
      total:214259,included:[components.topsoil],excluded:[components.removal,components.grading]
    },
    {
      name:'grading only',fixture:splitFixture({sodGradingPerSqft:90}),
      total:295000,included:[components.grading],excluded:[components.removal,components.topsoil]
    },
    {
      name:'all three',fixture:splitFixture({sodRemovalPerSqft:100,sodGradingPerSqft:90,topsoilPerCubicYard:3000,topsoilTargetDepthInches:4}),
      total:404259,included:[components.removal,components.grading,components.topsoil],excluded:[]
    }
  ];
  for(const row of cases){
    const result=ready(row.fixture);assert.equal(cents(result),row.total,row.name);
    assertSplitDisclosure(result,row);
  }
});

test('sod disclosure distinguishes valid zero rates, zero deficit and unknown allowance',()=>{
  const unclassified=splitFixture({sodGradingPerSqft:0});
  const unclassifiedResult=generateQuoteVNext(unclassified);
  assert.equal(unclassifiedResult.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.match(JSON.stringify(unclassifiedResult),/zero/i);

  const free=splitFixture({sodRemovalPerSqft:0,sodGradingPerSqft:0,topsoilPerCubicYard:0,topsoilTargetDepthInches:4});
  free.ownerPricing=includedFixture(free.ownerPricing,{
    sodRemovalPerSqft:'sodInstallLaborPerSqft',
    sodGradingPerSqft:'sodInstallLaborPerSqft',
    topsoilPerCubicYard:'sodMaterialPerSqft'
  });
  let result=ready(free);assert.equal(cents(result),205000);
  assertSplitDisclosure(result,{included:[components.removal,components.grading,components.topsoil]});

  const zeroDeficit=splitFixture({topsoilPerCubicYard:3000,topsoilTargetDepthInches:4},{usableTopsoilDepthInches:4});
  result=ready(zeroDeficit);assert.equal(cents(result),205000);
  const zeroPublic=assertSplitDisclosure(result,{excluded:[components.removal,components.grading],noTopsoil:true});
  assert.doesNotMatch(zeroPublic.disclaimer,/Excluded ground preparation:[^.]*imported topsoil/);

  const unknown=splitFixture({topsoilPerCubicYard:3000,topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:2},{usableTopsoilDepthInches:'unknown'});
  result=ready(unknown);assert.equal(cents(result),223519);
  const unknownPublic=assertSplitDisclosure(result,{included:[components.topsoil],excluded:[components.removal,components.grading]});
  assert.match(unknownPublic.disclaimer,/Imported topsoil is an allowance using the business.s typical import depth and will be confirmed on site\./);
});

test('sod disclosure keeps separate project-debris disposal separate from preparation scope',()=>{
  const fixture=splitFixture({sodGradingPerSqft:90});
  fixture.ownerPricing.disposalScope='separate_project_debris';
  fixture.ownerPricing.feeRules.disposal='always';
  fixture.businessDefaults.disposalFee=10000;
  fixture.customerInputs.separateDisposalSelected=true;
  const result=ready(fixture);assert.equal(cents(result),305000);
  assert.equal(result.lineItems.find(line=>line.name==='Disposal')?.amountCents,10000);
  assertSplitDisclosure(result,{included:[components.grading],excluded:[components.removal,components.topsoil]});
});

test('saved-book widget application response uses requested/component wording and replays frozen history',()=>{
  const fixture=splitFixture({topsoilPerCubicYard:3000,topsoilTargetDepthInches:4});
  const web=webQuote(fixture);
  assert.equal(web.result.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(web.result.midEstimate,2142.59);
  assert.equal(web.result.engineVersion,undefined,'customer response must not expose the internal engine version');
  assert.ok(web.result.priceDrivers.includes(REQUESTED));
  assert.match(web.result.disclaimer,/Included ground preparation: imported topsoil\./);
  assert.match(web.result.disclaimer,/Excluded ground preparation: old-lawn removal and disposal, grading\. Any required excluded work needs a separate on-site estimate\./);
  const prepFact=web.result.pricedScope.facts.find(fact=>fact.label===REQUESTED);
  assert.equal(prepFact?.value,'Yes');
  assert.doesNotMatch(JSON.stringify(web.result),/Existing-ground preparation included|topsoilPerCubicYard|3000/);

  const frozen=structuredClone(web.result);
  frozen.priceDrivers=frozen.priceDrivers.map(value=>value===REQUESTED?BROAD:value);
  frozen.pricedScope.facts=frozen.pricedScope.facts.map(fact=>fact.label===REQUESTED?{...fact,label:'Ground preparation included'}:fact);
  db.prepare('UPDATE quoteSubmissions SET customerResponseJson=? WHERE ownerId=? AND requestId=?')
    .run(JSON.stringify(frozen),web.owner,web.body.requestId);
  const replay=web.submit();
  assert.equal(replay.status,200);
  assert.deepEqual(replay.response,customerReceiptPresentation(frozen));
  assert.ok(replay.response.priceDrivers.includes(BROAD));
  assert.ok(projectSavedQuoteContext(replay.response).pricedScope.includes('Ground preparation included: Yes'));
});

test('real voice tool output uses the same split-preparation scope without private rates',async t=>{
  const fixture=splitFixture({sodGradingPerSqft:90});
  const harness=quoteEmailFixture(t),observed=await phone(harness,fixture);
  assert.equal(observed.result.status,'quoted',JSON.stringify(observed.result));
  assert.equal(observed.result.midEstimate,2950);
  assert.ok(observed.result.priceDrivers.includes(REQUESTED));
  assert.match(observed.result.writtenDisclosure,/Included ground preparation: grading\./);
  assert.match(observed.result.writtenDisclosure,/Excluded ground preparation: old-lawn removal and disposal, imported topsoil\. Any required excluded work needs a separate on-site estimate\./);
  assert.match(observed.result.quoteNarration,/Included ground preparation: grading\./);
  assert.match(observed.result.quoteNarration,/Excluded ground preparation: old-lawn removal and disposal, imported topsoil\./);
  assert.equal(observed.match.questionContract.fields.find(field=>field.field==='groundPrepNeeded')?.label,REQUESTED);
  assert.doesNotMatch(JSON.stringify(observed.result),/Existing-ground preparation included|sodGradingPerSqft|90/);

  const projected=projectVoiceQuote(webQuote(fixture).result,'synthetic-sod-disclosure');
  assert.match(projected.quoteNarration,/Included ground preparation: grading\./);
  assert.equal(bridge.ENGINE_VERSION,ENGINE_VERSION);
});

test('sod customer summary uses request wording rather than an inclusion promise',()=>{
  const fixture=splitFixture({sodGradingPerSqft:90});
  const definition=bridge.applicationServiceDefinition(fixture.ownerPricing);
  const summary=customerJobSummary(fixture.ownerPricing,definition,{customerInputs:fixture.customerInputs},'synthetic-revision');
  assert.equal(definition.customerFields.find(field=>field.name==='groundPrepNeeded')?.label,REQUESTED);
  assert.equal(summary.facts.find(fact=>fact.label===REQUESTED)?.value,'Yes');
  assert.equal(summary.facts.some(fact=>fact.label==='Ground preparation included'),false);
});
