import { EventEmitter } from "node:events";
import test from "node:test";
import assert from "node:assert/strict";

import { encodeMuLawSample } from "../server/src/voice/audioCodec.js";
import {
  GeminiMediaBridgeError,
  createGeminiMediaBridge,
} from "../server/src/voice/geminiMediaBridge.js";

const ACCOUNT_SID = `AC${"a".repeat(32)}`;
const CALL_SID = `CA${"b".repeat(32)}`;
const OTHER_CALL_SID = `CA${"c".repeat(32)}`;
const STREAM_SID = `MZ${"d".repeat(32)}`;

const hasCode = (code) => (error) => error instanceof GeminiMediaBridgeError && error.code === code;

function pcm(samples) {
  const output = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => output.writeInt16LE(sample, index * 2));
  return output;
}

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.bufferedAmount = 0;
    this.sent = [];
    this.closeCalls = [];
  }

  send(value, callback) {
    this.sent.push(JSON.parse(value));
    callback?.();
  }

  close(code, reason) {
    this.readyState = 3;
    this.closeCalls.push({ code, reason });
  }
}

function connected() {
  return { event: "connected", protocol: "Call", version: "1.0.0" };
}

function start(overrides = {}) {
  return {
    event: "start",
    sequenceNumber: "1",
    streamSid: STREAM_SID,
    start: {
      accountSid: ACCOUNT_SID,
      callSid: CALL_SID,
      streamSid: STREAM_SID,
      tracks: ["inbound"],
      mediaFormat: {
        encoding: "audio/x-mulaw",
        sampleRate: 8_000,
        channels: 1,
      },
      ...overrides,
    },
  };
}

function media(sequenceNumber, chunk, payload = Buffer.alloc(160, 0xff).toString("base64")) {
  return {
    event: "media",
    sequenceNumber: String(sequenceNumber),
    streamSid: STREAM_SID,
    media: {
      track: "inbound",
      chunk: String(chunk),
      timestamp: String((chunk - 1) * 20),
      payload,
    },
  };
}

function mark(sequenceNumber, name) {
  return {
    event: "mark",
    sequenceNumber: String(sequenceNumber),
    streamSid: STREAM_SID,
    mark: { name },
  };
}

function stop(sequenceNumber) {
  return {
    event: "stop",
    sequenceNumber: String(sequenceNumber),
    streamSid: STREAM_SID,
    stop: { accountSid: ACCOUNT_SID, callSid: CALL_SID },
  };
}

function emit(socket, value, isBinary = false) {
  socket.emit("message", JSON.stringify(value), isBinary);
}

async function createHarness(overrides = {}) {
  const socket = new FakeSocket();
  const events = {
    opens: [],
    inputAudio: [],
    toolResponses: [],
    cancelOutput: 0,
    providerCloses: [],
    transcripts: [],
    toolCalls: [],
    sessionEnds: [],
  };
  let providerCallbacks;
  const provider = {
    async sendAudio(value) {
      events.inputAudio.push(value);
      return overrides.sendAudio?.(value);
    },
    async sendToolResponse(value) {
      events.toolResponses.push(value);
      return overrides.sendToolResponse?.(value);
    },
    async cancelOutput() {
      events.cancelOutput += 1;
    },
    async close(value) {
      events.providerCloses.push(value);
      return overrides.close?.(value, providerCallbacks);
    },
  };
  const bridge = createGeminiMediaBridge({
    now: overrides.now ?? (() => 10_000),
    limits: overrides.limits,
    openGeminiSession: async (value) => {
      events.opens.push(value);
      providerCallbacks = value.callbacks;
      if (overrides.openGeminiSession) return overrides.openGeminiSession(value, provider);
      return provider;
    },
    onTranscript: async (value) => {
      events.transcripts.push(value);
      return overrides.onTranscript?.(value);
    },
    onToolCall: async (value) => {
      events.toolCalls.push(value);
      if (overrides.onToolCall) return overrides.onToolCall(value);
      return { ok: true, handle: "opaque-result" };
    },
    onSessionEnd: async (value) => {
      events.sessionEnds.push(value);
    },
  });
  const result = await bridge.startMediaSession({
    socket,
    context: {
      ownerId: "owner-a",
      accountSid: ACCOUNT_SID,
      callSid: CALL_SID,
      from: "+19025550100",
      to: "+19025550101",
    },
    session: { callRecordId: "call-a" },
  });
  return {
    socket,
    events,
    provider,
    result,
    get callbacks() {
      return providerCallbacks;
    },
  };
}

async function begin(harness) {
  emit(harness.socket, connected());
  emit(harness.socket, start());
  await harness.result.controller.whenIdle();
  assert.equal(harness.result.controller.state, "active");
  assert.equal(harness.events.opens.length, 1);
}

test("bridge construction requires explicit transcript and tool boundaries", () => {
  assert.throws(
    () => createGeminiMediaBridge({
      openGeminiSession: async () => ({}),
      onToolCall: async () => ({}),
    }),
    hasCode("TRANSCRIPT_CALLBACK_REQUIRED"),
  );
  assert.throws(
    () => createGeminiMediaBridge({
      openGeminiSession: async () => ({}),
      onTranscript: async () => {},
    }),
    hasCode("TOOL_CALLBACK_REQUIRED"),
  );
});

test("valid Twilio media is identity-bound, converted to PCM16 16 kHz, and closes on stop", async () => {
  const harness = await createHarness();
  await begin(harness);
  assert.deepEqual(harness.events.opens[0].audio, {
    inputMimeType: "audio/pcm;rate=16000",
    outputMimeType: "audio/pcm;rate=24000",
  });

  emit(harness.socket, media(2, 1));
  await harness.result.controller.whenIdle();
  assert.equal(harness.events.inputAudio.length, 1);
  assert.equal(harness.events.inputAudio[0].mimeType, "audio/pcm;rate=16000");
  assert.equal(harness.events.inputAudio[0].data.length, 640);
  assert.equal(harness.events.inputAudio[0].data.every((value) => value === 0), true);

  emit(harness.socket, stop(3));
  await harness.result.controller.whenIdle();
  assert.deepEqual(await harness.result.controller.done, {
    status: "stopped",
    reason: "TWILIO_STOP",
  });
  assert.deepEqual(harness.events.providerCloses, [{ reason: "TWILIO_STOP" }]);
  assert.equal(harness.socket.closeCalls.length, 0);
  assert.equal(harness.events.sessionEnds.length, 1);
});

test("Gemini PCM16 24 kHz audio becomes Twilio media plus an acknowledged mark", async () => {
  const harness = await createHarness();
  await begin(harness);
  const outputPcm = pcm(Array.from({ length: 480 }, () => 1_000));
  await harness.callbacks.onAudio({
    data: outputPcm.toString("base64"),
    mimeType: "audio/pcm;rate=24000",
  });
  await harness.result.controller.whenIdle();

  assert.equal(harness.socket.sent.length, 2);
  assert.equal(harness.socket.sent[0].event, "media");
  assert.equal(harness.socket.sent[0].streamSid, STREAM_SID);
  const wireAudio = Buffer.from(harness.socket.sent[0].media.payload, "base64");
  assert.equal(wireAudio.length, 160);
  assert.equal(wireAudio.every((value) => value === encodeMuLawSample(1_000)), true);
  assert.deepEqual(harness.socket.sent[1], {
    event: "mark",
    streamSid: STREAM_SID,
    mark: { name: "otc-1" },
  });

  emit(harness.socket, mark(2, "otc-1"));
  emit(harness.socket, stop(3));
  await harness.result.controller.whenIdle();
  assert.equal((await harness.result.controller.done).status, "stopped");
});

test("Gemini interruption clears Twilio immediately and discards already queued output", async () => {
  const harness = await createHarness();
  await begin(harness);
  const outputPcm = pcm(Array.from({ length: 480 }, () => 2_000));

  const first = harness.callbacks.onAudio({ data: outputPcm, mimeType: "audio/pcm;rate=24000" });
  const second = harness.callbacks.onAudio({ data: outputPcm, mimeType: "audio/pcm;rate=24000" });
  const interrupted = harness.callbacks.onInterruption();
  await Promise.all([first, second, interrupted]);
  await harness.result.controller.whenIdle();
  assert.deepEqual(harness.socket.sent, [{ event: "clear", streamSid: STREAM_SID }]);
  assert.equal(harness.events.cancelOutput, 1);

  await harness.callbacks.onAudio({ data: outputPcm, mimeType: "audio/pcm;rate=24000" });
  await harness.result.controller.whenIdle();
  assert.deepEqual(harness.socket.sent.map((value) => value.event), ["clear", "media", "mark"]);
  await harness.result.controller.close();
});

test("validated transcripts and tool calls cross only their injected callback interfaces", async () => {
  const harness = await createHarness({
    onToolCall: async ({ toolCall }) => ({
      ok: true,
      bookingHandle: `result-for-${toolCall.args.slot}`,
    }),
  });
  await begin(harness);

  await harness.callbacks.onTranscript({ text: "Tuesday works.", role: "user", final: true });
  await harness.callbacks.onTranscript({ text: "I can book that.", role: "model", final: true });
  await harness.callbacks.onToolCall({
    name: "confirmAppointment",
    args: { slot: "opaque-slot" },
    toolCallId: "tool-call-1",
  });
  await harness.result.controller.whenIdle();

  assert.deepEqual(
    harness.events.transcripts.map((entry) => entry.transcript),
    [
      { text: "Tuesday works.", role: "caller", final: true },
      { text: "I can book that.", role: "assistant", final: true },
    ],
  );
  assert.equal(harness.events.toolCalls[0].context.ownerId, "owner-a");
  assert.deepEqual(harness.events.toolResponses, [{
    toolCallId: "tool-call-1",
    name: "confirmAppointment",
    response: { ok: true, bookingHandle: "result-for-opaque-slot" },
  }]);
  await harness.result.controller.close();
});

test("forged call identity in the Twilio start event fails before Gemini opens", async () => {
  const harness = await createHarness();
  emit(harness.socket, connected());
  emit(harness.socket, start({ callSid: OTHER_CALL_SID }));
  const outcome = await harness.result.controller.done;
  assert.deepEqual(outcome, { status: "failed", reason: "TWILIO_START_BINDING_MISMATCH" });
  assert.equal(harness.events.opens.length, 0);
  assert.deepEqual(harness.socket.closeCalls, [{ code: 1008, reason: "Voice media unavailable" }]);
});

test("a socket close during Gemini connection cannot leak or resurrect the provider session", async () => {
  let releaseOpen;
  const harness = await createHarness({
    openGeminiSession: async (_value, provider) => {
      await new Promise((resolve) => {
        releaseOpen = resolve;
      });
      return provider;
    },
  });
  emit(harness.socket, connected());
  emit(harness.socket, start());
  while (harness.events.opens.length === 0) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  harness.socket.emit("close");
  assert.deepEqual(await harness.result.controller.done, {
    status: "closed",
    reason: "TWILIO_SOCKET_CLOSED",
  });
  releaseOpen();
  await harness.result.controller.whenIdle();
  assert.deepEqual(harness.events.providerCloses, [{ reason: "SESSION_ENDED_DURING_CONNECT" }]);
  assert.equal(harness.result.controller.state, "closed");
});

test("a provider close callback during application shutdown cannot recurse or deadlock", async () => {
  const harness = await createHarness({
    close: async (_value, callbacks) => callbacks.onClose(),
  });
  await begin(harness);
  const outcome = await harness.result.controller.close();
  assert.deepEqual(outcome, { status: "closed", reason: "APPLICATION_CLOSE" });
  assert.equal(harness.events.providerCloses.length, 1);
  assert.equal(harness.events.sessionEnds.length, 1);
});

test("out-of-order, unknown-mark, binary, and malformed audio events fail closed", async (t) => {
  await t.test("sequence gap", async () => {
    const harness = await createHarness();
    await begin(harness);
    emit(harness.socket, media(3, 1));
    assert.equal((await harness.result.controller.done).reason, "TWILIO_SEQUENCE_MISMATCH");
  });

  await t.test("unknown mark", async () => {
    const harness = await createHarness();
    await begin(harness);
    emit(harness.socket, mark(2, "attacker-mark"));
    assert.equal((await harness.result.controller.done).reason, "UNKNOWN_TWILIO_MARK");
  });

  await t.test("binary event", async () => {
    const harness = await createHarness();
    harness.socket.emit("message", Buffer.from("binary"), true);
    assert.equal((await harness.result.controller.done).reason, "BINARY_TWILIO_MESSAGE_REJECTED");
  });

  await t.test("non-canonical media base64", async () => {
    const harness = await createHarness();
    await begin(harness);
    emit(harness.socket, media(2, 1, "_w=="));
    assert.equal((await harness.result.controller.done).reason, "INVALID_AUDIO_BASE64");
  });
});

test("payload rate, queue, and socket backpressure limits terminate instead of buffering unboundedly", async (t) => {
  await t.test("inbound byte rate", async () => {
    const harness = await createHarness({
      limits: { maxInboundMuLawBytesPerSecond: 200 },
    });
    await begin(harness);
    emit(harness.socket, media(2, 1));
    emit(harness.socket, media(3, 2));
    assert.equal((await harness.result.controller.done).reason, "TWILIO_AUDIO_RATE_LIMIT");
  });

  await t.test("socket buffered amount", async () => {
    const harness = await createHarness({ limits: { maxSocketBufferedBytes: 10 } });
    await begin(harness);
    harness.socket.bufferedAmount = 11;
    await harness.callbacks.onAudio({
      data: pcm([100, 100, 100]),
      mimeType: "audio/pcm;rate=24000",
    });
    assert.equal((await harness.result.controller.done).reason, "SOCKET_BACKPRESSURE_LIMIT");
  });

  await t.test("queued input audio", async () => {
    let release;
    const harness = await createHarness({
      limits: { maxQueuedInputBytes: 1_000 },
      sendAudio: () => new Promise((resolve) => {
        release = resolve;
      }),
    });
    await begin(harness);
    emit(harness.socket, media(2, 1));
    emit(harness.socket, media(3, 2));
    assert.equal((await harness.result.controller.done).reason, "INPUT_AUDIO_BACKPRESSURE_LIMIT");
    release?.();
  });
});

test("invalid provider audio, transcript, or tool data fails closed without echoing details", async (t) => {
  await t.test("wrong output format", async () => {
    const harness = await createHarness();
    await begin(harness);
    await harness.callbacks.onAudio({ data: pcm([1, 2, 3]), mimeType: "audio/wav" });
    assert.equal((await harness.result.controller.done).reason, "INVALID_GEMINI_AUDIO_FORMAT");
  });

  await t.test("control character transcript", async () => {
    const harness = await createHarness();
    await begin(harness);
    await harness.callbacks.onTranscript({ text: "bad\0text", role: "user", final: true });
    assert.equal((await harness.result.controller.done).reason, "INVALID_GEMINI_TRANSCRIPT");
  });

  await t.test("prototype-bearing tool arguments", async () => {
    const harness = await createHarness();
    await begin(harness);
    const args = JSON.parse('{"__proto__":{"ownerId":"attacker"}}');
    await harness.callbacks.onToolCall({ name: "quote", args, toolCallId: "tool-1" });
    assert.equal((await harness.result.controller.done).reason, "INVALID_GEMINI_TOOL_CALL");
    assert.equal(harness.events.toolCalls.length, 0);
  });

  await t.test("accessor-bearing provider objects", async () => {
    const harness = await createHarness();
    await begin(harness);
    const args = {};
    Object.defineProperty(args, "slot", {
      enumerable: true,
      get() {
        throw new Error("must not execute provider getters");
      },
    });
    await harness.callbacks.onToolCall({ name: "quote", args, toolCallId: "tool-2" });
    assert.equal((await harness.result.controller.done).reason, "INVALID_GEMINI_TOOL_CALL");
    assert.equal(harness.events.toolCalls.length, 0);
  });
});
