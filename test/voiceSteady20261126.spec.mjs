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
  for(const part of ['Keep one steady, natural speaking voice throughout every sentence','never shift gender, pitch'])
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
