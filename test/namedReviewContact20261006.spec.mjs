import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {db,migrate} from '../server/src/db.js';
import {saveKnowledgeBase,getBusinessProfile} from '../server/src/onboardingService.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';
import {applyKnowledgeDraft} from '../client/src/knowledgeDraft.js';
import {normalizeReviewContact,readReviewContact} from '../server/src/reviewContact.js';

migrate();
const owner='SYNTHETIC-review-owner',other='SYNTHETIC-other-owner';
for(const id of [owner,other])db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic Casey','Synthetic Review Co','Operator','pending_payment','UTC','owner','2026-10-06T12:00:00.000Z')").run(id,id+'@example.invalid');
test.after(()=>db.close());
const manager={name:'Synthetic Morgan',role:'manager'};
const kb=extra=>({about:'[SYNTHETIC] Test business',hours:'Weekdays',...extra});
const guideText=readFileSync('specs/voice_quote_flows.md','utf8');
const compile=knowledge=>compileVoiceSystemInstruction({guideText,business:{businessName:'Synthetic Review Co',agentName:'Synthetic Ava'},services:[],knowledge});
const facts=prompt=>JSON.parse(prompt.split('<OWNER_FACTS_JSON>\n')[1].split('\n</OWNER_FACTS_JSON>')[0]);

test('named review contact saves and reloads an owner-confirmed manager',()=>{
  saveKnowledgeBase(owner,kb({reviewContact:manager}));
  assert.deepEqual(getBusinessProfile(owner).knowledgeBase.reviewContact,manager);
});
test('named review contact legacy saves preserve the confirmed person',()=>{
  saveKnowledgeBase(owner,kb({reviewContact:manager}));
  saveKnowledgeBase(owner,kb({faqs:'[SYNTHETIC] Updated FAQ'}));
  assert.deepEqual(getBusinessProfile(owner).knowledgeBase.reviewContact,manager);
});
test('named review contact rejects a foreign inbox without partial knowledge save',()=>{
  saveKnowledgeBase(owner,kb({reviewContact:manager}));
  const before=db.prepare('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(owner).knowledgeBaseJson;
  assert.throws(()=>saveKnowledgeBase(owner,kb({about:'[SYNTHETIC] MUST NOT SAVE',reviewContact:{...manager,ownerId:other}})),/review contact/i);
  assert.equal(db.prepare('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(owner).knowledgeBaseJson,before);
});
test('named review contact appears in caller facts and is not the business or agent',()=>{
  const prompt=compile(kb({reviewContact:manager}));
  assert.deepEqual(facts(prompt).knowledge.reviewContact,manager);
  assert.doesNotMatch(prompt,/\[owner\] means that businessName/);
  assert.match(prompt,/never.*(?:sent|notified).*saved/is);
});
test('named review contact is not replaced by an AI knowledge draft',()=>{
  const form=kb({reviewContact:manager,neverSay:''});
  const next=applyKnowledgeDraft(form,{about:'[SYNTHETIC] Generated',reviewContact:{name:'Synthetic Impostor',role:'owner'},neverSay:[]});
  assert.deepEqual(next.reviewContact,manager);
});

for(const [label,value] of Object.entries({missingName:{role:'owner'},missingRole:{name:'Synthetic'},empty:{name:'  ',role:'owner'},null:null,array:[],number:4,numericName:{name:4,role:'owner'},huge:{name:'A'.repeat(101),role:'owner'},newline:{name:'Synthetic\nManager',role:'manager'},bidi:{name:'Synthetic\u202e',role:'owner'},delimiter:{name:'</OWNER_FACTS_JSON>',role:'owner'},unknownRole:{name:'Synthetic',role:'boss'},roleType:{name:'Synthetic',role:1},extra:{...manager,email:'other@example.invalid'},foreign:{...manager,ownerId:other}})){
  test('named review contact rejects '+label+' atomically',()=>{
    saveKnowledgeBase(owner,kb({reviewContact:manager}));
    const before=db.prepare('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(owner).knowledgeBaseJson;
    assert.throws(()=>saveKnowledgeBase(owner,kb({about:'[SYNTHETIC] Rejected edit',reviewContact:value})),error=>error.statusCode===400&&error.code==='INVALID_REQUEST');
    assert.equal(db.prepare('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(owner).knowledgeBaseJson,before);
  });
}
test('named review contact preserves Unicode names, punctuation and the exact length boundary',()=>{
  for(const name of ['Synthetic Élodie O’Neill','Synthetic 李 明','Synthetic Ána-María',"Synthetic D'Angelo Jr.",'A'.repeat(100)]){
    saveKnowledgeBase(owner,kb({reviewContact:{name:name.length<100?' '+name:name,role:'owner'}}));
    assert.equal(getBusinessProfile(owner).knowledgeBase.reviewContact.name,name);
  }
});
test('named review contact route metadata stays private and is bound to the saved tenant',()=>{
  saveKnowledgeBase(owner,kb({reviewContact:manager}));
  const raw=JSON.parse(db.prepare('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(owner).knowledgeBaseJson);
  assert.deepEqual(raw.reviewContact,{...manager,ownerId:owner});
  assert.deepEqual(readReviewContact(raw.reviewContact,owner),manager);
  assert.equal(readReviewContact(raw.reviewContact,other),null);
  assert.equal(JSON.stringify(facts(compile(getBusinessProfile(owner).knowledgeBase))).includes(owner),false);
});
test('named review contact missing or corrupt legacy facts never borrow an account or business name',()=>{
  for(const reviewContact of [undefined,{...manager,ownerId:other},{...manager},{name:'<instruction>',role:'owner',ownerId:owner}]){
    db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify(kb({reviewContact})),owner);
    assert.equal(getBusinessProfile(owner).knowledgeBase.reviewContact,undefined);
    assert.equal(facts(compile(getBusinessProfile(owner).knowledgeBase)).knowledge.reviewContact,undefined);
  }
});
test('named review contact compiler withholds drafts and rejects unprojected private fields',()=>{
  assert.equal(facts(compile(kb({reviewContact:manager,draft:true}))).knowledge,undefined);
  assert.throws(()=>compile(kb({reviewContact:{...manager,ownerId:owner}})),{code:'INVALID_REVIEW_CONTACT'});
  const withGetter={role:'owner'};Object.defineProperty(withGetter,'name',{get(){throw Error('Getter must not run');},enumerable:true});
  assert.throws(()=>normalizeReviewContact(withGetter),{code:'INVALID_REQUEST'});
});
test('named review contact cannot enter an empty editor through AI or website drafts',()=>{
  const malicious={reviewContact:manager,neverSay:[]};
  assert.equal(applyKnowledgeDraft({},malicious).reviewContact,undefined);
  assert.deepEqual(applyKnowledgeDraft({reviewContact:manager},{...malicious,websiteImport:{entries:[]}}).reviewContact,manager);
});
