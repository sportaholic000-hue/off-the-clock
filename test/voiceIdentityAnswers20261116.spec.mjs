import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './leadCaptureRepair20261006Fixture.mjs';

// Owner ruling 2026-11-16: a caller who calls back must be recognised.
// Ordinary confirmations are accepted; real denials, "Maybe" and unclear
// answers still reveal nothing (privacy-safe: when in doubt, no history).
// Every answer goes through the real runtime's getCustomerContext.
// Expected values written before running.
async function identity(t,question,answer){
  const f=fixture(t),old=f.context();
  await f.voice(old).tool('captureLead',{name:'Sally Synthetic',description:'[SYNTHETIC] private deck repair'});
  const c=f.context(),v=f.voice(c),first=await v.tool('getCustomerContext',{});
  assert.equal(first.status,'identity_unconfirmed');
  const transcript=[{role:'assistant',text:question,final:true},...(Array.isArray(answer)?answer:[answer]).map(text=>({role:'caller',text,final:true}))];
  f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify(transcript),c.ownerId,c.callSid);
  const result=await v.tool('getCustomerContext',{callerConfirmedIdentity:true});
  return result;
}
const ASK='Hi! Am I speaking with Sally?';
const ACCEPTED=[
  // Existing accepted cases (receptionistAudit20261009).
  'Yes.','Yeah, that\'s me.','Yes, it\'s me.',['Yes',' it is.'],'Hi, yes, this is Sally.','Yup.','I\'m Sally.',
  // Audited phrasings that failed before.
  'Yes no problem, that\'s me','Uh, yeah speaking','Yep, not a problem.','Mhm, it\'s me.','Yes. Is it not raining there?',
  // More ordinary confirmations.
  'Yes, speaking.','Speaking.','Yeah.','Yep!','Yes it is.','Correct.','That\'s right.','That\'s me.','It\'s me.','Mm-hmm.','Uh-huh, that\'s me.',
  'Yes, this is Sally.','This is Sally.','Sally here.','Sally speaking.','Oh hi, yes.','Hello, yes it is.','Um, yes.','Yes ma\'am.','Yes sir, speaking.',
  'Yeah, no worries, it\'s me.','Yes, who is this?','Yes, of course.','Yes, absolutely.','Yes please.','Yeah it\'s Sally.','Sure is.','You got her.','Yes. I\'m not sure what I need yet.'
];
const REFUSED=[
  // Existing refused cases.
  'No, this isn\'t Sally.','Maybe, who\'s asking?',
  // Real denials and unclear answers named by the owner.
  'No','Nope, wrong number','That\'s not me','No, this is his wife','Maybe',
  // More denials, other people and unclear answers.
  'No.','Nah.','Nope.','No, sorry.','Wrong number.','Not me.','Not Sally, sorry.','This is Mike.','I\'m her husband.','She\'s not here.',
  'Yes, this is her husband.','Yeah, I\'m calling for my wife.','Yes, I\'m calling on her behalf.','Yes. No.','Yeah, no.','Yes, but it\'s not me.','Yes, it\'s not Sally.',
  'Who\'s asking?','Why?','Hmm.','Uh.','I don\'t know.','Depends who\'s asking.','Yes?','Is this about the deck?','Sally? No.','Okay.','Hello?',''
];
for(const answer of ACCEPTED)test('identity accepts: '+JSON.stringify(answer),async t=>{
  const result=await identity(t,ASK,answer);
  assert.equal(result.status,'found');assert.ok(result.openLeads.some(lead=>/deck/.test(lead.description)));
});
for(const answer of REFUSED)test('identity refuses: '+JSON.stringify(answer),async t=>{
  const result=await identity(t,ASK,answer);
  assert.notEqual(result.status,'found');
  // An empty answer only repeats the identity question; anything else reveals nothing.
  if(result.status==='identity_unconfirmed')assert.deepEqual(result,{status:'identity_unconfirmed',message:'Am I speaking with Sally?'});
  else assert.doesNotMatch(JSON.stringify(result),/deck|Sally/);
});
test('a denial still locks the rest of the call',async t=>{
  const f=fixture(t),old=f.context();
  await f.voice(old).tool('captureLead',{name:'Sally Synthetic',description:'[SYNTHETIC] private deck repair'});
  const c=f.context(),v=f.voice(c);await v.tool('getCustomerContext',{});
  f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'assistant',text:ASK,final:true},{role:'caller',text:'No, wrong number.',final:true}]),c.ownerId,c.callSid);
  assert.equal((await v.tool('getCustomerContext',{callerConfirmedIdentity:true})).status,'not_found');
  f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'assistant',text:ASK,final:true},{role:'caller',text:'Yes.',final:true}]),c.ownerId,c.callSid);
  assert.equal((await v.tool('getCustomerContext',{callerConfirmedIdentity:true})).status,'not_found');
});
