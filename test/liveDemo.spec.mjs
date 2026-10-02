import {configureClientAddress} from '../server/src/clientAddress.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import { installLiveDemoRoutes, liveDemoConfig, clientIp } from '../server/src/demo/liveDemo.js';

const ORIGIN = 'https://www.offtheclockai.com';
const baseEnv = { DEMO_ENABLED: 'true', GEMINI_API_KEY: 'test-key-123', DEMO_ALLOWED_ORIGINS: ORIGIN, DEMO_IP_SALT: 'salt' };
function harness(envPatch = {}, { mint = () => ({ ok: true, body: { name: 'auth_tokens/abc' } }) } = {}) {
  const db = new Database(':memory:'); const calls = []; let clock = Date.parse('2026-10-01T12:00:00Z');
  const fetchImpl = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); const m = mint(calls.length); return { ok: m.ok, status: m.ok ? 200 : 500, json: async () => m.body }; };
  const app = express(); configureClientAddress(app,{mode:envPatch.TRUST_PROXY || 'none'}); installLiveDemoRoutes(app, { db, env: { ...baseEnv, ...envPatch }, fetchImpl, now: () => clock });
  const server = app.listen(0); const port = server.address().port;
  const post = (body, { origin = ORIGIN, xff, raw } = {}) => fetch(`http://127.0.0.1:${port}/api/demo/session`, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}), ...(xff ? { 'x-forwarded-for': xff, ...(envPatch.TRUST_PROXY === 'railway' ? {'x-real-ip':xff} : {}) } : {}) }, body: raw ?? JSON.stringify(body) }).then(async r => ({ status: r.status, headers: r.headers, json: await r.json().catch(() => null) }));
  return { db, calls, post, port, advance: ms => { clock += ms; }, close: () => server.close() };
}

test('disabled demo refuses before any provider call', async () => {
  const h = harness({ DEMO_ENABLED: 'false' }); const r = await h.post({ agent: 'miles' });
  assert.equal(r.status, 503); assert.equal(r.json.error, 'disabled'); assert.equal(h.calls.length, 0); h.close();
});
test('origin must be allowed; preflight answers only allowed origins', async () => {
  const h = harness();
  assert.equal((await h.post({ agent: 'miles' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await h.post({ agent: 'miles' }, { origin: null })).status, 403);
  const ok = await fetch(`http://127.0.0.1:${h.port}/api/demo/session`, { method: 'OPTIONS', headers: { origin: ORIGIN } });
  assert.equal(ok.status, 204); assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  const bad = await fetch(`http://127.0.0.1:${h.port}/api/demo/session`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
  assert.equal(bad.status, 403); assert.equal(bad.headers.get('access-control-allow-origin'), null);
  assert.equal(h.calls.length, 0); h.close();
});
test('strict body: only a known agent, nothing else', async () => {
  const h = harness();
  for (const b of [{ agent: 'bob' }, { agent: 'miles', model: 'x' }, { agent: 'miles', systemInstruction: 'x' }, [], { }])
    assert.equal((await h.post(b)).status, 400);
  assert.equal((await h.post(null, { raw: 'not json' })).status, 400);
  assert.equal(h.calls.length, 0); h.close();
});
test('success mints a single-use token locked to the agent, voice, model and instructions', async () => {
  const h = harness(); const r = await h.post({ agent: 'nova' });
  assert.equal(r.status, 200); assert.equal(r.json.token, 'auth_tokens/abc'); assert.equal(r.json.agent.name, 'Nova'); assert.equal(r.json.model, 'gemini-3.8-live');
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.ok(!JSON.stringify(r.json).includes('test-key-123'));
  const c = h.calls[0]; assert.equal(c.url, 'https://generativelanguage.googleapis.com/v1beta/auth_tokens');
  assert.equal(c.init.headers['x-goog-api-key'], 'test-key-123'); assert.ok(!c.init.body.includes('test-key-123'));
  assert.equal(c.body.uses, 1);
  const s = c.body.bidiGenerateContentSetup; assert.equal(s.model, 'models/gemini-3.8-live');
  assert.equal(s.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');
  assert.match(s.systemInstruction.parts[0].text, /I'm Nova! What kind of business do you have\?/);
  assert.match(s.systemInstruction.parts[0].text, /digital employee/); assert.match(s.systemInstruction.parts[0].text, /Never deny being an AI/);
  assert.equal(Date.parse(c.body.expireTime) - Date.parse('2026-10-01T12:00:00Z'), 210000);
  assert.equal(Date.parse(c.body.newSessionExpireTime) - Date.parse('2026-10-01T12:00:00Z'), 60000);
  h.close();
});
test('two sessions per visitor per rolling hour; spoofed forwarding headers do not create allowance', async () => {
  const h = harness({ DEMO_MAX_CONCURRENT: '50' });
  assert.equal((await h.post({ agent: 'miles' })).status, 200);
  assert.equal((await h.post({ agent: 'nova' }, { xff: '1.2.3.4' })).status, 200);
  const third = await h.post({ agent: 'miles' }, { xff: '9.9.9.9' });
  assert.equal(third.status, 429); assert.equal(third.json.error, 'hourly'); assert.equal(h.calls.length, 2);
  h.advance(3600001); assert.equal((await h.post({ agent: 'miles' })).status, 200); h.close();
});
test('the shared proxy mode gives the demo the canonical edge address', async () => {
  const h = harness({ TRUST_PROXY: 'railway', DEMO_MAX_CONCURRENT: '50' });
  for (const ip of ['1.1.1.1', '1.1.1.1']) assert.equal((await h.post({ agent: 'miles' }, { xff: ip })).status, 200);
  assert.equal((await h.post({ agent: 'miles' }, { xff: '1.1.1.1' })).status, 429);
  assert.equal((await h.post({ agent: 'miles' }, { xff: '2.2.2.2' })).status, 200);
  assert.equal(clientIp({ socket: { remoteAddress: '10.0.0.1' }, headers: { 'x-forwarded-for': 'spoof, 3.3.3.3' } }, 1), '10.0.0.1');
  assert.equal(clientIp({ socket: { remoteAddress: '10.0.0.1' }, headers: { 'x-forwarded-for': '3.3.3.3' } }, 0), '10.0.0.1');
  h.close();
});
test('concurrency ceiling counts sessions still inside their token lifetime', async () => {
  const h = harness({ DEMO_MAX_CONCURRENT: '1', TRUST_PROXY: 'railway' });
  assert.equal((await h.post({ agent: 'miles' }, { xff: '1.1.1.1' })).status, 200);
  const busy = await h.post({ agent: 'miles' }, { xff: '2.2.2.2' }); assert.equal(busy.status, 429); assert.equal(busy.json.error, 'busy');
  h.advance(210001); assert.equal((await h.post({ agent: 'miles' }, { xff: '2.2.2.2' })).status, 200); h.close();
});
test('daily cap', async () => {
  const h = harness({ DEMO_DAILY_SESSION_CAP: '2', DEMO_MAX_CONCURRENT: '50', TRUST_PROXY: 'railway' });
  assert.equal((await h.post({ agent: 'miles' }, { xff: '1.1.1.1' })).status, 200);
  assert.equal((await h.post({ agent: 'miles' }, { xff: '2.2.2.2' })).status, 200);
  const d = await h.post({ agent: 'miles' }, { xff: '3.3.3.3' }); assert.equal(d.status, 429); assert.equal(d.json.error, 'daily');
  h.advance(86400001); assert.equal((await h.post({ agent: 'miles' }, { xff: '3.3.3.3' })).status, 200); h.close();
});
test('provider failure returns a generic error and does not use up the visitor allowance', async () => {
  const h = harness({ DEMO_MAX_CONCURRENT: '50' }, { mint: n => n <= 2 ? { ok: false, body: { error: { message: 'API key not valid secret-detail' } } } : { ok: true, body: { name: 'auth_tokens/ok' } } });
  for (let i = 0; i < 2; i++) { const r = await h.post({ agent: 'miles' }); assert.equal(r.status, 502); assert.ok(!JSON.stringify(r.json).includes('secret-detail')); }
  assert.equal((await h.post({ agent: 'miles' })).status, 200); assert.equal((await h.post({ agent: 'miles' })).status, 200);
  assert.equal((await h.post({ agent: 'miles' })).status, 429); h.close();
});
test('enabling requires key, salt and origins; origins must be bare', () => {
  assert.throws(() => liveDemoConfig({ DEMO_ENABLED: 'true', DEMO_ALLOWED_ORIGINS: ORIGIN, DEMO_IP_SALT: 's' }), /GEMINI_API_KEY/);
  assert.throws(() => liveDemoConfig({ ...baseEnv, DEMO_ALLOWED_ORIGINS: '' }), /DEMO_ALLOWED_ORIGINS/);
  assert.throws(() => liveDemoConfig({ ...baseEnv, DEMO_ALLOWED_ORIGINS: ORIGIN + '/path' }), /bare origin/);
  assert.throws(() => liveDemoConfig({ ...baseEnv, DEMO_SESSIONS_PER_IP_PER_HOUR: '0' }), /DEMO_SESSIONS_PER_IP_PER_HOUR/);
  assert.equal(liveDemoConfig({}).enabled, false);
});
test('Miles defaults to Charon (low-pitch male per Google catalog); env override still wins', async () => {
  const h = harness(); await h.post({ agent: 'miles' });
  assert.equal(h.calls[0].body.bidiGenerateContentSetup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Charon'); h.close();
  assert.equal(liveDemoConfig({ ...baseEnv, DEMO_MILES_VOICE: 'Orus' }).agents.miles.voice, 'Orus');
});
test('voice audition: refused unless enabled; only listed voices, only for Miles; never in production', async () => {
  const off = harness();
  assert.equal((await off.post({ agent: 'miles', voice: 'Algenib' })).status, 400); assert.equal(off.calls.length, 0); off.close();
  const on = harness({ DEMO_VOICE_AUDITION: 'true', DEMO_MAX_CONCURRENT: '50', DEMO_SESSIONS_PER_IP_PER_HOUR: '50' });
  const r = await on.post({ agent: 'miles', voice: 'Algenib' });
  assert.equal(r.status, 200); assert.equal(r.json.agent.voice, 'Algenib');
  assert.equal(on.calls[0].body.bidiGenerateContentSetup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Algenib');
  for (const b of [{ agent: 'miles', voice: 'Zephyr' }, { agent: 'nova', voice: 'Charon' }, { agent: 'miles', voice: 'algenib' }, { agent: 'miles', voice: 5 }, { agent: 'miles', voice: '' }])
    assert.equal((await on.post(b)).status, 400, JSON.stringify(b));
  assert.equal(on.calls.length, 1);
  const plain = await on.post({ agent: 'miles' }); assert.equal(plain.json.agent.voice, 'Charon'); on.close();
  assert.throws(() => liveDemoConfig({ ...baseEnv, DEMO_VOICE_AUDITION: 'true', NODE_ENV: 'production' }), /cannot run in production/);
});
