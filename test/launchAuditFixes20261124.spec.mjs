import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createGeminiMediaBridge, SILENCE_CHECK_PROMPT, RECEPTIONIST_ENDED_CALL } from '../server/src/voice/geminiMediaBridge.js';
import { projectVoiceToolResult } from '../server/src/voice/toolDispatcher.js';
import { confirmsIdentity } from '../server/src/voice/identityAnswer.js';
import { createGoogleGenAiLiveSessionOpener } from '../server/src/voice/googleGenAiLiveAdapter.js';
import { transcriptSummary } from '../server/src/callSummaryService.js';
import { transferGoodbyeTwiml } from '../server/src/voice/voiceFallbackRoutes.js';
import { encryptCredentialPayload, decryptCredentialPayload } from '../server/src/credentialEncryption.js';
import { lockedSetup, liveDemoConfig } from '../server/src/demo/liveDemo.js';
import { demoInstructions } from '../server/src/demo/demoInstructions.js';

const ACCOUNT_SID = 'AC' + 'a'.repeat(32);
const CALL_SID = 'CA' + 'b'.repeat(32);
const STREAM_SID = 'MZ' + 'd'.repeat(32);

class FakeSocket extends EventEmitter {
  constructor() { super(); this.readyState = 1; this.bufferedAmount = 0; this.sent = []; this.closeCalls = []; }
  send(value, cb) { this.sent.push(JSON.parse(value)); cb?.(); }
  close(code, reason) { this.readyState = 3; this.closeCalls.push({ code, reason }); }
}

function fakeTimers() {
  let clock = 1_000_000, seq = 0;
  const timers = new Map();
  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };
  return {
    now: () => clock,
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: clock + ms }); return id; },
    clearTimer: id => { timers.delete(id); },
    settle,
    async advance(ms) {
      const target = clock + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        clock = Math.max(clock, due[1].at);
        due[1].fn();
        await settle();
      }
      clock = target;
      await settle();
    }
  };
}

const audioChunk = () => ({ data: Buffer.alloc(960, 1).toString('base64'), mimeType: 'audio/pcm;rate=24000' });

async function bridgeFixture() {
  const timers = fakeTimers();
  const socket = new FakeSocket();
  const events = { prompts: [], sessionEnds: [] };
  let callbacks;
  const bridge = createGeminiMediaBridge({
    now: timers.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    openGeminiSession: async opts => {
      callbacks = opts.callbacks;
      return {
        async sendAudio() {},
        async sendToolResponse() {},
        async sendPrompt(text) { events.prompts.push(text); },
        async close() {}
      };
    },
    onTranscript: async () => {},
    onToolCall: async () => ({ status: 'ok' }),
    onSessionEnd: async ({ outcome }) => { events.sessionEnds.push(outcome); }
  });
  const { controller } = await bridge.startMediaSession({
    socket,
    context: { ownerId: 'owner-1', accountSid: ACCOUNT_SID, callSid: CALL_SID },
    session: {}
  });
  let seq = 1;
  const emit = msg => socket.emit('message', JSON.stringify(msg), false);
  emit({ event: 'connected', protocol: 'Call', version: '1.0.0' });
  emit({
    event: 'start',
    sequenceNumber: String(seq++),
    streamSid: STREAM_SID,
    start: {
      accountSid: ACCOUNT_SID,
      callSid: CALL_SID,
      streamSid: STREAM_SID,
      tracks: ['inbound'],
      mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 }
    }
  });
  await timers.settle();
  const marks = () => socket.sent.filter(m => m.event === 'mark').map(m => m.mark.name);
  return {
    timers, socket, events, controller,
    get callbacks() { return callbacks; },
    marks,
    emitNext(msg) { emit({ ...msg, sequenceNumber: String(seq++), streamSid: STREAM_SID }); }
  };
}

test('bridge: onInterruption clears pendingMarks so >128 interruptions do not hit PENDING_MARK_LIMIT and silence/endCall still work', async () => {
  const h = await bridgeFixture();
  for (let i = 0; i < 135; i++) {
    await h.callbacks.onAudio(audioChunk());
    await h.callbacks.onInterruption();
  }
  await h.timers.settle();
  assert.equal(h.controller.state, 'active');

  // An in-flight mark that arrived right after clear is absorbed without UNKNOWN_TWILIO_MARK.
  const priorMark = h.marks().at(-1);
  assert.ok(priorMark);
  h.emitNext({ event: 'mark', mark: { name: priorMark } });
  await h.timers.settle();
  assert.equal(h.controller.state, 'active');

  // Caller silence check fires normally after 10 s (was previously permanently disabled).
  await h.timers.advance(10_000);
  assert.deepEqual(h.events.prompts, [SILENCE_CHECK_PROMPT]);

  // endCall(emergency) completes in ~1.2 s after goodbye playback, never stalled 30 s by stale marks.
  await h.callbacks.onAudio(audioChunk());
  const finalMark = h.marks().at(-1);
  await h.callbacks.onToolCall({ name: 'endCall', args: { reason: 'emergency' }, toolCallId: 'end-1' });
  await h.timers.settle();
  h.emitNext({ event: 'mark', mark: { name: finalMark } });
  await h.timers.settle();
  await h.timers.advance(1_200);
  await h.controller.whenIdle();
  assert.deepEqual(h.events.sessionEnds, [{ status: 'stopped', reason: RECEPTIONIST_ENDED_CALL }]);
});

test('bridge: RTP timestamp reset with monotonic chunk does not drop live call', async () => {
  const h = await bridgeFixture();
  const payload = Buffer.alloc(160, 0xff).toString('base64');
  h.emitNext({ event: 'media', media: { track: 'inbound', chunk: '1', timestamp: '5000', payload } });
  h.emitNext({ event: 'media', media: { track: 'inbound', chunk: '2', timestamp: '20', payload } });
  await h.timers.settle();
  assert.equal(h.controller.state, 'active');
  await h.controller.close();
});

test('toolDispatcher preserves flagUrgent.urgentHandle and bookAppointment.retryAfterSeconds', () => {
  const handle = 'a'.repeat(32);
  const urgent = projectVoiceToolResult('flagUrgent', { status: 'flagged', urgentHandle: handle, message: 'Saved.' });
  assert.equal(urgent.urgentHandle, handle);
  const pending = projectVoiceToolResult('bookAppointment', {
    status: 'pending_confirmation',
    appointmentHandle: handle,
    retryAfterSeconds: 3,
    message: 'Still pending.'
  });
  assert.equal(pending.retryAfterSeconds, 3);
  assert.throws(() => projectVoiceToolResult('bookAppointment', {
    status: 'pending_confirmation',
    retryAfterSeconds: -1,
    message: 'Bad.'
  }));
});

test('identityAnswer supports French and Spanish confirmations and refuses denials', () => {
  for (const ok of [
    'Oui', "Oui, c'est moi", "Oui, j'appelle pour la toiture", "Bonjour, oui c'est Jean",
    'C\'est moi', 'Exactement', 'Tout à fait',
    'Sí', 'Sí, soy yo', 'Hola, sí, llamo por el techo', 'Claro, soy yo', 'Hablando'
  ]) {
    assert.equal(confirmsIdentity(ok, 'Jean', 'Jean Dupont'), true, 'should accept: ' + ok);
  }
  for (const no of [
    'Non', "Non, ce n'est pas Jean", "Oui, mais ce n'est pas moi", "Oui, mauvais numéro",
    "Oui, Jean n'est pas là", 'No, número equivocado', 'Sí, pero no soy yo', 'Sí, pero no soy Jean'
  ]) {
    assert.equal(confirmsIdentity(no, 'Jean', 'Jean Dupont'), false, 'should refuse: ' + no);
  }
});

test('googleGenAiLiveAdapter awaits and serializes greetOnConnect inside sendOrdered', async () => {
  const order = [];
  let releaseGreet;
  const provider = {
    async sendClientContent() {
      order.push('greet:start');
      await new Promise(resolve => { releaseGreet = resolve; });
      order.push('greet:end');
    },
    async sendRealtimeInput() { order.push('audio'); },
    async sendToolResponse() {},
    async close() {}
  };
  const open = createGoogleGenAiLiveSessionOpener({
    client: { live: { connect: async () => provider } },
    model: 'gemini-3.8-live',
    systemInstruction: 'Test instruction',
    toolDeclarations: [{ name: 'endCall' }],
    greetOnConnect: true
  });
  const opening = open({
    audio: { inputMimeType: 'audio/pcm;rate=16000', outputMimeType: 'audio/pcm;rate=24000' },
    callbacks: { onAudio() {}, onInterruption() {}, onTranscript() {}, onToolCall() {}, onError() {}, onClose() {} }
  });
  await new Promise(r => setImmediate(r));
  assert.deepEqual(order, ['greet:start']);
  releaseGreet();
  const session = await opening;
  await session.sendAudio({ data: Buffer.alloc(64), mimeType: 'audio/pcm;rate=16000' });
  assert.deepEqual(order, ['greet:start', 'greet:end', 'audio']);
  await session.close();
});

test('callSummaryService retains interrupted assistant turns while excluding unfinished caller turns', () => {
  const summary = transcriptSummary(JSON.stringify([
    { role: 'caller', text: 'How much for mowing?', final: true },
    { role: 'assistant', text: 'Your estimate is $85 to $110', final: false },
    { role: 'caller', text: 'unfinished fragment', final: false },
    { role: 'caller', text: 'Sounds good, book it.', final: true }
  ]));
  assert.ok(summary.includes('Assistant: Your estimate is $85 to $110'));
  assert.ok(!summary.includes('unfinished fragment'));
});

test('fallback transferGoodbyeTwiml includes Chirp3-HD voice when voiceId is configured', () => {
  assert.match(transferGoodbyeTwiml('female'), /<Say voice="Google\.en-US-Chirp3-HD-Kore">/);
  assert.match(transferGoodbyeTwiml('male'), /<Say voice="Google\.en-US-Chirp3-HD-Charon">/);
  assert.match(transferGoodbyeTwiml(null), /<Say>Sorry,/);
});

test('credentialEncryption binds keyVersion and optional AAD and supports key rotation', () => {
  const keyV1 = Buffer.alloc(32, 0x11).toString('hex');
  const keyV2 = Buffer.alloc(32, 0x22).toString('hex');
  const enc = encryptCredentialPayload({ secret: 'tok-1' }, { key: keyV1, keyVersion: 'v1', aad: 'tenant:a' });
  assert.deepEqual(decryptCredentialPayload(enc, { key: keyV1, aad: 'tenant:a' }), { secret: 'tok-1' });
  assert.throws(() => decryptCredentialPayload({ ...enc, keyVersion: 'v2' }, { key: keyV1, aad: 'tenant:a' }));
  assert.throws(() => decryptCredentialPayload(enc, { key: keyV1, aad: 'tenant:b' }));
  assert.throws(() => decryptCredentialPayload(enc, { key: keyV1 }));

  const enc2 = encryptCredentialPayload({ secret: 'tok-2' }, { keys: { v1: keyV1, v2: keyV2 }, keyVersion: 'v2' });
  assert.deepEqual(decryptCredentialPayload(enc2, { keys: { v1: keyV1, v2: keyV2 } }), { secret: 'tok-2' });
  assert.throws(() => decryptCredentialPayload({ ...enc2, keyVersion: 'v3' }, { keys: { v1: keyV1, v2: keyV2 } }), { code: 'CREDENTIAL_KEY_VERSION_UNKNOWN' });
});

test('live demo setup, instructions, and client echo-tail + audioStreamEnd + underrun cap', () => {
  const cfg = liveDemoConfig({
    DEMO_ENABLED: 'true',
    GEMINI_API_KEY: 'synthetic-key',
    DEMO_ALLOWED_ORIGINS: 'https://www.offtheclockai.com',
    DEMO_IP_SALT: 'salt'
  });
  const setup = lockedSetup(cfg, 'nova');
  assert.equal(setup.generationConfig.temperature, 0.6);
  assert.deepEqual(setup.realtimeInputConfig, { automaticActivityDetection: { prefixPaddingMs: 200, silenceDurationMs: 500 } });
  assert.match(demoInstructions('Nova'), /steady, natural speaking voice/);

  const source = readFileSync(new URL('../server/public/otc-live-demo.js', import.meta.url), 'utf8');
  assert.ok(source.includes('audioStreamEnd: true'));
  assert.ok(source.includes('Math.min(7200'));
  assert.ok(!source.includes('28800'));
  assert.ok(source.includes('playerPlaying || playerBuffered > 0 || now - lastPlayedAt < ECHO_TAIL_MS'));
});

test('marketing site removes untimed ~15 MINUTES setup claim', () => {
  const html = readFileSync(new URL('../site/www/index.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('~15 MINUTES'));
  assert.ok(html.includes('SETUP: SELF-SERVE · KEEP YOUR NUMBER'));
});
