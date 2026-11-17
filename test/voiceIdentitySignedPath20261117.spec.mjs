import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,until} from './voiceLifecycle20261006Fixture.mjs';

// Owner rulings 2026-11-17: an answer confirms only when it says this person is
// the caller (only confirmation words); a contradictory or third-party answer reveals nothing. These run
// through the complete path: signed Twilio HTTP and WebSocket calls, the
// receptionist's live transcript, and getCustomerContext through the tool
// dispatcher, exactly as a phone call reaches it.
// HANDWRITTEN EXPECTATIONS, before execution: a first call saves Sally's deck
// request. On a second call from the same number, the identity question is
// "Am I speaking with Sally?". Each refused answer returns not_found with no
// deck, Sally or Synthetic in the result, and the rest of that call stays
// locked even if the caller later says "Yes, it's me."; each accepted answer
// returns found with the deck request. Any words beyond the confirmation
// (even "I'm calling about my deck") reveal nothing.
async function secondCall(t,answer){
  const h=await harness(t),first=await h.connect(1);
  await h.tool(first.callback,'captureLead',{name:'Sally Synthetic',description:'[SYNTHETIC] private deck repair'});
  const c=await h.connect(2),asked=await h.tool(c.callback,'getCustomerContext',{});
  assert.equal(asked.status,'identity_unconfirmed');assert.equal(asked.message,'Am I speaking with Sally?');
  c.callback.onmessage({serverContent:{outputTranscription:{text:asked.message},turnComplete:true}});
  c.callback.onmessage({serverContent:{inputTranscription:{text:answer}}});
  const transcript=()=>JSON.parse(h.db.prepare('SELECT transcriptJson FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid).transcriptJson);
  await until(()=>transcript().some(turn=>turn.text===answer));
  return {h,c,result:await h.tool(c.callback,'getCustomerContext',{callerConfirmedIdentity:true}),transcript};
}
const REFUSED=['Yes, but I am not that person','Yes, I\'m her cousin','Yeah, that\'s Sally, but this is Peter speaking',
  'Yeah, Sally\'s not in','It is not','Sure, who is calling?','Right, she stepped out','Yes, I\'m her secretary','Yeah this is Mary',
  'Yeah, wrong person though','Yeah, she\'s out right now','Yes this is her office','Yes, Sally passed away','sure who is calling',
  'Yes, I\'m calling because Mary is out','Yes, I\'m calling about my deck.'];
for(const answer of REFUSED)test('signed call refuses: '+JSON.stringify(answer),async t=>{
  const {h,c,result,transcript}=await secondCall(t,answer);
  assert.equal(result.status,'not_found');assert.doesNotMatch(JSON.stringify(result),/deck|Sally|Synthetic/);
  c.callback.onmessage({serverContent:{outputTranscription:{text:'Am I speaking with Sally?'},turnComplete:true}});
  c.callback.onmessage({serverContent:{inputTranscription:{text:'Yes, it\'s me.'}}});
  await until(()=>transcript().some(turn=>turn.text==='Yes, it\'s me.'));
  const again=await h.tool(c.callback,'getCustomerContext',{callerConfirmedIdentity:true});
  assert.equal(again.status,'not_found');assert.doesNotMatch(JSON.stringify(again),/deck|Sally|Synthetic/);
});
for(const answer of ['Uh, yeah, speaking','Mhm, it\'s me','Yes no problem, that\'s me','Yes, this is Sally Synthetic.'])test('signed call accepts: '+JSON.stringify(answer),async t=>{
  const {result}=await secondCall(t,answer);
  assert.equal(result.status,'found');assert.ok(result.openLeads.some(lead=>/deck/.test(lead.description)));
});
