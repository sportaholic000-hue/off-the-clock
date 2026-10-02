// Gemini Live session opener for phone calls. Wraps a @google/genai client so the media
// bridge sees a small, provider-neutral surface: sendAudio, sendToolResponse, close, and
// ordered callbacks (transcripts, audio, tool calls, interruption). Provider errors never
// leave this module with their original text.

export class GoogleGenAiLiveAdapterError extends Error {
  constructor(code, message = 'The voice provider is unavailable.') {
    super(message);
    this.name = 'GoogleGenAiLiveAdapterError';
    this.code = code;
  }
}

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

function plainJson(value, depth = 0) {
  if (depth > 8) return false;
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => plainJson(item, depth + 1));
  if (!isPlainObject(value)) return false;
  return Object.keys(value).every(key => !['__proto__', 'constructor', 'prototype'].includes(key) && plainJson(value[key], depth + 1));
}

export function createGoogleGenAiLiveSessionOpener({ client, model, systemInstruction, toolDeclarations = [], voiceName, onProviderError } = {}) {
  const reportProvider = (where, error) => { try { if (typeof onProviderError === 'function') onProviderError(where, String(error?.message ?? error ?? '').slice(0, 500)); } catch {} };
  if (!client || !client.live || typeof client.live.connect !== 'function') throw new GoogleGenAiLiveAdapterError('GOOGLE_LIVE_CLIENT_REQUIRED');
  if (typeof model !== 'string' || !/^[A-Za-z0-9._-]{1,120}$/.test(model)) throw new GoogleGenAiLiveAdapterError('GOOGLE_LIVE_MODEL_REQUIRED');
  if (!['string', 'function'].includes(typeof systemInstruction)) throw new GoogleGenAiLiveAdapterError('GOOGLE_LIVE_INSTRUCTION_REQUIRED');
  if (!Array.isArray(toolDeclarations)) throw new GoogleGenAiLiveAdapterError('GOOGLE_LIVE_TOOLS_INVALID');

  return async function open({ context, session, audio, callbacks } = {}) {
    if (!callbacks || ['onAudio', 'onInterruption', 'onTranscript', 'onToolCall', 'onError', 'onClose'].some(name => typeof callbacks[name] !== 'function')) {
      throw new GoogleGenAiLiveAdapterError('GOOGLE_LIVE_CALLBACKS_REQUIRED');
    }
    const instruction = typeof systemInstruction === 'function' ? systemInstruction({ context, session }) : systemInstruction;
    if (typeof instruction !== 'string' || !instruction.trim()) throw new GoogleGenAiLiveAdapterError('GOOGLE_LIVE_INSTRUCTION_REQUIRED');

    const config = {
      responseModalities: ['AUDIO'],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: instruction,
      // The SDK rewrites declarations in place; give it a private copy so the frozen originals stay intact.
      tools: [{ functionDeclarations: structuredClone(toolDeclarations) }],
    };
    if (voiceName) config.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName } } };

    let queue = Promise.resolve();
    let userText = '', modelText = '', failed = false, closed = false, provider = null;
    const run = step => { queue = queue.then(step).catch(() => {}); return queue; };
    const flushUser = async () => { if (userText) { const text = userText; userText = ''; await callbacks.onTranscript({ text, role: 'user', final: true }); } };
    const flushModel = async final => { if (modelText) { const text = modelText; modelText = ''; await callbacks.onTranscript({ text, role: 'model', final }); } };
    const fail = async () => { if (failed) return; failed = true; userText = ''; modelText = ''; await callbacks.onError(); try { provider?.close(); } catch {} };

    async function handle(message) {
      if (failed || !isPlainObject(message)) return;
      if (message.toolCall !== undefined) {
        const calls = message.toolCall?.functionCalls;
        if (!Array.isArray(calls) || !calls.length) return fail();
        for (const call of calls) {
          if (!isPlainObject(call) || typeof call.id !== 'string' || !call.id || call.id.length > 200 ||
              typeof call.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(call.name) ||
              (call.args !== undefined && (!isPlainObject(call.args) || !plainJson(call.args)))) return fail();
        }
        await flushUser(); await flushModel(true);
        for (const call of calls) await callbacks.onToolCall({ name: call.name, args: call.args ?? {}, toolCallId: call.id });
        return;
      }
      const content = message.serverContent;
      if (content === undefined) return;
      if (!isPlainObject(content)) return fail();
      if (typeof content.inputTranscription?.text === 'string') userText += content.inputTranscription.text;
      const output = typeof content.outputTranscription?.text === 'string' ? content.outputTranscription.text : '';
      const parts = Array.isArray(content.modelTurn?.parts) ? content.modelTurn.parts : [];
      if (output || parts.length) await flushUser();
      modelText += output;
      for (const part of parts) {
        const data = part?.inlineData?.data;
        if (typeof data === 'string' && data && !part.thought) await callbacks.onAudio({ data, mimeType: String(part.inlineData.mimeType || audio?.outputMimeType || 'audio/pcm;rate=24000') });
      }
      if (content.interrupted === true) { await flushModel(false); await callbacks.onInterruption(); }
      if (content.turnComplete === true) { await flushUser(); await flushModel(true); }
    }

    try {
      provider = await client.live.connect({
        model,
        config,
        callbacks: {
          onopen: () => {},
          // The SDK delivers class instances; reduce each message to plain JSON before validating it.
          onmessage: message => { let plain; try { plain = JSON.parse(JSON.stringify(message)); } catch { run(fail); return; } run(() => handle(plain)); },
          onerror: event => { reportProvider('onerror', event?.message ?? event?.error ?? event); run(fail); },
          onclose: event => { if (event?.code && event.code !== 1000) reportProvider('onclose', `${event.code} ${event.reason || ''}`); run(async () => { if (closed) return; closed = true; await callbacks.onClose(); }); },
        },
      });
    } catch (error) {
      reportProvider('connect', error);
      throw new GoogleGenAiLiveAdapterError('GEMINI_CONNECT_FAILED');
    }

    let closing = null;
    return {
      async sendAudio({ data, mimeType }) {
        if (failed || closed || closing) return;
        const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
        provider.sendRealtimeInput({ audio: { data: bytes.toString('base64'), mimeType: mimeType || audio?.inputMimeType || 'audio/pcm;rate=16000' } });
      },
      async sendText(text) {
        if (failed || closed || closing || typeof text !== 'string' || !text) return;
        provider.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true });
      },
      async sendToolResponse({ toolCallId, name, response }) {
        if (failed || closed || closing) return;
        provider.sendToolResponse({ functionResponses: [{ id: toolCallId, name, response }] });
      },
      close() {
        if (!closing) closing = (async () => {
          try { provider.sendRealtimeInput({ audioStreamEnd: true }); } catch {}
          try { provider.close(); } catch {}
          await queue;
        })();
        return closing;
      },
    };
  };
}
