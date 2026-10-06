// Measures how fast Gemini delivers spoken audio across a ~3 minute demo session from a datacenter.
// Speech must arrive at least as fast as it plays (ratio >= 1); below 1 the listener hears gaps.
import { writeFileSync } from 'node:fs';
import { demoInstructions } from '../server/src/demo/demoInstructions.js';
const KEY = process.env.GEMINI_API_KEY, MODEL = 'gemini-3.8-live';
const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${KEY}`;
const ws = new WebSocket(url); const out = { model: MODEL, turns: [] }; let cur = null, t0 = Date.now();
const text = async d => typeof d === 'string' ? d : Buffer.from(await d.arrayBuffer?.() ?? d).toString();
ws.onmessage = async ev => { const m = JSON.parse(await text(ev.data)); if (m.setupComplete) out.setupMs = Date.now() - t0;
  const s = m.serverContent; if (!s || !cur) return;
  for (const p of s.modelTurn?.parts || []) if (p.inlineData?.data) { const b = Buffer.from(p.inlineData.data, 'base64').length; if (!cur.first) cur.first = Date.now(); cur.bytes += b; cur.chunks++; cur.maxGap = Math.max(cur.maxGap, cur.last ? Date.now() - cur.last : 0); cur.last = Date.now(); }
  if (s.turnComplete) cur.done(); };
await new Promise(r => { ws.onopen = r; });
ws.send(JSON.stringify({ setup: { model: `models/${MODEL}`, generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }, systemInstruction: { parts: [{ text: demoInstructions('Nova') }] }, outputAudioTranscription: {} } }));
await new Promise(r => setTimeout(r, 1500));
const prompts = ['[SYSTEM] A visitor just started the demo. Greet them now.', 'I have a roofing company.', 'I just answer them all myself.', 'What happens if a customer gives the wrong dimensions?', 'What questions do you ask people who want a roof quote?', 'Is that all of them?', 'How do I set up my number?', 'Can it run all night?', 'What does QuoteDone cost?', 'What if I want to cancel?', 'Do you work for landscapers too?', 'What questions for a lawn mowing quote?', 'Okay, sounds good.'];
for (const p of prompts) {
  const turn = { prompt: p, sentAt: Date.now() - t0, bytes: 0, chunks: 0, maxGap: 0 };
  await new Promise(res => { cur = { ...turn, done: res }; cur.done = res; ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: p }] }], turnComplete: true } })); setTimeout(res, 40000); });
  const audioSec = cur.bytes / 48000, overSec = cur.first ? (cur.last - cur.first) / 1000 : 0;
  out.turns.push({ atSec: +(turn.sentAt / 1000).toFixed(1), prompt: p.slice(0, 40), firstAudioMs: cur.first ? cur.first - (turn.sentAt + t0) : null, audioSec: +audioSec.toFixed(1), deliveredOverSec: +overSec.toFixed(1), speedVsPlayback: overSec ? +(audioSec / overSec).toFixed(2) : null, chunks: cur.chunks, maxGapMs: cur.maxGap });
  await new Promise(r => setTimeout(r, 4000));
}
ws.close(); writeFileSync('delivery-rate.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out.turns));
