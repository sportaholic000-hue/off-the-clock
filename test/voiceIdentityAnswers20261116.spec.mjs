import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,at} from './leadCaptureRepair20261006Fixture.mjs';

// Owner rulings 2026-11-16 and 2026-11-17: a caller who calls back must be
// recognised, but an answer confirms only when it says this person is the
// caller, and is made only of confirmation words. A denial locks the call at once;
// any other refused answer gets the identity question once more (2026-11-18).
// An answer that says someone else is speaking, that the person is
// away, or that ends in a question reveals nothing. When in doubt, nothing.
// Every answer goes through the real runtime's getCustomerContext.
// Expected values written before running.
async function identity(t,question,answer,name='Sally Synthetic'){
  const f=fixture(t),old=f.context();
  await f.voice(old).tool('captureLead',{name,description:'[SYNTHETIC] private deck repair'});
  const c=f.context(),v=f.voice(c),first=await v.tool('getCustomerContext',{});
  assert.equal(first.status,'identity_unconfirmed');
  const transcript=[{role:'assistant',text:question,final:true},...(Array.isArray(answer)?answer:[answer]).map(text=>({role:'caller',text,final:true}))];
  f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify(transcript),c.ownerId,c.callSid);
  const result=await v.tool('getCustomerContext',{callerConfirmedIdentity:true});
  return result;
}
function found(result){assert.equal(result.status,'found');assert.ok(result.openLeads.some(lead=>/deck/.test(lead.description)));}
function nothing(result,question){
  assert.notEqual(result.status,'found');
  // An empty answer only repeats the identity question; anything else reveals nothing.
  if(result.status==='identity_unconfirmed')assert.deepEqual(result,{status:'identity_unconfirmed',message:question});
  else{assert.equal(result.status,'not_found');assert.doesNotMatch(JSON.stringify(result),/deck|Sally|John|Synthetic/);}
}
const ASK='Hi! Am I speaking with Sally?';
const ACCEPTED=[
  // Existing accepted cases (receptionistAudit20261009).
  'Yes.','Yeah, that\'s me.','Yes, it\'s me.',['Yes',' it is.'],'Hi, yes, this is Sally.','Yup.','I\'m Sally.',
  // Audited phrasings that must confirm.
  'Yes no problem, that\'s me','Uh, yeah speaking','Uh, yeah, speaking','Yep, not a problem.','Mhm, it\'s me.','Mhm, it\'s me',
  // More ordinary confirmations.
  'Yes, speaking.','Speaking.','Yeah.','Yep!','Yes it is.','Correct.','That\'s right.','That\'s me.','It\'s me.','Mm-hmm.','Uh-huh, that\'s me.',
  'Yes, this is Sally.','This is Sally.','Sally here.','Sally speaking.','Oh hi, yes.','Hello, yes it is.','Um, yes.','Yes ma\'am.','Yes sir, speaking.',
  'Yeah, no worries, it\'s me.','Yes, of course.','Yes, absolutely.','Yes please.','Yeah it\'s Sally.','Sure is.','You got her.','Yes, this is she.',
  'Yes, this is Sally Synthetic.','Good morning, yes, this is Sally.','yeah speaking','yes this is sally'
];
const REFUSED=[
  // Existing refused cases.
  'No, this isn\'t Sally.','Maybe, who\'s asking?',
  // Real denials and unclear answers named by the owner.
  'No','Nope, wrong number','That\'s not me','No, this is his wife','Maybe',
  // More denials, other people and unclear answers.
  'No.','Nah.','Nope.','No, sorry.','Wrong number.','Not me.','Not Sally, sorry.','This is Mike.','I\'m her husband.','She\'s not here.',
  'Yes, this is her husband.','Yeah, I\'m calling for my wife.','Yes, I\'m calling on her behalf.','Yes. No.','Yeah, no.','Yes, but it\'s not me.','Yes, it\'s not Sally.',
  'Who\'s asking?','Why?','Hmm.','Uh.','I don\'t know.','Depends who\'s asking.','Yes?','Is this about the deck?','Sally? No.','Okay.','Hello?','',
  // An answer that ends in a question reveals nothing (owner ruling 2026-11-17).
  'Yes, who is this?','Yes. Is it not raining there?','Speaking, what\'s this about?','Yes, can you call back later?',
  // Words that are not a confirmation or the caller's own reason: when in doubt, nothing.
  'Yes. I\'m not sure what I need yet.','Yes, Sally.','Yes, this is Sally Jones.','Yes, this is her phone.','Yeah, hold on.','Yes, I think so.',
  // Someone else, the person away, or a question without punctuation (a speech transcript).
  'yeah she s not here','sure who is calling','yes this is mary','yes i m her secretary','yeah she stepped out','yes sally passed away',
  'Yes, I\'m calling about her deck.','Yes, I\'m calling for Mary.','Yes, I need to leave a message for Sally.','Yes, I\'m calling from Mary\'s phone.',
  // Astra's audit of be4a62c3: contradictory and third-party answers.
  'Yes, but I am not that person','Yes, I\'m her cousin','Yeah, that\'s Sally, but this is Peter speaking',
  'Yeah, that\'s Sally','Yes, that\'s her','Yes, Sally speaking, but I\'m Peter','Yes, I\'m her niece.','Yeah, I\'m not Sally','Yes, though I\'m not her',
  'Yes, it\'s me. Actually no, it\'s her sister.','Yes, I\'m with Sally.','Yes, I\'m Peter.','Yes, I am Peter, Sally\'s cousin.',
  // Any words beyond the confirmation, even the caller's own reason, cannot be checked for someone else: nothing.
  'Yes, I\'m calling because Mary is out','Yes, I\'m calling, Mary asked me to','Yes, I\'m calling about the deck at Mary\'s place',
  'Yes, I\'m calling about the deck.','Yeah that\'s me, I\'m calling about my deck quote.','Yes, I\'m returning your call.'
];
for(const answer of ACCEPTED)test('identity accepts: '+JSON.stringify(answer),async t=>found(await identity(t,ASK,answer)));
for(const answer of REFUSED)test('identity refuses: '+JSON.stringify(answer),async t=>nothing(await identity(t,ASK,answer),'Am I speaking with Sally?'));

// Owner's report 2026-11-17, saved name John. Each of these confirmed before
// this change and must reveal nothing.
const ASK_JOHN='Hi! Am I speaking with John?';
for(const answer of ['Yeah, John\'s not in','It is not','Sure, who is calling?','Right, he stepped out','Yes, I\'m his secretary','Yeah this is Mary',
  'Yeah, wrong guy though','Yeah, he\'s out right now','Yes this is his office','Yes, John passed away',
  'Yeah, he can\'t come to the phone','Yes, I\'ll take a message','Yes, one sec, I\'ll get him','Yeah, John\'s at work','Yes, this is the office',
  'Yes, I\'m answering for him','Yeah, John died last year','Mhm, he moved','Yes, I\'m calling for John',
  'Yes, I am his wife','I am not','You are speaking with his wife','Yes, this is his wife','This is Mary','Sure am not','Yes it\'s me, Mary',
  'Yes I am, John\'s brother','I am Peter','Yes, John','You are calling John\'s phone','This is the office','Yes, I\'m, uh, his assistant'])
  test('identity refuses for John: '+JSON.stringify(answer),async t=>nothing(await identity(t,ASK_JOHN,answer,'John Synthetic'),'Am I speaking with John?'));
// Owner ruling 2026-11-18: plain confirmations that name nobody else confirm.
for(const answer of ['Uh, yeah, speaking','Mhm, it\'s me','Yes no problem, that\'s me','Yes, this is John.','John here.','Yes, this is John Synthetic.',
  'Yes, I am','I am','Yes I am.','You are','Yes you are','Yes, this is','This is','Sure am','Yessir','Yes it\'s me, John','It\'s me, John Synthetic.',
  'Yes, I\'m.','You\'re right.','Speaking, John.','Yes sir, I am.'])
  test('identity accepts for John: '+JSON.stringify(answer),async t=>found(await identity(t,ASK_JOHN,answer,'John Synthetic')));

// A caller with history but no saved name hears "Have you called us before from this number?".
async function noName(t,answer){
  const f=fixture(t),old=f.context();
  f.ownerQuery('UPDATE calls SET status=?,createdAt=?,transcriptJson=? WHERE ownerId=? AND id=?').run('FAILED',new Date(Date.parse(at)-60000).toISOString(),JSON.stringify([{role:'caller',text:'[SYNTHETIC] deck'}]),old.ownerId,old.callSid);
  const c=f.context(),v=f.voice(c),first=await v.tool('getCustomerContext',{});
  assert.equal(first.message,'Have you called us before from this number?');
  f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'assistant',text:'Hi. Have you called us before from this number?',final:true},{role:'caller',text:answer,final:true}]),c.ownerId,c.callSid);
  return v.tool('getCustomerContext',{callerConfirmedIdentity:true});
}
for(const answer of ['Yes.','Yes, I have.','Yeah, a few times.','Yes I did','Yep, that\'s me.'])
  test('no-name question accepts: '+JSON.stringify(answer),async t=>assert.equal((await noName(t,answer)).status,'found'));
for(const answer of ['Yes, he has.','Yes, my wife has.','Yes, this is Mary.','Yes, who is this?','Yeah, he\'s out','I think so.','No.','Yep, I called last week about the deck.'])
  test('no-name question refuses: '+JSON.stringify(answer),async t=>{const result=await noName(t,answer);assert.notEqual(result.status,'found');assert.doesNotMatch(JSON.stringify(result),/deck/);});

test('a denial still locks the rest of the call',async t=>{
  const f=fixture(t),old=f.context();
  await f.voice(old).tool('captureLead',{name:'Sally Synthetic',description:'[SYNTHETIC] private deck repair'});
  const c=f.context(),v=f.voice(c);await v.tool('getCustomerContext',{});
  f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'assistant',text:ASK,final:true},{role:'caller',text:'No, wrong number.',final:true}]),c.ownerId,c.callSid);
  assert.equal((await v.tool('getCustomerContext',{callerConfirmedIdentity:true})).status,'not_found');
  f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'assistant',text:ASK,final:true},{role:'caller',text:'Yes.',final:true}]),c.ownerId,c.callSid);
  assert.equal((await v.tool('getCustomerContext',{callerConfirmedIdentity:true})).status,'not_found');
});
test('someone else answering is asked once more; a second refusal locks the rest of the call',async t=>{
  const f=fixture(t),old=f.context();
  await f.voice(old).tool('captureLead',{name:'John Synthetic',description:'[SYNTHETIC] private deck repair'});
  const c=f.context(),v=f.voice(c);await v.tool('getCustomerContext',{});
  const say=turns=>f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify(turns),c.ownerId,c.callSid);
  const first=[{role:'assistant',text:ASK_JOHN,final:true},{role:'caller',text:'Yeah, he\'s out right now.',final:true}];
  say(first);
  assert.deepEqual(await v.tool('getCustomerContext',{callerConfirmedIdentity:true}),{status:'identity_unconfirmed',message:'Am I speaking with John?'});
  const again=[...first,{role:'assistant',text:'Sorry, am I speaking with John?',final:true},{role:'caller',text:'Yes, I\'m his secretary.',final:true}];
  say(again);
  assert.equal((await v.tool('getCustomerContext',{callerConfirmedIdentity:true})).status,'not_found');
  say([...again,{role:'assistant',text:ASK_JOHN,final:true},{role:'caller',text:'Yes, it\'s me.',final:true}]);
  assert.equal((await v.tool('getCustomerContext',{callerConfirmedIdentity:true})).status,'not_found');
});
