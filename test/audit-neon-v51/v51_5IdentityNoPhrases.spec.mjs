// Neon audit of v51, V51-5 (November 26, 2026): my V50-5 fix still treated
// any standalone "no" as a denial, so "Yes, that's me, I have no idea of the
// square footage" lost the caller's history. Expected, written before the
// fix (denial stays the safe side):
// - found: "Yes, that's me, I have no idea what the square footage is yet.";
//   "Yeah, speaking, there's no gate on the backyard fence.";
//   "Yes, it's me, no changes to the address.";
// - not found: "No, wrong number."; "Not Sally, I'm her neighbor.";
//   "Yeah, that's me, no wait, that's my wife." (a correction);
//   "Yes. Actually no, this is her husband."; "Yes, no, it's not me.".
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
// Merged with the launch branch on November 26, 2026. That branch replaced this
// check with the owner's November 19 ruling (server/src/voice/identityAnswer.js):
// an answer that starts with a yes recognises the caller unless it holds a clear
// no, and "no" anywhere outside a courtesy ("no problem") is a clear no. Under
// that rule these three answers are not recognised: the caller is served as a
// new caller and no saved history is read out. It is the safe side, and it
// replaces the V51-5 repair described above, which recognised them.
for(const answer of ["Yes, that's me, I have no idea what the square footage is yet.","Yeah, speaking, there's no gate on the backyard fence.","Yes, it's me, no changes to the address."])
  test('V51-5, under the November 19 ruling, a "no" about the job is not recognised: '+answer,async t=>assert.equal(await identity(t,answer),'not_found'));
for(const answer of ["No, wrong number.","Not Sally, I'm her neighbor.","Yeah, that's me, no wait, that's my wife.","Yes. Actually no, this is her husband.","Yes, no, it's not me."])
  test('V51-5 not confirmed: '+answer,async t=>assert.equal(await identity(t,answer),'not_found'));
