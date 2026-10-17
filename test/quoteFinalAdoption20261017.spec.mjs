import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,flooring} from '../verification/engine-independent/fixtures.mjs';
import {quoteEmailFixture,publish,webQuote,bridge,date,loadPricebook,db} from './quoteDeliveryBatch20261015Fixture.mjs';
import {submitQuote} from '../server/src/quoteDoneRoutes.js';

const siteLine='This price is based on the measurements you gave us. The business will confirm them on site.';
function painting(){
  const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,ceilingLaborPerSqftPerCoat:100,ceilingMaterialPerSqftPerCoat:30,trimLaborPerLF:200,trimMaterialPerLF:30,minimumJob:0},
    {areaInputMethod:'wall_sqft',wallAreaSqft:400,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:1,ceilingsIncluded:false,trimIncluded:false});
  f.ownerPricing.priceBasisByCategory.material='sell_price';return f;
}
function replaceWithNew(owner,f){
  const service=structuredClone(f.ownerPricing);service.id=randomUUID();
  for(const key of ['origin','approvedValues','quoteDoneApproval','startingValueState','startingValueAdoptions'])delete service[key];
  const draft=bridge.convertApplicationBook({services:[service],defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC',rangeLowPercent:0,rangeHighPercent:0}},'toDollars');
  bridge.saveApplicationBook(owner,{...draft,revision:bridge.readApplicationBook(owner).revision},date);
  approve(owner);
  if(db.prepare('SELECT id FROM users WHERE id=?').get(owner))db.prepare("INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,enabled,updatedAt) VALUES(?,?,'SYNTHETIC','site_visit_first',0,?)").run(owner,service.id,date.quoteInstant);
  return loadPricebook(owner).services[0];
}
function approve(owner,extra={}){const draft=bridge.readApplicationBook(owner);bridge.approveApplicationService(owner,draft.services[0].id,{revision:draft.revision,confirmConfiguration:true,confirmLegacySettings:true,...extra},date);}
function confirm(owner,path){const draft=bridge.readApplicationBook(owner);draft.services[0].startingValueActions={confirmPaths:[path]};bridge.saveApplicationBook(owner,draft,date);approve(owner);}
async function channels(w,h,inputs,cents,{notPublished=false}={}){
  const service=loadPricebook(w.owner).services[0],body={...w.body,serviceId:service.id,requestId:randomUUID(),customerInputs:structuredClone(inputs)};delete body.intakeConfirmation;
  const checked=bridge.prepareApplicationIntake(w.owner,body,date),match=await h.tool('matchService',{query:service.service});
  if(notPublished){assert.equal(cents,null);assert.equal(checked.status,'needs_details');assert.equal(match.status,'needs_clarification');assert.equal(match.serviceHandle,undefined);assert.equal(match.midEstimate,undefined);return;}
  assert.ok(match.serviceHandle,JSON.stringify(match));
  const customerInputs=structuredClone(inputs);delete customerInputs.confirmedFacts;
  const voice=await h.tool('getQuote',{serviceHandle:match.serviceHandle,customerInputs,customerConfirmed:true,callerMeasurementsEstimated:true,additionalWork:[],productConfirmations:Object.fromEntries(Object.keys(inputs.confirmedFacts||{}).map(k=>[k,true]))});
  if(cents===null){assert.equal(checked.status,'needs_details');assert.notEqual(voice.status,'quoted');assert.equal(voice.midEstimate,undefined);return;}
  assert.equal(checked.status,'ready',JSON.stringify(checked));
  const saved=submitQuote(w.owner,{...body,intakeConfirmation:checked.confirmation},{clock:()=>new Date(date.quoteInstant)});
  assert.equal(saved.status,201);assert.equal(saved.response.midEstimate,cents/100);
  assert.equal(voice.status,'quoted',JSON.stringify(voice));assert.equal(voice.midEstimate,cents/100);assert.ok(voice.quoteNarration.includes(siteLine));
  for(const response of [saved.response,voice])assert.doesNotMatch(JSON.stringify(response),/"(?:lineItems|startingValueState|priceMetadata|installedLaborPercent|actualLaborCostCents)"/);
}
for(const name of ['painting','flooring'])test('final integration '+name+' saved adoption and used-only confirmation through widget/voice',async t=>{
  // Expected BEFORE execution. Paint one coat legacy40000+13200=53200;
  // adopted round(80000/1.8)+13200=57644. Flooring300sqft straight:
  // labor99000+material162000=261000; adopted diagonal118800+168000=286800.
  const f=name==='painting'?painting():flooring('vinyl_plank',300);
  Object.assign(f.businessDefaults,{rangeLowPercent:0,rangeHighPercent:0});
  const w=webQuote(f),h=quoteEmailFixture(t);publish(h.c.ownerId,f);
  const owners=[w.owner,h.c.ownerId],group=name==='painting'?'painting_coats_20261017':'flooring_patterns_20261017';
  await channels(w,h,f.customerInputs,name==='painting'?53200:261000);
  for(const owner of owners)approve(owner,{adoptStartingValueGroup:group});
  const selected={...f.customerInputs,...(name==='flooring'?{layoutPattern:'diagonal'}:{})};
  await channels(w,h,selected,name==='painting'?57644:286800);
  for(const owner of owners){const s=replaceWithNew(owner,f);assert.equal(s.startingValueAdoptions[group].mode,'new');assert.ok(Object.values(s.startingValueState).every(row=>!row.confirmed&&row.source&&row.assumption));}
  if(name==='flooring')await channels(w,h,f.customerInputs,261000);
  await channels(w,h,selected,null,{notPublished:name==='painting'});
  const path=name==='painting'?'paintingSettings.wallAdditionalCoatRatio':'diagonalWasteAdderByType.vinyl_plank';
  for(const owner of owners)confirm(owner,path);
  await channels(w,h,selected,name==='painting'?57644:286800);
  const pending=name==='painting'?{...selected,ceilingsIncluded:true,ceilingAreaSqft:400,ceilingCoats:1,ceilingSurfaceCondition:'good'}:{...selected,layoutPattern:'herringbone_or_chevron'};
  await channels(w,h,pending,null);
  await channels(w,h,name==='painting'?selected:f.customerInputs,name==='painting'?57644:261000);
});
