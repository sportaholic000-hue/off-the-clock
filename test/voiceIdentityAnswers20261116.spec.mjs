import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,at} from './leadCaptureRepair20261006Fixture.mjs';

// Owner ruling 2026-11-19: the identity question is asked once. A plain
// confirmation is recognised as before, and so is any answer that starts with
// a yes, whatever follows, unless it is a clear no (a "no", "Not me", "Wrong
// number", "I'm not Sally", the person away). The owner accepts that "Yes, I'm
// his wife" is recognised. An answer that does not start with a yes and is not
// a plain confirmation ("It's Mary", "Who's asking?", "Maybe") is not. Anyone
// not recognised is a new caller for the rest of the call.
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
// Not recognised: a clear no, or an answer that does not start with a yes.
const REFUSED=[
  'No, this isn\'t Sally.','Maybe, who\'s asking?','No','Nope, wrong number','That\'s not me','No, this is his wife','Maybe',
  'No.','Nah.','Nope.','No, sorry.','Wrong number.','Not me.','Not Sally, sorry.','This is Mike.','I\'m her husband.','She\'s not here.',
  'Yes. No.','Yeah, no.','Yes, but it\'s not me.','Yes, it\'s not Sally.','Who\'s asking?','Why?','Hmm.','Uh.','I don\'t know.',
  'Depends who\'s asking.','Is this about the deck?','Sally? No.','Okay.','Hello?','',
  'Yeah, I\'m not Sally','Yes, though I\'m not her','Yes, it\'s me. Actually no, it\'s her sister.','Yes, but I\'m not Sally',
  'yeah she s not here','Yeah, she\'s not here','Yes, she isn\'t home','Yes, Sally passed away','Yes, she stepped out','Yes, Sally\'s at work',
  'Yeah, you have the wrong number','Yes, I\'ll take a message','It\'s Mary','Mary speaking','It\'s Mary, Sally\'s sister','I\'m Mary',
  'This is Sally\'s husband','This is her husband','Okay, I\'m calling about the deck','I\'m calling about the deck','Hello, who is this?','I think so'];
// Recognised under the 2026-11-19 ruling: starts with a yes, no clear no.
const YES_START=[
  'Yes, I\'m calling about the deck.','Yeah that\'s me, I\'m calling about my deck quote.','Yes, I\'m returning your call.','Yes, I got your message',
  'Yes I\'m Sally and I need a roof quote','This is Sally, I need a roof quote','Sally here, quick question','Oh hi, yes, I need a quote',
  'Uh huh, about the fence','Yes?','Yes, who is this?','Speaking, what\'s this about?','Yes. I\'m not sure what I need yet.','Yes, Sally.',
  'Yes, I think so.','Yeah, hold on.','Sure, who is calling?','Yes, this is her husband.','Yes, I\'m her cousin','Yes, I\'m Peter.',
  'Yeah, no worries, I need a quote','Right, I\'m calling back','Yes, can you call back later?'];
for(const answer of ACCEPTED)test('identity accepts: '+JSON.stringify(answer),async t=>found(await identity(t,ASK,answer)));
for(const answer of YES_START)test('identity accepts an answer starting with yes: '+JSON.stringify(answer),async t=>found(await identity(t,ASK,answer)));
for(const answer of REFUSED)test('identity refuses: '+JSON.stringify(answer),async t=>nothing(await identity(t,ASK,answer),'Am I speaking with Sally?'));

const ASK_JOHN='Hi! Am I speaking with John?';
for(const answer of ['Yeah, John\'s not in','It is not','Right, he stepped out','Yeah, wrong guy though','Yeah, he\'s out right now','Yes, John passed away',
  'Yeah, he can\'t come to the phone','Yes, I\'ll take a message','Yeah, John\'s at work','Yeah, John died last year','I am not','You are speaking with his wife',
  'This is Mary','Sure am not','I am Peter','You are calling John\'s phone','This is the office','No, John isn\'t here','Yes, this isn\'t John','Who is calling?'])
  test('identity refuses for John: '+JSON.stringify(answer),async t=>nothing(await identity(t,ASK_JOHN,answer,'John Synthetic'),'Am I speaking with John?'));
for(const answer of ['Uh, yeah, speaking','Mhm, it\'s me','Yes no problem, that\'s me','Yes, this is John.','John here.','Yes, this is John Synthetic.',
  'Yes, I am','I am','Yes I am.','You are','Yes you are','Yes, this is','This is','Sure am','Yessir','Yes it\'s me, John','It\'s me, John Synthetic.',
  'Yes, I\'m.','You\'re right.','Speaking, John.','Yes sir, I am.',
  // 2026-11-19: starts with a yes.
  'Yes, I\'m his wife','Yes, I am his wife','Yes, John','Yes, I\'m calling for John','Sure, who is calling?','Yes, I\'m calling about the deck','Yes, I got your message'])
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
for(const answer of ['Yes.','Yes, I have.','Yeah, a few times.','Yes I did','Yep, that\'s me.','Yep, I called last week about the deck.','Yes, my wife has.'])
  test('no-name question accepts: '+JSON.stringify(answer),async t=>assert.equal((await noName(t,answer)).status,'found'));
for(const answer of ['I think so.','No.','No, never.','Not from this number.','Maybe','Who is this?','My wife has.'])
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
test('the question is asked once: an answer that is not recognised locks, and a later yes never opens it',async t=>{
  const f=fixture(t),old=f.context();
  await f.voice(old).tool('captureLead',{name:'John Synthetic',description:'[SYNTHETIC] private deck repair'});
  for(const first of ['It\'s Mary.','Who\'s asking?','Yes, but I\'m not John.','Maybe.']){
    const c=f.context(),v=f.voice(c);await v.tool('getCustomerContext',{});
    const turns=[{role:'assistant',text:ASK_JOHN,final:true},{role:'caller',text:first,final:true}];
    f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify(turns),c.ownerId,c.callSid);
    const a=await v.tool('getCustomerContext',{callerConfirmedIdentity:true});
    f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([...turns,{role:'assistant',text:'Sorry, am I speaking with John?',final:true},{role:'caller',text:'Yes.',final:true}]),c.ownerId,c.callSid);
    const b=await v.tool('getCustomerContext',{callerConfirmedIdentity:true});
    assert.equal(a.status,'not_found',first);assert.equal(b.status,'not_found',first);assert.doesNotMatch(JSON.stringify([a,b]),/deck/);
  }
});
