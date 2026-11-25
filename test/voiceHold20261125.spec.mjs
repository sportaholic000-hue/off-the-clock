import './pricebookTestEnv.mjs';
import {EventEmitter} from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGeminiMediaBridge,SILENCE_CHECK_PROMPT,SILENCE_GOODBYE_PROMPT,HOLD_CHECK_PROMPT,HOLD_TIMEOUT_PROMPT,CALLER_SILENT} from '../server/src/voice/geminiMediaBridge.js';
import {HOLD_CALL_TOOL_NAME,HOLD_CALL_TOOL_DECLARATION,HOLD_CALL_MAX_SECONDS,getVoiceToolDeclarations} from '../server/src/voice/toolSchemas.js';
import {compileVoiceSystemInstruction,HOLD_RULE} from '../server/src/voice/voicePromptCompiler.js';

// The receptionist offers to wait while a caller measures, but the silence check hung
// up after 20 seconds of quiet. holdCall pauses that hang-up. Real media bridge with
// fake timers, a fake Twilio socket and a fake Gemini session (harness copied from
// test/voiceEndCall20261105.spec.mjs). No live call, no provider request.
// HANDWRITTEN EXPECTATIONS, before execution:
// - after holdCall: the tool gets {status:'on_hold',maxHoldSeconds:300}; nothing at 10 s,
//   20 s or 59.999 s; a check-in call event at 60, 120, 180 and 240 s; at 300 s the
//   normal "Are you still there?" event, and the goodbye 10 s after that; the call ends
//   only after that goodbye plays, about 5 min 10 s after the hold began;
// - caller speech during the hold ends it: the next silence is the normal 10 s check;
// - a later holdCall starts a fresh 5 minutes;
// - with no holdCall, silence still ends the call after 20 s (unchanged);
// - holdCall is a call-control tool (BLOCKING), not one of the business tools, and the
//   phone receptionist's declarations include it before endCall;
// - the HOLD rule appears once in every plan's instructions.

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


const hold=async(h,id='synthetic-hold-1')=>{await h.callbacks.onToolCall({name:HOLD_CALL_TOOL_NAME,args:{reason:'measuring'},toolCallId:id});await settle();};

test('hold: check-ins every minute, the normal check at 5 minutes, then goodbye',async()=>{
  const h=await bridgeHarness();
  await hold(h);
  assert.deepEqual(h.events.toolResponses,[{toolCallId:'synthetic-hold-1',name:HOLD_CALL_TOOL_NAME,response:{status:'on_hold',maxHoldSeconds:HOLD_CALL_MAX_SECONDS}}]);
  assert.equal(h.events.toolCalls.length,0,'handled by the bridge, not the business tools');
  await h.timers.advance(59_999);
  assert.deepEqual(h.events.prompts,[],'no hang-up check at 10 or 20 seconds');
  for(let minute=1;minute<=4;minute++){
    await h.timers.advance(minute===1?1:60_000);
    assert.deepEqual(h.events.prompts,Array(minute).fill(HOLD_CHECK_PROMPT),'check-in '+minute);
  }
  assert.equal(h.events.sessionEnds.length,0);
  await h.timers.advance(59_999);
  assert.equal(h.events.prompts.length,4);
  await h.timers.advance(1);
  assert.deepEqual(h.events.prompts.slice(4),[HOLD_TIMEOUT_PROMPT],'5 minutes: are you still there');
  await h.timers.advance(10_000);
  assert.deepEqual(h.events.prompts.slice(5),[SILENCE_GOODBYE_PROMPT]);
  await h.speak();await h.echoMark(h.marks().at(-1));
  await h.timers.advance(1_200);await h.controller.whenIdle();
  assert.deepEqual(h.events.sessionEnds,[{status:'stopped',reason:CALLER_SILENT}]);
});

test('hold: the caller speaking ends the hold; silence then follows the normal 10 s check',async()=>{
  const h=await bridgeHarness();
  await hold(h);
  await h.timers.advance(45_000);
  await h.callerSays('[SYNTHETIC] Okay, it is twenty by thirty.');
  await h.timers.advance(9_999);
  assert.deepEqual(h.events.prompts,[]);
  await h.timers.advance(1);
  assert.deepEqual(h.events.prompts,[SILENCE_CHECK_PROMPT]);
  await h.timers.advance(10_000);
  assert.deepEqual(h.events.prompts,[SILENCE_CHECK_PROMPT,SILENCE_GOODBYE_PROMPT]);
});

test('hold: a second hold after the caller spoke starts a fresh 5 minutes',async()=>{
  const h=await bridgeHarness();
  await hold(h);
  await h.timers.advance(240_000);
  assert.equal(h.events.prompts.length,4);
  await h.callerSays('[SYNTHETIC] Still looking, give me a minute.');
  await hold(h,'synthetic-hold-2');
  await h.timers.advance(240_000);
  assert.deepEqual(h.events.prompts,Array(8).fill(HOLD_CHECK_PROMPT));
  await h.timers.advance(60_000);
  assert.equal(h.events.prompts.at(-1),HOLD_TIMEOUT_PROMPT);
});

test('without holdCall, 20 s of silence still ends the call',async()=>{
  const h=await bridgeHarness();
  await h.timers.advance(10_000);await h.timers.advance(10_000);
  assert.deepEqual(h.events.prompts,[SILENCE_CHECK_PROMPT,SILENCE_GOODBYE_PROMPT]);
});

test('holdCall is a call-control tool declared on phone calls before endCall',()=>{
  assert.equal(HOLD_CALL_TOOL_DECLARATION.name,'holdCall');
  assert.equal(HOLD_CALL_TOOL_DECLARATION.behavior,'BLOCKING');
  assert.deepEqual(HOLD_CALL_TOOL_DECLARATION.parameters.properties.reason.enum,['measuring','finding_information']);
  assert.ok(!getVoiceToolDeclarations().some(tool=>tool.name==='holdCall'));
  const runtime=readFileSync(new URL('../server/src/voice/productionVoiceRuntime.js',import.meta.url),'utf8');
  assert.match(runtime,/capabilities\(context\.ownerId\)\)\),HOLD_CALL_TOOL_DECLARATION,END_CALL_TOOL_DECLARATION\]/);
});

test('the HOLD rule appears once in every plan',()=>{
  const guide=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
  for(const capabilities of [{booking:false,transfer:false,phoneQuoting:false},{booking:true,transfer:true,phoneQuoting:false},{booking:true,transfer:true,phoneQuoting:true}]){
    const text=compileVoiceSystemInstruction({guideText:guide,business:{businessName:'[SYNTHETIC] Cedar',agentName:'Nova'},services:[],knowledge:{about:'',hours:'',services:'',policies:'',faqs:'',prices:'',neverSay:[]},capabilities});
    assert.equal(text.split(HOLD_RULE).length,2,JSON.stringify(capabilities));
    assert.ok(text.indexOf(HOLD_RULE)<text.indexOf('ENDING THE CALL:'));
  }
});
