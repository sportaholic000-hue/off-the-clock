import { resolve } from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('.', import.meta.url));
export const LIMITS = Object.freeze({
  sessionMs: 180_000, silenceMs: 10_000, handshakeMs: 15_000,
  responseMs: 20_000, graceMs: 4_000, hourlySessions: 2,
  maxInputChars: 2_000, maxTurns: 40, maxFrameBytes: 16_000,
  maxAudioBytes: 32_000 * 180, maxQueuedBytes: 512_000,
});
export function dollarsToMicros(raw, label) {
  if (typeof raw !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(raw)) throw new TypeError(`${label} requires a nonnegative decimal, at most six places.`);
  const [a,b=''] = raw.split('.'); const n=BigInt(a)*1_000_000n+BigInt(b.padEnd(6,'0'));
  if(n>BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(`${label} exceeds safe accounting precision.`);
  return Number(n);
}
const nonempty=(x,n)=>{if(typeof x!=='string'||!x.trim())throw new Error(`${n} is required.`);return x.trim();};
export function configuration(env=process.env) {
  const enabled=env.DEMO_ENABLED==='true';
  const port=Number(env.DEMO_PORT||8787);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid DEMO_PORT.');
  const origin=new URL(env.DEMO_ORIGIN||`http://127.0.0.1:${port}`);
  if(!['https:','http:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('DEMO_ORIGIN must be an origin, without path or credentials.');
  if(origin.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw new Error('Non-loopback origins require HTTPS.');
  const c={enabled,port,origin:origin.origin,host:env.DEMO_BIND_HOST||'127.0.0.1',
    database:resolve(env.DEMO_DATABASE||resolve(ROOT,'.runtime/demo.sqlite')),
    maxConcurrent:Number(env.DEMO_MAX_CONCURRENT||10), limits:LIMITS,
    agents:{miles:{name:env.DEMO_MILES_NAME||'Miles',voice:env.DEMO_MILES_VOICE||'Puck'},nova:{name:env.DEMO_NOVA_NAME||'Nova',voice:env.DEMO_NOVA_VOICE||'Kore'}},
    signupUrl:env.DEMO_SIGNUP_URL||null, trustedProxyIPs:(env.DEMO_TRUST_PROXY_IPS||'').split(',').map(x=>x.trim()).filter(Boolean),
    key:env.GEMINI_API_KEY||'', model:env.GEMINI_LIVE_MODEL||'', dailyMicros:0,reserveMicros:0,maxRateMicros:0};
  if(!Number.isInteger(c.maxConcurrent)||c.maxConcurrent<1||c.maxConcurrent>1000)throw new Error('Invalid concurrent-session ceiling.');
  for(const a of Object.values(c.agents))if(!/^[A-Za-z][A-Za-z '-]{0,39}$/.test(a.name)||! /^[A-Za-z][A-Za-z0-9_-]{0,59}$/.test(a.voice))throw new Error('Invalid agent name or voice.');
  if(c.trustedProxyIPs.some(x=>!isIP(x)))throw new Error('Trusted proxies must be explicit IP addresses.');
  if(c.agents.miles.voice===c.agents.nova.voice)throw new Error('The two demo voices must be distinct.');
  if(c.signupUrl){const u=new URL(c.signupUrl);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Signup destination must be an approved HTTPS URL.');}
  if(enabled){
    c.key=nonempty(c.key,'GEMINI_API_KEY'); c.model=nonempty(c.model,'GEMINI_LIVE_MODEL');
    if(!/^[a-zA-Z0-9._-]{1,120}$/.test(c.model))throw new Error('Invalid Live model identifier.');
    c.dailyMicros=dollarsToMicros(nonempty(env.DEMO_DAILY_BUDGET_USD,'DEMO_DAILY_BUDGET_USD'),'Daily budget');
    c.reserveMicros=dollarsToMicros(nonempty(env.DEMO_SESSION_RESERVE_USD,'DEMO_SESSION_RESERVE_USD'),'Session reservation');
    c.maxRateMicros=dollarsToMicros(nonempty(env.DEMO_MAX_TOKEN_RATE_USD_PER_MILLION,'DEMO_MAX_TOKEN_RATE_USD_PER_MILLION'),'Conservative token rate');
    if(!c.reserveMicros||!c.maxRateMicros)throw new Error('Session reservation and token rate must be positive.');
  }
  return c;
}
