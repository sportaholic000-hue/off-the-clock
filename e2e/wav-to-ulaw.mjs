// Converts a 16-bit PCM mono WAV to 8 kHz mu-law (Twilio's phone format) with the app's own encoder.
import fs from 'node:fs';
import { encodeMuLawSample } from '../server/src/voice/audioCodec.js';
const [input, output] = process.argv.slice(2);
const buf = fs.readFileSync(input);
let off = 12, fmt = null, data = null;
while (off + 8 <= buf.length) {
  const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4);
  if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
  if (id === 'data') data = buf.subarray(off + 8, off + 8 + size);
  off += 8 + size + (size % 2);
}
if (!fmt || !data || fmt.bits !== 16) throw new Error('expected 16-bit PCM WAV');
const frames = Math.floor(data.length / 2 / fmt.channels);
const sample = i => data.readInt16LE(i * 2 * fmt.channels);
const outLen = Math.floor(frames * 8000 / fmt.rate), out = Buffer.alloc(outLen);
for (let j = 0; j < outLen; j++) {
  const pos = j * fmt.rate / 8000, i = Math.floor(pos), f = pos - i;
  const v = sample(i) * (1 - f) + (i + 1 < frames ? sample(i + 1) : 0) * f;
  out[j] = encodeMuLawSample(Math.max(-32768, Math.min(32767, Math.round(v))));
}
fs.writeFileSync(output, out);
console.log(`${input}: ${fmt.rate} Hz, ${frames} samples -> ${output}: ${outLen} mu-law bytes (${(outLen / 8000).toFixed(2)} s)`);
