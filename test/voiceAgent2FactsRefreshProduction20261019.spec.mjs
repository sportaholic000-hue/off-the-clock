import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {production,facts} from './voiceAgent2FactsRefreshProduction20261019Fixture.mjs';
import {deferred,until,OUTPUT} from './voiceAgent2FactsRefresh20261019Fixture.mjs';

const review=result=>{assert.equal(result.status,'needs_review',JSON.stringify(result));assert.equal(Object.hasOwn(result,'extendedAmount'),false);};
const amount=(result,expected)=>{assert.equal(result.status,'calculated',JSON.stringify(result));assert.equal(result.extendedAmount,expected);};
const speech=text=>({serverContent:{outputTranscription:{text},turnComplete:true,modelTurn:{parts:[{inlineData:{mimeType:OUTPUT,data:Buffer.alloc(960,1).toString('base64')}}]}}});
const newest=call=>call.rows.at(-1);

// Hand arithmetic: three at $10/$12/$8 are $30/$36/$24. A qualification is
// retained literal scope, never permission to invent a conditional multiplier.
for(const resumable of [false,true])for(const [name,before,after,expected] of [
  ['amount increase','Widget $10 each','Widget $12 each','36.00'],
  ['amount decrease','Widget $10 each','Widget $8 each','24.00'],
  ['added membership','Widget $10 each','Widget $10 each\nAvailable to members',null],
  ['removed membership','Widget $10 each\nAvailable to members','Widget $10 each','30.00'],
  ['replaced qualification','Widget $10 each\nAvailable to members','Widget $10 each\nWeekdays only',null],
  ['removed price','Widget $10 each','',null]
])test('voice H2 saved HTTP '+name+' reaches '+(resumable?'resumed':'fresh')+' provider and real dispatcher',async t=>{
  const f=await production(t,{prices:before,sharedTimestamp:true}),call=await f.connect(),foreign=JSON.stringify(f.current(f.owners[1]));
  const initial=await f.tool(call,before,'same-event');if(before==='Widget $10 each')amount(initial,'30.00');else review(initial);
  const handle=resumable?f.resume(call):null;
  const originalTimestamp=f.db.prepare('SELECT updatedAt FROM businessProfiles WHERE ownerId=?').get(call.owner.id).updatedAt;
  await f.save(after);review(await f.tool(call,before,'same-event'));
  await until(()=>call.rows.length===2&&newest(call).established);
  const current=await f.tool(call,after,'current-event');
  if(expected)amount(current,expected);
  else if(after===''){assert.equal(current.status,'needs_details','An empty tool argument fails the existing required-field contract');assert.equal(Object.hasOwn(current,'extendedAmount'),false);}
  else review(current);
  assert.deepEqual(f.delivered(call),[before,after]);assert.equal(newest(call).config.sessionResumption.handle,handle??undefined);
  assert.equal(JSON.stringify(f.current(f.owners[1])),foreign,'Body ownerId must not retarget a save');
  assert.equal(f.db.prepare('SELECT updatedAt FROM businessProfiles WHERE ownerId=?').get(call.owner.id).updatedAt,originalTimestamp,'Fixed-clock saves still require refresh');
  assert.doesNotMatch(JSON.stringify(call.rows.map(row=>[facts(row.config.systemInstruction),row.responses,row.content])),/FOREIGN_SENTINEL|knowledgeBaseJson|quoteDoneApproval|priceBasisByCategory/);
  t.diagnostic(JSON.stringify({name,resumable,delivered:f.delivered(call),current,stale:'needs_review'}));
});

test('voice H2 actual idle call receives saved qualifications without a tool or media trigger',async t=>{
  const f=await production(t),call=await f.connect();await f.save('Widget $10 each\nAvailable to members');
  await until(()=>call.rows.length===2&&newest(call).content.length>0);
  assert.deepEqual(f.delivered(call),['Widget $10 each','Widget $10 each\nAvailable to members']);
  assert.equal(call.ws.readyState,WebSocket.OPEN);
  review(await f.tool(call,'Widget $10 each'));
});

test('voice H2 real media output suppresses stale speech and accepts the refreshed provider',async t=>{
  const f=await production(t),call=await f.connect(),old=newest(call);
  await f.save('Widget $12 each');f.emit(call,speech('[SYNTHETIC] The old amount is ten dollars'),old);
  await until(()=>call.rows.length===2&&call.socketMessages.some(message=>message.event==='clear'));
  assert.equal(call.socketMessages.filter(message=>message.event==='media').length,0);
  f.emit(call,speech('[SYNTHETIC] The current listing is twelve dollars'));
  await until(()=>call.socketMessages.some(message=>message.event==='media'));
  const count=call.socketMessages.filter(message=>message.event==='media').length;
  f.emit(call,speech('[SYNTHETIC] Late retired voice output'),old);old.callbacks.onclose();
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(call.socketMessages.filter(message=>message.event==='media').length,count);
  const stored=f.db.prepare('SELECT transcriptJson FROM calls WHERE ownerId=? AND callSid=?').get(call.owner.id,call.callSid).transcriptJson;
  assert.match(stored,/current listing is twelve/);assert.doesNotMatch(stored,/old amount|Late retired/);
});

test('voice H2 actual consecutive owner saves reach the latest provider at a shared timestamp',async t=>{
  const f=await production(t,{sharedTimestamp:true}),call=await f.connect();
  for(const [text,total] of [['Widget $12 each','36.00'],['Widget $14 each','42.00'],['Widget $9 each','27.00']]){
    const old=f.delivered(call).at(-1);await f.save(text);review(await f.tool(call,old,'repeat-id'));
    await until(()=>f.delivered(call).at(-1)===text&&newest(call).established);
    amount(await f.tool(call,text,'fresh-'+total),total);
  }
  assert.deepEqual(f.delivered(call),['Widget $10 each','Widget $12 each','Widget $14 each','Widget $9 each']);
  assert.equal(call.rows.flatMap(row=>row.content).filter(value=>JSON.stringify(value).includes('[Call connected.')).length,1);
});

test('voice H2 real saved update cannot be overwritten by a delayed earlier connection',async t=>{
  const gate=deferred();const f=await production(t,{onConnect:row=>row.call.rows.length===2?gate.promise:undefined});f.release.push(gate.resolve);
  const call=await f.connect();await f.save('Widget $12 each');f.media(call);
  await until(()=>call.rows.length===2);await f.save('Widget $14 each');f.media(call);gate.resolve();
  await until(()=>call.rows.length===3&&newest(call).established&&newest(call).realtime.some(value=>value.audio));
  assert.deepEqual(f.delivered(call),['Widget $10 each','Widget $12 each','Widget $14 each']);
  assert.equal(call.rows[1].content.length,0);assert.equal(call.rows[1].realtime.length,0);
  review(await f.tool(call,'Widget $12 each'));amount(await f.tool(call,'Widget $14 each','latest'),'42.00');
});

test('voice H2 real GoAway reconnect reads the latest saved facts and keeps the phone stream',async t=>{
  const f=await production(t),call=await f.connect(),handle=f.resume(call);
  await f.save('Widget $12 each');f.emit(call,{goAway:{timeLeft:'10s'}});
  await until(()=>call.rows.length===2&&newest(call).established);
  assert.equal(newest(call).config.sessionResumption.handle,handle);assert.equal(call.ws.readyState,1);
  amount(await f.tool(call,'Widget $12 each'),'36.00');review(await f.tool(call,'Widget $10 each','stale'));
});

test('voice H2 failed refresh ends the real call through existing fallback with zero billed minutes',async t=>{
  const f=await production(t),call=await f.connect(),old=newest(call);f.failRefresh();await f.save('Widget $12 each');f.media(call);
  await until(()=>call.ws.readyState===3);
  const saved=f.db.prepare('SELECT status,minutesBilled,transcriptJson FROM calls WHERE ownerId=? AND callSid=?').get(call.owner.id,call.callSid);
  assert.equal(saved.status,'FAILED');assert.equal(saved.minutesBilled,0);
  f.emit(call,speech('[SYNTHETIC] Rejected late stale speech'),old);assert.equal(call.socketMessages.filter(value=>value.event==='media').length,0);
  const backup=await f.signed(call.fallback,call.params);assert.match(await backup.text(),/<Gather/);
  assert.doesNotMatch(JSON.stringify(f.errors),/PRIVATE/);
});

test('voice H2 refresh failure after a real tool response completes shutdown without a queue cycle',async t=>{
  const f=await production(t),call=await f.connect();f.failRefresh();await f.save('Widget $12 each');
  review(await f.tool(call,'Widget $10 each','refresh-failure-after-response'));
  await until(()=>call.ws.readyState===3);
  const saved=f.db.prepare('SELECT status,minutesBilled FROM calls WHERE ownerId=? AND callSid=?').get(call.owner.id,call.callSid);
  assert.equal(saved.status,'FAILED');assert.equal(saved.minutesBilled,0);
  assert.equal(call.rows[0].responses.length,1);assert.equal(call.rows[0].closed,1);
  assert.equal(call.socketMessages.filter(value=>value.event==='media').length,0);
  assert.match(await (await f.signed(call.fallback,call.params)).text(),/<Gather/);
});

test('voice H2 a failed telephony clear while a real response drains completes fallback',async t=>{
  const gate=deferred();let clearEntered=false;
  const f=await production(t,{onServerSend:async message=>{if(message.event==='clear'){clearEntered=true;await gate.promise;throw Error('[SYNTHETIC] Telephony clear failed');}}});f.release.push(gate.resolve);
  const call=await f.connect();await f.save('Widget $12 each');review(await f.tool(call,'Widget $10 each'));
  await until(()=>clearEntered);gate.resolve();await until(()=>call.ws.readyState===3);
  const saved=f.db.prepare('SELECT status,minutesBilled FROM calls WHERE ownerId=? AND callSid=?').get(call.owner.id,call.callSid);
  assert.equal(saved.status,'FAILED');assert.equal(saved.minutesBilled,0);assert.equal(call.rows[0].responses.length,1);
  assert.equal(call.socketMessages.filter(value=>value.event==='media').length,0);
});

test('voice H2 a failed refreshed audio write completes shutdown and retains received caller words',async t=>{
  const f=await production(t,{onServerSend:async message=>{if(message.event==='media')throw Error('[SYNTHETIC] Telephony media write failed');}}),call=await f.connect();
  await f.save('Widget $12 each');f.media(call);
  await until(()=>call.rows.length===2&&call.rows.at(-1).realtime.some(value=>value.audio));
  f.emit(call,{serverContent:{inputTranscription:{text:'[SYNTHETIC] Preserve caller words after refresh'}}});
  f.emit(call,speech('[SYNTHETIC] Current saved amount twelve dollars'));
  await until(()=>call.ws.readyState===3);
  const saved=f.db.prepare('SELECT status,minutesBilled,transcriptJson FROM calls WHERE ownerId=? AND callSid=?').get(call.owner.id,call.callSid);
  assert.equal(saved.status,'FAILED');assert.equal(saved.minutesBilled,0);assert.match(saved.transcriptJson,/Preserve caller words after refresh/);
  assert.equal(call.socketMessages.filter(value=>value.event==='media').length,0);
});

test('voice H2 simultaneous owners retain separate facts, requests and provider handles',async t=>{
  const f=await production(t),a=await f.connect(),b=await f.connect(f.owners[1]);
  const aHandle=f.resume(a),bHandle=f.resume(b),before=JSON.stringify(f.current(f.owners[1]));
  amount(await f.tool(a,'Widget $10 each','shared-id'),'30.00');amount(await f.tool(b,'Gadget $99 each','shared-id'),'297.00');
  await f.save('Widget $12 each');review(await f.tool(a,'Widget $10 each','shared-id'));
  await until(()=>a.rows.length===2);amount(await f.tool(a,'Widget $12 each','new-id'),'36.00');
  amount(await f.tool(b,'Gadget $99 each','shared-id'),'297.00');
  assert.equal(newest(a).config.sessionResumption.handle,aHandle);assert.equal(b.rows.length,1);
  assert.equal(JSON.stringify(f.current(f.owners[1])),before);
  assert.doesNotMatch(JSON.stringify(a.rows.map(row=>[row.config,row.content,row.responses])),new RegExp(bHandle+'|FOREIGN_SENTINEL'));
  assert.doesNotMatch(JSON.stringify(b.rows.map(row=>[row.config,row.content,row.responses])),new RegExp(aHandle+'|Widget \\$12'));
});

test('voice H2 two calls for one owner refresh independently without exchanging caller context',async t=>{
  const f=await production(t),a=await f.connect(),b=await f.connect(f.owners[0],'+19025550102');
  const aHandle=f.resume(a),bHandle=f.resume(b);
  f.emit(a,{serverContent:{inputTranscription:{text:'[SYNTHETIC] Caller A private request'}}});
  f.emit(b,{serverContent:{inputTranscription:{text:'[SYNTHETIC] Caller B private request'}}});
  await f.save('Widget $12 each');review(await f.tool(a,'Widget $10 each','same-id'));review(await f.tool(b,'Widget $10 each','same-id'));
  await until(()=>a.rows.length===2&&b.rows.length===2);
  assert.equal(newest(a).config.sessionResumption.handle,aHandle);assert.equal(newest(b).config.sessionResumption.handle,bHandle);
  amount(await f.tool(a,'Widget $12 each','fresh'),'36.00');amount(await f.tool(b,'Widget $12 each','fresh'),'36.00');
  const aRecord=f.db.prepare('SELECT transcriptJson FROM calls WHERE ownerId=? AND callSid=?').get(a.owner.id,a.callSid).transcriptJson;
  const bRecord=f.db.prepare('SELECT transcriptJson FROM calls WHERE ownerId=? AND callSid=?').get(b.owner.id,b.callSid).transcriptJson;
  assert.match(aRecord,/Caller A private/);assert.doesNotMatch(aRecord,/Caller B private/);
  assert.match(bRecord,/Caller B private/);assert.doesNotMatch(bRecord,/Caller A private/);
});
