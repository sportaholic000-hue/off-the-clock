import {localPreviewEnabled} from './previewMode.js';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHmac } from 'node:crypto';

export class WebhookDestinationError extends Error {
  constructor(code = 'WEBHOOK_DESTINATION_BLOCKED') {
    super('Use an HTTPS webhook on a public internet address, without URL credentials or redirects.');
    this.code = code; this.statusCode = 400;
  }
}

export function publicAddress(address) {
  if (isIP(address) === 4) {
    const p = address.split('.').map(Number);
    if ([0,10,127].includes(p[0]) || p[0] >= 224 ||
        (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
        (p[0] === 169 && p[1] === 254) ||
        (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
        (p[0] === 192 && (p[1] === 168 || (p[1] === 0 && [0,2].includes(p[2])) || (p[1] === 88 && p[2] === 99))) ||
        (p[0] === 198 && ([18,19].includes(p[1]) || (p[1] === 51 && p[2] === 100))) ||
        (p[0] === 203 && p[1] === 0 && p[2] === 113)) return false;
    return true;
  }
  if (isIP(address) !== 6 || address.includes('%')) return false;
  const groups = address.toLowerCase().split(':');
  const first = parseInt(groups[0],16), second = parseInt(groups[1] || '0',16);
  // Global unicast only. Reject documentation, protocol assignments, Teredo,
  // 6to4, mapped IPv4, loopback, link-local, ULA and multicast.
  return first >= 0x2000 && first <= 0x3fff && first !== 0x2002 &&
    !(first === 0x2001 && (second <= 0x01ff || second === 0x0db8)) &&
    !(first === 0x3fff && second <= 0x0fff);
}

export function parseWebhookUrl(input) {
  if (typeof input !== 'string' || input.length > 2048 || /[\u0000-\u0020\u007f\\]/u.test(input)) {
    throw new WebhookDestinationError();
  }
  let url; try { url = new URL(input); } catch { throw new WebhookDestinationError(); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) {
    throw new WebhookDestinationError();
  }
  return url;
}

export async function resolveWebhookDestination(input, { lookup = dnsLookup, timeoutMs = 3000 } = {}) {
  const url = parseWebhookUrl(input), hostname = url.hostname.replace(/^\[|\]$/g,'');
  let records, timer;
  try {
    records = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await Promise.race([
        lookup(hostname, { all: true, verbatim: true }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new WebhookDestinationError('WEBHOOK_DNS_TIMEOUT')), timeoutMs);
        })
      ]);
  } catch (error) {
    if (error instanceof WebhookDestinationError) throw error;
    throw new WebhookDestinationError('WEBHOOK_DNS_FAILED');
  } finally { clearTimeout(timer); }
  if (!Array.isArray(records) || !records.length || records.some(record =>
      !publicAddress(record.address) || isIP(record.address) !== record.family)) throw new WebhookDestinationError();
  return { url, hostname, address: records[0].address, family: records[0].family };
}

export function signWebhook(secret, timestamp, eventId, body) {
  return 'v1=' + createHmac('sha256', secret).update(String(timestamp) + '.' + eventId + '.' + body).digest('hex');
}

export function postWebhook(destination, { body, headers, timeoutMs = 5000, request = https.request }) {
  // Resolve once, then pin the approved address to the actual socket lookup.
  // No proxy agent, no redirects, and normal TLS certificate checks stay enabled.
  return new Promise((resolve, reject) => {
    let req, finished = false;
    const finish = (error, status) => {
      if (finished) return; finished = true; clearTimeout(timer);
      if (error) reject(error); else resolve(status);
    };
    const timer = setTimeout(() => {
      const error = new Error('Webhook delivery timed out'); error.code = 'WEBHOOK_TIMEOUT';
      req?.destroy(error); finish(error);
    }, timeoutMs);
    try {
      req = request(destination.url, {
        method: 'POST', agent: false, servername: isIP(destination.hostname) ? undefined : destination.hostname,
        lookup: (_host, options, callback) => options?.all
          ? callback(null, [{address: destination.address, family: destination.family}])
          : callback(null, destination.address, destination.family),
        headers: { ...headers, 'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body), 'User-Agent': 'OffTheClock-Webhooks/1' }
      }, response => {
        // The status is sufficient. Do not persist receiver bodies or headers.
        const status = response.statusCode;
        response.on('error', () => {});
        response.destroy();
        finish(null, status);
      });
      req.on('error', error => finish(error));
      req.end(body);
    } catch (error) { req?.destroy(); finish(error); }
  });
}

export function webhookDispatchEnabled(env = process.env) {
  if (localPreviewEnabled(env)) return false;
  const setting = String(env.OUTBOUND_WEBHOOKS_ENABLED || '').toLowerCase();
  return setting === 'true' || (env.NODE_ENV === 'production' && setting !== 'false');
}
