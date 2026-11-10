import './pricebookTestEnv.mjs';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileVoiceSystemInstruction,
  transcriptionNoticeKind,
  TRANSCRIPTION_NOTICE,
  VOICE_GUIDE_SERVICE_TYPES,
} from '../server/src/voice/voicePromptCompiler.js';
import {VOICE_TOOL_NAMES} from '../server/src/voice/toolSchemas.js';
import {voiceToolAllowed} from '../server/src/voice/voicePlanAccess.js';

// Owner-approved receptionist instruction fixes (2026-11-10). Expected text written before execution.
// Real compiler and real guide, synthetic business data only; nothing calls the live voice.
const GUIDE=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
const PLANS={
  starter:{receptionist:true,booking:false,transfer:false,phoneQuoting:false},
  operator:{receptionist:true,booking:true,transfer:true,phoneQuoting:false},
  quoteDone:{receptionist:true,booking:true,transfer:true,phoneQuoting:true},
};
// Starter and Operator have no price-book quoting, so no live quoting service reaches the compiler.
const SERVICES={
  starter:[],
  operator:[],
  quoteDone:VOICE_GUIDE_SERVICE_TYPES.map(serviceType=>({serviceType,serviceLabel:'[SYNTHETIC] '+serviceType.toLowerCase().replaceAll('_',' '),active:true,status:'QUOTING LIVE',offerings:[]})),
};
function compile(plan){
  const {receptionist,...capabilities}=PLANS[plan];
  return compileVoiceSystemInstruction({guideText:GUIDE,business:{businessName:'[SYNTHETIC] Harbour Services',agentName:'Nova'},services:SERVICES[plan],capabilities,transcriptionNotice:transcriptionNoticeKind(true,PLANS[plan])});
}
const TEXT=Object.fromEntries(Object.keys(PLANS).map(plan=>[plan,compile(plan)]));
const QUOTING_ONLY=['First matchService','Catalog discovery','Before getQuote','Caller-confirmed best guesses','MEASUREMENT HELP','NUMBER CONFIRMATION'];
const CALLBACK_LINE='Never invent availability, successful notifications or a transfer. Save caller callback requests with captureLead(callbackRequested=true, notes=the caller words). Reuse the same inquiryNumber or leadHandle for retries and corrections; use a different inquiryNumber only for a genuinely separate request. A callback saved message means the request was stored, not that the owner received an alert.';

// The approved URGENCY wording itself contains "Never say anyone has been notified", so the check is
// that every remaining "has been notified" is that prohibition, and the old instructions to say it are gone.
test('no plan tells a caller anyone has been notified',()=>{
  for(const [plan,text] of Object.entries(TEXT)){
    assert.equal(text.split('has been notified').length,text.split('Never say anyone has been notified.').length,plan);
    for(const removed of ['tell them the owner has been notified','[owner] has been notified'])assert.equal(text.includes(removed),false,plan+': '+removed);
  }
  assert.ok(TEXT.quoteDone.includes("once flagUrgent confirms, tell them it's marked urgent for the business. Never say anyone has been notified."));
  assert.ok(TEXT.quoteDone.includes('YES → flagUrgent immediately; once it confirms, say "Okay, I\'ve marked that as urgent. Couple quick questions so they\'re ready."'));
});

test('Starter and Operator drop the phone-quoting instructions and keep PHONE PRICING; QuoteDone keeps them',()=>{
  for(const plan of ['starter','operator']){
    for(const phrase of QUOTING_ONLY)assert.equal(TEXT[plan].includes(phrase),false,plan+': '+phrase);
    assert.ok(TEXT[plan].includes('PHONE PRICING:'),plan);
    assert.ok(TEXT[plan].includes('Give a Your prices line exactly as written whenever it matches what the caller asks about; capture any other work request for the owner.'),plan);
    for(const removed of ['If the caller wants work done','A measurement may be the caller','Only speak successful tool results.','Use these measured-input conversation flows'])assert.equal(TEXT[plan].includes(removed),false,plan+': '+removed);
  }
  for(const phrase of QUOTING_ONLY)assert.ok(TEXT.quoteDone.includes(phrase),'quoteDone: '+phrase);
  assert.ok(TEXT.quoteDone.includes('If the caller wants work done—install, repair'));
  assert.equal(TEXT.quoteDone.includes('PHONE PRICING:'),false);
});

test('every plan keeps the callback-request instructions',()=>{
  for(const [plan,text] of Object.entries(TEXT)){
    assert.ok(text.includes('callbackRequested'),plan);
    assert.ok(text.includes('A callback saved message means the request was stored'),plan);
    assert.equal(text.split(CALLBACK_LINE).length,2,plan+': one complete callback line');
  }
  for(const plan of ['operator','quoteDone'])assert.ok(TEXT[plan].includes('Supply the caller words in transferCall.notes.'),plan);
});

test('QuoteDone guide text carries the approved question wording only',()=>{
  const text=TEXT.quoteDone;
  for(const removed of ['confirmedFacts','[wallScopeUniform]','medium shrubs','Can a concrete truck pull','key figure','If so, how many steps?','What\'s down now —'])assert.equal(text.includes(removed),false,removed);
  for(const added of [
    'Q1 [areaInputMethod]: "Do you know the wall area in square feet, or would it be easier to go room by room?" For room by room, collect each room\'s length, width and height. Never substitute floor area or a room count.',
    'Q4 [wallHeight]: "Are the ceilings standard height, high, or vaulted?" Ask for feet only when the live contract asks wallHeightFeet.',
    'Q4 [areaInputMethod]: "Do you know the paintable wall area in square feet, or the distance around the house and the wall height?" A caller-given approximate number can be confirmed.',
    'Q5 [areaInputMethod] — LAST: "Do you know the wall area in square feet, or the distance around the house and the wall height?" A caller-given approximate number can be confirmed.',
    'Ask [permitRequired] when applicable.',
    'Q1 [plantsBySize]: "What are you looking to plant?" Then offer the owner\'s size names exactly as the live plantsBySize choices give them, and ask how many of each, one size per turn.',
    'Q7 [accessDifficulty]: "How easy is it to get to the work area — easy, a bit tight, or difficult?"',
    'Read back every number the caller gave, digits then words, identifying an approximate number as their estimate. This is',
    'Q3 [stairSteps] — ALWAYS ASKED: "Any stairs getting covered?" If yes, next turn: "How many steps?"',
    'Q4 [existingFloorType + removalNeeded]: "What\'s on the floor now?" Then, next turn: "Are we ripping that out, or is it already bare?"',
  ])assert.ok(text.includes(added),added);
  assert.ok(/Stairs are priced\s+per step/.test(text),'stairs-per-step note kept');
  assert.ok(text.includes('If removing it, ask for measured [removalAreaSqft].'),'removal area line kept');
});

test('transcription notice: Starter and Operator hear the details sentence, QuoteDone the quoting sentence',()=>{
  assert.equal(transcriptionNoticeKind(true,PLANS.operator),'details');
  assert.equal(transcriptionNoticeKind(true,PLANS.starter),'details');
  assert.equal(transcriptionNoticeKind(true,PLANS.quoteDone),'quoting');
  for(const plan of ['starter','operator']){
    assert.ok(TEXT[plan].includes(TRANSCRIPTION_NOTICE.details),plan);
    assert.equal(TEXT[plan].includes(TRANSCRIPTION_NOTICE.quoting),false,plan);
  }
  assert.ok(TEXT.quoteDone.includes(TRANSCRIPTION_NOTICE.quoting));
  assert.equal(TEXT.quoteDone.includes(TRANSCRIPTION_NOTICE.details),false);
});

// Open item awaiting the owner's ruling: two AUTHORITY sentences outside the approved changes still name
// getQuote for Starter and Operator ("(a) the current successful getQuote result" and the booking line's
// "the order is getQuote result →"). Marked todo so it reports without failing the suite.
test('each plan names only tools that plan is given',{todo:'Starter and Operator still name getQuote in two unapproved AUTHORITY sentences'},()=>{
  for(const [plan,capabilities] of Object.entries(PLANS)){
    for(const name of VOICE_TOOL_NAMES){
      if(voiceToolAllowed(name,capabilities))continue;
      assert.equal(new RegExp('\\b'+name+'\\b').test(TEXT[plan]),false,plan+' names unavailable tool '+name);
    }
  }
});
