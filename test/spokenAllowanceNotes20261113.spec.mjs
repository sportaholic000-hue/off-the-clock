import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture as voiceFixture,at,secret} from './leadCaptureRepair20261006Fixture.mjs';
import {fixture as quoteFixture,flooring} from '../verification/engine-independent/fixtures.mjs';
import {sodFixture} from './quoteConcreteLandscape20261016Fixture.mjs';
import {savePricebook,loadPricebook} from '../server/priceBookService.js';
import {approveApplicationService,bookRevision} from '../server/src/quoteDoneBridge.js';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {projectVoiceToolResult} from '../server/src/voice/toolDispatcher.js';
import {projectVoiceQuote,engineAllowances} from '../server/src/voice/voiceQuotePresentation.js';

// Owner request 2026-11-13: the topsoil allowance (only when the caller did not
// know the topsoil depth) and the subfloor allowance (whenever the quote carries
// it) are said on the call as fixed sentences the code supplies in
// spokenQuote.spokenNotes, like the travel and busy-months notes. The
// sentences are the agent's proposed wording, pending the owner's approval.
// Every expected value below was written before this file was run.
// Synthetic price books only; nothing calls the live voice or the website demo.
const TOPSOIL="The topsoil is priced at the business's usual depth and gets confirmed on site.";
const SUBFLOOR='The subfloor repair covers only the area you gave me, and it gets confirmed once the floor is opened up.';
const TRAVEL='The travel charge for your area gets confirmed by the business.';
const BUSY='The price is lower outside the busy months.';
// The engine's written sentences, which stay in the written copy only.
const TOPSOIL_WRITTEN='Imported topsoil is an allowance using the business’s typical import depth and will be confirmed on site.';
const SUBFLOOR_WRITTEN='Subfloor repair allowance covers only the measured affected area and is confirmed after opening the floor.';

async function phoneQuote(t,f,{confirm=[]}={}){
  const h=voiceFixture(t),c=h.context();
  f.ownerPricing.priceBasisByCategory.material='sell_price';delete f.ownerPricing.origin;
  savePricebook(c.ownerId,{services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'CAD'}});
  const book=loadPricebook(c.ownerId);approveApplicationService(c.ownerId,book.services[0].id,{revision:bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true},{timeZone:'UTC',quoteInstant:at});
  process.env.JWT_SECRET='SYNTHETIC_ALLOWANCE_NOTES_KEY_NEVER_LIVE'.padEnd(64,'x');
  const runtime=createVoiceToolRuntime({database:h.db,callContext:c,handleSecret:secret,clock:()=>new Date(at)});
  const invoke=async(name,args)=>projectVoiceToolResult(name,await runtime.handlers[name]({context:c,args}));
  const matched=await invoke('matchService',{query:f.ownerPricing.service});assert.ok(matched.serviceHandle);
  const inputs=structuredClone(f.customerInputs);delete inputs.confirmedFacts;
  const args={serviceHandle:matched.serviceHandle,customerInputs:inputs,customerConfirmed:true,callerMeasurementsEstimated:true,productConfirmations:Object.fromEntries(confirm.map(field=>[field,true]))};
  let result=await invoke('getQuote',args);
  const tokens=result.questionContract?.fields?.filter(field=>field.confirmationToken)||[];
  if(tokens.length){args.scopeConfirmations=Object.fromEntries(tokens.map(field=>[field.field,field.confirmationToken]));for(const field of tokens)args.customerInputs[field.field]=true;result=await invoke('getQuote',args);}
  assert.equal(result.status,'quoted',JSON.stringify(result));
  // A retried call returns the saved quote: its spoken notes are the same.
  const again=await invoke('getQuote',args);
  assert.deepEqual(again.spokenQuote,result.spokenQuote);
  return result;
}
const spokenText=result=>Object.values(result.spokenQuote).join(' ');
const count=(text,sentence)=>text.split(sentence).length-1;

function sod({topsoil=true,usable,removal=true,busy=false}={}){
  const f=sodFixture();delete f.ownerPricing.pricing.groundPrepPerSqft;
  Object.assign(f.ownerPricing.pricing,removal?{sodRemovalPerSqft:50}:{},topsoil?{sodGradingPerSqft:20,topsoilPerCubicYard:4000,topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:2}:{});
  if(usable!==undefined)f.customerInputs.usableTopsoilDepthInches=usable;
  if(busy){f.ownerPricing.peakMonths=[7];f.ownerPricing.peakSurchargePercent=10;f.customerInputs.workMonth='not_sure';}
  return f;
}
function replacement({subfloor=true,busy=false}={}){
  const base=flooring('tile',200);
  const f=quoteFixture('FLOORING_REPLACEMENT',{...base.ownerPricing.pricing,subfloorAllowancePerSqft:300,removalPerSqft:{carpet:100}},{...base.customerInputs,existingFloorType:'carpet',removalNeeded:true,removalAreaSqft:200,subfloorIssues:subfloor,...(subfloor?{subfloorRepairAreaSqft:40}:{})});
  if(busy){f.ownerPricing.peakMonths=[7];f.ownerPricing.peakSurchargePercent=10;f.customerInputs.workMonth='not_sure';}
  return f;
}

test('sod: topsoil priced separately and depth Not sure says the topsoil note, never the written sentence',async t=>{
  const result=await phoneQuote(t,sod({usable:'unknown'}));
  assert.equal(result.spokenQuote.spokenNotes,TOPSOIL);
  assert.ok(result.quoteNarration.includes(TOPSOIL_WRITTEN));
  assert.equal(spokenText(result).includes(TOPSOIL_WRITTEN),false);
  assert.equal(result.quoteNarration.includes(TOPSOIL),false,'the spoken note is not added to the written copy');
});

test('sod: a known topsoil depth has no topsoil note, whether it meets the target or needs an import',async t=>{
  const meets=await phoneQuote(t,sod({usable:4}));
  assert.ok(meets.quoteNarration.includes('No imported topsoil is needed for the supplied depth.'));
  assert.equal(Object.hasOwn(meets.spokenQuote,'spokenNotes'),false);
  const imports=await phoneQuote(t,sod({usable:1}));
  assert.ok(imports.quoteNarration.includes('Topsoil import depth: 3 inches.'));
  assert.equal(imports.quoteNarration.includes(TOPSOIL_WRITTEN),false);
  assert.equal(Object.hasOwn(imports.spokenQuote,'spokenNotes'),false);
});

test('sod: topsoil not priced separately has no note; its exclusion is unchanged',async t=>{
  const split=await phoneQuote(t,sod({topsoil:false}));
  assert.equal(Object.hasOwn(split.spokenQuote,'spokenNotes'),false);
  assert.equal(split.spokenQuote.spokenExclusions,"Just so you know, that doesn't include sod grading and imported topsoil.");
  const combined=await phoneQuote(t,sodFixture());
  assert.equal(Object.hasOwn(combined.spokenQuote,'spokenNotes'),false);
});

test('flooring replacement: a subfloor allowance says the subfloor note; without one there is no note',async t=>{
  const withSubfloor=await phoneQuote(t,replacement(),{confirm:['existingFloorType']});
  assert.equal(withSubfloor.spokenQuote.spokenNotes,SUBFLOOR);
  assert.ok(withSubfloor.quoteNarration.includes(SUBFLOOR_WRITTEN));
  assert.equal(spokenText(withSubfloor).includes(SUBFLOOR_WRITTEN),false);
  const without=await phoneQuote(t,replacement({subfloor:false}),{confirm:['existingFloorType']});
  assert.equal(without.quoteNarration.includes(SUBFLOOR_WRITTEN),false);
  assert.equal(Object.hasOwn(without.spokenQuote,'spokenNotes'),false);
});

test('real engine: the busy-months note comes first, then the allowance note, each once',async t=>{
  const sodBusy=await phoneQuote(t,sod({usable:'unknown',busy:true}));
  assert.equal(sodBusy.spokenQuote.spokenNotes,BUSY+' '+TOPSOIL);
  const floorBusy=await phoneQuote(t,replacement({busy:true}),{confirm:['existingFloorType']});
  assert.equal(floorBusy.spokenQuote.spokenNotes,BUSY+' '+SUBFLOOR);
  for(const result of [sodBusy,floorBusy])for(const note of [BUSY,TOPSOIL,SUBFLOOR,TRAVEL])assert.ok(count(result.spokenQuote.spokenNotes,note)<=1,note);
});

test('all four notes: travel, busy months, topsoil, subfloor, each exactly once and nothing else changes',()=>{
  const SEASON='Priced at the busy-season rate because no work month was given. The price is lower if the work is scheduled outside July, August.';
  const TRAVEL_WRITTEN='This location is outside the areas with a set travel charge; the business will confirm the travel charge.';
  const option={tierName:null,lowEstimate:4370,midEstimate:4370,highEstimate:4370,taxTreatment:'Includes applicable tax.',currency:'CAD',priceDrivers:[],skippedAddons:['Power washing'],disclaimer:'[SYNTHETIC] '+TRAVEL_WRITTEN+' '+SEASON};
  const quote={resultType:'INSTANT_ESTIMATE_READY',lowEstimate:4370,midEstimate:4370,highEstimate:4370,currency:'CAD',taxTreatment:'Includes applicable tax.',priceDrivers:['200 measured square feet'],skippedAddons:[],options:[option],disclaimer:option.disclaimer};
  const project=allowances=>projectVoiceToolResult('getQuote',projectVoiceQuote(structuredClone(quote),'h'.repeat(43),[],{businessCurrency:'CAD',measured:true,...(allowances?{allowances}:{})}));
  const all=project({topsoil:true,subfloor:true}),none=project();
  assert.equal(all.spokenQuote.spokenNotes,[TRAVEL,BUSY,TOPSOIL,SUBFLOOR].join(' '));
  for(const note of [TRAVEL,BUSY,TOPSOIL,SUBFLOOR])assert.equal(count(all.spokenQuote.spokenNotes,note),1,note);
  assert.equal(none.spokenQuote.spokenNotes,TRAVEL+' '+BUSY);
  const {spokenNotes:ignoredAll,...restAll}=all.spokenQuote,{spokenNotes:ignoredNone,...restNone}=none.spokenQuote;
  assert.deepEqual(restAll,restNone);
  assert.equal(all.quoteNarration,none.quoteNarration);assert.equal(all.voiceSummary,none.voiceSummary);
  assert.equal(all.spokenQuote.spokenExclusions,"Just so you know, that doesn't include power washing.");
});

test('engineAllowances reads only the engine structured record and is false for anything else',()=>{
  const no={topsoil:false,subfloor:false};
  for(const value of [undefined,null,'text',[],{},{options:'x'},{options:[null,{calculationRecord:{quantityDerivations:'x'},lineItems:'x'}]}])assert.deepEqual(engineAllowances(value),no);
  assert.deepEqual(engineAllowances({options:[{calculationRecord:{quantityDerivations:[{name:'topsoilCubicYards',inputs:{topsoilTargetDepthInches:4,usableTopsoilDepthInches:1}}]},lineItems:[]}]}),no);
  assert.deepEqual(engineAllowances({options:[{calculationRecord:{quantityDerivations:[{name:'topsoilCubicYards',inputs:{topsoilTypicalImportDepthInches:2}}]},lineItems:[]}]}),{topsoil:true,subfloor:false});
  assert.deepEqual(engineAllowances({options:[{calculationRecord:{quantityDerivations:[]},lineItems:[{name:'Anything',calculation:{ratePath:'subfloorAllowancePerSqft'}}]}]}),{topsoil:false,subfloor:true});
  // A written sentence alone never turns a note on.
  assert.deepEqual(engineAllowances({disclaimer:TOPSOIL_WRITTEN+' '+SUBFLOOR_WRITTEN,options:[{disclaimer:TOPSOIL_WRITTEN+' '+SUBFLOOR_WRITTEN,lineItems:[],calculationRecord:{quantityDerivations:[]}}]}),no);
});
