// Simulated phone call against the real server: signed Twilio webhook, signed media-stream
// WebSocket, real Twilio Media Streams messages carrying spoken mu-law audio, real Gemini.
// Usage: node e2e/voice-call-sim.mjs <appOrigin> <publicBaseUrl> <authToken> <accountSid> <to> <ulawFile> <outDir>
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const twilio = require('twilio'); const { WebSocket } = require('ws');
const [appOrigin, publicBase, authToken, accountSid, to, ulawFile, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const out = { steps: {}, startedAt: new Date().toISOString() };
const save = () => fs.writeFileSync(path.join(outDir, 'call.json'), JSON.stringify(out, null, 2));
const hex = n => crypto.randomBytes(n).toString('hex');
const callSid = 'CA' + hex(16), streamSid = 'MZ' + hex(16);
const params = { AccountSid: accountSid, CallSid: callSid, From: '+15065550100', To: to, CallStatus: 'ringing', Direction: 'inbound' };
const incomingPath = '/api/twilio/voice/incoming';
const sig = twilio.getExpectedTwilioSignature(authToken, publicBase + incomingPath, params);
const r = await fetch(appOrigin + incomingPath, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig }, body: new URLSearchParams(params) });
const twiml = await r.text(); out.steps.webhook = { status: r.status, twiml: twiml.replace(/stream\/[A-Za-z0-9_-]+/, 'stream/<nonce>') }; save();
const m = twiml.match(/url="(wss:\/\/[^"]+)"/); if (!m) { out.error = 'no stream url'; save(); process.exit(1); }
const wssUrl = m[1].replace(/&amp;/g, '&'); const streamPath = new URL(wssUrl).pathname;
const wsSig = twilio.getExpectedTwilioSignature(authToken, wssUrl, {});
const ws = new WebSocket(appOrigin.replace(/^http/, 'ws') + streamPath, { headers: { 'x-twilio-signature': wsSig } });
const inbound = { mediaFrames: 0, mediaBytes: 0, marks: 0, clears: 0, firstMediaMs: null, events: [] };
let seq = 0; const t0 = Date.now(); const send = msg => ws.send(JSON.stringify(msg));
ws.on('message', raw => { const msg = JSON.parse(raw.toString());
  if (msg.event === 'media') { inbound.mediaFrames++; inbound.mediaBytes += Buffer.from(msg.media.payload, 'base64').length; if (inbound.firstMediaMs === null) inbound.firstMediaMs = Date.now() - t0; }
  else if (msg.event === 'mark') inbound.marks++; else if (msg.event === 'clear') inbound.clears++; else inbound.events.push(msg.event);
});
const opened = await new Promise(res => { ws.on('open', () => res(true)); ws.on('error', e => res('error: ' + e.message)); ws.on('unexpected-response', (_q, resp) => res('http ' + resp.statusCode)); });
out.steps.websocket = { opened }; save(); if (opened !== true) process.exit(1);
let closed = null; ws.on('close', (code, reason) => { closed = { code, reason: String(reason), atMs: Date.now() - t0 }; });
send({ event: 'connected', protocol: 'Call', version: '1.0.0' });
send({ event: 'start', sequenceNumber: String(++seq), streamSid, start: { accountSid, callSid, streamSid, tracks: ['inbound'], mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 } } });
const speech = fs.readFileSync(ulawFile);
const silence = s => Buffer.alloc(8000 * s, 0xff);
const audio = Buffer.concat([silence(6), speech, silence(14)]);
let chunk = 0;
for (let off = 0; off < audio.length && !closed; off += 160) {
  const payload = audio.subarray(off, off + 160);
  send({ event: 'media', sequenceNumber: String(++seq), streamSid, media: { track: 'inbound', chunk: String(++chunk), timestamp: String(chunk * 20), payload: payload.toString('base64') } });
  await new Promise(res => setTimeout(res, 20));
}
if (!closed) send({ event: 'stop', sequenceNumber: String(++seq), streamSid, stop: { accountSid, callSid } });
await new Promise(res => setTimeout(res, 3000)); try { ws.close(); } catch {}
out.steps.media = { sentFrames: chunk, agentAudioSeconds: +(inbound.mediaBytes / 8000).toFixed(2), ...inbound, closed };
out.callSid = callSid; out.finishedAt = new Date().toISOString(); save();
console.log(JSON.stringify(out.steps.media));
