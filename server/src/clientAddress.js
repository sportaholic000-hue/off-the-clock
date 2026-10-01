import {isIP} from 'node:net';

export function proxyMode(env = process.env) {
  const mode = env.TRUST_PROXY || 'none';
  if (!['none','railway'].includes(mode)) throw new Error('TRUST_PROXY must be none or railway.');
  return mode;
}

export function normalizeIp(value) {
  if (typeof value !== 'string') return null;
  const ip = value.trim();
  if (ip.includes('%') || !isIP(ip)) return null;
  if (/^::ffff:/i.test(ip) && isIP(ip.slice(7)) === 4) return ip.slice(7);
  if(isIP(ip) === 4) return ip;
  const canonical = new URL('http://[' + ip + ']/').hostname.slice(1,-1);
  const mapped = canonical.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if(mapped) {const high=parseInt(mapped[1],16),low=parseInt(mapped[2],16);return [high>>8,high&255,low>>8,low&255].join('.');}
  return canonical;
}

// Railway staff identify X-Real-IP as the edge's overwritten connecting-IP
// header. XFF may include extra internal hops; it is never a quota identity.
// railway mode is only for a service reachable through Railway's public edge.
export function configureClientAddress(app, {mode = proxyMode()} = {}) {
  if (!['none','railway'].includes(mode)) throw new Error('Invalid proxy mode.');
  app.set('trust proxy', mode === 'railway' ? 1 : false);
  app.use((req, _res, next) => {
    const peer = normalizeIp(req.socket?.remoteAddress) || 'unknown';
    const ip = mode === 'railway' ? normalizeIp(req.headers['x-real-ip']) || peer : peer;
    Object.defineProperty(req, 'ip', {value:ip, configurable:true});
    next();
  });
}
