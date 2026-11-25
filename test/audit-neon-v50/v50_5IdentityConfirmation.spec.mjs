// Neon audit of v50, V50-5 (November 26, 2026): "Am I speaking with Sally?"
// answered "Yeah, that's me, I'm not going to be home Tuesday..." was treated
// as a denial (any "not" or "no" anywhere), and the caller lost their history
// and appointments for the rest of the call. Expected, written before the fix
// (denial stays the safe side: reveal nothing when unsure):
// - found: the Neon sentence; "Yes, no problem, I wanted to check my quote.";
//   "This is Sally, not sure you have my file."; "Yes." (unchanged);
// - not found (unchanged or still denied): "No, this isn't Sally.";
//   "Nope."; "Yeah, that's me, no wait, that's my wife." (a standalone no);
//   "Yes it's not me, wrong number."; "Maybe, who's asking?".
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../leadCaptureRepair20261006Fixture.mjs';

async function identity(t,answer){
  const f=fixture(t),old=f.context();await f.voice(old).tool('captureLead',{name:'Sally Synthetic',description:'[SYNTHETIC] private deck repair'});
  const c=f.context(),v=f.voice(c),first=await v.tool('getCustomerContext',{});assert.equal(first.status,'identity_unconfirmed');
  f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'assistant',text:'Hello. Am I speaking with Sally?',final:true},{role:'caller',text:answer,final:true}]),c.ownerId,c.callSid);
  return (await v.tool('getCustomerContext',{callerConfirmedIdentity:true})).status;
}
for(const answer of ["Yeah, that's me, I'm not going to be home Tuesday so I need to move my appointment.","Yes, no problem, I wanted to check my quote.","This is Sally, not sure you have my file.","Yes."])
  test('V50-5 confirmed: '+answer,async t=>assert.equal(await identity(t,answer),'found'));
for(const answer of ["No, this isn't Sally.","Nope.","Yeah, that's me, no wait, that's my wife.","Yes it's not me, wrong number.","Maybe, who's asking?"])
  test('V50-5 not confirmed: '+answer,async t=>assert.equal(await identity(t,answer),'not_found'));
