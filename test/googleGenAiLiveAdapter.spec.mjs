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

