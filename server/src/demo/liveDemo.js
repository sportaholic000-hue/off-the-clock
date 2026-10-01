import {normalizeIp} from '../clientAddress.js';
// Website live voice demo: mints single-use, short-lived Gemini Live tokens whose
// model, voice and instructions are locked server-side. The browser talks to Gemini
// directly with that token; the API key never leaves the server.
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import express from 'express';
import { demoInstructions } from './demoInstructions.js';

const AGENTS = Object.freeze({ miles: { name: 'Miles', voiceEnv: 'DEMO_MILES_VOICE', voice: 'Puck' }, nova: { name: 'Nova', voiceEnv: 'DEMO_NOVA_VOICE', voice: 'Kore' } });
export const DEMO_MESSAGES = Object.freeze({
  disabled: 'The live demo is resting right now. Please try again later.',
  origin: 'This demo can only be started from the Off The Clock website.',
  invalid: 'That demo request could not be accepted.',
  hourly: 'You have used the two demo sessions available this hour. Please try again later.',
  busy: 'Both voices are busy right now. Please try again in a minute.',
  daily: 'High demand today. Start your free trial to talk to your own agent.',
  provider: 'The demo could not connect. Please try again.',
});
const intEnv = (env, key, dflt, min, max) => { const n = env[key] === undefined || env[key] === '' ? dflt : Number(env[key]); if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${key} must be an integer from ${min} to ${max}.`); return n; };

export function liveDemoConfig(env = process.env) {
  const enabled = env.DEMO_ENABLED === 'true';
  const c = {
    enabled, key: env.GEMINI_API_KEY || '', model: env.GEMINI_LIVE_MODEL || 'gemini-3.8-live',
    origins: (env.DEMO_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
    perIpPerHour: intEnv(env, 'DEMO_SESSIONS_PER_IP_PER_HOUR', 2, 1, 100),
    dailyCap: intEnv(env, 'DEMO_DAILY_SESSION_CAP', 200, 1, 100000),
    maxConcurrent: intEnv(env, 'DEMO_MAX_CONCURRENT', 10, 1, 1000),
    sessionSeconds: intEnv(env, 'DEMO_SESSION_SECONDS', 180, 30, 600),
    salt: env.DEMO_IP_SALT || env.JWT_SECRET || '',
    agents: Object.fromEntries(Object.entries(AGENTS).map(([k, a]) => [k, { name: a.name, voice: env[a.voiceEnv] || a.voice }])),
  };
  if (!/^[a-zA-Z0-9._-]{1,120}$/.test(c.model)) throw new Error('GEMINI_LIVE_MODEL is invalid.');
  for (const o of c.origins) { const u = new URL(o); if (u.origin !== o) throw new Error(`DEMO_ALLOWED_ORIGINS entry must be a bare origin: ${o}`); }
  if (enabled && !c.key) throw new Error('DEMO_ENABLED=true requires GEMINI_API_KEY.');
  if (enabled && !c.salt) throw new Error('DEMO_ENABLED=true requires DEMO_IP_SALT or JWT_SECRET.');
  if (enabled && !c.origins.length) throw new Error('DEMO_ENABLED=true requires DEMO_ALLOWED_ORIGINS.');
  return c;
}

export function lockedSetup(config, agentKey) {
  const a = config.agents[agentKey];
  return {
    model: `models/${config.model}`,
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: a.voice } } } },
    systemInstruction: { parts: [{ text: demoInstructions(a.name) }] },
    inputAudioTranscription: {}, outputAudioTranscription: {},
  };
}

// Every visitor limit uses the same canonical req.ip as auth and booking.
export function clientIp(req) {
  return normalizeIp(req.ip) || normalizeIp(req.socket?.remoteAddress) || 'unknown';
}

export function installLiveDemoRoutes(app, { db, env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const config = liveDemoConfig(env);
  db.exec(`CREATE TABLE IF NOT EXISTS demoSessions (id TEXT PRIMARY KEY, ipKey TEXT NOT NULL, agent TEXT NOT NULL, createdAt INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS demoSessionsIp ON demoSessions(ipKey, createdAt);
    CREATE INDEX IF NOT EXISTS demoSessionsTime ON demoSessions(createdAt);`);
  const countIp = db.prepare('SELECT COUNT(*) AS n FROM demoSessions WHERE ipKey = ? AND createdAt > ?');
  const countSince = db.prepare('SELECT COUNT(*) AS n FROM demoSessions WHERE createdAt > ?');
  const insert = db.prepare('INSERT INTO demoSessions (id, ipKey, agent, createdAt) VALUES (?, ?, ?, ?)');
  const prune = db.prepare('DELETE FROM demoSessions WHERE createdAt < ?');
  const origins = new Set(config.origins);
  const cors = (req, res) => { const o = req.headers.origin; if (o && origins.has(o)) { res.set('Access-Control-Allow-Origin', o); res.set('Vary', 'Origin'); } return Boolean(o && origins.has(o)); };
  const fail = (res, status, code) => res.status(status).json({ error: code, message: DEMO_MESSAGES[code] });

  const widget = readFileSync(new URL('../../public/otc-live-demo.js', import.meta.url));
  app.get('/demo/otc-live-demo.js', (_req, res) => {
    res.set({ 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Cross-Origin-Resource-Policy': 'cross-origin', 'X-Content-Type-Options': 'nosniff' });
    res.send(widget);
  });
  app.options('/api/demo/session', (req, res) => {
    if (!cors(req, res)) return res.status(403).end();
    res.set('Access-Control-Allow-Methods', 'POST'); res.set('Access-Control-Allow-Headers', 'Content-Type'); res.set('Access-Control-Max-Age', '600');
    return res.status(204).end();
  });
  app.post('/api/demo/session', express.json({ limit: '1kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!cors(req, res)) return fail(res, 403, 'origin');
    if (!config.enabled) return fail(res, 503, 'disabled');
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'agent') || !Object.hasOwn(config.agents, body.agent)) return fail(res, 400, 'invalid');
    const t = now();
    prune.run(t - 2 * 86400000);
    const ipKey = crypto.createHash('sha256').update(config.salt + '|' + clientIp(req)).digest('hex');
    if (countIp.get(ipKey, t - 3600000).n >= config.perIpPerHour) return fail(res, 429, 'hourly');
    if (countSince.get(t - 86400000).n >= config.dailyCap) return fail(res, 429, 'daily');
    if (countSince.get(t - (config.sessionSeconds + 30) * 1000).n >= config.maxConcurrent) return fail(res, 429, 'busy');
    const expireMs = t + (config.sessionSeconds + 30) * 1000;
    let minted;
    try {
      const r = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
        method: 'POST', headers: { 'x-goog-api-key': config.key, 'content-type': 'application/json' },
        body: JSON.stringify({ uses: 1, expireTime: new Date(expireMs).toISOString(), newSessionExpireTime: new Date(t + 60000).toISOString(), bidiGenerateContentSetup: lockedSetup(config, body.agent) }),
        signal: AbortSignal.timeout(10000),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || typeof j?.name !== 'string' || !j.name) return fail(res, 502, 'provider');
      minted = j.name;
    } catch { return fail(res, 502, 'provider'); }
    insert.run(crypto.randomUUID(), ipKey, body.agent, t);
    return res.json({ token: minted, model: config.model, agent: { key: body.agent, name: config.agents[body.agent].name }, sessionSeconds: config.sessionSeconds, expiresAt: new Date(expireMs).toISOString() });
  });
  app.use('/api/demo/session', (err, req, res, next) => { if (res.headersSent) return next(err); res.set('Cache-Control', 'no-store'); cors(req, res); return fail(res, 400, 'invalid'); });
  return config;
}
