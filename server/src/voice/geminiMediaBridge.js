import {
  VOICE_AUDIO_FORMATS,
  VoiceAudioCodecError,
  createPcm16le24kToMuLaw8kEncoder,
  decodeCanonicalBase64,
  decodeTwilioMediaPayload,
} from "./audioCodec.js";

const ACCOUNT_SID = /^AC[0-9a-fA-F]{32}$/;
const CALL_SID = /^CA[0-9a-fA-F]{32}$/;
const STREAM_SID = /^MZ[0-9a-fA-F]{32}$/;
const DECIMAL = /^(0|[1-9]\d{0,15})$/;
const TOOL_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const TOOL_CALL_ID = /^[A-Za-z0-9_.:-]{1,200}$/;
const CONTROL_CHARACTER = /[\0\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const FORBIDDEN_PROPERTY = new Set(["__proto__", "prototype", "constructor"]);

const DEFAULT_LIMITS = Object.freeze({
  maxRawMessageBytes: 32 * 1024,
  maxMediaPayloadBytes: 4 * 1024,
  maxGeminiAudioBytesPerMessage: 96 * 1024,
  maxQueuedMessageBytes: 256 * 1024,
  maxQueuedInputBytes: 128 * 1024,
  maxQueuedOutputBytes: 192 * 1024,
  maxSocketBufferedBytes: 256 * 1024,
  maxInboundMessagesPerSecond: 100,
  maxInboundMuLawBytesPerSecond: 16_000,
  maxOutboundPcmBytesPerSecond: 192_000,
  maxPendingMarks: 128,
  maxTranscriptBytes: 16 * 1024,
  maxToolJsonBytes: 32 * 1024,
  maxToolResultJsonBytes: 256 * 1024,
});

export class GeminiMediaBridgeError extends Error {
  constructor(code) {
    super("The live voice media session ended safely.");
    this.name = "GeminiMediaBridgeError";
    this.code = code;
  }
}

function bridgeError(code) {
  return new GeminiMediaBridgeError(code);
}

function isPlainObject(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor && "value" in descriptor && !descriptor.get && !descriptor.set);
  });
}

function assertClosed(value, allowed, required = allowed, code = "INVALID_PROVIDER_MESSAGE") {
  if (!isPlainObject(value)) throw bridgeError(code);
  const keys = Object.keys(value);
  if (
    keys.some((key) => !allowed.includes(key) || FORBIDDEN_PROPERTY.has(key)) ||
    required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw bridgeError(code);
  }
  return value;
}

function normalizeLimits(overrides) {
  if (overrides === undefined) return DEFAULT_LIMITS;
  assertClosed(overrides, Object.keys(DEFAULT_LIMITS), [], "INVALID_MEDIA_LIMITS");
  const result = { ...DEFAULT_LIMITS };
  for (const [key, value] of Object.entries(overrides)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw bridgeError("INVALID_MEDIA_LIMITS");
    result[key] = value;
  }
  return Object.freeze(result);
}

function normalizeContext(value) {
  if (!isPlainObject(value)) throw bridgeError("INVALID_CALL_CONTEXT");
  const ownerId = typeof value.ownerId === "string" ? value.ownerId.trim() : "";
  const accountSid = typeof value.accountSid === "string" ? value.accountSid.trim() : "";
  const callSid = typeof value.callSid === "string" ? value.callSid.trim() : "";
  if (
    ownerId.length === 0 ||
    ownerId.length > 200 ||
    !ACCOUNT_SID.test(accountSid) ||
    !CALL_SID.test(callSid)
  ) {
    throw bridgeError("INVALID_CALL_CONTEXT");
  }
  return Object.freeze({ ...value, ownerId, accountSid, callSid });
}

function normalizeDecimal(value, code) {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw bridgeError(code);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw bridgeError(code);
  return result;
}

function createWindowBudget(limit, now) {
  let windowStartedAt = null;
  let used = 0;
  let lastNow = null;
  return Object.freeze({
    consume(amount, code) {
      if (!Number.isSafeInteger(amount) || amount < 0) throw bridgeError(code);
      const timestamp = now();
      if (!Number.isFinite(timestamp) || (lastNow !== null && timestamp < lastNow)) {
        throw bridgeError("INVALID_MEDIA_CLOCK");
      }
      lastNow = timestamp;
      if (windowStartedAt === null || timestamp - windowStartedAt >= 1_000) {
        windowStartedAt = timestamp;
        used = 0;
      }
      used += amount;
      if (used > limit) throw bridgeError(code);
    },
  });
}

function rawMessage(value, isBinary, maxBytes) {
  if (isBinary === true) throw bridgeError("BINARY_TWILIO_MESSAGE_REJECTED");
  let text;
  if (typeof value === "string") text = value;
  else if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    text = Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("utf8");
  } else {
    throw bridgeError("INVALID_TWILIO_MESSAGE");
  }
  const byteLength = Buffer.byteLength(text, "utf8");
  if (byteLength === 0 || byteLength > maxBytes) throw bridgeError("TWILIO_MESSAGE_TOO_LARGE");
  return { text, byteLength };
}

function parseMessage(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw bridgeError("INVALID_TWILIO_JSON");
  }
}

function normalizePcmData(value, maxBytes) {
  let output;
  if (Buffer.isBuffer(value)) output = value;
  else if (value instanceof Uint8Array) {
    output = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  } else if (typeof value === "string") {
    output = decodeCanonicalBase64(value, { maxDecodedBytes: maxBytes });
  } else {
    throw bridgeError("INVALID_GEMINI_AUDIO");
  }
  if (output.length === 0 || output.length > maxBytes || output.length % 2 !== 0) {
    throw bridgeError("INVALID_GEMINI_AUDIO");
  }
  return output;
}

function validateJsonValue(value, { maxBytes, code, maxNodes = 2000 }) {
  let nodes = 0;
  function visit(current, depth) {
    nodes += 1;
    if (nodes > maxNodes || depth > 12) throw bridgeError(code);
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean" ||
      (typeof current === "number" && Number.isFinite(current))
    ) {
      return;
    }
    if (Array.isArray(current)) {
      for (const entry of current) visit(entry, depth + 1);
      return;
    }
    if (!isPlainObject(current)) throw bridgeError(code);
    for (const key of Object.keys(current)) {
      if (FORBIDDEN_PROPERTY.has(key)) throw bridgeError(code);
      visit(current[key], depth + 1);
    }
  }
  visit(value, 0);
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw bridgeError(code);
  }
  if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > maxBytes) {
    throw bridgeError(code);
  }
  return value;
}

function normalizeTranscript(value, maxBytes) {
  assertClosed(
    value,
    ["text", "role", "final"],
    ["text", "role", "final"],
    "INVALID_GEMINI_TRANSCRIPT",
  );
  if (
    typeof value.text !== "string" ||
    value.text.length === 0 ||
    Buffer.byteLength(value.text, "utf8") > maxBytes ||
    CONTROL_CHARACTER.test(value.text) ||
    typeof value.final !== "boolean"
  ) {
    throw bridgeError("INVALID_GEMINI_TRANSCRIPT");
  }
  const role = value.role === "user"
    ? "caller"
    : value.role === "model"
      ? "assistant"
      : value.role;
  if (role !== "caller" && role !== "assistant") {
    throw bridgeError("INVALID_GEMINI_TRANSCRIPT");
  }
  return Object.freeze({ text: value.text, role, final: value.final });
}

function normalizeToolCall(value, maxBytes) {
  assertClosed(
    value,
    ["name", "args", "toolCallId"],
    ["name", "args", "toolCallId"],
    "INVALID_GEMINI_TOOL_CALL",
  );
  if (!TOOL_NAME.test(value.name) || !TOOL_CALL_ID.test(value.toolCallId)) {
    throw bridgeError("INVALID_GEMINI_TOOL_CALL");
  }
  if (!isPlainObject(value.args)) throw bridgeError("INVALID_GEMINI_TOOL_CALL");
  validateJsonValue(value.args, { maxBytes, code: "INVALID_GEMINI_TOOL_CALL" });
  return Object.freeze({ name: value.name, args: value.args, toolCallId: value.toolCallId });
}

function validateGeminiSession(value) {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.sendAudio !== "function" ||
    typeof value.sendToolResponse !== "function" ||
    typeof value.close !== "function" ||
    (value.cancelOutput !== undefined && typeof value.cancelOutput !== "function")
  ) {
    throw bridgeError("INVALID_GEMINI_SESSION_ADAPTER");
  }
  return value;
}

function safeSocketState(socket) {
  return socket.readyState === undefined || socket.readyState === 1;
}

/**
 * Creates the media-only Twilio <-> Gemini Live bridge. Provider SDK details
 * remain behind `openGeminiSession`, so this module can be tested without a
 * network or SDK. Audio is transient and is never persisted by this bridge.
 *
 * Adapter contract:
 *   openGeminiSession({ context, session, audio, callbacks }) -> {
 *     sendAudio({ data: Buffer, mimeType }),
 *     sendToolResponse({ toolCallId, name, response }),
 *     cancelOutput?(), close({ reason })
 *   }
 */
export function createGeminiMediaBridge({
  openGeminiSession,
  onTranscript,
  onToolCall,
  onSessionEnd = async () => {},
  now = Date.now,
  limits: limitOverrides,
} = {}) {
  if (typeof openGeminiSession !== "function") throw bridgeError("GEMINI_SESSION_OPENER_REQUIRED");
  if (typeof onTranscript !== "function") throw bridgeError("TRANSCRIPT_CALLBACK_REQUIRED");
  if (typeof onToolCall !== "function") throw bridgeError("TOOL_CALLBACK_REQUIRED");
  if (typeof onSessionEnd !== "function") throw bridgeError("SESSION_END_CALLBACK_INVALID");
  if (typeof now !== "function") throw bridgeError("MEDIA_CLOCK_REQUIRED");
  const limits = normalizeLimits(limitOverrides);

  async function startMediaSession({ socket, context: rawContext, session } = {}) {
    if (
      !socket ||
      typeof socket.on !== "function" ||
      typeof socket.send !== "function" ||
      (typeof socket.close !== "function" && typeof socket.terminate !== "function")
    ) {
      throw bridgeError("INVALID_MEDIA_SOCKET");
    }
    const context = normalizeContext(rawContext);
    const encoder = createPcm16le24kToMuLaw8kEncoder({
      maxInputBytes: limits.maxGeminiAudioBytesPerMessage,
    });
    const inboundMessageBudget = createWindowBudget(limits.maxInboundMessagesPerSecond, now);
    const inboundAudioBudget = createWindowBudget(limits.maxInboundMuLawBytesPerSecond, now);
    const outboundAudioBudget = createWindowBudget(limits.maxOutboundPcmBytesPerSecond, now);

    let state = "awaiting_connected";
    let streamSid = null;
    let expectedSequence = 1;
    let expectedMediaChunk = 1;
    let lastMediaTimestamp = -1;
    let gemini = null;
    let ended = false;
    let finishPromise = null;
    let queuedMessageBytes = 0;
    let queuedInputBytes = 0;
    let queuedOutputBytes = 0;
    let outputEpoch = 0;
    let markCounter = 0;
    const pendingMarks = new Set();
    let incomingTail = Promise.resolve();
    let inputTail = Promise.resolve();
    let outputTail = Promise.resolve();
    let transcriptTail = Promise.resolve();
    let toolTail = Promise.resolve();
    let interruptionTail = Promise.resolve();
    let resolveDone;
    const done = new Promise((resolve) => {
      resolveDone = resolve;
    });

    function removeListeners() {
      const remove = typeof socket.off === "function"
        ? socket.off.bind(socket)
        : typeof socket.removeListener === "function"
          ? socket.removeListener.bind(socket)
          : null;
      if (!remove) return;
      remove("message", handleSocketMessage);
      remove("close", handleSocketClose);
      remove("error", handleSocketError);
    }

    function closeSocket(code, reason) {
      try {
        if (typeof socket.close === "function") socket.close(code, reason);
        else socket.terminate();
      } catch {
        try {
          socket.terminate?.();
        } catch {
          // The session is already marked ended; a failed transport close is final.
        }
      }
    }

    function finish(outcome, { closeTransport = false } = {}) {
      if (finishPromise) return finishPromise;
      ended = true;
      state = outcome.status;
      outputEpoch += 1;
      encoder.reset();
      removeListeners();
      // Defer cleanup by one microtask so `finishPromise` is assigned before a
      // provider close callback can synchronously re-enter `finish`.
      finishPromise = Promise.resolve().then(async () => {
        if (gemini) {
          try {
            await gemini.close({ reason: outcome.reason });
          } catch {
            // A provider close failure cannot keep accepting media.
          }
        }
        if (closeTransport) {
          closeSocket(
            outcome.status === "failed" ? 1008 : 1000,
            outcome.status === "failed" ? "Voice media unavailable" : "Voice session ended",
          );
        }
        try {
          await onSessionEnd({ context, session, streamSid, outcome });
        } catch {
          // Session-end telemetry is best effort after media has already stopped.
        }
        resolveDone(outcome);
        return outcome;
      });
      return finishPromise;
    }

    function abort(error) {
      const code = error instanceof GeminiMediaBridgeError
        ? error.code
        : error instanceof VoiceAudioCodecError
          ? error.code
          : "VOICE_MEDIA_FAILURE";
      return finish(Object.freeze({ status: "failed", reason: code }), { closeTransport: true });
    }

    function sendSocketMessage(message) {
      if (ended || !safeSocketState(socket)) return Promise.reject(bridgeError("MEDIA_SOCKET_CLOSED"));
      const bufferedAmount = socket.bufferedAmount ?? 0;
      if (!Number.isFinite(bufferedAmount) || bufferedAmount < 0) {
        return Promise.reject(bridgeError("INVALID_SOCKET_BACKPRESSURE"));
      }
      if (bufferedAmount > limits.maxSocketBufferedBytes) {
        return Promise.reject(bridgeError("SOCKET_BACKPRESSURE_LIMIT"));
      }
      const payload = JSON.stringify(message);
      return new Promise((resolve, reject) => {
        try {
          if (socket.send.length >= 2) {
            socket.send(payload, (error) => (error ? reject(error) : resolve()));
          } else {
            socket.send(payload);
            resolve();
          }
        } catch (error) {
          reject(error);
        }
      });
    }

    function checkSequence(message) {
      const sequence = normalizeDecimal(message.sequenceNumber, "INVALID_TWILIO_SEQUENCE");
      if (sequence !== expectedSequence) throw bridgeError("TWILIO_SEQUENCE_MISMATCH");
      expectedSequence += 1;
    }

    function callbacks() {
      return Object.freeze({
        onAudio(value) {
          let pcm;
          try {
            assertClosed(value, ["data", "mimeType"], ["data", "mimeType"], "INVALID_GEMINI_AUDIO");
            if (value.mimeType !== VOICE_AUDIO_FORMATS.geminiOutput.mimeType) {
              throw bridgeError("INVALID_GEMINI_AUDIO_FORMAT");
            }
            pcm = normalizePcmData(value.data, limits.maxGeminiAudioBytesPerMessage);
            outboundAudioBudget.consume(pcm.length, "GEMINI_AUDIO_RATE_LIMIT");
            queuedOutputBytes += pcm.length;
            if (queuedOutputBytes > limits.maxQueuedOutputBytes) {
              throw bridgeError("OUTPUT_AUDIO_BACKPRESSURE_LIMIT");
            }
          } catch (error) {
            void abort(error);
            return Promise.resolve();
          }
          const epoch = outputEpoch;
          const task = outputTail.then(async () => {
            try {
              if (ended || epoch !== outputEpoch) return;
              const muLaw = encoder.push(pcm);
              if (muLaw.length === 0 || ended || epoch !== outputEpoch) return;
              await sendSocketMessage({
                event: "media",
                streamSid,
                media: { payload: muLaw.toString("base64") },
              });
              if (ended || epoch !== outputEpoch) return;
              if (pendingMarks.size >= limits.maxPendingMarks) {
                throw bridgeError("PENDING_MARK_LIMIT");
              }
              markCounter += 1;
              const name = `otc-${markCounter}`;
              pendingMarks.add(name);
              try {
                await sendSocketMessage({ event: "mark", streamSid, mark: { name } });
              } catch (error) {
                pendingMarks.delete(name);
                throw error;
              }
            } finally {
              queuedOutputBytes -= pcm.length;
            }
          });
          outputTail = task.catch((error) => abort(error));
          return outputTail;
        },

        onInterruption() {
          if (ended) return Promise.resolve();
          outputEpoch += 1;
          encoder.reset();
          const task = interruptionTail.then(async () => {
            await sendSocketMessage({ event: "clear", streamSid });
            if (typeof gemini?.cancelOutput === "function") await gemini.cancelOutput();
          });
          interruptionTail = task.catch((error) => abort(error));
          return interruptionTail;
        },

        onTranscript(value) {
          let transcript;
          try {
            transcript = normalizeTranscript(value, limits.maxTranscriptBytes);
          } catch (error) {
            void abort(error);
            return Promise.resolve();
          }
          const task = transcriptTail.then(() => {
            if (ended) return undefined;
            return onTranscript({ context, session, streamSid, transcript });
          });
          transcriptTail = task.catch((error) => abort(
            error instanceof GeminiMediaBridgeError
              ? error
              : bridgeError("TRANSCRIPT_CALLBACK_FAILED"),
          ));
          return transcriptTail;
        },

        onToolCall(value) {
          let toolCall;
          try {
            toolCall = normalizeToolCall(value, limits.maxToolJsonBytes);
          } catch (error) {
            void abort(error);
            return Promise.resolve();
          }
          const task = toolTail.then(async () => {
            if (ended) return;
            const response = await onToolCall({ context, session, streamSid, toolCall });
            validateJsonValue(response, {
              maxBytes: limits.maxToolResultJsonBytes,
              maxNodes: 20000,
              code: "INVALID_TOOL_RESPONSE",
            });
            await gemini.sendToolResponse({
              toolCallId: toolCall.toolCallId,
              name: toolCall.name,
              response,
            });
          });
          toolTail = task.catch((error) => abort(
            error instanceof GeminiMediaBridgeError
              ? error
              : bridgeError("TOOL_CALLBACK_FAILED"),
          ));
          return toolTail;
        },

        onError() {
          if (ended) return Promise.resolve();
          return abort(bridgeError("GEMINI_SESSION_ERROR"));
        },

        onClose() {
          if (ended) return Promise.resolve();
          return finish(Object.freeze({ status: "closed", reason: "GEMINI_SESSION_CLOSED" }), {
            closeTransport: true,
          });
        },
      });
    }

    async function processConnected(message) {
      assertClosed(
        message,
        ["event", "protocol", "version"],
        ["event", "protocol", "version"],
      );
      if (
        state !== "awaiting_connected" ||
        message.protocol !== "Call" ||
        message.version !== "1.0.0"
      ) {
        throw bridgeError("INVALID_TWILIO_CONNECTED_EVENT");
      }
      state = "awaiting_start";
    }

    async function processStart(message) {
      assertClosed(message, ["event", "sequenceNumber", "streamSid", "start"]);
      if (state !== "awaiting_start") throw bridgeError("UNEXPECTED_TWILIO_START");
      checkSequence(message);
      if (!STREAM_SID.test(message.streamSid)) throw bridgeError("INVALID_TWILIO_STREAM_SID");
      const start = assertClosed(
        message.start,
        ["accountSid", "callSid", "streamSid", "tracks", "mediaFormat", "customParameters"],
        ["accountSid", "callSid", "streamSid", "tracks", "mediaFormat"],
      );
      if (
        start.accountSid !== context.accountSid ||
        start.callSid !== context.callSid ||
        start.streamSid !== message.streamSid ||
        !Array.isArray(start.tracks) ||
        start.tracks.length !== 1 ||
        start.tracks[0] !== "inbound"
      ) {
        throw bridgeError("TWILIO_START_BINDING_MISMATCH");
      }
      const mediaFormat = assertClosed(
        start.mediaFormat,
        ["encoding", "sampleRate", "channels"],
        ["encoding", "sampleRate", "channels"],
      );
      if (
        mediaFormat.encoding !== VOICE_AUDIO_FORMATS.twilio.encoding ||
        mediaFormat.sampleRate !== VOICE_AUDIO_FORMATS.twilio.sampleRateHz ||
        mediaFormat.channels !== VOICE_AUDIO_FORMATS.twilio.channels
      ) {
        throw bridgeError("UNSUPPORTED_TWILIO_MEDIA_FORMAT");
      }
      if (start.customParameters !== undefined) {
        assertClosed(start.customParameters, Object.keys(start.customParameters), []);
        for (const [key, value] of Object.entries(start.customParameters)) {
          if (
            FORBIDDEN_PROPERTY.has(key) ||
            key.length > 100 ||
            typeof value !== "string" ||
            Buffer.byteLength(value, "utf8") > 1_000 ||
            CONTROL_CHARACTER.test(value)
          ) {
            throw bridgeError("INVALID_TWILIO_CUSTOM_PARAMETERS");
          }
        }
      }

      streamSid = message.streamSid;
      state = "connecting";
      const opened = await openGeminiSession({
        context,
        session,
        audio: Object.freeze({
          inputMimeType: VOICE_AUDIO_FORMATS.geminiInput.mimeType,
          outputMimeType: VOICE_AUDIO_FORMATS.geminiOutput.mimeType,
        }),
        callbacks: callbacks(),
      });
      const validated = validateGeminiSession(opened);
      if (ended) {
        try {
          await validated.close({ reason: "SESSION_ENDED_DURING_CONNECT" });
        } catch {
          // The transport already ended; do not resurrect or retain the session.
        }
        return;
      }
      gemini = validated;
      state = "active";
    }

    async function processMedia(message) {
      assertClosed(message, ["event", "sequenceNumber", "streamSid", "media"]);
      if (state !== "active") throw bridgeError("MEDIA_BEFORE_ACTIVE_START");
      checkSequence(message);
      if (message.streamSid !== streamSid) throw bridgeError("TWILIO_STREAM_SID_MISMATCH");
      const media = assertClosed(
        message.media,
        ["track", "chunk", "timestamp", "payload"],
        ["track", "chunk", "timestamp", "payload"],
      );
      if (media.track !== "inbound") throw bridgeError("UNEXPECTED_TWILIO_MEDIA_TRACK");
      const chunk = normalizeDecimal(media.chunk, "INVALID_TWILIO_MEDIA_CHUNK");
      const timestamp = normalizeDecimal(media.timestamp, "INVALID_TWILIO_MEDIA_TIMESTAMP");
      if (chunk !== expectedMediaChunk || timestamp < lastMediaTimestamp) {
        throw bridgeError("TWILIO_MEDIA_ORDER_MISMATCH");
      }
      expectedMediaChunk += 1;
      lastMediaTimestamp = timestamp;
      const muLaw = decodeCanonicalBase64(media.payload, {
        maxDecodedBytes: limits.maxMediaPayloadBytes,
      });
      inboundMessageBudget.consume(1, "TWILIO_MESSAGE_RATE_LIMIT");
      inboundAudioBudget.consume(muLaw.length, "TWILIO_AUDIO_RATE_LIMIT");
      const pcm = decodeTwilioMediaPayload(media.payload, {
        maxInputBytes: limits.maxMediaPayloadBytes,
      });
      queuedInputBytes += pcm.length;
      if (queuedInputBytes > limits.maxQueuedInputBytes) {
        queuedInputBytes -= pcm.length;
        throw bridgeError("INPUT_AUDIO_BACKPRESSURE_LIMIT");
      }
      const task = inputTail.then(async () => {
        try {
          if (ended) return;
          await gemini.sendAudio({
            data: pcm,
            mimeType: VOICE_AUDIO_FORMATS.geminiInput.mimeType,
          });
        } finally {
          queuedInputBytes -= pcm.length;
        }
      });
      inputTail = task.catch((error) => abort(error));
    }

    async function processMark(message) {
      assertClosed(message, ["event", "sequenceNumber", "streamSid", "mark"]);
      if (state !== "active") throw bridgeError("MARK_BEFORE_ACTIVE_START");
      checkSequence(message);
      if (message.streamSid !== streamSid) throw bridgeError("TWILIO_STREAM_SID_MISMATCH");
      const mark = assertClosed(message.mark, ["name"], ["name"]);
      if (typeof mark.name !== "string" || !pendingMarks.delete(mark.name)) {
        throw bridgeError("UNKNOWN_TWILIO_MARK");
      }
    }

    async function processStop(message) {
      assertClosed(message, ["event", "sequenceNumber", "streamSid", "stop"]);
      if (state !== "active") throw bridgeError("STOP_BEFORE_ACTIVE_START");
      checkSequence(message);
      if (message.streamSid !== streamSid) throw bridgeError("TWILIO_STREAM_SID_MISMATCH");
      const stop = assertClosed(message.stop, ["accountSid", "callSid"], ["accountSid", "callSid"]);
      if (stop.accountSid !== context.accountSid || stop.callSid !== context.callSid) {
        throw bridgeError("TWILIO_STOP_BINDING_MISMATCH");
      }
      await finish(Object.freeze({ status: "stopped", reason: "TWILIO_STOP" }));
    }

    async function processMessage(text) {
      if (ended) return;
      const message = parseMessage(text);
      if (!isPlainObject(message) || typeof message.event !== "string") {
        throw bridgeError("INVALID_TWILIO_MESSAGE");
      }
      if (message.event === "connected") return processConnected(message);
      if (message.event === "start") return processStart(message);
      if (message.event === "media") return processMedia(message);
      if (message.event === "mark") return processMark(message);
      if (message.event === "stop") return processStop(message);
      throw bridgeError("UNSUPPORTED_TWILIO_EVENT");
    }

    function handleSocketMessage(value, isBinary = false) {
      if (ended) return;
      let normalized;
      try {
        normalized = rawMessage(value, isBinary, limits.maxRawMessageBytes);
        queuedMessageBytes += normalized.byteLength;
        if (queuedMessageBytes > limits.maxQueuedMessageBytes) {
          queuedMessageBytes -= normalized.byteLength;
          throw bridgeError("TWILIO_MESSAGE_BACKPRESSURE_LIMIT");
        }
      } catch (error) {
        void abort(error);
        return;
      }
      const task = incomingTail.then(async () => {
        try {
          await processMessage(normalized.text);
        } finally {
          queuedMessageBytes -= normalized.byteLength;
        }
      });
      incomingTail = task.catch((error) => abort(error));
    }

    function handleSocketClose() {
      void finish(Object.freeze({ status: "closed", reason: "TWILIO_SOCKET_CLOSED" }));
    }

    function handleSocketError() {
      void abort(bridgeError("TWILIO_SOCKET_ERROR"));
    }

    socket.on("message", handleSocketMessage);
    socket.on("close", handleSocketClose);
    socket.on("error", handleSocketError);

    const controller = Object.freeze({
      get state() {
        return state;
      },
      get streamSid() {
        return streamSid;
      },
      done,
      close() {
        return finish(Object.freeze({ status: "closed", reason: "APPLICATION_CLOSE" }), {
          closeTransport: true,
        });
      },
      async whenIdle() {
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const snapshot = [
            incomingTail,
            inputTail,
            outputTail,
            transcriptTail,
            toolTail,
            interruptionTail,
          ];
          await Promise.allSettled(snapshot);
          if (
            snapshot[0] === incomingTail &&
            snapshot[1] === inputTail &&
            snapshot[2] === outputTail &&
            snapshot[3] === transcriptTail &&
            snapshot[4] === toolTail &&
            snapshot[5] === interruptionTail
          ) {
            break;
          }
        }
        if (finishPromise) await finishPromise;
      },
    });

    return Object.freeze({ status: "started", controller });
  }

  return Object.freeze({ startMediaSession });
}
