import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GoogleGenAiLiveAdapterError,
  createGoogleGenAiLiveSessionOpener
} from '../server/src/voice/googleGenAiLiveAdapter.js';

const CONTEXT = Object.freeze({ ownerId: 'owner-a', callSid: 'CA' + 'a'.repeat(32) });
const SESSION = Object.freeze({ callRecordId: 'call-a' });
const TOOLS = Object.freeze([{
  name: 'getQuote',
  description: 'Get a server-authoritative quote.',
  parameters: { type: 'OBJECT', properties: {}, required: [] }
}]);

function harness(overrides = {}) {
  const calls = { connect: [], realtime: [], responses: [], close: 0, events: [] };
  let providerCallbacks;
  const providerSession = {
    sendRealtimeInput(value) { calls.realtime.push(value); },
    sendToolResponse(value) { calls.responses.push(value); },
    close() { calls.close += 1; }
  };
  const client = {
    live: {
      async connect(value) {
        calls.connect.push(value);
        providerCallbacks = value.callbacks;
        if (overrides.connectError) throw new Error('secret provider detail');
        return providerSession;
      }
    }
  };
  const bridgeCallbacks = {
    async onAudio(value) { calls.events.push(['audio', value]); },
    async onInterruption() { calls.events.push(['interruption']); },
    async onTranscript(value) { calls.events.push(['transcript', value]); },
    async onToolCall(value) { calls.events.push(['tool', value]); },
    async onToolCallCancellation(value) { calls.events.push(['toolCancellation', value]); },
    async onError() { calls.events.push(['error']); },
    async onClose() { calls.events.push(['close']); }
  };
  const open = createGoogleGenAiLiveSessionOpener({
    client,
    model: 'gemini-3.8-live',
    systemInstruction: ({ context }) => `Serve ${context.ownerId} without exposing prices.`,
    toolDeclarations: TOOLS,
    voiceName: 'Aoede'
  });
  return {
    calls,
    bridgeCallbacks,
    get providerCallbacks() { return providerCallbacks; },
    open: () => open({
      context: CONTEXT,
      session: SESSION,
      audio: { inputMimeType: 'audio/pcm;rate=16000', outputMimeType: 'audio/pcm;rate=24000' },
      callbacks: bridgeCallbacks
    })
  };
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
}

test('connects with audio-only transcription, tools, prompt, and configured voice', async () => {
  const h = harness();
  const session = await h.open();
  assert.equal(h.calls.connect[0].model, 'gemini-3.8-live');
  assert.deepEqual(h.calls.connect[0].config, {
    responseModalities: ['AUDIO'],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    systemInstruction: 'Serve owner-a without exposing prices.',
    tools: [{ functionDeclarations: TOOLS }],
    sessionResumption: {},
    contextWindowCompression: { slidingWindow: {} },
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } }
  });
  const pcm = Buffer.from([0, 1, 2, 3]);
  await session.sendAudio({ data: pcm, mimeType: 'audio/pcm;rate=16000' });
  assert.deepEqual(h.calls.realtime, [{
    audio: { data: pcm.toString('base64'), mimeType: 'audio/pcm;rate=16000' }
  }]);
});

test('maps provider audio, finalized transcripts, interruption, and tool calls', async () => {
  const h = harness();
  const session = await h.open();
  h.providerCallbacks.onmessage({
    serverContent: {
      inputTranscription: { text: 'Need mowing.' },
      outputTranscription: { text: 'I can help. ' },
      modelTurn: { parts: [{ inlineData: { data: 'AAEC', mimeType: 'audio/pcm;rate=24000' } }] }
    }
  });
  h.providerCallbacks.onmessage({ serverContent: {
    outputTranscription: { text: 'What size is the yard?' }, turnComplete: true
  } });
  h.providerCallbacks.onmessage({ toolCall: { functionCalls: [{
    id: 'tool-1', name: 'getQuote', args: {}
  }] } });
  h.providerCallbacks.onmessage({ serverContent: { interrupted: true } });
  await settle();
  assert.deepEqual(h.calls.events, [
    ['transcript', { text: 'Need mowing.', role: 'user', final: true }],
    ['audio', { data: 'AAEC', mimeType: 'audio/pcm;rate=24000' }],
    ['transcript', { text: 'I can help. What size is the yard?', role: 'model', final: true }],
    ['tool', { name: 'getQuote', args: {}, toolCallId: 'tool-1' }],
    ['interruption']
  ]);
  await session.sendToolResponse({ toolCallId: 'tool-1', name: 'getQuote', response: { status: 'ok' } });
  assert.deepEqual(h.calls.responses, [{ functionResponses: [{
    id: 'tool-1', name: 'getQuote', response: { status: 'ok' }
  }] }]);
});

test('flushes interrupted operator transcript as non-final before clearing playback', async () => {
  const h = harness();
  await h.open();
  h.providerCallbacks.onmessage({ serverContent: { outputTranscription: { text: 'The estimate is' } } });
  h.providerCallbacks.onmessage({ serverContent: { interrupted: true } });
  await settle();
  assert.deepEqual(h.calls.events, [
    ['transcript', { text: 'The estimate is', role: 'model', final: false }],
    ['interruption']
  ]);
});

test('provider protocol violations fail closed without exposing provider details', async () => {
  const h = harness();
  await h.open();
  const args = Object.create({ injected: true });
  args.value = 'bad';
  h.providerCallbacks.onmessage({ toolCall: { functionCalls: [{ id: 'tool-1', name: 'getQuote', args }] } });
  await settle();
  assert.deepEqual(h.calls.events, [['error']]);
});

test('close sends audio-stream-end and closes exactly once', async () => {
  const h = harness();
  const session = await h.open();
  await session.close();
  await session.close();
  assert.deepEqual(h.calls.realtime, [{ audioStreamEnd: true }]);
  assert.equal(h.calls.close, 1);
});

test('construction and connection failures use stable local error codes', async () => {
  assert.throws(
    () => createGoogleGenAiLiveSessionOpener({ client: {}, model: 'x', systemInstruction: 'x', toolDeclarations: TOOLS }),
    error => error instanceof GoogleGenAiLiveAdapterError && error.code === 'GOOGLE_LIVE_CLIENT_REQUIRED'
  );
  const h = harness({ connectError: true });
  await assert.rejects(
    h.open(),
    error => error instanceof GoogleGenAiLiveAdapterError && error.code === 'GEMINI_CONNECT_FAILED' &&
      !error.message.includes('secret provider detail')
  );
});

test('accepts authentic @google/genai LiveServerMessage class instances with prototype accessors', async () => {
  const { LiveServerMessage } = await import('@google/genai');
  const h = harness();
  await h.open();
  const msg = new LiveServerMessage();
  Object.assign(msg, {
    serverContent: {
      modelTurn: { parts: [{ text: 'Hello from Gemini Live' }] },
      outputTranscription: { text: 'Hello from Gemini Live' },
      turnComplete: true
    }
  });
  assert.equal(typeof msg.text, 'string');
  assert.equal(msg.text, 'Hello from Gemini Live');
  h.providerCallbacks.onmessage(msg);
  await settle();
  assert.deepEqual(h.calls.events, [
    ['transcript', { text: 'Hello from Gemini Live', role: 'model', final: true }]
  ]);
});

test('maps toolCallCancellation on caller barge-in during tool call prediction', async () => {
  const h = harness();
  await h.open();
  h.providerCallbacks.onmessage({ toolCallCancellation: { ids: ['tool-cancel-1'] } });
  await settle();
  assert.deepEqual(h.calls.events, [
    ['toolCancellation', { toolCallId: 'tool-cancel-1' }]
  ]);
});

test('unused batched functionResponses input is refused', async () => {
  const h=harness(),session=await h.open();
  await assert.rejects(session.sendToolResponse({functionResponses:[{id:'call-1',name:'getQuote',response:{}}]}),{code:'INVALID_GOOGLE_LIVE_TOOL_RESPONSE'});
  assert.deepEqual(h.calls.responses,[]);
  await session.close();
});

for(const status of [undefined,'INTERACTION_STATUS_UNSPECIFIED','IDLE','REQUIRES_ACTION'])test(`goAway reconnects once at idle turnComplete: ${status}`,async()=>{
  const h=harness(),s=await h.open(),old=h.providerCallbacks;
  old.onmessage({sessionResumptionUpdate:{newHandle:'synthetic-handle',resumable:false}});
  old.onmessage({goAway:{timeLeft:'20s'}});
  old.onmessage({serverContent:{turnComplete:true,...(status?{interactionStatus:status}:{})}});
  await s.whenIdle();await settle();
  assert.equal(h.calls.connect.length,2);
  assert.equal(h.calls.connect[1].config.sessionResumption.handle,'synthetic-handle');
  old.onmessage({serverContent:{turnComplete:true}});await settle();
  assert.equal(h.calls.connect.length,2);await s.close();
});

test('IN_PROGRESS waits at turnComplete but reconnects before timeLeft expires',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=harness(),s=await h.open();
  h.providerCallbacks.onmessage({sessionResumptionUpdate:{newHandle:'synthetic-handle',resumable:false}});
  h.providerCallbacks.onmessage({goAway:{timeLeft:'10s'}});
  h.providerCallbacks.onmessage({serverContent:{turnComplete:true,interactionStatus:'IN_PROGRESS'}});
  await s.whenIdle();assert.equal(h.calls.connect.length,1);
  t.mock.timers.tick(7999);await Promise.resolve();assert.equal(h.calls.connect.length,1);
  t.mock.timers.tick(1);await Promise.resolve();await Promise.resolve();
  assert.equal(h.calls.connect.length,2);
  t.mock.timers.tick(2000);await s.whenIdle();assert.equal(h.calls.connect.length,2);
  assert.deepEqual(h.calls.events,[]);await s.close();
});

test('SDK class allowance never extends to nested objects or unrelated root classes',async()=>{
  const {LiveServerMessage}=await import('@google/genai');
  for(const msg of [Object.assign(new LiveServerMessage(),{serverContent:new (class Nested {})()}),new (class Pretender {})()]){
    const h=harness(),s=await h.open();h.providerCallbacks.onmessage(msg);await settle();
    assert.deepEqual(h.calls.events,[['error']]);await s.close();
  }
});
