import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,until} from './voiceLifecycle20261006Fixture.mjs';

// Owner rulings 2026-11-17 and 2026-11-18 (final): the identity question is asked
// once. Only a plain confirmation (only confirmation words) releases saved history;
// any other answer makes the caller a new caller for the rest of the call, with
// no second ask. These run through the complete path: signed Twilio HTTP and
// WebSocket calls, the receptionist's live transcript, and getCustomerContext
// through the tool dispatcher, exactly as a phone call reaches it.
// HANDWRITTEN EXPECTATIONS, before execution: a first call saves Sally's deck
// request. On a second call from the same number the question is "Am I
// speaking with Sally?".
// - Plain confirmations return found with the deck request.
// - Every other answer returns not_found with nothing about Sally or the deck,
//   and no later answer, even a plain "Yes" after the question is asked again,
//   opens the history.
// - Before the caller has answered, the lookup returns the question again and
//   does not lock. The caller's request is still saved after a lock.
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
  const capture=args=>h.tool(c.callback,'captureLead',args);
  const leads=()=>h.db.prepare('SELECT customerName,describedService FROM leads WHERE ownerId=?').all(h.owner);
  return {ask,answer,exchange,lookup,capture,leads};
}
const found=result=>{assert.equal(result.status,'found');assert.ok(result.openLeads.some(lead=>/deck/.test(lead.description)));};
const locked=result=>{assert.equal(result.status,'not_found');assert.doesNotMatch(JSON.stringify(result),/deck|Sally|Synthetic/);};
const askAgain=result=>assert.deepEqual(result,{status:'identity_unconfirmed',message:ASK});

const CONFIRMED=['Uh, yeah, speaking','Mhm, it\'s me','Yes no problem, that\'s me','Yes, this is Sally Synthetic.',
  'Yes, I am','I am','Yes I am.','You are','Yes you are','Yes, this is','This is','Sure am','Yessir','Yes it\'s me, Sally'];
// Every answer that is not a plain confirmation, whatever kind it is.
const NOT_CONFIRMED=[
  // Denials.
  'No','Nope, wrong number','That\'s not me','Yes, but I am not that person','It is not','Yeah, no.','I\'m not Sally','No, this is her husband',
  'Wrong number.','Yes. No.','Sure am not',
  // Someone else.
  'Yes, I\'m her wife','Yes, I\'m her husband','Yes, I\'m her cousin','Yeah, that\'s Sally, but this is Peter speaking','Yeah, Sally\'s not in',
  'Right, she stepped out','Yes, I\'m her secretary','Yeah this is Mary','yes this is mary','Yeah, she\'s out right now','Yes this is her office',
  'Yes, Sally passed away','Yes, I\'m calling because Mary is out','Yes, I\'m calling for Sally','Yes, I\'ll take a message','Yes, Mary asked me to call',
  'My name is Peter','You\'re speaking with Mary','Yes, I\'m Peter','Yes, I\'m calling on her behalf','Yeah, Sally will call you back',
  'Yes, they\'re not home right now','Yes, tell Sally I called',
  // Owner's report 2026-11-18: these were asked a second time before.
  'It\'s Mary','Mary speaking','Yeah it\'s Dave','Yes, I\'m the homeowner now','Yes we bought the house from Sally',
  'yes i\'m mary','yes mary is out','It\'s Dave here','Dave here','Yeah, it\'s her brother','Yes, the new owner','Sally moved out',
  // Extra words, questions and unclear answers, including from the real Sally.
  'Yes, I got your message','Yes I\'m Sally and I need a roof quote','Yes, I\'m calling about the deck','Yeah that\'s me, I\'m returning your call',
  'Yes, I\'m calling about my mom\'s deck','Sure, who is calling?','sure who is calling','Maybe','Who\'s asking?','Yes, Sally',
  'Yes, I need a quote for my roof.','Yes, I\'m calling from work','Yes, this is about the Ridgeline quote','Yes, I\'m outside',
  'Yeah, it\'s Sally, I had a question','Yes, Sally speaking, I need help','Yes I am the homeowner','Hmm.','Hello?','Okay.','I think so'];

for(const answer of CONFIRMED)test('signed call confirms: '+JSON.stringify(answer),async t=>{
  const s=await call(t);await s.exchange(ASK,answer);found(await s.lookup());
});
for(const answer of NOT_CONFIRMED)test('signed call: anything but a plain confirmation makes a new caller at once: '+JSON.stringify(answer),async t=>{
  const s=await call(t);await s.exchange(ASK,answer);locked(await s.lookup());
  // No second ask counts: a plain "Yes" afterwards, even after the question is asked again, never opens the history.
  for(const later of ['Yes.','Yes, it\'s me.','Yes, this is Sally.']){await s.exchange(ASK,later);locked(await s.lookup());}
});
test('signed call: before the caller answers, the lookup repeats the question and does not lock',async t=>{
  const s=await call(t);await s.ask(ASK);askAgain(await s.lookup());askAgain(await s.lookup());
  await s.answer('Yes, it\'s me.');found(await s.lookup());
});
test('signed call: the request of a caller made new is still saved',async t=>{
  const s=await call(t);await s.exchange(ASK,'Yes, I\'m the homeowner now');locked(await s.lookup());
  const saved=await s.capture({name:'[SYNTHETIC] New homeowner',description:'[SYNTHETIC] roof quote'});
  assert.equal(saved.status,'captured_address_required');
  assert.equal(s.leads().filter(lead=>lead.customerName==='[SYNTHETIC] New homeowner'&&lead.describedService==='[SYNTHETIC] roof quote').length,1);
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
