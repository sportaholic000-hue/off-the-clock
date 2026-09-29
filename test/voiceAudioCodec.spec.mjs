import test from "node:test";
import assert from "node:assert/strict";

import {
  VoiceAudioCodecError,
  createPcm16le24kToMuLaw8kEncoder,
  decodeCanonicalBase64,
  decodeMuLaw8kToPcm16le16k,
  decodeMuLawSample,
  decodeTwilioMediaPayload,
  encodeMuLawSample,
  encodePcm16le24kToMuLaw8k,
} from "../server/src/voice/audioCodec.js";

const hasCode = (code) => (error) => error instanceof VoiceAudioCodecError && error.code === code;

function pcm(samples) {
  const result = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => result.writeInt16LE(sample, index * 2));
  return result;
}

function samples(buffer) {
  const result = [];
  for (let offset = 0; offset < buffer.length; offset += 2) {
    result.push(buffer.readInt16LE(offset));
  }
  return result;
}

test("G.711 mu-law codec matches canonical endpoint and zero vectors", () => {
  assert.equal(decodeMuLawSample(0x00), -32_124);
  assert.equal(decodeMuLawSample(0x80), 32_124);
  assert.equal(decodeMuLawSample(0xff), 0);
  assert.equal(decodeMuLawSample(0x7f), 0);
  assert.equal(encodeMuLawSample(-32_124), 0x00);
  assert.equal(encodeMuLawSample(32_124), 0x80);
  assert.equal(encodeMuLawSample(0), 0xff);
});

test("representable mu-law levels round-trip exactly, except negative zero canonicalizes", () => {
  const codes = [0x00, 0x10, 0x20, 0x40, 0x60, 0x80, 0x90, 0xa0, 0xc0, 0xe0, 0xff];
  for (const code of codes) {
    assert.equal(encodeMuLawSample(decodeMuLawSample(code)), code);
  }
  assert.equal(encodeMuLawSample(decodeMuLawSample(0x7f)), 0xff);
});

test("an inbound 20 ms Twilio frame keeps duration when converted from 8 kHz to 16 kHz", () => {
  const input = Buffer.alloc(160, 0xff);
  input[0] = 0x00;
  input[1] = 0x80;
  const output = decodeTwilioMediaPayload(input.toString("base64"));
  assert.equal(output.length, 640);
  assert.equal(output.length / 2 / 16_000, input.length / 8_000);
  assert.deepEqual(samples(output.subarray(0, 8)), [-32_124, -32_124, 32_124, 32_124]);
});

test("8-to-16 kHz conversion is frame-independent and duplicates each decoded sample", () => {
  const input = Buffer.from([0x10, 0x90, 0xff]);
  const whole = decodeMuLaw8kToPcm16le16k(input);
  const split = Buffer.concat([
    decodeMuLaw8kToPcm16le16k(input.subarray(0, 1)),
    decodeMuLaw8kToPcm16le16k(input.subarray(1)),
  ]);
  assert.deepEqual(split, whole);
  assert.deepEqual(samples(whole), [-15_996, -15_996, 15_996, 15_996, 0, 0]);
});

test("a 20 ms Gemini frame becomes exactly 20 ms of 8 kHz mu-law", () => {
  const inputSamples = Array.from({ length: 480 }, (_, index) => (index % 12) * 100 - 550);
  const output = encodePcm16le24kToMuLaw8k(pcm(inputSamples));
  assert.equal(output.length, 160);
  assert.equal(inputSamples.length / 24_000, output.length / 8_000);
});

test("24-to-8 kHz streaming retains incomplete triplets across provider chunks", () => {
  const encoder = createPcm16le24kToMuLaw8kEncoder();
  const { pushBase64 } = encoder;
  assert.deepEqual(encoder.push(pcm([100, 200])), Buffer.alloc(0));
  assert.equal(encoder.pendingSampleCount, 2);
  assert.deepEqual(
    encoder.push(pcm([300, 600, 600, 600])),
    Buffer.from([encodeMuLawSample(200), encodeMuLawSample(600)]),
  );
  assert.equal(encoder.pendingSampleCount, 0);
  assert.equal(pushBase64(pcm([0, 0, 0])), Buffer.from([0xff]).toString("base64"));
});

test("reset discards pre-interruption output while flush intentionally emits a final partial sample", () => {
  const encoder = createPcm16le24kToMuLaw8kEncoder();
  encoder.push(pcm([3_000, 3_000]));
  encoder.reset();
  assert.equal(encoder.pendingSampleCount, 0);
  assert.deepEqual(encoder.push(pcm([-900])), Buffer.alloc(0));
  assert.deepEqual(encoder.flush(), Buffer.from([encodeMuLawSample(-900)]));
});

test("canonical base64 and PCM alignment checks reject ambiguous or oversized audio", () => {
  assert.deepEqual(decodeCanonicalBase64("/w=="), Buffer.from([0xff]));
  assert.throws(() => decodeCanonicalBase64("_w=="), hasCode("INVALID_AUDIO_BASE64"));
  assert.throws(() => decodeCanonicalBase64("/w"), hasCode("INVALID_AUDIO_BASE64"));
  assert.throws(
    () => decodeCanonicalBase64(Buffer.alloc(5).toString("base64"), { maxDecodedBytes: 4 }),
    hasCode("AUDIO_PAYLOAD_TOO_LARGE"),
  );
  assert.throws(
    () => encodePcm16le24kToMuLaw8k(Buffer.from([0x00])),
    hasCode("MISALIGNED_PCM16_AUDIO"),
  );
});
