// Phone bridge: a caller's key press and Gemini's real delivery speed.
//
// Expected results, written before the first run:
// - A Twilio `dtmf` message (the documented shape: event, streamSid,
//   sequenceNumber, dtmf.track "inbound", dtmf.digit) keeps the call active.
//   Media keeps flowing to Gemini, Gemini audio keeps flowing to Twilio, the
//   digit never reaches Gemini, and the dtmf message advances the sequence
//   number and counts toward the inbound message budget. Today every dtmf
//   message fails the call with UNSUPPORTED_TWILIO_EVENT.
// - A malformed dtmf message and any unknown event still fail the call and close
//   the Twilio socket with 1008, with the existing reviewed failure codes
//   (INVALID_PROVIDER_MESSAGE for a wrong shape, track or digit;
//   MEDIA_BEFORE_ACTIVE_START before the stream starts).
// - Every reply in claude/probe-results delivery-rate.json (gemini-3.8-live),
//   replayed with its measured chunk count, audio length and delivery span,
//   evenly spaced, with its longest measured gap at every position, and with the
//   whole reply arriving at once, never trips GEMINI_AUDIO_RATE_LIMIT or any
//   other limit. Today the greeting fails with GEMINI_AUDIO_RATE_LIMIT.
// - More than 768,000 PCM bytes in one second still fails with
//   GEMINI_AUDIO_RATE_LIMIT, and a runaway stream below that speed still fails
//   with PENDING_MARK_LIMIT once Twilio has 128 chunks waiting to play.
// Fakes only: fake Twilio socket, fake Gemini session, fake clock. No network.
import { EventEmitter } from "node:events";
import test from "node:test";
import assert from "node:assert/strict";
import { createGeminiMediaBridge } from "../server/src/voice/geminiMediaBridge.js";
import { callFailureReason } from "../server/src/callFailureReasons.js";

const ACCOUNT_SID = `AC${"a".repeat(32)}`;
const CALL_SID = `CA${"b".repeat(32)}`;
const STREAM_SID = `MZ${"d".repeat(32)}`;
const OTHER_STREAM_SID = `MZ${"e".repeat(32)}`;
const PCM_BYTES_PER_SECOND = 48_000; // 24 kHz, 16-bit mono
const SILENT_MULAW = Buffer.alloc(160, 0xff).toString("base64");

// claude/probe-results delivery-rate.json, gemini-3.8-live, copied verbatim
// (prompt text shortened to the probe's own 40-character labels).
const PROBE_TURNS = [
  { atSec: 1.6, prompt: "[SYSTEM] A visitor just started the demo", firstAudioMs: 1365, audioSec: 4.5, deliveredOverSec: 1, chunks: 15, maxGapMs: 253 },
  { atSec: 11.4, prompt: "I have a roofing company.", firstAudioMs: 1097, audioSec: 5.8, deliveredOverSec: 1.3, chunks: 17, maxGapMs: 202 },
  { atSec: 22.3, prompt: "I just answer them all myself.", firstAudioMs: 998, audioSec: 13.8, deliveredOverSec: 3.2, chunks: 43, maxGapMs: 379 },
  { atSec: 41.1, prompt: "What happens if a customer gives the wro", firstAudioMs: 882, audioSec: 10, deliveredOverSec: 2.3, chunks: 31, maxGapMs: 226 },
  { atSec: 56, prompt: "What questions do you ask people who wan", firstAudioMs: 1298, audioSec: 10.5, deliveredOverSec: 2.3, chunks: 34, maxGapMs: 433 },
  { atSec: 71.9, prompt: "Is that all of them?", firstAudioMs: 1051, audioSec: 3.8, deliveredOverSec: 0.8, chunks: 12, maxGapMs: 253 },
  { atSec: 80.7, prompt: "How do I set up my number?", firstAudioMs: 1343, audioSec: 10.2, deliveredOverSec: 1.9, chunks: 29, maxGapMs: 545 },
  { atSec: 96.3, prompt: "Can it run all night?", firstAudioMs: 1207, audioSec: 5.6, deliveredOverSec: 1.3, chunks: 17, maxGapMs: 441 },
  { atSec: 107.1, prompt: "What does QuoteDone cost?", firstAudioMs: 762, audioSec: 5.4, deliveredOverSec: 1.2, chunks: 18, maxGapMs: 388 },
  { atSec: 117.3, prompt: "What if I want to cancel?", firstAudioMs: 842, audioSec: 4.8, deliveredOverSec: 1.2, chunks: 18, maxGapMs: 326 },
  { atSec: 127, prompt: "Do you work for landscapers too?", firstAudioMs: 806, audioSec: 10.3, deliveredOverSec: 2.4, chunks: 33, maxGapMs: 290 },
  { atSec: 142.2, prompt: "What questions for a lawn mowing quote?", firstAudioMs: 1217, audioSec: 8.1, deliveredOverSec: 1.9, chunks: 27, maxGapMs: 602 },
  { atSec: 155.6, prompt: "Okay, sounds good.", firstAudioMs: 963, audioSec: 4.4, deliveredOverSec: 1, chunks: 13, maxGapMs: 386 },
];

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

const connected = () => ({ event: "connected", protocol: "Call", version: "1.0.0" });
const start = () => ({
  event: "start",
  sequenceNumber: "1",
  streamSid: STREAM_SID,
  start: {
    accountSid: ACCOUNT_SID,
    callSid: CALL_SID,
    streamSid: STREAM_SID,
    tracks: ["inbound"],
    mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8_000, channels: 1 },
  },
});
const media = (sequenceNumber, chunk) => ({
  event: "media",
  sequenceNumber: String(sequenceNumber),
  streamSid: STREAM_SID,
  media: { track: "inbound", chunk: String(chunk), timestamp: String((chunk - 1) * 20), payload: SILENT_MULAW },
});
// Twilio's documented dtmf example, field for field.
const dtmf = (sequenceNumber, digit = "1") => ({
  event: "dtmf",
  streamSid: STREAM_SID,
  sequenceNumber: String(sequenceNumber),
  dtmf: { track: "inbound", digit },
});
const mark = (sequenceNumber, name) => ({ event: "mark", sequenceNumber: String(sequenceNumber), streamSid: STREAM_SID, mark: { name } });
const stop = (sequenceNumber) => ({ event: "stop", sequenceNumber: String(sequenceNumber), streamSid: STREAM_SID, stop: { accountSid: ACCOUNT_SID, callSid: CALL_SID } });
const geminiAudio = (bytes) => ({ data: Buffer.alloc(bytes, 0x10), mimeType: "audio/pcm;rate=24000" });

async function createHarness({ limits, clock } = {}) {
  const socket = new FakeSocket();
  const events = { inputAudio: [], prompts: [], toolResponses: [], transcripts: [], toolCalls: [], cancelOutput: 0 };
  let callbacks;
  const provider = {
    async sendAudio(value) { events.inputAudio.push(value); },
    async sendToolResponse(value) { events.toolResponses.push(value); },
    async sendPrompt(text) { events.prompts.push(text); },
    async cancelOutput() { events.cancelOutput += 1; },
    async close() {},
  };
  const bridge = createGeminiMediaBridge({
    now: clock ?? (() => 10_000),
    limits,
    openGeminiSession: async (value) => { callbacks = value.callbacks; return provider; },
    onTranscript: async (value) => { events.transcripts.push(value); },
    onToolCall: async (value) => { events.toolCalls.push(value); return { ok: true }; },
    onSessionEnd: async () => {},
    // Silence prompts are covered elsewhere; here they would only add noise.
    setTimer: () => 0,
    clearTimer: () => {},
  });
  const result = await bridge.startMediaSession({
    socket,
    context: { ownerId: "owner-a", accountSid: ACCOUNT_SID, callSid: CALL_SID, from: "+19025550100", to: "+19025550101" },
    session: { callRecordId: "call-a" },
  });
  const harness = {
    socket,
    events,
    result,
    get callbacks() { return callbacks; },
    get state() { return result.controller.state; },
    emit(value) { socket.emit("message", JSON.stringify(value), false); },
    idle() { return result.controller.whenIdle(); },
  };
  harness.emit(connected());
  harness.emit(start());
  await harness.idle();
  assert.equal(harness.state, "active");
  return harness;
}

async function expectFailure(harness, reason) {
  assert.deepEqual(await harness.result.controller.done, { status: "failed", reason });
  assert.deepEqual(harness.socket.closeCalls, [{ code: 1008, reason: "Voice media unavailable" }]);
}

const sentEvents = (harness, event) => harness.socket.sent.filter((message) => message.event === event);

test("Twilio documents six inbound messages on a bidirectional stream; the bridge accepts each one", async () => {
  // connected, start, media, dtmf, stop, mark (Twilio "WebSocket messages from Twilio").
  const harness = await createHarness();
  harness.emit(media(2, 1));
  harness.emit(dtmf(3, "7"));
  await harness.idle();
  await harness.callbacks.onAudio(geminiAudio(960));
  await harness.idle();
  harness.emit(mark(4, sentEvents(harness, "mark")[0].mark.name));
  harness.emit(stop(5));
  assert.deepEqual(await harness.result.controller.done, { status: "stopped", reason: "TWILIO_STOP" });
  assert.deepEqual(harness.socket.closeCalls, []);
});

test("a key press mid-call keeps the call active, audio flowing both ways, and the digit away from Gemini", async () => {
  const harness = await createHarness();
  harness.emit(media(2, 1));
  harness.emit(dtmf(3, "5"));
  harness.emit(media(4, 2));
  await harness.idle();
  assert.equal(harness.state, "active");
  assert.equal(harness.events.inputAudio.length, 2);

  await harness.callbacks.onAudio(geminiAudio(960));
  await harness.idle();
  assert.equal(sentEvents(harness, "media").length, 1);
  const firstMark = sentEvents(harness, "mark")[0].mark.name;

  // A second key while the receptionist is talking, then the played-audio mark.
  harness.emit(dtmf(5, "#"));
  harness.emit(mark(6, firstMark));
  harness.emit(media(7, 3));
  await harness.idle();
  await harness.callbacks.onAudio(geminiAudio(960));
  await harness.idle();
  assert.equal(harness.state, "active");
  assert.equal(harness.events.inputAudio.length, 3);
  assert.equal(sentEvents(harness, "media").length, 2);

  // Only caller audio reached Gemini: no prompt, tool, transcript or cancel.
  for (const value of harness.events.inputAudio) {
    assert.equal(value.mimeType, "audio/pcm;rate=16000");
    assert.equal(value.data.length, 640);
  }
  assert.deepEqual(harness.events.prompts, []);
  assert.deepEqual(harness.events.toolResponses, []);
  assert.deepEqual(harness.events.toolCalls, []);
  assert.deepEqual(harness.events.transcripts, []);
  assert.equal(harness.events.cancelOutput, 0);
  // Nothing about the key went back to Twilio either.
  assert.deepEqual([...new Set(harness.socket.sent.map((message) => message.event))].sort(), ["mark", "media"]);

  harness.emit(stop(8));
  assert.deepEqual(await harness.result.controller.done, { status: "stopped", reason: "TWILIO_STOP" });
  assert.deepEqual(harness.socket.closeCalls, []);
});

test("every DTMF key is accepted: 0-9, *, # and A-D", async () => {
  const harness = await createHarness();
  let sequence = 2;
  for (const digit of [..."0123456789*#ABCDabcd"]) harness.emit(dtmf(sequence++, digit));
  harness.emit(media(sequence++, 1));
  await harness.idle();
  assert.equal(harness.state, "active");
  assert.equal(harness.events.inputAudio.length, 1);
});

test("a key press advances and checks the sequence number like every other message", async (t) => {
  await t.test("the message after a key press must carry the next number", async () => {
    const harness = await createHarness();
    harness.emit(dtmf(2));
    harness.emit(media(2, 1));
    await expectFailure(harness, "TWILIO_SEQUENCE_MISMATCH");
  });
  await t.test("a key press that skips a number fails", async () => {
    const harness = await createHarness();
    harness.emit(media(2, 1));
    harness.emit(dtmf(4));
    await expectFailure(harness, "TWILIO_SEQUENCE_MISMATCH");
  });
  await t.test("a repeated key press number fails", async () => {
    const harness = await createHarness();
    harness.emit(dtmf(2));
    harness.emit(dtmf(2));
    await expectFailure(harness, "TWILIO_SEQUENCE_MISMATCH");
  });
  await t.test("a key press does not change the media chunk count", async () => {
    const harness = await createHarness();
    harness.emit(media(2, 1));
    harness.emit(dtmf(3));
    harness.emit(media(4, 3));
    await expectFailure(harness, "TWILIO_MEDIA_ORDER_MISMATCH");
  });
});

test("key presses count toward the inbound message budget", async () => {
  const clock = { t: 50_000 };
  const harness = await createHarness({ limits: { maxInboundMessagesPerSecond: 3 }, clock: () => clock.t });
  harness.emit(media(2, 1));
  harness.emit(dtmf(3));
  harness.emit(media(4, 2));
  await harness.idle();
  assert.equal(harness.state, "active");
  // The next second opens a new window.
  clock.t += 1_000;
  harness.emit(dtmf(5));
  harness.emit(dtmf(6));
  harness.emit(dtmf(7));
  await harness.idle();
  assert.equal(harness.state, "active");
  harness.emit(dtmf(8));
  await expectFailure(harness, "TWILIO_MESSAGE_RATE_LIMIT");
});

test("a malformed key press still fails closed", async (t) => {
  const valid = dtmf(2);
  const cases = [
    ["no dtmf object", { event: "dtmf", streamSid: STREAM_SID, sequenceNumber: "2" }, "INVALID_PROVIDER_MESSAGE"],
    ["no sequence number", { event: "dtmf", streamSid: STREAM_SID, dtmf: valid.dtmf }, "INVALID_PROVIDER_MESSAGE"],
    ["no stream", { event: "dtmf", sequenceNumber: "2", dtmf: valid.dtmf }, "INVALID_PROVIDER_MESSAGE"],
    ["extra top-level field", { ...valid, digits: "1" }, "INVALID_PROVIDER_MESSAGE"],
    ["extra dtmf field", { ...valid, dtmf: { ...valid.dtmf, duration: "100" } }, "INVALID_PROVIDER_MESSAGE"],
    ["dtmf without digit", { ...valid, dtmf: { track: "inbound" } }, "INVALID_PROVIDER_MESSAGE"],
    ["dtmf without track", { ...valid, dtmf: { digit: "1" } }, "INVALID_PROVIDER_MESSAGE"],
    ["dtmf is an array", { ...valid, dtmf: ["1"] }, "INVALID_PROVIDER_MESSAGE"],
    ["dtmf is a string", { ...valid, dtmf: "1" }, "INVALID_PROVIDER_MESSAGE"],
    ["prototype key", JSON.parse(`{"event":"dtmf","streamSid":"${STREAM_SID}","sequenceNumber":"2","dtmf":{"track":"inbound","digit":"1","__proto__":{}}}`), "INVALID_PROVIDER_MESSAGE"],
    ["outbound track", { ...valid, dtmf: { track: "outbound", digit: "1" } }, "INVALID_PROVIDER_MESSAGE"],
    ["two digits", { ...valid, dtmf: { track: "inbound", digit: "12" } }, "INVALID_PROVIDER_MESSAGE"],
    ["empty digit", { ...valid, dtmf: { track: "inbound", digit: "" } }, "INVALID_PROVIDER_MESSAGE"],
    ["letter outside A-D", { ...valid, dtmf: { track: "inbound", digit: "E" } }, "INVALID_PROVIDER_MESSAGE"],
    ["number instead of string", { ...valid, dtmf: { track: "inbound", digit: 1 } }, "INVALID_PROVIDER_MESSAGE"],
    ["control character", { ...valid, dtmf: { track: "inbound", digit: "\n" } }, "INVALID_PROVIDER_MESSAGE"],
    ["numeric sequence number", { ...valid, sequenceNumber: 2 }, "INVALID_TWILIO_SEQUENCE"],
    ["another stream", { ...valid, streamSid: OTHER_STREAM_SID }, "TWILIO_STREAM_SID_MISMATCH"],
  ];
  for (const [label, message, reason] of cases) {
    await t.test(label, async () => {
      const harness = await createHarness();
      harness.emit(message);
      await expectFailure(harness, reason);
      assert.deepEqual(harness.events.inputAudio, []);
      assert.deepEqual(harness.events.prompts, []);
    });
  }
  await t.test("key press before the stream starts", async () => {
    const socket = new FakeSocket();
    const bridge = createGeminiMediaBridge({
      openGeminiSession: async () => assert.fail("Gemini must not open"),
      onTranscript: async () => {},
      onToolCall: async () => ({}),
      setTimer: () => 0,
      clearTimer: () => {},
    });
    const result = await bridge.startMediaSession({
      socket,
      context: { ownerId: "owner-a", accountSid: ACCOUNT_SID, callSid: CALL_SID },
      session: {},
    });
    socket.emit("message", JSON.stringify(connected()), false);
    socket.emit("message", JSON.stringify(dtmf(1)), false);
    assert.deepEqual(await result.controller.done, { status: "failed", reason: "MEDIA_BEFORE_ACTIVE_START" });
    assert.deepEqual(socket.closeCalls, [{ code: 1008, reason: "Voice media unavailable" }]);
  });
});

test("unknown or malformed events still fail closed", async (t) => {
  for (const [label, message, reason] of [
    ["unknown event", { event: "keypress", sequenceNumber: "2", streamSid: STREAM_SID }, "UNSUPPORTED_TWILIO_EVENT"],
    ["dtmf in capitals", { ...dtmf(2), event: "DTMF" }, "UNSUPPORTED_TWILIO_EVENT"],
    ["clear sent by Twilio", { event: "clear", streamSid: STREAM_SID }, "UNSUPPORTED_TWILIO_EVENT"],
    ["empty event name", { event: "", sequenceNumber: "2" }, "UNSUPPORTED_TWILIO_EVENT"],
    ["no event", { sequenceNumber: "2", streamSid: STREAM_SID }, "INVALID_TWILIO_MESSAGE"],
    ["event is not a string", { event: 5 }, "INVALID_TWILIO_MESSAGE"],
  ]) {
    await t.test(label, async () => {
      const harness = await createHarness();
      harness.emit(message);
      await expectFailure(harness, reason);
    });
  }
  await t.test("non-JSON text", async () => {
    const harness = await createHarness();
    harness.socket.emit("message", "dtmf 1", false);
    await expectFailure(harness, "INVALID_TWILIO_JSON");
  });
});

test("a failed key press shows owners the existing reviewed wording", () => {
  const wording = "The call contained audio or connection data the receptionist could not process safely.";
  for (const code of ["INVALID_PROVIDER_MESSAGE", "MEDIA_BEFORE_ACTIVE_START", "TWILIO_SEQUENCE_MISMATCH", "UNSUPPORTED_TWILIO_EVENT"]) {
    assert.equal(callFailureReason(code), wording);
  }
});

// --- Gemini delivery speed -------------------------------------------------

function chunkSizes(turn) {
  const total = Math.round((turn.audioSec * PCM_BYTES_PER_SECOND) / 2) * 2;
  const base = Math.floor(total / turn.chunks / 2) * 2;
  return Array.from({ length: turn.chunks }, (_, index) => (index < turn.chunks - 1 ? base : total - base * (turn.chunks - 1)));
}

// Arrival offsets in ms from the reply's first chunk.
function evenOffsets(turn) {
  const span = turn.deliveredOverSec * 1_000;
  return Array.from({ length: turn.chunks }, (_, index) => Math.round((index * span) / (turn.chunks - 1)));
}
function burstOffsets(turn, longGapIndex) {
  // The measured longest gap sits at one position; the other gaps share the
  // rest of the delivery span evenly, so the chunks around it arrive closer.
  const span = turn.deliveredOverSec * 1_000;
  const short = (span - turn.maxGapMs) / (turn.chunks - 2);
  const offsets = [0];
  let at = 0;
  for (let gap = 0; gap < turn.chunks - 1; gap += 1) {
    at += gap === longGapIndex ? turn.maxGapMs : short;
    offsets.push(Math.round(at));
  }
  return offsets;
}

// Feeds one reply the way the Google adapter does: one chunk at a time, each
// awaited, on the fake clock. Returns the call state afterwards.
async function replayReply(turn, offsets, limits) {
  const clock = { t: 1_000_000 };
  const harness = await createHarness({ limits, clock: () => clock.t });
  const sizes = chunkSizes(turn);
  for (let index = 0; index < sizes.length && harness.state === "active"; index += 1) {
    clock.t = 1_000_000 + offsets[index];
    await harness.callbacks.onAudio(geminiAudio(sizes[index]));
    await harness.idle();
  }
  return harness;
}

test("every measured Gemini reply, evenly spaced, plays without tripping a limit", async (t) => {
  for (const turn of PROBE_TURNS) {
    await t.test(`${turn.prompt} (${turn.audioSec} s in ${turn.chunks} chunks over ${turn.deliveredOverSec} s)`, async () => {
      const harness = await replayReply(turn, evenOffsets(turn));
      assert.equal(harness.state, "active");
      assert.equal(sentEvents(harness, "media").length, turn.chunks);
      assert.equal(sentEvents(harness, "mark").length, turn.chunks);
      assert.deepEqual(harness.socket.closeCalls, []);
    });
  }
});

test("every measured Gemini reply with its longest gap at any position plays without tripping a limit", async () => {
  let replays = 0;
  for (const turn of PROBE_TURNS) {
    for (let longGapIndex = 0; longGapIndex < turn.chunks - 1; longGapIndex += 1) {
      const harness = await replayReply(turn, burstOffsets(turn, longGapIndex));
      assert.equal(harness.state, "active", `${turn.prompt}, long gap at ${longGapIndex}`);
      assert.equal(sentEvents(harness, "media").length, turn.chunks);
      replays += 1;
    }
  }
  assert.equal(replays, PROBE_TURNS.reduce((sum, turn) => sum + turn.chunks - 1, 0));
});

test("even a whole measured reply arriving within the same millisecond stays under the ceiling", async (t) => {
  for (const turn of PROBE_TURNS) {
    await t.test(turn.prompt, async () => {
      const harness = await replayReply(turn, Array(turn.chunks).fill(0));
      assert.equal(harness.state, "active");
      assert.equal(sentEvents(harness, "media").length, turn.chunks);
    });
  }
});

test("the previous 192,000 bytes-per-second value ends the measured greeting", async () => {
  const harness = await replayReply(PROBE_TURNS[0], evenOffsets(PROBE_TURNS[0]), { maxOutboundPcmBytesPerSecond: 192_000 });
  await expectFailure(harness, "GEMINI_AUDIO_RATE_LIMIT");
});

test("a full measured call with caller audio, key presses and Twilio playback stays active", async (t) => {
  for (const variant of ["even", "longest gap last"]) {
    await t.test(variant, async () => {
      const clock = { t: 0 };
      const harness = await createHarness({ clock: () => clock.t });
      let sequence = 2;
      let mediaChunk = 1;
      let playhead = 0;
      const queue = [];
      for (let at = 0; at <= 170_000; at += 20) queue.push({ at, kind: "media" });
      for (const at of [3_000, 3_200, 25_000, 40_000, 82_500]) queue.push({ at, kind: "dtmf" });
      for (const turn of PROBE_TURNS) {
        const first = turn.atSec * 1_000 + turn.firstAudioMs;
        const offsets = variant === "even" ? evenOffsets(turn) : burstOffsets(turn, turn.chunks - 2);
        chunkSizes(turn).forEach((bytes, index) => queue.push({ at: first + offsets[index], kind: "audio", bytes }));
      }
      const order = { mark: 0, audio: 1, media: 2, dtmf: 3 };
      const sortQueue = () => queue.sort((a, b) => a.at - b.at || order[a.kind] - order[b.kind]);
      sortQueue();
      let maxPendingMarks = 0;
      let pending = 0;
      let keyPresses = 0;
      while (queue.length > 0 && harness.state === "active") {
        const item = queue.shift();
        clock.t = item.at;
        if (item.kind === "media") harness.emit(media(sequence++, mediaChunk++));
        else if (item.kind === "dtmf") { harness.emit(dtmf(sequence++, "9")); keyPresses += 1; }
        else if (item.kind === "mark") { harness.emit(mark(sequence++, item.name)); pending -= 1; }
        else {
          await harness.callbacks.onAudio(geminiAudio(item.bytes));
          await harness.idle();
          const name = sentEvents(harness, "mark").at(-1).mark.name;
          // Twilio plays chunks back to back and echoes each mark once played.
          playhead = Math.max(playhead, item.at) + (item.bytes / PCM_BYTES_PER_SECOND) * 1_000;
          queue.push({ at: Math.ceil(playhead), kind: "mark", name });
          sortQueue();
          pending += 1;
          maxPendingMarks = Math.max(maxPendingMarks, pending);
        }
        await harness.idle();
      }
      assert.equal(harness.state, "active");
      const chunks = PROBE_TURNS.reduce((sum, turn) => sum + turn.chunks, 0);
      assert.equal(sentEvents(harness, "media").length, chunks);
      assert.equal(keyPresses, 5);
      assert.equal(harness.events.inputAudio.length, mediaChunk - 1);
      // The longest reply (43 chunks) never comes near the 128-mark cap.
      t.diagnostic(`${variant}: most chunks waiting to play at once ${maxPendingMarks}`);
      assert.ok(maxPendingMarks <= 43, `max pending marks ${maxPendingMarks}`);
      harness.emit(stop(sequence));
      assert.deepEqual(await harness.result.controller.done, { status: "stopped", reason: "TWILIO_STOP" });
    });
  }
});

test("a stream above 768,000 PCM bytes in one second still fails closed", async () => {
  const clock = { t: 1_000_000 };
  const harness = await createHarness({ clock: () => clock.t });
  // Exactly 16 s of audio in the first second is accepted.
  for (let index = 0; index < 8; index += 1) {
    clock.t = 1_000_000 + index * 100;
    await harness.callbacks.onAudio(geminiAudio(96_000));
    await harness.idle();
  }
  assert.equal(harness.state, "active");
  // A new second opens a new window.
  clock.t = 1_001_000;
  for (let index = 0; index < 8; index += 1) {
    await harness.callbacks.onAudio(geminiAudio(96_000));
    await harness.idle();
  }
  assert.equal(harness.state, "active");
  // Two more bytes inside that same second is over the ceiling.
  clock.t = 1_001_999;
  await harness.callbacks.onAudio(geminiAudio(2));
  await expectFailure(harness, "GEMINI_AUDIO_RATE_LIMIT");
  assert.equal(sentEvents(harness, "media").length, 16);
});

test("a runaway stream below the ceiling still fails once Twilio has 128 chunks waiting", async () => {
  // 15x real time: 0.3 s chunks every 20 ms, marks echoed only as audio plays.
  const clock = { t: 0 };
  const harness = await createHarness({ clock: () => clock.t });
  const played = [];
  let playhead = 0;
  let sequence = 2;
  let accepted = 0;
  for (let at = 0; at < 10_000 && harness.state === "active"; at += 20) {
    clock.t = at;
    while (played.length > 0 && played[0].at <= at) harness.emit(mark(sequence++, played.shift().name));
    await harness.idle();
    await harness.callbacks.onAudio(geminiAudio(14_400));
    await harness.idle();
    if (harness.state !== "active") break;
    accepted += 1;
    playhead = Math.max(playhead, at) + 300;
    played.push({ at: playhead, name: sentEvents(harness, "mark").at(-1).mark.name });
  }
  await expectFailure(harness, "PENDING_MARK_LIMIT");
  assert.ok(clock.t < 5_000, `stopped at ${clock.t} ms`);
  assert.ok(accepted >= 128 && accepted < 160, `accepted ${accepted}`);
});

// --- Through the production voice runtime ---------------------------------
// Real Express, real WebSocket server, real SQLite; fake Twilio frames and a
// fake Google client. The bridge here uses the real clock, so replies are paced
// in real time. Expected: the call row stays CONNECTED, the socket stays open,
// and every Gemini chunk reaches the caller as a media message.
const { harness: runtimeHarness, until } = await import("./voiceLifecycle20261006Fixture.mjs");
const callRow = (h, c) => h.db.prepare("SELECT status,failureCode FROM calls WHERE ownerId=? AND callSid=?").get(h.owner, c.params.CallSid);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function twilioInbox(c) {
  const received = [];
  c.ws.on("message", (value) => received.push(JSON.parse(String(value))));
  return received;
}
const sendTwilio = (c, value) => c.ws.send(JSON.stringify({ ...value, streamSid: c.streamSid }));
const speak = (c, bytes) => c.callback.onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: Buffer.alloc(bytes, 0x10).toString("base64") } }] } } });

test("production runtime: a key press mid-call keeps the call connected and the receptionist talking", async (t) => {
  const h = await runtimeHarness(t), c = await h.connect();
  const received = twilioInbox(c);
  sendTwilio(c, media(2, 1));
  sendTwilio(c, dtmf(3, "1"));
  sendTwilio(c, media(4, 2));
  speak(c, 960);
  await until(() => received.some((message) => message.event === "mark") || callRow(h, c).status !== "CONNECTED");
  assert.deepEqual(callRow(h, c), { status: "CONNECTED", failureCode: null });
  const name = received.find((message) => message.event === "mark").mark.name;
  sendTwilio(c, mark(5, name));
  sendTwilio(c, dtmf(6, "#"));
  speak(c, 960);
  await until(() => received.filter((message) => message.event === "media").length === 2);
  await wait(100);
  assert.equal(c.ws.readyState, 1);
  assert.deepEqual(callRow(h, c), { status: "CONNECTED", failureCode: null });
  sendTwilio(c, { event: "stop", sequenceNumber: "7", stop: { accountSid: c.params.AccountSid, callSid: c.params.CallSid } });
  await until(() => callRow(h, c).status !== "CONNECTED");
  assert.equal(callRow(h, c).failureCode, null);
  assert.notEqual(callRow(h, c).status, "FAILED");
});

for (const [label, turn, offsets] of [
  ["greeting, evenly spaced", PROBE_TURNS[0], evenOffsets(PROBE_TURNS[0])],
  ["fastest reply with its longest gap last", PROBE_TURNS[6], burstOffsets(PROBE_TURNS[6], PROBE_TURNS[6].chunks - 2)],
]) {
  test(`production runtime: measured ${label} plays in real time without ending the call`, async (t) => {
    const h = await runtimeHarness(t), c = await h.connect();
    const received = twilioInbox(c);
    const startedAt = Date.now();
    const sizes = chunkSizes(turn);
    for (let index = 0; index < sizes.length; index += 1) {
      const delay = startedAt + offsets[index] - Date.now();
      if (delay > 0) await wait(delay);
      speak(c, sizes[index]);
    }
    await until(() => received.filter((message) => message.event === "media").length === turn.chunks || callRow(h, c).status !== "CONNECTED");
    await wait(100);
    assert.deepEqual(callRow(h, c), { status: "CONNECTED", failureCode: null });
    assert.equal(received.filter((message) => message.event === "media").length, turn.chunks);
    assert.equal(c.ws.readyState, 1);
  });
}

test("production runtime: the largest measured reply arriving in one burst plays without ending the call", async (t) => {
  // All 43 chunks (13.8 s, 662,400 bytes) handed to the Google adapter in the
  // same tick. Expected: the adapter feeds them to the bridge one at a time, so
  // at most one chunk waits in the bridge's output queue (192 KB cap), and the
  // whole reply stays under the 768,000-byte ceiling.
  const h = await runtimeHarness(t), c = await h.connect();
  const received = twilioInbox(c);
  const turn = PROBE_TURNS[2];
  for (const bytes of chunkSizes(turn)) speak(c, bytes);
  await until(() => received.filter((message) => message.event === "media").length === turn.chunks || callRow(h, c).status !== "CONNECTED");
  await wait(100);
  assert.deepEqual(callRow(h, c), { status: "CONNECTED", failureCode: null });
  assert.equal(received.filter((message) => message.event === "media").length, turn.chunks);
  assert.equal(received.filter((message) => message.event === "mark").length, turn.chunks);
  assert.equal(c.ws.readyState, 1);
});
