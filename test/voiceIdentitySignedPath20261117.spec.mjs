import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,until} from './voiceLifecycle20261006Fixture.mjs';

// Owner ruling 2026-11-19: the identity question is asked once. A plain
// confirmation is recognised as before, and so is any answer that starts with a
// yes, whatever follows, unless it is a clear no. An answer that does not start
// with a yes and is not a plain confirmation is not recognised. Anyone not
// recognised is a new caller for the rest of the call, and their request is
// still taken. These run through the complete path: signed Twilio HTTP and
// WebSocket calls, the receptionist's live transcript, and getCustomerContext
// through the tool dispatcher, exactly as a phone call reaches it.
// HANDWRITTEN EXPECTATIONS, before execution: a first call saves Sally's deck
// request. On a second call from the same number the question is "Am I
// speaking with Sally?".
// - Plain confirmations and answers starting with a yes (no clear no) return
//   found with the deck request.
// - Clear no answers and answers not starting with a yes return not_found with
//   nothing about Sally or the deck, and no later answer, even a plain "Yes"
//   after the question is asked again, opens the history.
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
// Recognised under the 2026-11-19 ruling: starts with a yes and has no clear no.
const YES_START=['Yes, I\'m calling about the deck','Yeah that\'s me, I\'m returning your call','Yes, I got your message',
  'Yes I\'m Sally and I need a roof quote','Yes, I\'m her wife','Yes, I\'m her husband','Yes, I\'m the homeowner now',
  'Yes, I need a quote for my roof.','Yeah, it\'s Sally, I had a question','Yes, Sally speaking, I need help','This is Sally, I need a roof quote',
  'Uh, yeah, I\'m calling about my fence','Oh hi, yes, about the gate','Mhm, I had a question about my quote','Speaking, what\'s this about?',
  'Sure, who is calling?','Yes?','Yes, Sally','Right, I\'m calling back','Yeah, no worries, I need a quote','Yes, I\'m not sure what I need yet'];
// Not recognised: a clear no, or an answer that does not start with a yes.
const NOT_CONFIRMED=[
  // Clear no.
  'No','Nope, wrong number','That\'s not me','Yes, but I am not that person','It is not','Yeah, no.','I\'m not Sally','No, this is her husband',
  'Wrong number.','Yes. No.','Sure am not','Yes, but I\'m not Sally','Yeah, Sally\'s not in','Right, she stepped out','Yeah, she\'s out right now',
  'Yes, Sally passed away','Yes, I\'ll take a message','Yes, they\'re not home right now','Yes, it\'s not me','Yeah, you have the wrong number',
  'Yes, she isn\'t available','No, I\'m calling about the deck',
  // Does not start with a yes.
  'It\'s Mary','Mary speaking','My name is Peter','You\'re speaking with Mary','Dave here','It\'s Dave here','Who\'s asking?','Maybe','Hmm.',
  'Hello?','Okay.','I think so','Sally moved out','I\'m calling about the deck','I\'m her wife','This is her office','Okay, I got your message',
  'Hi, who is this?','Well, I\'m calling about the fence'];

for(const answer of CONFIRMED)test('signed call confirms: '+JSON.stringify(answer),async t=>{
  const s=await call(t);await s.exchange(ASK,answer);found(await s.lookup());
});
for(const answer of YES_START)test('signed call recognises an answer starting with yes: '+JSON.stringify(answer),async t=>{
  const s=await call(t);await s.exchange(ASK,answer);found(await s.lookup());
});
for(const answer of NOT_CONFIRMED)test('signed call: not recognised, a new caller at once: '+JSON.stringify(answer),async t=>{
  const s=await call(t);await s.exchange(ASK,answer);locked(await s.lookup());
  // No second ask counts: a plain "Yes" afterwards, even after the question is asked again, never opens the history.
  for(const later of ['Yes.','Yes, it\'s me.','Yes, this is Sally.']){await s.exchange(ASK,later);locked(await s.lookup());}
});
test('signed call: before the caller answers, the lookup repeats the question and does not lock',async t=>{
  const s=await call(t);await s.ask(ASK);askAgain(await s.lookup());askAgain(await s.lookup());
  await s.answer('Yes, it\'s me.');found(await s.lookup());
});
test('signed call: the request of a caller made new is still saved',async t=>{
  const s=await call(t);await s.exchange(ASK,'It\'s Mary');locked(await s.lookup());
  const saved=await s.capture({name:'[SYNTHETIC] New homeowner',description:'[SYNTHETIC] roof quote'});
  assert.equal(saved.status,'captured_address_required');
  assert.equal(s.leads().filter(lead=>lead.customerName==='[SYNTHETIC] New homeowner'&&lead.describedService==='[SYNTHETIC] roof quote').length,1);
});
test('signed call: "Yes, I\'m his wife" is recognised (owner ruling 2026-11-19); "Yes, but I\'m not John" is not',async t=>{
  const wife=await call(t,'John Synthetic','Am I speaking with John?');
  await wife.exchange('Am I speaking with John?','Yes, I\'m his wife');
  const a=await wife.lookup();assert.equal(a.status,'found');assert.ok(a.openLeads.some(lead=>/deck/.test(lead.description)));
  const not=await call(t,'John Synthetic','Am I speaking with John?');
  await not.exchange('Am I speaking with John?','Yes, but I\'m not John');
  const b=await not.lookup();assert.equal(b.status,'not_found');assert.doesNotMatch(JSON.stringify(b),/deck|John|Synthetic/);
});
test('signed call: John recognised from a plain yes as before',async t=>{
  for(const answer of ['Yes','Yes, I am','Yes, it\'s me, John','Uh, yeah, speaking','Yes, I\'m calling about the deck','Yes, I got your message']){
    const s=await call(t,'John Synthetic','Am I speaking with John?');await s.exchange('Am I speaking with John?',answer);
    const result=await s.lookup();assert.equal(result.status,'found',answer);assert.ok(result.openLeads.some(lead=>/deck/.test(lead.description)));
  }
});
