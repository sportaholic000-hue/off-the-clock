import './pricebookTestEnv.mjs';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileVoiceSystemInstruction,STEADY_VOICE_RULE,STAY_ON_TOPIC_RULE,HOLD_RULE} from '../server/src/voice/voicePromptCompiler.js';
import {speakGreeting} from '../server/src/voicePreviewRoutes.js';
import {VOICE_TEMPERATURE} from '../server/src/voice/voiceProviderLimits.js';

// The website demo keeps one steady voice with temperature 0.6 and a steady-voice
// line; phone calls and greeting previews had neither (external audit, Medium).
// HANDWRITTEN EXPECTATIONS, before execution:
// - VOICE_TEMPERATURE is 0.6, the demo's value;
// - every plan's phone instructions carry the VOICE rule once, between STAY ON TOPIC
//   and HOLD, and it asks for the same steady voice as the demo line;
// - the phone session config sent to Gemini has temperature 0.6;
// - a greeting preview session has temperature 0.6 and its instruction asks for one
//   steady voice. No provider is contacted.
const GUIDE=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
const DEMO=readFileSync(new URL('../server/src/demo/demoInstructions.js',import.meta.url),'utf8');
const LIVE_DEMO=readFileSync(new URL('../server/src/demo/liveDemo.js',import.meta.url),'utf8');
const PLANS={quoteDone:{booking:true,transfer:true,phoneQuoting:true},operator:{booking:true,transfer:true,phoneQuoting:false},starter:{booking:false,transfer:false,phoneQuoting:false}};

test('phone instructions: one steady-voice rule in every plan, between STAY ON TOPIC and HOLD',()=>{
  assert.equal(VOICE_TEMPERATURE,0.6);assert.match(LIVE_DEMO,/temperature: 0\.6/);
  for(const [plan,capabilities] of Object.entries(PLANS)){
    const text=compileVoiceSystemInstruction({guideText:GUIDE,business:{businessName:'[SYNTHETIC] Ridge Roofing',agentName:'Sam'},services:[],capabilities});
    assert.equal(text.split(STEADY_VOICE_RULE).length,2,plan);
    const at=text.indexOf(STEADY_VOICE_RULE);
    assert.ok(text.indexOf(STAY_ON_TOPIC_RULE)<at&&at<text.indexOf(HOLD_RULE),plan);
  }
  // The demo and the phone ask for the same steady voice, and both keep that voice
  // through a language switch, so "never shift accent" never fights the language rule.
  for(const part of ['Keep one steady, natural speaking voice throughout every sentence','never shift gender, pitch or accent within a language','keep that same voice'])
    {assert.ok(DEMO.includes(part),part);assert.ok(STEADY_VOICE_RULE.includes(part),part);}
});

test('phone session config: temperature 0.6 is in the call setup',()=>{
  const source=readFileSync(new URL('../server/src/voice/googleGenAiLiveAdapter.js',import.meta.url),'utf8');
  assert.match(source,/const config=\{responseModalities:\['AUDIO'\],temperature:VOICE_TEMPERATURE,/);
});

test('greeting preview: temperature 0.6 and a steady-voice instruction',async()=>{
  let seen;
  const client={live:{connect:async({config,callbacks})=>{seen=config;queueMicrotask(()=>{
    callbacks.onmessage({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:Buffer.alloc(480,1).toString('base64')}}]}}});
    callbacks.onmessage({serverContent:{turnComplete:true}});});return {close(){}};}}};
  await speakGreeting({client,model:'synthetic-model',voiceName:'Kore',greeting:'[SYNTHETIC] Thanks for calling.',timeoutMs:2000});
  assert.equal(seen.temperature,0.6);
  assert.match(seen.systemInstruction,/Keep one steady, natural speaking voice throughout; never shift gender, pitch or accent\.$/);
});

// 2026-11-26: a long call is moved to a new connection when Google asks (goAway).
// HANDWRITTEN EXPECTATION, before execution: the second connection is opened with the
// same voice, the same temperature and the same instructions as the first, plus the
// resumption handle, so the receptionist cannot change voice part-way through a call.
test('phone call: a mid-call reconnect keeps the same voice, temperature and instructions',async()=>{
  const {createGoogleGenAiLiveSessionOpener}=await import('../server/src/voice/googleGenAiLiveAdapter.js');
  const connects=[];let provider;
  const client={live:{connect:async value=>{connects.push(value);provider=value.callbacks;return {sendRealtimeInput(){},sendToolResponse(){},close(){}};}}};
  const noop=async()=>{};
  const open=createGoogleGenAiLiveSessionOpener({client,model:'synthetic-live-model',systemInstruction:'[SYNTHETIC] instructions',voiceName:'Charon',
    toolDeclarations:[{name:'getQuote',description:'Get a server-authoritative quote.',parameters:{type:'OBJECT',properties:{},required:[]}}]});
  const session=await open({context:{ownerId:'synthetic-owner',callSid:'CA'+'a'.repeat(32)},session:{callRecordId:'synthetic-call'},
    audio:{inputMimeType:'audio/pcm;rate=16000',outputMimeType:'audio/pcm;rate=24000'},
    callbacks:{onAudio:noop,onInterruption:noop,onTranscript:noop,onToolCall:noop,onToolCallCancellation:noop,onError:noop,onClose:noop}});
  const first=provider;
  first.onmessage({sessionResumptionUpdate:{newHandle:'synthetic-handle',resumable:false}});
  first.onmessage({goAway:{timeLeft:'20s'}});
  first.onmessage({serverContent:{turnComplete:true}});
  await session.whenIdle();await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(connects.length,2);
  const [before,after]=connects.map(value=>value.config);
  assert.equal(after.sessionResumption.handle,'synthetic-handle');
  assert.equal(after.temperature,0.6);assert.equal(before.temperature,0.6);
  assert.deepEqual(after.speechConfig,{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Charon'}}});
  assert.deepEqual(after.speechConfig,before.speechConfig);
  assert.equal(after.systemInstruction,before.systemInstruction);
  assert.equal(connects[1].model,connects[0].model);
  await session.close();
});
