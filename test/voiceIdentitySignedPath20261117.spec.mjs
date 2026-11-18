import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,until} from './voiceLifecycle20261006Fixture.mjs';

// Owner rulings 2026-11-17 and 2026-11-18: an answer confirms only when it says
// this person is the caller (only confirmation words). A denial (an answer with
// "no", or a plain denial such as "That's not me" or "It is not") or an answer
// that mentions another person locks the call at once. Any other refused answer gets the identity question once more; the
// second answer is judged by the same check, and a second refusal locks.
// These run through the complete path: signed Twilio HTTP and WebSocket calls,
// the receptionist's live transcript, and getCustomerContext through the tool
// dispatcher, exactly as a phone call reaches it.
// HANDWRITTEN EXPECTATIONS, before execution: a first call saves Sally's deck
// request. On a second call from the same number the question is "Am I
// speaking with Sally?".
// - Confirmations return found with the deck request.
// - Denials return not_found with nothing about Sally or the deck, and a later
//   "Yes, it's me." after the question is asked again is still not_found.
// - Answers that mention another person return not_found at once, and a later
//   "Yes" after the question is asked again stays not_found.
// - Other refused answers return identity_unconfirmed with exactly the question
//   and nothing else; asking getCustomerContext again before the question is
//   asked again returns the same and does not lock; after the question is asked
//   again, a confirmation returns found, and another refused answer (unclear or
//   denial) returns not_found and locks the rest of the call.
const ASK='Am I speaking with Sally?';
async function call(t,name='Sally Synthetic',question=ASK){
  const h=await harness(t),first=await h.connect(1);
  await h.tool(first.callback,'captureLead',{name,description:'[SYNTHETIC] private deck repair'});
  const c=await h.connect(2),asked=await h.tool(c.callback,'getCustomerContext',{});
  assert.equal(asked.status,'identity_unconfirmed');assert.equal(asked.message,question);
  const transcript=()=>JSON.parse(h.db.prepare('SELECT transcriptJson FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid).transcriptJson);
  const count=()=>transcript().length;
  // The receptionist asks (its words reach the transcript at turn end), then the caller answers.
  const ask=async question=>{const before=count();c.callback.onmessage({serverContent:{outputTranscription:{text:question},turnComplete:true}});await until(()=>count()>before);};
  const answer=async text=>{const before=count();c.callback.onmessage({serverContent:{inputTranscription:{text}}});await until(()=>count()>before);};
  const exchange=async(question,text)=>{await ask(question);await answer(text);};
  const lookup=()=>h.tool(c.callback,'getCustomerContext',{callerConfirmedIdentity:true});
  return {ask,answer,exchange,lookup};
}
const found=result=>{assert.equal(result.status,'found');assert.ok(result.openLeads.some(lead=>/deck/.test(lead.description)));};
const locked=result=>{assert.equal(result.status,'not_found');assert.doesNotMatch(JSON.stringify(result),/deck|Sally|Synthetic/);};
const askAgain=result=>assert.deepEqual(result,{status:'identity_unconfirmed',message:ASK});

const CONFIRMED=['Uh, yeah, speaking','Mhm, it\'s me','Yes no problem, that\'s me','Yes, this is Sally Synthetic.',
  'Yes, I am','I am','Yes I am.','You are','Yes you are','Yes, this is','This is','Sure am','Yessir','Yes it\'s me, Sally'];
const DENIED=['No','Nope, wrong number','That\'s not me','Yes, but I am not that person','It is not','Yeah, no.','I\'m not Sally','No, this is her husband',
  'Wrong number.','Yes. No.','Sure am not'];
// Owner ruling 2026-11-18 (second): an answer that mentions another person locks at once, with no second ask.
const SOMEONE_ELSE=['Yes, I\'m her wife','Yes, I\'m her husband','Yes, I\'m her cousin','Yeah, that\'s Sally, but this is Peter speaking',
  'Yeah, Sally\'s not in','Right, she stepped out','Yes, I\'m her secretary','Yeah this is Mary','yes this is mary','Yeah, she\'s out right now',
  'Yes this is her office','Yes, Sally passed away','Yes, I\'m calling because Mary is out','Yes, I\'m calling for Sally','Yes, I\'ll take a message',
  'Yes, Mary asked me to call','My name is Peter','You\'re speaking with Mary','Yes, I\'m Peter','Yes, I\'m calling on her behalf',
  'Yeah, Sally will call you back','Yes, I\'m calling about my mom\'s deck','Yes, they\'re not home right now','Yes, tell Sally I called'];
const UNCLEAR=['Yes, I\'m calling about the deck','Yeah that\'s me, I\'m returning your call','Sure, who is calling?','sure who is calling','Maybe',
  'Who\'s asking?','Yes, Sally','Yes, I need a quote for my roof.','Yes, I\'m calling from work','Yes, I\'m calling about Monday',
  'Yes, this is about the Ridgeline quote','Yes, I\'m outside','Yeah, it\'s Sally, I had a question','Yes, Sally speaking, I need help','Yes I am the homeowner'];

for(const answer of CONFIRMED)test('signed call confirms: '+JSON.stringify(answer),async t=>{
  const s=await call(t);await s.exchange(ASK,answer);found(await s.lookup());
});
for(const answer of DENIED)test('signed call denial locks at once: '+JSON.stringify(answer),async t=>{
  const s=await call(t);await s.exchange(ASK,answer);locked(await s.lookup());
  await s.exchange('Sorry, am I speaking with Sally?','Yes, it\'s me.');locked(await s.lookup());
});
for(const answer of SOMEONE_ELSE)test('signed call: someone else locks at once with no second ask: '+JSON.stringify(answer),async t=>{
  const s=await call(t);await s.exchange(ASK,answer);locked(await s.lookup());
  // A plain "Yes" afterwards, even after the question is asked again, never opens the history.
  for(const later of ['Yes.','Yes, it\'s me.','Yes, this is Sally.']){await s.exchange(ASK,later);locked(await s.lookup());}
});
for(const answer of UNCLEAR)test('signed call asks once more, then confirms: '+JSON.stringify(answer),async t=>{
  const s=await call(t);await s.exchange(ASK,answer);askAgain(await s.lookup());
  // Looking up again before the question is asked again neither uses the old answer nor locks.
  askAgain(await s.lookup());
  await s.exchange('Sorry, am I speaking with Sally?','Yes, speaking.');found(await s.lookup());
});
for(const [first,second] of [['Yes, I\'m calling about the deck','Yes, I\'m calling about the deck'],['Who\'s asking?','Yes, I\'m her husband'],
  ['Yes, I\'m calling about the deck','No'],['Maybe','Yes, who is this?'],['Yes, Sally','It is not'],['Yes, I\'m outside','Yeah this is Mary']])
  test('signed call: a second refused answer locks: '+JSON.stringify([first,second]),async t=>{
    const s=await call(t);await s.exchange(ASK,first);askAgain(await s.lookup());
    await s.exchange('Sorry, am I speaking with Sally?',second);locked(await s.lookup());
    await s.exchange(ASK,'Yes, it\'s me.');locked(await s.lookup());
  });
test('signed call: a denial after an unclear answer also locks, and no later answer opens it',async t=>{
  const s=await call(t);await s.exchange(ASK,'Yes, I\'m calling about the deck');askAgain(await s.lookup());
  await s.exchange(ASK,'Nope.');locked(await s.lookup());
  for(const answer of ['Yes.','Yes, this is Sally.'])await s.exchange(ASK,answer),locked(await s.lookup());
});
test('signed call: silence after the second ask keeps asking without locking',async t=>{
  const s=await call(t);await s.exchange(ASK,'Hmm.');askAgain(await s.lookup());
  // The question is asked again but the caller has not answered yet.
  await s.ask(ASK);askAgain(await s.lookup());askAgain(await s.lookup());
  await s.answer('Yes, it\'s me.');found(await s.lookup());
});

test('signed call, the reported case: "Yes, I\'m his wife" then "Yes" never treats her as John',async t=>{
  const s=await call(t,'John Synthetic','Am I speaking with John?');
  await s.exchange('Am I speaking with John?','Yes, I\'m his wife');
  const first=await s.lookup();assert.equal(first.status,'not_found');assert.doesNotMatch(JSON.stringify(first),/deck|John|Synthetic/);
  await s.exchange('Am I speaking with John?','Yes');
  const second=await s.lookup();assert.equal(second.status,'not_found');assert.doesNotMatch(JSON.stringify(second),/deck|John|Synthetic/);
});
test('signed call: John recognised from a plain yes as before',async t=>{
  for(const answer of ['Yes','Yes, I am','Yes, it\'s me, John','Uh, yeah, speaking']){
    const s=await call(t,'John Synthetic','Am I speaking with John?');await s.exchange('Am I speaking with John?',answer);
    const result=await s.lookup();assert.equal(result.status,'found',answer);assert.ok(result.openLeads.some(lead=>/deck/.test(lead.description)));
  }
});
