import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,until} from './voiceLifecycle20261006Fixture.mjs';

// Real signed HTTP + media WebSocket routes; all AI/carrier providers synthetic.
for(const failure of ['startup','session-error','session-close'])for(const route of ['owner','message','capture'])test(`billing repair 1 production: ${failure} → ${route}, signed whole-call duration is free`,async t=>{
  const h=await harness(t,{fail:failure==='startup'}),c=await h.connect();
  if(failure==='session-error')c.callback.onerror(Error('[SYNTHETIC] session failed'));
  if(failure==='session-close')c.callback.onclose({code:1011,reason:'[SYNTHETIC] session closed'});
  await until(()=>c.ws.readyState===3);
  assert.equal(h.db.prepare('SELECT status FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid).status,'FAILED');
  if(route!=='capture')h.db.prepare('UPDATE businessProfiles SET operatorEnabled=0,carrierSetupStatus=? WHERE ownerId=?').run(route==='owner'?'updated':'failed',h.owner);
  const response=await h.post(c.fallback,c.params);assert.equal(response.status,200);const xml=await response.text();
  if(route==='owner')assert.match(xml,/<Dial/);
  if(route==='message')assert.doesNotMatch(xml,/<Dial|<Gather|<Stream/);
  if(route==='capture'){
    assert.match(xml,/<Gather/);const url=new URL(xml.match(/action="([^"]+)"/)[1].replaceAll('&amp;','&'));
    const saved=await h.post(url.pathname+url.search,{...c.params,SpeechResult:'[SYNTHETIC] Call me about the gate.'});assert.equal(saved.status,200);assert.match(await saved.text(),/<Dial/);
  }
  const receipt={...c.params,CallStatus:'completed',CallDuration:'601'};
  assert.equal((await h.post('/api/twilio/voice/status',receipt)).status,204);
  assert.equal((await h.post('/api/twilio/voice/status',receipt)).status,204);
  assert.equal(h.db.prepare('SELECT minutesBilled FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid).minutesBilled,0);
  assert.equal(h.writes.filter(w=>w[0]==='sms').length,0);
});

for(const failure of ['session-error','session-close'])for(const acceptedFirst of [false,true])test(`billing repair 1 production: ${failure} ${acceptedFirst?'after':'before'} warm-transfer acceptance remains free`,async t=>{
  const h=await harness(t),c=await h.connect();
  await h.tool(c.callback,'transferCall',{reason:'caller_requested',customerConfirmed:true,notes:'[SYNTHETIC] Help with gate.'});
  const twiml=h.writes.find(w=>w[0]==='call')[2].twiml,accept=new URL(twiml.match(/<Number url="([^"]+)"/)[1]).pathname;
  const child={...c.params,CallSid:'CA'+'c'.repeat(32),ParentCallSid:c.params.CallSid,To:'+19025550199',Digits:'1'};
  if(acceptedFirst)assert.equal((await h.post(accept,child)).status,200);
  if(failure==='session-error')c.callback.onerror(Error('[SYNTHETIC] AI failed during handoff'));else c.callback.onclose({code:1011,reason:'[SYNTHETIC] AI closed during handoff'});
  await until(()=>c.ws.readyState===3);
  if(!acceptedFirst)assert.equal((await h.post(accept,child)).status,200);
  assert.equal((await h.post('/api/twilio/voice/status',{...c.params,CallStatus:'completed',CallDuration:'601'})).status,204);
  assert.equal(h.db.prepare('SELECT minutesBilled FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid).minutesBilled,0);
});
test('billing repair 1 production: failed warm transfer enters capture-again with a durable zero-minute exclusion',async t=>{
  const h=await harness(t),c=await h.connect();
  await h.tool(c.callback,'transferCall',{reason:'escalation',customerConfirmed:true,notes:'[SYNTHETIC] Please help.'});
  const twiml=h.writes.find(w=>w[0]==='call')[2].twiml,result=new URL(twiml.match(/ action="([^"]+)"/)[1]).pathname;
  assert.equal((await h.post(result,{...c.params,DialCallStatus:'no-answer'})).status,200);
  assert.match(await (await h.post('/api/twilio/voice/capture/again',c.params)).text(),/<Gather/);
  assert.equal((await h.post('/api/twilio/voice/status',{...c.params,CallStatus:'completed',CallDuration:'601'})).status,204);
  assert.equal(h.db.prepare('SELECT minutesBilled FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid).minutesBilled,0);
});
test('billing repair 1 production: late media completion and summary cannot erase operator-off exclusion',async t=>{
  const h=await harness(t),c=await h.connect();
  h.db.prepare("UPDATE businessProfiles SET operatorEnabled=0,carrierSetupStatus='updated' WHERE ownerId=?").run(h.owner);
  assert.match(await (await h.post(c.fallback,c.params)).text(),/<Dial/);
  c.ws.send(JSON.stringify({event:'stop',sequenceNumber:'2',streamSid:c.streamSid,stop:{accountSid:c.params.AccountSid,callSid:c.params.CallSid}}));
  await until(()=>h.db.prepare('SELECT completedAt FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid).completedAt);
  assert.equal((await h.post('/api/twilio/voice/status',{...c.params,CallStatus:'completed',CallDuration:'601'})).status,204);
  assert.equal(h.db.prepare('SELECT minutesBilled FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid).minutesBilled,0);
});
for(const partial of [false,true])test(`billing repair 1 production: direct fallback ${partial?'partial':'final'} capture excludes a still-connected row`,async t=>{
  const h=await harness(t),c=await h.connect();
  const body={...c.params,...(partial?{UnstableSpeechResult:'[SYNTHETIC] Gate help.'}:{SpeechResult:'[SYNTHETIC] Gate help.'})};
  assert.equal((await h.post('/api/twilio/voice/capture'+(partial?'/partial':''),body)).status,partial?204:200);
  assert.equal((await h.post('/api/twilio/voice/status',{...c.params,CallStatus:'completed',CallDuration:'601'})).status,204);
  assert.equal(h.db.prepare('SELECT minutesBilled FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid).minutesBilled,0);
});
