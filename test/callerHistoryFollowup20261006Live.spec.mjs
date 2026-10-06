import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './callerHistoryFollowup20261006LiveFixture.mjs';
import {createOwnerCallService} from '../server/src/ownerCallService.js';

test('D24 signed HTTP and WebSocket call stores factual transcript summary visible in owner feed',async()=>{
 const h=await harness();try{
  const {ws}=await h.connect();await new Promise(resolve=>setImmediate(resolve));
  const words='[SYNTHETIC] My gate fell down. Please call after five.';
  await h.fake.speak(words);await h.fake.tool('captureLead',{name:'[SYNTHETIC] Alex',description:'[SYNTHETIC] Gate repair'});
  ws.send(JSON.stringify({event:'stop',sequenceNumber:'2',streamSid:'MZ'+'c'.repeat(32),stop:{accountSid:'AC'+'a'.repeat(32),callSid:h.callSid}}));
  const deadline=Date.now()+5000;let row;do{row=h.db.prepare('SELECT * FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,h.callSid);if(row.status==='COMPLETED')break;await new Promise(resolve=>setTimeout(resolve,10));}while(Date.now()<deadline);
  assert.equal(row.status,'COMPLETED');assert.equal(row.summaryText,'Caller: '+words);assert.equal(row.outcome,'LEAD');assert.equal(row.transportOutcome,'TWILIO_STOP');
  const service=createOwnerCallService({ownerQuery:sql=>{assert.match(sql,/ownerId/);return h.db.prepare(sql);}});assert.equal(service.list({ownerId:h.owner}).calls[0].summaryText,row.summaryText);
 }finally{await h.close();}
});
