// Checks that Google itself ends a locked session at the token's expireTime (the hard cost bound).
const KEY = process.env.GEMINI_API_KEY; const out = {};
const t = Date.now();
const r = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', { method: 'POST', headers: { 'x-goog-api-key': KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ uses: 1, expireTime: new Date(t + 40000).toISOString(), newSessionExpireTime: new Date(t + 30000).toISOString(),
    bidiGenerateContentSetup: { model: 'models/gemini-3.8-live', generationConfig: { responseModalities: ['AUDIO'] }, systemInstruction: { parts: [{ text: 'Answer in one short sentence.' }] }, outputAudioTranscription: {} } }) });
const j = await r.json(); out.mintStatus = r.status;
if (!j.name) { console.log(JSON.stringify({ ...out, error: 'mint failed' })); process.exit(0); }
const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(j.name)}`);
const events = []; let closedAt = null;
ws.onopen = () => ws.send(JSON.stringify({ setup: { model: 'models/gemini-3.8-live' } }));
ws.onmessage = async ev => { const m = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text()); if (m.setupComplete) events.push([Math.round((Date.now() - t) / 1000), 'setupComplete']); if (m.serverContent?.turnComplete) events.push([Math.round((Date.now() - t) / 1000), 'turnComplete']); if (m.goAway) events.push([Math.round((Date.now() - t) / 1000), 'goAway']); };
ws.onclose = ev => { closedAt = Math.round((Date.now() - t) / 1000); events.push([closedAt, `close ${ev.code} ${String(ev.reason).slice(0, 80)}`]); };
const say = text => { try { ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } })); events.push([Math.round((Date.now() - t) / 1000), 'sent']); } catch (e) { events.push([Math.round((Date.now() - t) / 1000), 'send failed']); } };
await new Promise(r => setTimeout(r, 5000)); say('Say hello.');
for (const at of [20000, 35000, 50000, 65000]) { await new Promise(r => setTimeout(r, at - (Date.now() - t))); if (ws.readyState === 1) say('Say hello again.'); }
await new Promise(r => setTimeout(r, 5000));
out.tokenExpireSeconds = 40; out.socketClosedAtSeconds = closedAt; out.events = events; out.enforced = closedAt !== null && closedAt <= 50;
console.log(JSON.stringify(out)); process.exit(0);
