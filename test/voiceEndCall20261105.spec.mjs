import './pricebookTestEnv.mjs';
import {EventEmitter} from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGeminiMediaBridge,
  SILENCE_CHECK_PROMPT,
  SILENCE_GOODBYE_PROMPT,
  RECEPTIONIST_ENDED_CALL,
  CALLER_SILENT,
} from '../server/src/voice/geminiMediaBridge.js';
import {END_CALL_TOOL_NAME,END_CALL_TOOL_DECLARATION,getVoiceToolDeclarations} from '../server/src/voice/toolSchemas.js';
import {createGoogleGenAiLiveSessionOpener} from '../server/src/voice/googleGenAiLiveAdapter.js';
import {harness,until} from './voiceLifecycle20261006Fixture.mjs';

// Before this change the receptionist had no way to hang up: after a goodbye
// the call stayed open, silent, until the caller hung up. Expected behavior,
// written before execution:
// - endCall ends the call only after the goodbye audio already sent has been
//   confirmed played (Twilio mark echo), never mid-sentence; no tool response
//   is sent, so the model says nothing more.
// - 10 s of caller silence: one "Are you still there?" call event. Another
//   10 s: a goodbye call event, then the call ends after the goodbye plays.
// - The silence window never runs while the receptionist's audio is playing
//   or a tool is running; caller speech restarts it.
// - The ended call persists transcript, lead and duration exactly like a
//   caller hang-up.

const ACCOUNT_SID='AC'+'a'.repeat(32),CALL_SID='CA'+'b'.repeat(32),STREAM_SID='MZ'+'d'.repeat(32);

class FakeSocket extends EventEmitter{
  constructor(){super();this.readyState=1;this.bufferedAmount=0;this.sent=[];this.closeCalls=[];}
  send(value,callback){this.sent.push(JSON.parse(value));callback?.();}
  close(code,reason){this.readyState=3;this.closeCalls.push({code,reason});}
}
function fakeTimers(){
  let clock=1_000_000,seq=0;const timers=new Map();
  return {
    now:()=>clock,
    setTimer:(fn,ms)=>{const id=++seq;timers.set(id,{fn,at:clock+ms});return id;},
    clearTimer:id=>{timers.delete(id);},
    pending:()=>timers.size,
    async advance(ms){
      const target=clock+ms;
      for(;;){
        const due=[...timers.entries()].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!due)break;
        timers.delete(due[0]);clock=Math.max(clock,due[1].at);due[1].fn();await settle();
      }
      clock=target;await settle();
    }
  };
}
async function settle(){for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));}
// 24 kHz PCM16 that encodes to non-empty mu-law: one 20 ms frame.
const goodbyeAudio=()=>({data:Buffer.alloc(960,1).toString('base64'),mimeType:'audio/pcm;rate=24000'});

async function bridgeHarness(){
  const timers=fakeTimers(),socket=new FakeSocket();
  const events={prompts:[],toolResponses:[],toolCalls:[],sessionEnds:[],transcripts:[]};
  let callbacks;
  const bridge=createGeminiMediaBridge({
    now:timers.now,setTimer:timers.setTimer,clearTimer:timers.clearTimer,
    openGeminiSession:async options=>{callbacks=options.callbacks;return {
      async sendAudio(){},
      async sendToolResponse(value){events.toolResponses.push(value);},
      async sendPrompt(text){events.prompts.push(text);},
      async close(){},
    };},
    onTranscript:async({transcript})=>{events.transcripts.push(transcript);},
    onToolCall:async({toolCall})=>{events.toolCalls.push(toolCall);return events.toolResult?await events.toolResult:{status:'ok'};},
    onSessionEnd:async({outcome})=>{events.sessionEnds.push(outcome);},
  });
  const {controller}=await bridge.startMediaSession({socket,context:{ownerId:'synthetic-owner',accountSid:ACCOUNT_SID,callSid:CALL_SID},session:{}});
  let sequence=1;
  const send=value=>socket.emit('message',JSON.stringify(value),false);
  send({event:'connected',protocol:'Call',version:'1.0.0'});
  send({event:'start',sequenceNumber:String(sequence++),streamSid:STREAM_SID,start:{accountSid:ACCOUNT_SID,callSid:CALL_SID,streamSid:STREAM_SID,tracks:['inbound'],mediaFormat:{encoding:'audio/x-mulaw',sampleRate:8000,channels:1}}});
  await settle();
  assert.equal(controller.state,'active');
  const marks=()=>socket.sent.filter(message=>message.event==='mark').map(message=>message.mark.name);
  return {timers,socket,events,controller,get callbacks(){return callbacks;},marks,
    echoMark:async name=>{send({event:'mark',sequenceNumber:String(sequence++),streamSid:STREAM_SID,mark:{name}});await settle();},
    speak:async()=>{await callbacks.onAudio(goodbyeAudio());await settle();},
    callerSays:async text=>{await callbacks.onTranscript({text,role:'user',final:true});await settle();},
  };
}

test('endCall is a declared call-control tool outside the business tool registry',()=>{
  assert.equal(END_CALL_TOOL_NAME,'endCall');
  assert.equal(END_CALL_TOOL_DECLARATION.name,'endCall');
  assert.equal(getVoiceToolDeclarations().some(tool=>tool.name==='endCall'),false);
});

test('endCall ends the call only after the goodbye already sent has finished playing',async()=>{
  const h=await bridgeHarness();
  await h.speak();
  const [mark]=h.marks();assert.ok(mark,'goodbye audio was sent with a playback mark');
  await h.callbacks.onToolCall({name:'endCall',args:{reason:'caller_said_goodbye'},toolCallId:'synthetic-end-1'});await settle();
  // Goodbye still playing: nothing ends, however long Twilio takes to confirm.
  await h.timers.advance(20_000);
  assert.equal(h.events.sessionEnds.length,0);assert.equal(h.socket.closeCalls.length,0);
  await h.echoMark(mark);
  assert.equal(h.events.sessionEnds.length,0,'a short pause follows playback before hanging up');
  await h.timers.advance(1_200);
  await h.controller.whenIdle();
  assert.deepEqual(h.events.sessionEnds,[{status:'stopped',reason:RECEPTIONIST_ENDED_CALL}]);
  assert.deepEqual(h.socket.closeCalls,[{code:1000,reason:'Voice session ended'}]);
  // Call control only: the business tool handler never ran and no reply was requested.
  assert.equal(h.events.toolCalls.length,0);
  assert.equal(h.events.toolResponses.length,0);
  assert.equal(h.timers.pending(),0,'no call timer outlives the call');
});

test('more goodbye audio after endCall restarts the playback wait',async()=>{
  const h=await bridgeHarness();
  await h.speak();
  await h.callbacks.onToolCall({name:'endCall',args:{},toolCallId:'synthetic-end-2'});await settle();
  await h.echoMark(h.marks()[0]);
  await h.timers.advance(600);
  await h.speak();
  await h.timers.advance(5_000);
  assert.equal(h.events.sessionEnds.length,0,'second goodbye chunk is still unplayed');
  await h.echoMark(h.marks()[1]);
  await h.timers.advance(1_200);await h.controller.whenIdle();
  assert.deepEqual(h.events.sessionEnds,[{status:'stopped',reason:RECEPTIONIST_ENDED_CALL}]);
});

test('silence: "Are you still there?" after 10 s, goodbye after another 10 s, then the call ends after the goodbye plays',async()=>{
  const h=await bridgeHarness();
  await h.timers.advance(9_999);
  assert.deepEqual(h.events.prompts,[]);
  await h.timers.advance(1);
  assert.deepEqual(h.events.prompts,[SILENCE_CHECK_PROMPT]);
  assert.match(SILENCE_CHECK_PROMPT,/"Are you still there\?"/);
  // The receptionist asks; the window waits until that question has played.
  await h.speak();
  await h.timers.advance(30_000);
  assert.deepEqual(h.events.prompts,[SILENCE_CHECK_PROMPT]);
  await h.echoMark(h.marks()[0]);
  await h.timers.advance(10_000);
  assert.deepEqual(h.events.prompts,[SILENCE_CHECK_PROMPT,SILENCE_GOODBYE_PROMPT]);
  assert.equal(h.events.sessionEnds.length,0,'waits for the goodbye to be spoken');
  await h.speak();
  await h.timers.advance(10_000);
  assert.equal(h.events.sessionEnds.length,0,'goodbye still playing');
  await h.echoMark(h.marks()[1]);
  await h.timers.advance(1_200);await h.controller.whenIdle();
  assert.deepEqual(h.events.sessionEnds,[{status:'stopped',reason:CALLER_SILENT}]);
  assert.deepEqual(h.socket.closeCalls,[{code:1000,reason:'Voice session ended'}]);
});

test('silence: caller speech restarts the window and asks again only after a fresh 10 s',async()=>{
  const h=await bridgeHarness();
  await h.timers.advance(10_000);
  assert.deepEqual(h.events.prompts,[SILENCE_CHECK_PROMPT]);
  await h.timers.advance(5_000);
  await h.callerSays('[SYNTHETIC] Yes, sorry, I am here.');
  await h.timers.advance(9_999);
  assert.deepEqual(h.events.prompts,[SILENCE_CHECK_PROMPT],'no goodbye after the caller answered');
  await h.timers.advance(1);
  assert.deepEqual(h.events.prompts,[SILENCE_CHECK_PROMPT,SILENCE_CHECK_PROMPT],'the next silence starts over at the check');
  assert.equal(h.events.sessionEnds.length,0);
});

test('silence: never counts while a tool is running',async()=>{
  const h=await bridgeHarness();
  let release;h.events.toolResult=new Promise(resolve=>{release=resolve;});
  // Not awaited: the bridge's tool queue settles only when the tool result does.
  void h.callbacks.onToolCall({name:'captureLead',args:{notes:'[SYNTHETIC] request'},toolCallId:'synthetic-tool-1'});await settle();
  await h.timers.advance(60_000);
  assert.deepEqual(h.events.prompts,[]);
  release({status:'saved'});await settle();
  await h.timers.advance(10_000);
  assert.deepEqual(h.events.prompts,[SILENCE_CHECK_PROMPT]);
});

test('a caller hang-up during the goodbye still ends once, as a hang-up',async()=>{
  const h=await bridgeHarness();
  await h.speak();
  await h.callbacks.onToolCall({name:'endCall',args:{},toolCallId:'synthetic-end-3'});await settle();
  h.socket.emit('message',JSON.stringify({event:'stop',sequenceNumber:'2',streamSid:STREAM_SID,stop:{accountSid:ACCOUNT_SID,callSid:CALL_SID}}),false);
  await settle();await h.timers.advance(60_000);await h.controller.whenIdle();
  assert.deepEqual(h.events.sessionEnds,[{status:'stopped',reason:'TWILIO_STOP'}]);
  assert.equal(h.timers.pending(),0);
});

test('adapter sends a call event as ordered client content',async()=>{
  const sent=[];
  const client={live:{connect:async()=>({sendRealtimeInput(){},sendToolResponse(){},sendClientContent(value){sent.push(value);},close(){}})}};
  const open=createGoogleGenAiLiveSessionOpener({client,model:'synthetic-live-model',systemInstruction:'[SYNTHETIC] instruction',toolDeclarations:[END_CALL_TOOL_DECLARATION]});
  const session=await open({audio:{inputMimeType:'audio/pcm;rate=16000',outputMimeType:'audio/pcm;rate=24000'},callbacks:{onAudio(){},onInterruption(){},onTranscript(){},onToolCall(){},onError(){},onClose(){}}});
  await session.sendPrompt(SILENCE_CHECK_PROMPT);
  assert.deepEqual(sent,[{turns:[{role:'user',parts:[{text:SILENCE_CHECK_PROMPT}]}],turnComplete:true}]);
  await session.close();
});

// Full production path: signed Twilio webhook, real WebSocket, SQLite and the
// production voice runtime. Same caller words, lead and 125 s of talk; one call
// ends by caller hang-up, the other by the receptionist's endCall.
test('ending by endCall saves the call exactly as a caller hang-up does',async t=>{
  let now=Date.parse('2026-11-05T15:00:00.000Z');
  const declared=[];
  const h=await harness(t,{install:{clock:()=>new Date(now)},onConnect:input=>declared.push(input.config.tools[0].functionDeclarations.map(tool=>tool.name))});
  async function run(n,end){
    const call=await h.connect(n);
    assert.ok(declared.at(-1).includes('endCall'),'endCall is offered to the live model');
    call.callback.onmessage({serverContent:{inputTranscription:{text:'[SYNTHETIC] My gutter is loose, please call me back.'}}});
    call.callback.onmessage({serverContent:{outputTranscription:{text:'Got it, I will pass that on. Bye for now!'},turnComplete:true}});
    const lead=await h.tool(call.callback,'captureLead',{notes:'[SYNTHETIC] Loose gutter, wants a callback',callbackRequested:true},'synthetic-lead-'+n);
    assert.equal(typeof lead.leadHandle,'string');
    now+=125_000;
    await end(call);
    await until(()=>h.db.prepare('SELECT status FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,call.params.CallSid)?.status==='COMPLETED');
    return call;
  }
  const hungUp=await run(1,async call=>{call.ws.send(JSON.stringify({event:'stop',sequenceNumber:'2',streamSid:call.streamSid,stop:{accountSid:call.params.AccountSid,callSid:call.params.CallSid}}));});
  const ended=await run(2,async call=>{call.callback.onmessage({toolCall:{functionCalls:[{id:'synthetic-end-call',name:'endCall',args:{reason:'request_handled'}}]}});});
  // The receptionist closed the media stream; Twilio's follow-up request hangs up.
  await until(()=>ended.ws.readyState===3);
  const resume=await h.post(ended.fallback,ended.params);
  assert.match(await resume.text(),/<Hangup\/>/);
  assert.equal(h.responses.has('synthetic-end-call'),false,'endCall never asks the model for another reply');

  const row=call=>h.db.prepare('SELECT * FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,call.params.CallSid);
  const a=row(hungUp),b=row(ended);
  assert.equal(b.status,'COMPLETED');assert.equal(b.failureCode,null);
  assert.equal(b.duration,125);assert.equal(b.duration,a.duration);
  assert.equal(b.minutesBilled,a.minutesBilled);
  assert.deepEqual(JSON.parse(b.transcriptJson),JSON.parse(a.transcriptJson));
  for(const key of ['outcome','summaryText','summaryStatus','urgency','spamFiltered']){assert.ok(key in a,key);assert.deepEqual(b[key],a[key],key);}
  assert.equal(b.outcome,'LEAD');assert.equal(b.minutesBilled,3);
  // Only the transport reason differs: who ended the call.
  assert.equal(a.transportOutcome,'TWILIO_STOP');assert.equal(b.transportOutcome,RECEPTIONIST_ENDED_CALL);
  const leads=call=>h.db.prepare('SELECT COUNT(*) n FROM leads WHERE ownerId=? AND callId=?').get(h.owner,row(call).id).n;
  assert.equal(leads(hungUp),1);assert.equal(leads(ended),1);
});
