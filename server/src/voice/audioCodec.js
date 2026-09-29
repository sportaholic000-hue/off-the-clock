const MULAW_SAMPLE_RATE_HZ = 8_000;
const GEMINI_INPUT_SAMPLE_RATE_HZ = 16_000;
const GEMINI_OUTPUT_SAMPLE_RATE_HZ = 24_000;
const PCM_BYTES_PER_SAMPLE = 2;
const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32_635;
const DEFAULT_MAX_INPUT_BYTES = 64 * 1024;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export const VOICE_AUDIO_FORMATS = Object.freeze({
  twilio: Object.freeze({
    encoding: "audio/x-mulaw",
    sampleRateHz: MULAW_SAMPLE_RATE_HZ,
    channels: 1,
  }),
  geminiInput: Object.freeze({
    encoding: "audio/pcm",
    sampleRateHz: GEMINI_INPUT_SAMPLE_RATE_HZ,
    channels: 1,
    mimeType: "audio/pcm;rate=16000",
  }),
  geminiOutput: Object.freeze({
    encoding: "audio/pcm",
    sampleRateHz: GEMINI_OUTPUT_SAMPLE_RATE_HZ,
    channels: 1,
    mimeType: "audio/pcm;rate=24000",
  }),
});

export class VoiceAudioCodecError extends Error {
  constructor(code) {
    super("The voice audio payload is invalid.");
    this.name = "VoiceAudioCodecError";
    this.code = code;
  }
}

function fail(code) {
  throw new VoiceAudioCodecError(code);
}

function positiveByteLimit(value) {
  if (!Number.isSafeInteger(value) || value <= 0) fail("INVALID_AUDIO_LIMIT");
  return value;
}

function bytes(value, code = "INVALID_PCM_BUFFER") {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  fail(code);
}

function assertPcm16(value, maxInputBytes) {
  const input = bytes(value);
  if (input.length === 0 || input.length > positiveByteLimit(maxInputBytes)) {
    fail(input.length === 0 ? "EMPTY_PCM_AUDIO" : "PCM_AUDIO_TOO_LARGE");
  }
  if (input.length % PCM_BYTES_PER_SAMPLE !== 0) fail("MISALIGNED_PCM16_AUDIO");
  return input;
}

export function decodeCanonicalBase64(value, {
  maxDecodedBytes = DEFAULT_MAX_INPUT_BYTES,
  allowEmpty = false,
} = {}) {
  const limit = positiveByteLimit(maxDecodedBytes);
  if (typeof value !== "string" || value.length > Math.ceil(limit / 3) * 4 + 4) {
    fail("INVALID_AUDIO_BASE64");
  }
  if (value.length === 0) {
    if (allowEmpty) return Buffer.alloc(0);
    fail("EMPTY_AUDIO_PAYLOAD");
  }
  if (value.length % 4 !== 0 || !BASE64.test(value)) fail("INVALID_AUDIO_BASE64");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length > limit) fail("AUDIO_PAYLOAD_TOO_LARGE");
  if (decoded.toString("base64") !== value) fail("NON_CANONICAL_AUDIO_BASE64");
  return decoded;
}

/** Decodes one ITU-T G.711 mu-law byte into a signed 16-bit PCM sample. */
export function decodeMuLawSample(value) {
  if (!Number.isInteger(value) || value < 0 || value > 255) fail("INVALID_MULAW_SAMPLE");
  const encoded = (~value) & 0xff;
  const sign = encoded & 0x80;
  const exponent = (encoded >> 4) & 0x07;
  const mantissa = encoded & 0x0f;
  const magnitude = ((mantissa << 3) + MULAW_BIAS) * 2 ** exponent - MULAW_BIAS;
  if (magnitude === 0) return 0;
  return sign === 0 ? magnitude : -magnitude;
}

/** Encodes one signed PCM16 sample into an ITU-T G.711 mu-law byte. */
export function encodeMuLawSample(value) {
  if (!Number.isFinite(value)) fail("INVALID_PCM_SAMPLE");
  let sample = Math.round(value);
  sample = Math.max(-32_768, Math.min(32_767, sample));
  const sign = sample < 0 ? 0x80 : 0;
  if (sample < 0) sample = -sample;
  sample = Math.min(sample, MULAW_CLIP) + MULAW_BIAS;

  let exponent = 7;
  for (let mask = 0x4000; exponent > 0 && (sample & mask) === 0; mask >>= 1) {
    exponent -= 1;
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

export function decodeMuLaw8k(value, { maxInputBytes = DEFAULT_MAX_INPUT_BYTES } = {}) {
  const input = bytes(value, "INVALID_MULAW_BUFFER");
  if (input.length === 0 || input.length > positiveByteLimit(maxInputBytes)) {
    fail(input.length === 0 ? "EMPTY_MULAW_AUDIO" : "MULAW_AUDIO_TOO_LARGE");
  }
  const output = Buffer.allocUnsafe(input.length * PCM_BYTES_PER_SAMPLE);
  for (let index = 0; index < input.length; index += 1) {
    output.writeInt16LE(decodeMuLawSample(input[index]), index * PCM_BYTES_PER_SAMPLE);
  }
  return output;
}

/**
 * Converts Twilio's mono 8 kHz mu-law audio to mono signed PCM16LE at 16 kHz.
 * The integer 2:1 conversion repeats each decoded sample. That preserves exact
 * frame duration and is stable across independently delivered WebSocket frames.
 */
export function decodeMuLaw8kToPcm16le16k(value, options) {
  const decoded = decodeMuLaw8k(value, options);
  const output = Buffer.allocUnsafe(decoded.length * 2);
  for (let offset = 0; offset < decoded.length; offset += PCM_BYTES_PER_SAMPLE) {
    const sample = decoded.readInt16LE(offset);
    const outputOffset = offset * 2;
    output.writeInt16LE(sample, outputOffset);
    output.writeInt16LE(sample, outputOffset + PCM_BYTES_PER_SAMPLE);
  }
  return output;
}

export function decodeTwilioMediaPayload(value, {
  maxInputBytes = DEFAULT_MAX_INPUT_BYTES,
} = {}) {
  const input = decodeCanonicalBase64(value, { maxDecodedBytes: maxInputBytes });
  return decodeMuLaw8kToPcm16le16k(input, { maxInputBytes });
}

function averagePcmSamples(input, offsets) {
  let sum = 0;
  for (const offset of offsets) sum += input.readInt16LE(offset);
  return sum >= 0
    ? Math.floor((sum + offsets.length / 2) / offsets.length)
    : Math.ceil((sum - offsets.length / 2) / offsets.length);
}

/**
 * Stateful 24 kHz PCM16LE to 8 kHz mu-law converter. A three-sample box filter
 * provides deterministic anti-aliasing and retains an incomplete triplet until
 * the next provider chunk. `reset` intentionally discards that tail on barge-in.
 */
export function createPcm16le24kToMuLaw8kEncoder({
  maxInputBytes = DEFAULT_MAX_INPUT_BYTES,
} = {}) {
  const limit = positiveByteLimit(maxInputBytes);
  let pending = Buffer.alloc(0);

  function convert(input) {
    const completeSamples = Math.floor(input.length / (PCM_BYTES_PER_SAMPLE * 3)) * 3;
    const output = Buffer.allocUnsafe(completeSamples / 3);
    let outputOffset = 0;
    for (let sampleIndex = 0; sampleIndex < completeSamples; sampleIndex += 3) {
      const byteOffset = sampleIndex * PCM_BYTES_PER_SAMPLE;
      const sample = averagePcmSamples(input, [byteOffset, byteOffset + 2, byteOffset + 4]);
      output[outputOffset] = encodeMuLawSample(sample);
      outputOffset += 1;
    }
    pending = Buffer.from(input.subarray(completeSamples * PCM_BYTES_PER_SAMPLE));
    return output;
  }

  function push(value) {
      const input = assertPcm16(value, limit);
      const combined = pending.length === 0 ? input : Buffer.concat([pending, input]);
      return convert(combined);
  }

  return Object.freeze({
    push,

    pushBase64(value) {
      return push(value).toString("base64");
    },

    flush() {
      if (pending.length === 0) return Buffer.alloc(0);
      const offsets = [];
      for (let offset = 0; offset < pending.length; offset += PCM_BYTES_PER_SAMPLE) {
        offsets.push(offset);
      }
      const result = Buffer.from([encodeMuLawSample(averagePcmSamples(pending, offsets))]);
      pending = Buffer.alloc(0);
      return result;
    },

    reset() {
      pending = Buffer.alloc(0);
    },

    get pendingSampleCount() {
      return pending.length / PCM_BYTES_PER_SAMPLE;
    },
  });
}

export function encodePcm16le24kToMuLaw8k(value, options) {
  const encoder = createPcm16le24kToMuLaw8kEncoder(options);
  return Buffer.concat([encoder.push(value), encoder.flush()]);
}

export function encodeGeminiAudioPayload(value, options) {
  return encodePcm16le24kToMuLaw8k(value, options).toString("base64");
}
