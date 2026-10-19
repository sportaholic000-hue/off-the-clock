import test from 'node:test';
import assert from 'node:assert/strict';
import {adapter,deferred,until,pricesFrom,OUTPUT} from './voiceAgent2FactsRefresh20261019Fixture.mjs';

const audio={serverContent:{modelTurn:{parts:[{inlineData:{data:'AQACAA==',mimeType:OUTPUT}}]}}};
const tool=(id='synthetic-h2-tool')=>({toolCall:{functionCalls:[{id,name:'calculateListedPrice',args:{}}]}});
const delivered=h=>h.rows.map(row=>pricesFrom(row.config.systemInstruction));
const frames=h=>h.rows.flatMap(row=>row.realtime.filter(value=>value.audio).map(value=>Buffer.from(value.audio.data,'base64')[0]));
const greetings=h=>h.rows.flatMap(row=>row.content).filter(value=>JSON.stringify(value).includes('[Call connected.'));

for(const [name,before,after] of [
  ['amount increase','Widget $10 each','Widget $12 each'],
  ['amount decrease','Widget $10 each','Widget $8 each'],
  ['added qualification','Widget $10 each','Widget $10 each\nAvailable to members'],
  ['removed qualification','Widget $10 each\nAvailable to members','Widget $10 each'],
  ['replaced qualification','Widget $10 each\nAvailable to members','Widget $10 each\nWeekdays only'],
  ['removed listing','Widget $10 each','']
])test('voice H2 provider receives '+name+' before next caller audio',async t=>{
  const h=await adapter(t,{prices:before});h.save(after);await h.sendAudio(3);
  assert.deepEqual(delivered(h),[before,after]);assert.deepEqual(frames(h),[3]);
  assert.equal(h.rows[0].realtime.filter(value=>value.audio).length,0);
  assert.equal(h.rows[0].closed,1);assert.equal(h.rows[1].closed,0);
  assert.equal(greetings(h).length,1);
  const priorEvents=h.events.length;
  h.rows[0].callbacks.onmessage(audio);h.rows[0].callbacks.onmessage(tool('retired'));
  h.rows[0].callbacks.onclose();h.rows[0].callbacks.onerror();await h.session.whenIdle();
  assert.equal(h.events.length,priorEvents,'Retired callbacks cannot reach this call');
});

test('voice H2 unchanged saved facts avoid provider replacement across repeated input',async t=>{
  const h=await adapter(t);h.save('Widget $10 each');
  for(let i=0;i<20;i++)await h.sendAudio(i);
  assert.deepEqual(delivered(h),['Widget $10 each']);assert.equal(frames(h).length,20);
  assert.equal(h.rows[0].closed,0);assert.equal(greetings(h).length,1);
});

test('voice H2 connected provider refreshes while caller is idle',async t=>{
  const h=await adapter(t,{interval:10});h.save('Widget $12 each');
  await until(()=>h.rows.length===2);await h.session.whenIdle();
  assert.deepEqual(delivered(h),['Widget $10 each','Widget $12 each']);
  assert.deepEqual(frames(h),[]);assert.equal(greetings(h).length,1);
});

test('voice H2 stale provider speech is cleared without waiting for caller audio or tools',async t=>{
  const h=await adapter(t);h.save('Widget $12 each');
  h.emit({...audio,serverContent:{...audio.serverContent,outputTranscription:{text:'[SYNTHETIC] Old price is ten dollars'},turnComplete:true}});
  await until(()=>h.rows.length===2);await h.session.whenIdle();
  assert.equal(h.events.filter(([kind])=>kind==='audio').length,0);
  assert.equal(h.events.filter(([kind,value])=>kind==='transcript'&&value.role==='model').length,0);
  assert.ok(h.events.some(([kind])=>kind==='interrupt'));
  assert.equal(delivered(h).at(-1),'Widget $12 each');
});

for(const shape of ['separate messages','multiple parts'])test('voice H2 a save during queued '+shape+' suppresses the remaining old output',async t=>{
  let gate;const h=await adapter(t,{onAudio:()=>gate.promise});gate=h.gate();
  if(shape==='separate messages'){h.emit(audio);h.emit(audio);}
  else h.emit({serverContent:{modelTurn:{parts:[...audio.serverContent.modelTurn.parts,...audio.serverContent.modelTurn.parts]}}});
  await until(()=>h.events.some(([kind])=>kind==='audio'));
  h.save('Widget $12 each');gate.resolve();
  // No new incoming message, caller media or timer tick observes this save.
  await h.session.whenIdle();
  assert.equal(h.events.filter(([kind])=>kind==='audio').length,1,'The queued part must not escape with the prior saved facts');
  await until(()=>h.rows.length===2);await h.session.whenIdle();
  assert.equal(delivered(h).at(-1),'Widget $12 each');assert.ok(h.events.some(([kind])=>kind==='interrupt'));
});

test('voice H2 refreshed speech and caller input wait for queued telephony output to clear',async t=>{
  let gate;const h=await adapter(t,{onInterruption:()=>gate.promise});gate=h.gate();
  h.save('Widget $12 each');const pending=h.sendAudio(5);
  await until(()=>h.rows.length===2&&h.rows[1].established);
  assert.equal(h.rows[1].content.length,0,'Do not start refreshed speech before the clear has completed');
  assert.deepEqual(frames(h),[]);gate.resolve();await pending;
  assert.equal(h.rows[1].content.length,1);assert.deepEqual(frames(h),[5]);
});

test('voice H2 rejected telephony clear fails closed instead of accepting stale or refreshed speech',async t=>{
  const h=await adapter(t,{onInterruption:async()=>{throw Error('[SYNTHETIC PRIVATE CLEAR FAILURE]');}});
  h.save('Widget $12 each');await assert.rejects(h.sendAudio(5));await h.session.close();
  assert.equal(h.events.filter(([kind])=>kind==='error').length,1);assert.deepEqual(frames(h),[]);
  assert.equal(h.rows.flatMap(row=>row.content).length,1,'Only the original greeting was delivered');
});

test('voice H2 normal close retains final current caller and provider transcripts',async t=>{
  const h=await adapter(t,{onClose:row=>row.callbacks.onmessage({serverContent:{inputTranscription:{text:'[SYNTHETIC] Final caller words'},outputTranscription:{text:'[SYNTHETIC] Final current reply'},turnComplete:true}})});
  await h.session.close();
  assert.deepEqual(h.events.filter(([kind])=>kind==='transcript').map(([,value])=>[value.role,value.text]),[
    ['user','[SYNTHETIC] Final caller words'],['model','[SYNTHETIC] Final current reply']
  ]);
});

test('voice H2 normal close drains an already accepted tool response before retiring its provider',async t=>{
  let gate;const h=await adapter(t,{tool:async()=>{await gate.promise;return {status:'needs_review'};}});gate=h.gate();
  h.emit(tool());await until(()=>h.events.some(([kind])=>kind==='tool'));
  const closing=h.session.close();gate.resolve();await closing;
  assert.equal(h.rows[0].responses.length,1);assert.equal(h.events.filter(([kind])=>kind==='error').length,0);
  assert.ok(h.wire.findIndex(([kind])=>kind==='response')<h.wire.findIndex(([kind])=>kind==='close'));
});

test('voice H2 cold continuity waits for already received caller words to finish persistence',async t=>{
  let gate;const h=await adapter(t,{onTranscript:()=>gate.promise});gate=h.gate();
  h.emit({serverContent:{inputTranscription:{text:'[SYNTHETIC] Caller detail received before the save'}}});
  await until(()=>h.events.some(([kind])=>kind==='transcript'));
  h.save('Widget $12 each');const sending=h.sendAudio(6);
  await until(()=>h.rows.length===2&&h.rows[1].established);
  assert.equal(h.rows[1].content.length,0,'Received caller context must finish before continuation is seeded');
  gate.resolve();await sending;await h.session.whenIdle();
  assert.match(JSON.stringify(h.rows[1].content),/Caller detail received before the save/);
});

test('voice H2 consecutive completed saves replace each provider in order',async t=>{
  const h=await adapter(t);
  for(const [i,text] of ['Widget $12 each','Widget $14 each\nMembers only','Widget $9 each'].entries()){
    h.save(text);await h.sendAudio(i+1);
  }
  assert.deepEqual(delivered(h),['Widget $10 each','Widget $12 each','Widget $14 each\nMembers only','Widget $9 each']);
  assert.deepEqual(frames(h),[1,2,3]);assert.equal(greetings(h).length,1);
  assert.deepEqual(h.rows.map(row=>row.closed),[1,1,1,0]);
});

test('voice H2 later save wins while an earlier provider replacement is connecting',async t=>{
  let gate;const h=await adapter(t,{onConnect:row=>row.index===1?gate.promise:undefined});gate=h.gate();
  h.save('Widget $12 each');const first=h.sendAudio(1);
  await until(()=>h.rows.length===2);h.save('Widget $14 each');const second=h.sendAudio(2);
  h.rows[1].callbacks.onmessage(audio);
  assert.deepEqual(frames(h),[]);gate.resolve();await Promise.all([first,second]);
  assert.deepEqual(delivered(h),['Widget $10 each','Widget $12 each','Widget $14 each']);
  assert.equal(h.rows[1].content.length,0,'An obsolete candidate must not request new speech');
  assert.equal(h.rows[1].closed,1);assert.deepEqual(frames(h),[1,2]);
  assert.equal(h.events.filter(([kind])=>kind==='audio').length,0);
});

test('voice H2 later save wins while facts compilation is delayed',async t=>{
  let gate;const h=await adapter(t,{onCompile:text=>text.includes('Widget $12 each')?gate.promise:undefined});gate=h.gate();
  h.save('Widget $12 each');const pending=h.sendAudio(4);
  await new Promise(resolve=>setTimeout(resolve,0));h.save('Widget $14 each');gate.resolve();await pending;
  assert.deepEqual(delivered(h),['Widget $10 each','Widget $14 each']);assert.deepEqual(frames(h),[4]);
});

for(const event of ['goAway','onclose','onerror'])test('voice H2 '+event+' resumption uses current saved facts and the same handle',async t=>{
  const h=await adapter(t);h.resume('synthetic-h2-resume-'+event);h.save('Widget $12 each');
  if(event==='goAway')h.emit({goAway:{timeLeft:'10s'}});else h.rows[0].callbacks[event]();
  await until(()=>h.rows.length===2);await h.sendAudio(6);await h.session.whenIdle();
  assert.deepEqual(delivered(h),['Widget $10 each','Widget $12 each']);
  assert.equal(h.rows[1].config.sessionResumption.handle,'synthetic-h2-resume-'+event);
  assert.equal(greetings(h).length,1);assert.deepEqual(frames(h),[6]);
  assert.deepEqual(h.events.filter(([kind])=>kind==='error'||kind==='close'),[]);
});

test('voice H2 cold replacement retains received conversation and historical tool context',async t=>{
  const h=await adapter(t,{tool:async()=>({status:'needs_review',message:'[SYNTHETIC] Previous result has no amount.'})});
  h.emit({serverContent:{inputTranscription:{text:'[SYNTHETIC] Three widgets for my gate'},outputTranscription:{text:'[SYNTHETIC] I will check the listing'},turnComplete:true}});
  h.emit(tool());await h.session.whenIdle();h.save('Widget $12 each');await h.sendAudio(7);
  assert.equal(h.rows[1].config.sessionResumption.handle,undefined);
  const sent=JSON.stringify(h.rows[1].content);
  assert.match(sent,/Three widgets for my gate/);assert.match(sent,/I will check the listing/);
  assert.match(sent,/Previous result has no amount/);assert.match(sent,/historical context/);
  assert.match(sent,/Current OWNER_FACTS_JSON replaces earlier business facts/);
  assert.equal(h.rows[1].responses.length,0,'Historical context is not an orphan tool response');
});

test('voice H2 pending tool reply drains before replacement without deadlocking waiting audio',async t=>{
  let gate;const h=await adapter(t,{tool:async()=>{await gate.promise;return {status:'needs_review'};}});gate=h.gate();
  h.emit(tool());await until(()=>h.events.some(([kind])=>kind==='tool'));
  h.save('Widget $12 each');const first=h.sendAudio(1),second=h.sendAudio(2);
  h.emit(audio);await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(h.rows.length,1);assert.deepEqual(frames(h),[]);
  h.save('Widget $14 each');gate.resolve();await Promise.all([first,second]);await h.session.whenIdle();
  assert.deepEqual(delivered(h),['Widget $10 each','Widget $14 each']);
  const response=h.wire.findIndex(([kind])=>kind==='response'),close=h.wire.findIndex(([kind])=>kind==='close');
  assert.ok(response>=0&&close>response);assert.equal(h.rows[0].responses.length,1);
  assert.equal(h.rows[1].responses.length,0);assert.deepEqual(frames(h),[1,2]);
  assert.equal(h.events.filter(([kind])=>kind==='audio').length,0);
});

test('voice H2 every tool in an accepted batch drains once before refresh',async t=>{
  const h=await adapter(t,{tool:async()=>({status:'needs_review'})});h.save('Widget $12 each');
  h.emit({toolCall:{functionCalls:[...tool('batch-a').toolCall.functionCalls,...tool('batch-b').toolCall.functionCalls]}});
  await until(()=>h.rows.length===2);await h.session.whenIdle();
  assert.deepEqual(h.rows[0].responses.flatMap(row=>row.functionResponses.map(item=>item.id)),['batch-a','batch-b']);
  assert.equal(h.rows[1].responses.length,0);assert.equal(delivered(h).at(-1),'Widget $12 each');
});

for(const mode of ['revision','compile','connect','timeout','continuation','missing-continuation-method'])test('voice H2 '+mode+' refresh failure closes safely without forwarding stale audio',async t=>{
  let gate;const h=await adapter(t,{connectTimeoutMs:100,
    onConnect:row=>{if(row.index===0)return;if(mode==='connect')throw Error('[SYNTHETIC PRIVATE PROVIDER ERROR]');if(mode==='timeout')return gate.promise;},
    onContent:row=>{if(row.index>0&&mode==='continuation')throw Error('[SYNTHETIC PRIVATE SEND ERROR]');},
    withoutClientContent:mode==='missing-continuation-method'});gate=h.gate();
  h.save('Widget $12 each');if(mode==='revision')h.failRevision();if(mode==='compile')h.failCompile();
  await assert.rejects(h.sendAudio(8),error=>error.code==='GOOGLE_LIVE_SEND_FAILED'&&!error.message.includes('PRIVATE'));
  h.rows[0].callbacks.onmessage(audio);gate.resolve();await h.session.close();
  await until(()=>h.rows.every(row=>!row.established||row.closed>0));
  if(mode==='connect')assert.notEqual(h.rows[1].established,true,'A rejected connect never produced a provider session');
  assert.deepEqual(frames(h),[]);assert.equal(h.events.filter(([kind])=>kind==='error').length,1);
  assert.equal(h.events.filter(([kind])=>kind==='audio').length,0);
  assert.doesNotMatch(JSON.stringify(h.events),/PRIVATE/);
});

test('voice H2 close during replacement retires a late successful provider without resurrection',async t=>{
  let gate;const h=await adapter(t,{onConnect:row=>row.index===1?gate.promise:undefined});gate=h.gate();
  h.save('Widget $12 each');const send=h.sendAudio(9);send.catch(()=>{});
  await until(()=>h.rows.length===2);const closing=h.session.close();gate.resolve();
  await closing;await assert.rejects(send);assert.deepEqual(frames(h),[]);
  assert.ok(h.rows.every(row=>row.closed>0));
});

test('voice H2 refresh polling stops after call close',async t=>{
  const h=await adapter(t,{interval:10});await h.session.close();h.failRevision();
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(h.rows.length,1);assert.equal(h.events.filter(([kind])=>kind==='error').length,0);
});

test('voice H2 bounded cold continuity preserves newest words and labels omitted context',async t=>{
  const h=await adapter(t);
  for(let i=0;i<30;i++)h.emit({serverContent:{inputTranscription:{text:'[SYNTHETIC] Detail '+i+' '+'.'.repeat(1800)}}});
  await h.session.whenIdle();h.save('Widget $12 each');await h.sendAudio(2);
  const value=h.rows[1].content[0],text=JSON.stringify(value);
  assert.ok(Buffer.byteLength(text)<34000);assert.match(text,/Detail 29 /);
  assert.doesNotMatch(text,/Detail 0 /);assert.match(text,/Older conversation context is omitted/);
});

test('voice H2 independent sessions never share facts, history or resume handles',async t=>{
  const a=await adapter(t,{ownerId:'synthetic-a',prices:'Widget $10 each'});
  const b=await adapter(t,{ownerId:'synthetic-b',prices:'FOREIGN_SENTINEL $99 each'});
  a.resume('synthetic-a-handle');b.resume('synthetic-b-handle');
  a.emit({serverContent:{inputTranscription:{text:'[SYNTHETIC] Private caller A words'}}});
  a.save('Widget $12 each');await a.sendAudio(1);await b.sendAudio(2);
  assert.equal(a.rows[1].config.sessionResumption.handle,'synthetic-a-handle');assert.equal(b.rows.length,1);
  assert.doesNotMatch(JSON.stringify(a.rows.map(row=>[row.config,row.content])),/FOREIGN_SENTINEL|synthetic-b-handle/);
  assert.doesNotMatch(JSON.stringify(b.rows.map(row=>[row.config,row.content])),/Private caller A|Widget \$12|synthetic-a-handle/);
});
