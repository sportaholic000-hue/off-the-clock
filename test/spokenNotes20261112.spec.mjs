import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {projectVoiceQuote} from '../server/src/voice/voiceQuotePresentation.js';
import {projectVoiceToolResult} from '../server/src/voice/toolDispatcher.js';
import {compileVoiceSystemInstruction,transcriptionNoticeKind,VOICE_GUIDE_SERVICE_TYPES} from '../server/src/voice/voicePromptCompiler.js';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {flooring,mowing} from '../verification/engine-independent/fixtures.mjs';

// Owner request 2026-11-12: the travel-charge note and the busy-months note are
// said on the call as fixed sentences the code supplies in spokenQuote.spokenNotes,
// never in the receptionist's own words and never read from the written quote.
// Expected sentences are the owner's own wording, written before running.
// Synthetic quotes only; nothing calls the live voice or the website demo.
const TRAVEL='The travel charge for your area gets confirmed by the business.';
const BUSY='The price is lower outside the busy months.';
// The engine's own written wording for each note (quote-engine-vnext/engine.js).
const SEASON_DISCLOSURE='Priced at the busy-season rate because no work month was given. The price is lower if the work is scheduled outside July, August.';
const TRAVEL_DISCLOSURE='This location is outside the areas with a set travel charge; the business will confirm the travel charge.';
const HANDLE='h'.repeat(43);
function quote({disclaimer='[SYNTHETIC] Written qualification.',options=[[null,4370,disclaimer]]}={}){
  const priced=options.map(([tierName,amount,optionDisclaimer])=>({tierName,lowEstimate:amount,midEstimate:amount,highEstimate:amount,taxTreatment:'Includes applicable tax.',currency:'CAD',priceDrivers:[],skippedAddons:[],disclaimer:optionDisclaimer}));
  return {resultType:'INSTANT_ESTIMATE_READY',lowEstimate:priced[0].lowEstimate,midEstimate:priced[0].midEstimate,highEstimate:priced[0].highEstimate,currency:'CAD',taxTreatment:'Includes applicable tax.',priceDrivers:[],skippedAddons:[],options:priced,disclaimer};
}
const project=response=>projectVoiceToolResult('getQuote',projectVoiceQuote(response,HANDLE,[],{businessCurrency:'CAD',measured:true}));

test('spokenNotes: the travel sentence only for a quote with the travel-zone disclosure',()=>{
  const result=project(quote({disclaimer:'[SYNTHETIC] Written qualification. '+TRAVEL_DISCLOSURE}));
  assert.equal(result.spokenQuote.spokenNotes,TRAVEL);
  // The written copy still carries the engine's own wording; the call gets only the fixed sentence.
  assert.ok(result.quoteNarration.includes(TRAVEL_DISCLOSURE));
  assert.equal(result.spokenQuote.spokenNotes.includes('outside the areas'),false);
  for(const other of ['[SYNTHETIC] Written qualification.','[SYNTHETIC] Travel to the job is included in this price.',SEASON_DISCLOSURE])
    assert.equal(project(quote({disclaimer:other})).spokenQuote.spokenNotes?.includes(TRAVEL)??false,false,other);
});

test('spokenNotes: the busy-months sentence only for a quote with the work-month note',()=>{
  const result=project(quote({disclaimer:'[SYNTHETIC] Written qualification. '+SEASON_DISCLOSURE}));
  assert.equal(result.spokenQuote.spokenNotes,BUSY);
  assert.ok(result.quoteNarration.includes(SEASON_DISCLOSURE));
  for(const other of ['[SYNTHETIC] Written qualification.','[SYNTHETIC] Busy-season pricing follows the month the work is done.',TRAVEL_DISCLOSURE])
    assert.equal(project(quote({disclaimer:other})).spokenQuote.spokenNotes?.includes(BUSY)??false,false,other);
});

test('spokenNotes: both notes, option-level notes, and no field at all without a note',()=>{
  assert.equal(project(quote({disclaimer:TRAVEL_DISCLOSURE+' '+SEASON_DISCLOSURE})).spokenQuote.spokenNotes,TRAVEL+' '+BUSY);
  const options=quote({options:[['Basic',1200,'[SYNTHETIC] Basic. '+SEASON_DISCLOSURE],['Premium',1800,'[SYNTHETIC] Premium. '+SEASON_DISCLOSURE]]});
  assert.equal(project(options).spokenQuote.spokenNotes,BUSY);
  const plain=project(quote());
  assert.equal(Object.hasOwn(plain.spokenQuote,'spokenNotes'),false);
  assert.deepEqual(Object.keys(plain.spokenQuote),['spokenPrice']);
});

test('spokenNotes leaves spokenPrice, spokenExclusions, spokenDrivers and quoteNarration exactly as they were',()=>{
  const withNote=quote({disclaimer:'[SYNTHETIC] Written qualification. '+SEASON_DISCLOSURE});
  withNote.options[0].skippedAddons=['Power washing'];withNote.priceDrivers=['200 measured square feet'];
  const result=project(withNote);
  assert.equal(result.spokenQuote.spokenPrice,"For that, you're looking at $4,370, tax included. That's based on the measurements you gave me, and it gets confirmed on site before any work starts.");
  assert.equal(result.spokenQuote.spokenExclusions,"Just so you know, that doesn't include power washing.");
  assert.equal(result.spokenQuote.spokenDrivers,'The biggest factor is 200 measured square feet.');
  assert.equal(result.spokenQuote.spokenNotes,BUSY);
  assert.equal(result.lowEstimate,4370);assert.equal(result.highEstimate,4370);
  assert.equal(result.quoteNarration.includes(BUSY),false,'the spoken note is not added to the written copy');
});

// Real engine (no price book file, no network): what the engine actually puts in the quote.
test('real engine: a not-sure work month carries the busy-season note; a chosen month does not',()=>{
  const season=workMonth=>{const f=flooring('tile',200);f.ownerPricing.peakMonths=[7];f.ownerPricing.peakSurchargePercent=10;f.currentMonth=3;f.customerInputs.workMonth=workMonth;return project(sanitizeForCustomerVNext(generateQuoteVNext(f)));};
  const unsure=season('not_sure');
  assert.equal(unsure.status,'quoted');
  // Hand-calculated in qeAuditBuild20261028: base 178,000 cents + 10% of 66,000 labor = 184,600 cents.
  assert.equal(unsure.midEstimate,1846);
  assert.equal(unsure.spokenQuote.spokenNotes,BUSY);
  const march=season('march');
  assert.equal(march.midEstimate,1780);
  assert.equal(Object.hasOwn(march.spokenQuote,'spokenNotes'),false);
});

test('real engine: an in-zone travel charge has no note, and an out-of-zone charged job goes to review with no spoken quote',()=>{
  const ZONES=[{name:'Core',codes:['E2L'],charge:0},{name:'Outer',codes:['E2H'],charge:3500}];
  const zoned=postal=>{const f=mowing();f.ownerPricing.feeRules.travel='always';f.businessDefaults.travelFee=2500;f.businessDefaults.travelZones=structuredClone(ZONES);f.customerInputs.postalCode=postal;return project(sanitizeForCustomerVNext(generateQuoteVNext(f)));};
  const inside=zoned('E2H 1A1');
  // Mowing 5,000 sq ft x 2 = 10,000 cents plus the Outer zone's 3,500 = 13,500 cents.
  assert.equal(inside.midEstimate,135);
  assert.equal(Object.hasOwn(inside.spokenQuote,'spokenNotes'),false);
  const outside=zoned('E3B 5A3');
  assert.equal(outside.status,'needs_details');
  assert.equal(outside.spokenQuote,undefined);
});

const GUIDE=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
const PLANS={starter:{booking:false,transfer:false,phoneQuoting:false},operator:{booking:true,transfer:true,phoneQuoting:false},quoteDone:{booking:true,transfer:true,phoneQuoting:true}};
const ALL=VOICE_GUIDE_SERVICE_TYPES.map(serviceType=>({serviceType,serviceLabel:'[SYNTHETIC] '+serviceType.toLowerCase().replaceAll('_',' '),active:true,status:'QUOTING LIVE',offerings:[]}));
const compile=(plan,services,notice=false)=>compileVoiceSystemInstruction({guideText:GUIDE,business:{businessName:'[SYNTHETIC] Harbour Services',agentName:'Nova'},services,capabilities:PLANS[plan],transcriptionNotice:transcriptionNoticeKind(notice,PLANS[plan])});
const QUOTE_DONE=[[],ALL,ALL.filter(s=>['CONCRETE_DRIVEWAY','LANDSCAPING_SOD','INTERIOR_PAINTING'].includes(s.serviceType))].flatMap(services=>[false,true].map(notice=>compile('quoteDone',services,notice)));

test('QuoteDone: no instruction says "read its disclosure" or "read its note", and none reads quoteNarration aloud',()=>{
  for(const text of QUOTE_DONE){
    const flat=text.replace(/\s+/g,' ');
    assert.equal(/read its disclosure/i.test(flat),false);
    assert.equal(/read its note/i.test(flat),false);
    // Every sentence naming quoteNarration either forbids reading it aloud or describes the email.
    const sentences=flat.split(/(?<=[.;:]"?)\s+/).filter(sentence=>/quoteNarration/.test(sentence));
    assert.ok(sentences.length>0);
    for(const sentence of sentences)assert.ok(/^Never read quoteNarration aloud/.test(sentence)||/^The server sends the same quoteNarration from this call under the business name\.$/.test(sentence),sentence);
  }
});

test('QuoteDone: the travel-zone and work-month instructions say spokenNotes when present',()=>{
  const flat=compile('quoteDone',[]).replace(/\s+/g,' ');
  assert.ok(flat.includes('If the postal or ZIP code is outside the travel areas and the business charges travel there, getQuote sends the request to the business for review instead of a price; otherwise it returns the quote without a travel charge. When spokenQuote.spokenNotes is present, say it exactly as written right after the price and any spokenExclusions.'));
  assert.ok(flat.includes('If the caller is not sure, send not_sure; the quote then uses the busy-season price. When spokenQuote.spokenNotes is present, say it exactly as written right after the price and any spokenExclusions.'));
});

test('QuoteDone: concrete, landscaping and painting written-only lines are never said on the call',()=>{
  for(const text of QUOTE_DONE){
    const flat=text.replace(/\s+/g,' ');
    assert.equal(flat.includes('Read every returned on-site placement and control-joint qualification, and the stated base depth.'),false);
    assert.equal(flat.includes('retain the returned on-site measurement sentence'),false);
    assert.equal(flat.includes('Set callerMeasurementsEstimated=true for any approximation and retain the returned on-site measurement line.'),false);
    assert.equal(flat.includes('Read the returned on-site confirmation sentence.'),false);
  }
  const flat=QUOTE_DONE[5].replace(/\s+/g,' ');
  assert.ok(flat.includes('The returned on-site placement and control-joint qualifications and the stated base depth stay in the written copy; never say them on the call.'));
  assert.ok(flat.includes('The returned on-site measurement sentence stays in the written copy; never say it on the call.'));
  assert.ok(flat.includes('The returned on-site measurement line stays in the written copy; never say it on the call.'));
  assert.ok(flat.includes('spokenQuote.spokenPrice already says the measurements get confirmed on site; never read the written on-site confirmation sentence.'));
});

test('Starter and Operator compiled text is unchanged, byte for byte',()=>{
  // SHA-256 of the compiled instructions at fb52bc69, before this change: no
  // services (production) and, as a stricter check, every guide service active.
  const before={
    starter:{none:['26ab4834e89f24ccef6f60c9534c771e472af940531460119c0523a23afb07a1','23ba4a2b44ac47f09530292f41233b8005d1b57b42dc34b573b57f142acffc81'],
      all:['1d3ef9d0826c35f21a12e22a0a2dc72d15a6e2f17ded03a7c359eb02c7e02d0e','74c25e9fe9df2fd21eeb25e0ab211d4e1f83f565d4aa61efa8c9de11b05f918b']},
    operator:{none:['833c57ccf1d2ab92bc803938505b0366d2fab5e4b3455a5c66eb1a762195d9b9','3e26fd959619ba6afe130685a785ba44c9610fc7e1cae5a4755f72d126778e06'],
      all:['30743b016ed1abfc48f077cc7290be80e9cf5ba5fdf9123a00d31f9774cc05ef','d6cd133a6b2a2579c53531aa5178a0d826a1344d58b6903c92c579e166fdc9e2']}
  };
  for(const [plan,sets] of Object.entries(before))for(const [name,digests] of Object.entries(sets))[false,true].forEach((notice,index)=>{
    const text=compile(plan,name==='all'?ALL:[],notice);
    assert.equal(createHash('sha256').update(text).digest('hex'),digests[index],plan+' '+name+' notice='+notice);
    assert.equal(text.includes('spokenNotes'),false);
  });
});
