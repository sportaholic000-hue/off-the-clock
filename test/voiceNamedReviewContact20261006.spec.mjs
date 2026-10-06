import test from 'node:test';
import assert from 'node:assert/strict';
import {db,getBusinessProfile,saveKnowledgeBase} from './namedReviewContact20261006.fixture.mjs';
import {voiceHarness} from './namedReviewContact20261006.voice.fixture.mjs';
test.after(()=>db.close());
const facts=prompt=>JSON.parse(prompt.split('<OWNER_FACTS_JSON>\n')[1].split('\n</OWNER_FACTS_JSON>')[0]);
const kb=reviewContact=>({about:'[SYNTHETIC] Test business',hours:'Weekdays',reviewContact});
test('named review contact saved owner and manager edits reach the next signed production voice session',async t=>{
  const h=await voiceHarness(t);
  for(const contact of [{name:'Synthetic Casey',role:'owner'},{name:'Synthetic Morgan',role:'manager'}]){
    saveKnowledgeBase(h.owner.id,kb(contact));const {prompt}=await h.connect(),data=facts(prompt);
    assert.deepEqual(data.knowledge.reviewContact,contact);assert.deepEqual(getBusinessProfile(h.owner.id).knowledgeBase.reviewContact,contact);
    assert.equal(data.business.businessName,'Synthetic Review Co');assert.equal(data.business.agentName,'Synthetic Ava');assert.equal(prompt.includes(h.owner.id),false);
    assert.match(prompt,/captureLead with those details in notes/);assert.match(prompt,/Never say a message was sent or the person notified merely because a request was saved or flagged/);
  }
  assert.deepEqual(h.errors,[]);
});
test('named review contact missing, corrupt, foreign and draft data do not leak into production voice',async t=>{
  const h=await voiceHarness(t);
  for(const value of [{},{reviewContact:{name:'Synthetic Foreign',role:'owner',ownerId:'SYNTHETIC-other-owner'}},{reviewContact:{name:'Synthetic Unconfirmed',role:'owner'}},{reviewContact:{name:'<Synthetic Injection>',role:'owner',ownerId:h.owner.id}},{reviewContact:{name:'Synthetic Draft',role:'owner',ownerId:h.owner.id},draft:true}]){
    db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({about:'[SYNTHETIC] Test business',hours:'Weekdays',...value}),h.owner.id);
    const {prompt}=await h.connect();assert.equal(facts(prompt).knowledge?.reviewContact,undefined);
    for(const name of ['Synthetic Foreign','Synthetic Unconfirmed','Synthetic Injection','Synthetic Draft'])assert.equal(prompt.includes(name),false);
  }
  assert.deepEqual(h.errors,[]);
});
test('named review contact capture stays in the signed caller business and makes no notification claim',async t=>{
  const h=await voiceHarness(t);saveKnowledgeBase(h.owner.id,kb({name:'Synthetic Morgan',role:'manager'}));const call=await h.connect();
  const result=await h.tool('captureLead',{name:'Synthetic Caller',notes:'[SYNTHETIC] Question for Synthetic Morgan; callback is the calling number.'});
  assert.equal(result.status,'captured_address_required');assert.doesNotMatch(JSON.stringify(result),/sent|notified|read/i);
  const lead=db.prepare('SELECT ownerId,collectedInputsJson FROM leads WHERE callId=(SELECT id FROM calls WHERE callSid=? AND ownerId=?) AND ownerId=?').get(call.callSid,h.owner.id,h.owner.id);
  assert.equal(lead.ownerId,h.owner.id);assert.equal(JSON.parse(lead.collectedInputsJson).contact.phone,'+19025550100');
  // Note retention and owner-alert delivery belong to the separate lead repair.
  // This assertion proves routing and a capture result, not preserved notes or delivery.
});
