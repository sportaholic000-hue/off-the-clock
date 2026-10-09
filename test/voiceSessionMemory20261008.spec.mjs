import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGoogleGenAiLiveSessionOpener} from '../server/src/voice/googleGenAiLiveAdapter.js';
import {captureChoice} from '../server/src/voice/voiceFallbackRoutes.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';
import {customerHistory} from '../server/src/customerHistoryService.js';
import {fixture,at} from './leadCaptureRepair20261006Fixture.mjs';
import {harness,until} from './voiceLifecycle20261006Fixture.mjs';

const wait=async()=>{await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0));};
function live(){
 const connections=[],events=[],deferred=[];
 const client={live:{connect:async input=>{
  const row={input,audio:[],tools:[],greetings:[],closes:0};connections.push(row);
  if(deferred.length)await deferred.shift();
  return {sendRealtimeInput:value=>row.audio.push(value),sendToolResponse:value=>row.tools.push(value),sendClientContent:value=>row.greetings.push(value),close:()=>{row.closes++;}};
 }}};
 const open=createGoogleGenAiLiveSessionOpener({client,model:'synthetic-live-model',systemInstruction:'[SYNTHETIC] Answer this call.',toolDeclarations:[{name:'captureLead',description:'Synthetic',parameters:{type:'OBJECT',properties:{},required:[]}}],voiceName:'Kore',greetOnConnect:true});
 const callbacks={onAudio:async value=>events.push(['audio',value]),onInterruption:async()=>events.push(['interrupt']),onTranscript:async value=>events.push(['text',value]),onToolCall:async value=>events.push(['tool',value]),onError:async()=>events.push(['error']),onClose:async()=>events.push(['close'])};
 return {connections,events,defer:promise=>deferred.push(promise),open:()=>open({context:{ownerId:'synthetic-a'},session:{callRecordId:'synthetic-call'},audio:{inputMimeType:'audio/pcm;rate=16000',outputMimeType:'audio/pcm;rate=24000'},callbacks})};
}

test('A goAway resumes one call with compression, one greeting, ordered caller audio and a single tool completion',async()=>{
 const h=live(),s=await h.open(),first=h.connections[0];
 assert.deepEqual(first.input.config.sessionResumption,{});
 assert.deepEqual(first.input.config.contextWindowCompression,{slidingWindow:{}});
 first.input.callbacks.onmessage({sessionResumptionUpdate:{newHandle:'synthetic-handle-1'}});
 first.input.callbacks.onmessage({serverContent:{inputTranscription:{text:'[SYNTHETIC] deck repair'}}});
 first.input.callbacks.onmessage({toolCall:{functionCalls:[{id:'synthetic-tool',name:'captureLead',args:{}}]}});
 let release;h.defer(new Promise(resolve=>{release=resolve;}));
 first.input.callbacks.onmessage({goAway:{timeLeft:'20s'}});
 const during=s.sendAudio({data:Buffer.from([1,0]),mimeType:'audio/pcm;rate=16000'});
 await wait();assert.equal(h.connections.length,2);assert.equal(first.audio.length,0);
 release();await during;await s.whenIdle();
 const second=h.connections[1];assert.equal(second.input.config.sessionResumption.handle,'synthetic-handle-1');
 assert.equal(first.greetings.length,1);assert.equal(second.greetings.length,0);
 assert.equal(second.audio.length,1);assert.deepEqual(h.events.filter(x=>x[0]==='tool').map(x=>x[1].toolCallId),['synthetic-tool']);
 await s.sendToolResponse({toolCallId:'synthetic-tool',name:'captureLead',response:{status:'captured'}});
 assert.equal(first.tools.length+second.tools.length,1);
 second.input.callbacks.onmessage({serverContent:{inputTranscription:{text:'[SYNTHETIC] more details'}}});await s.whenIdle();
 assert.deepEqual(h.events.filter(x=>x[0]==='text').map(x=>x[1].text),['[SYNTHETIC] deck repair','[SYNTHETIC] more details']);
 first.input.callbacks.onclose();await wait();assert.deepEqual(h.events.filter(x=>['error','close'].includes(x[0])),[]);
 await s.close();
});

test('A unexpected close with a valid handle reconnects; failed reconnect reports a real failure once',async()=>{
 const h=live(),s=await h.open(),first=h.connections[0];first.input.callbacks.onmessage({sessionResumptionUpdate:{newHandle:'synthetic-handle-2',resumable:true}});
 first.input.callbacks.onclose();await wait();assert.equal(h.connections.length,2);assert.deepEqual(h.events.filter(x=>x[0]==='close'),[]);
 h.connections[1].input.callbacks.onmessage({sessionResumptionUpdate:{newHandle:'synthetic-handle-3',resumable:true}});
 h.defer(Promise.reject(Error('[SYNTHETIC] reconnect failed')));h.connections[1].input.callbacks.onmessage({goAway:{timeLeft:'1s'}});
 await wait();await wait();assert.deepEqual(h.events.filter(x=>x[0]==='error'),[['error']]);await s.close();
});
test('A signed phone stream stays open across reconnection; a later caller hangup completes and bills normally',async t=>{
 let now=Date.parse(at);const h=await harness(t,{install:{clock:()=>new Date(now)}}),c=await h.connect();
 c.callback.onmessage({sessionResumptionUpdate:{newHandle:'synthetic-long-call',resumable:true}});
 c.callback.onmessage({goAway:{timeLeft:'20s'}});
 await until(()=>h.callbacks.length===2);assert.equal(c.ws.readyState,1);
 c.ws.send(JSON.stringify({event:'media',sequenceNumber:'2',streamSid:c.streamSid,media:{track:'inbound',chunk:'1',timestamp:'0',payload:Buffer.alloc(160,255).toString('base64')}}));
 now+=12*60*1000;c.ws.send(JSON.stringify({event:'stop',sequenceNumber:'3',streamSid:c.streamSid,stop:{accountSid:c.params.AccountSid,callSid:c.params.CallSid}}));
 await until(()=>h.db.prepare('SELECT status FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid)?.status==='COMPLETED');
 const row=h.db.prepare('SELECT status,outcome,minutesBilled FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid);
 assert.equal(row.status,'COMPLETED');assert.notEqual(row.outcome,'AI_FALLBACK');assert.ok(row.minutesBilled>=12);
});
test('A failed resumption runs the genuine backup path and bills zero minutes',async t=>{
 let connections=0;const h=await harness(t,{onConnect:()=>{if(++connections===2)throw Error('[SYNTHETIC] reconnect failed');}}),c=await h.connect();
 c.callback.onmessage({sessionResumptionUpdate:{newHandle:'synthetic-long-call',resumable:true}});c.callback.onmessage({goAway:{timeLeft:'1s'}});
 await until(()=>c.ws.readyState===3);const row=h.db.prepare('SELECT status,minutesBilled FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid);
 assert.equal(row.status,'FAILED');assert.equal(row.minutesBilled,0);
 const response=await h.post(c.fallback,c.params);assert.match(await response.text(),/<Gather/);
});

const guide=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
const prompt=()=>compileVoiceSystemInstruction({guideText:guide,business:{businessName:'Synthetic Repairs',agentName:'Nova'},services:[]});
function prior(f,{ownerId='synthetic-a',minutesAgo=30,status='FAILED',message='[SYNTHETIC] My deck needs repair.',amount='$875'}={}){
 const c=f.context(ownerId),transcript=[{role:'caller',text:message,final:true},{role:'assistant',text:`[SYNTHETIC] Prior estimate ${amount}`,final:true},{role:'user',text:'[SYNTHETIC] backup message for the deck',fallbackKey:'synthetic',final:true}];
 f.db.prepare('UPDATE calls SET status=?,outcome=?,failureCode=?,createdAt=?,transcriptJson=? WHERE ownerId=? AND id=?').run(status,status==='FAILED'?'AI_FALLBACK':'TWILIO_STOP',status==='FAILED'?'GEMINI_SESSION_CLOSED':null,new Date(Date.parse(at)-minutesAgo*60000).toISOString(),JSON.stringify(transcript),c.ownerId,c.callSid);
 return c;
}
async function affirm(f,c,v,name='Sally'){
 const row=f.db.prepare('SELECT transcriptJson FROM calls WHERE ownerId=? AND id=?').get(c.ownerId,c.callSid);
 const transcript=JSON.parse(row.transcriptJson||'[]');transcript.push({role:'assistant',text:`Am I speaking with ${name}?`,final:true},{role:'caller',text:'Yes, speaking.',final:true});
 f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify(transcript),c.ownerId,c.callSid);
 return v.tool('getCustomerContext',{callerConfirmedIdentity:true});
}
test('B same-number dropped call has gated name, then bounded previous transcript and backup message without an old price',async t=>{
 const f=fixture(t),old=prior(f),v0=f.voice(old);await v0.tool('captureLead',{name:'Sally Synthetic',description:'[SYNTHETIC] deck repair'});
 const c=f.context(),v=f.voice(c),first=await v.tool('getCustomerContext',{});
 assert.equal(first.status,'identity_unconfirmed');assert.equal(first.greetingName,'Sally');assert.equal(first.openLeads,undefined);assert.equal(first.previousCall,undefined);
 const result=await affirm(f,c,v);assert.equal(result.status,'found');assert.equal(result.previousCall.endedUnexpectedly,true);
 assert.match(JSON.stringify(result.previousCall),/deck|backup message/);assert.doesNotMatch(JSON.stringify(result.previousCall),/\$875/);
 assert.ok(result.openLeads.some(x=>/deck/.test(x.description)));
});
test('B a price at the very start of old speech is redacted before the model sees history',async t=>{
 const f=fixture(t);prior(f,{message:'$875 was the old price for the deck',amount:'CA$910'});
 const old=f.context(),v=f.voice(old),first=await v.tool('getCustomerContext',{});
 assert.equal(first.status,'identity_unconfirmed');const result=await affirm(f,old,v,'the person who called this business from this number');
 assert.doesNotMatch(JSON.stringify(result.previousCall),/\$875|\$910/);assert.match(JSON.stringify(result.previousCall),/past amount omitted/);
});
test('B a dropped Twilio socket is flagged as an unexpected previous call',async t=>{
 const f=fixture(t),old=prior(f,{status:'COMPLETED'});f.ownerQuery('UPDATE calls SET outcome=? WHERE ownerId=? AND id=?').run('TWILIO_SOCKET_CLOSED',old.ownerId,old.callSid);
 const current=f.context(),v=f.voice(current);assert.equal((await v.tool('getCustomerContext',{})).status,'identity_unconfirmed');
 assert.equal((await affirm(f,current,v,'the person who called this business from this number')).previousCall.endedUnexpectedly,true);
});
test('B all caller history reads use the tenant ownerQuery, including the previous call',async t=>{
 const f=fixture(t),old=prior(f);await f.voice(old).tool('captureLead',{name:'Sally Synthetic',description:'[SYNTHETIC] deck repair'});
 const current=f.context(),queries=[],result=customerHistory(f.db,current,{now:Date.parse(at),ownerQuery:sql=>{queries.push(sql);assert.match(sql,/\bownerId\b/);return f.ownerQuery(sql);}});
 assert.ok(queries.length>=6);assert.equal(result.previousCall.endedUnexpectedly,true);assert.ok(result.openLeads.some(x=>/deck/.test(x.description)));
});
test('B a no or unclear identity answer reveals no history, even if a tool claims confirmation',async t=>{
 const f=fixture(t),old=prior(f);await f.voice(old).tool('captureLead',{name:'Sally Synthetic',description:'[SYNTHETIC] private deck'});
 const c=f.context(),v=f.voice(c);await v.tool('getCustomerContext',{});
 f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'assistant',text:'Am I speaking with Sally?',final:true},{role:'caller',text:"No, this isn't Sally.",final:true}]),c.ownerId,c.callSid);
 const denied=await v.tool('getCustomerContext',{callerConfirmedIdentity:true});assert.equal(denied.status,'not_found');assert.doesNotMatch(JSON.stringify(denied),/deck|Sally|875/);
});
test('B an explicit natural yes with the saved first name confirms, while an unclear answer does not',async t=>{
 const f=fixture(t),old=prior(f);await f.voice(old).tool('captureLead',{name:'Sally Synthetic',description:'[SYNTHETIC] private deck'});
 const confirmed=f.context(),v=f.voice(confirmed),first=await v.tool('getCustomerContext',{});
 f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'assistant',text:first.message,final:true},{role:'caller',text:'Yes, this is Sally.',final:true}]),confirmed.ownerId,confirmed.callSid);
 assert.equal((await v.tool('getCustomerContext',{callerConfirmedIdentity:true})).status,'found');
 const unclear=f.context(),v2=f.voice(unclear),question=await v2.tool('getCustomerContext',{});
 f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'assistant',text:question.message,final:true},{role:'caller',text:'Maybe, who is asking?',final:true}]),unclear.ownerId,unclear.callSid);
 const result=await v2.tool('getCustomerContext',{callerConfirmedIdentity:true});assert.equal(result.status,'not_found');assert.doesNotMatch(JSON.stringify(result),/Sally|deck/);
});
test('B withheld and other-business caller IDs disclose nothing',async t=>{
 const f=fixture(t),old=prior(f);await f.voice(old).tool('captureLead',{name:'Sally Synthetic',description:'[SYNTHETIC] private deck'});
 const other=f.context('synthetic-b'),anonymous=f.context();f.ownerQuery('UPDATE calls SET callerNumber=? WHERE ownerId=? AND id=?').run('anonymous',anonymous.ownerId,anonymous.callSid);anonymous.from='anonymous';
 for(const c of [other,anonymous]){const response=await f.voice(c).tool('getCustomerContext',{});assert.equal(response.status,'not_found');assert.doesNotMatch(JSON.stringify(response),/Sally|deck|875/);}
});
test('B after 24 hours saved requests remain available only after identity confirmation, without old transcript',async t=>{
 const f=fixture(t),old=prior(f,{minutesAgo:24*60+1});await f.voice(old).tool('captureLead',{name:'Sally Synthetic',description:'[SYNTHETIC] old deck'});
 const c=f.context(),v=f.voice(c);assert.equal((await v.tool('getCustomerContext',{})).status,'identity_unconfirmed');
 const result=await affirm(f,c,v);assert.equal(result.status,'found');assert.equal(result.previousCall,undefined);assert.ok(result.openLeads.some(x=>/old deck/.test(x.description)));
});
test('B caller words are captured immediately and survive a drop; prompt requires early capture and guarded returning context',async t=>{
 assert.match(prompt(),/captureLead.*as soon as the caller (?:says|describes) what work/i);
 assert.match(prompt(),/Am I speaking with/);
 assert.match(prompt(),/Never repeat a price from a previous transcript/);
 const h=await harness(t),c=await h.connect(),words='[SYNTHETIC] My deck railing fell down';
 c.callback.onmessage({serverContent:{inputTranscription:{text:words}}});c.callback.onclose();
 await until(()=>h.db.prepare('SELECT status FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid).status==='FAILED');
 assert.match(JSON.stringify(h.db.prepare('SELECT describedService,collectedInputsJson FROM leads WHERE ownerId=?').all(h.owner)),/My deck railing fell down/);
});
test('C backup capture speaks the matching Chirp voice and the exact two new lines',()=>{
 const male=captureChoice('https://synthetic.example.invalid','male'),female=captureChoice('https://synthetic.example.invalid','female');
 assert.equal(male.voice,'Google.en-US-Chirp3-HD-Charon');assert.equal(female.voice,'Google.en-US-Chirp3-HD-Kore');
 assert.equal(male.message,"Sorry, we got cut off. Please tell me what you need, your name and the best number to reach you, and we'll get back to you.");
 assert.equal(captureChoice('https://synthetic.example.invalid','unknown').voice,undefined);
});
for(const [choice,voice] of [['male','Charon'],['female','Kore']])test(`C signed ${choice} fallback repeats the configured voice on capture and thanks, then retains ring-through`,async t=>{
 const h=await harness(t,{beforeInstall:f=>f.ownerQuery('UPDATE businessProfiles SET voiceId=? WHERE ownerId=?').run(choice,'synthetic-a')}),c=await h.connect();
 c.callback.onerror();await until(()=>c.ws.readyState===3);
 const fallback=await h.post(c.fallback,c.params),xml=await fallback.text();assert.match(xml,new RegExp(`<Say voice="Google.en-US-Chirp3-HD-${voice}">Sorry, we got cut off`));
 const again=await h.post('/api/twilio/voice/capture/again',c.params);assert.match(await again.text(),new RegExp(`<Say voice="Google.en-US-Chirp3-HD-${voice}">Sorry, we got cut off`));
 const response=await h.post('/api/twilio/voice/capture',{...c.params,SpeechResult:'[SYNTHETIC] Broken deck; Sally; +19025550100'}),thanks=await response.text();
 assert.match(thanks,new RegExp(`<Say voice="Google.en-US-Chirp3-HD-${voice}">Thanks, we&apos;ll get back to you\\.<\\/Say>`));
 assert.match(thanks,/<Dial answerOnBridge="true"/);
});
