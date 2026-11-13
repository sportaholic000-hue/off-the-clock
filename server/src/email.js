import crypto from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {deliverableEmailAddress} from './emailAddress.js';

export class EmailDeliveryError extends Error {
  constructor(code = 'EMAIL_DELIVERY_FAILED') {
    super('Account email is temporarily unavailable.');
    this.name = 'EmailDeliveryError';
    this.code = code;
  }
}

// Live account email (verification and password reset) needs all four settings.
// Production startup and the sender share this one definition.
export function transactionalEmailConfigured(environment = process.env) {
  return environment.EMAIL_PROVIDER === 'resend' && environment.EMAIL_DELIVERY_ENABLED === 'true' &&
    typeof environment.RESEND_API_KEY === 'string' && Boolean(environment.RESEND_API_KEY) &&
    !/[\r\n]/.test(environment.RESEND_API_KEY) && typeof environment.EMAIL_FROM === 'string' &&
    /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(environment.EMAIL_FROM);
}

export function createTransactionalEmailSender({
  environment = process.env, fetchClient = globalThis.fetch, wait = delay, logger = console
} = {}) {
  return async function send({to, subject, text, idempotencyKey = crypto.randomUUID()}) {
    if (!deliverableEmailAddress(to) ||
        typeof subject !== 'string' || !subject || /[\r\n]/.test(subject) ||
        typeof text !== 'string' || !text || typeof idempotencyKey !== 'string' ||
        !/^[A-Za-z0-9_/-]{1,256}$/.test(idempotencyKey)) throw new EmailDeliveryError('EMAIL_REQUEST_INVALID');
    const provider = environment.EMAIL_PROVIDER || 'console';
    if (provider === 'console' && environment.NODE_ENV !== 'production') {
      // Development diagnostics must not expose token links or message bodies.
      logger.info('[email:console]', {provider: 'console', simulated: true});
      return {provider: 'console', accepted: true, simulated: true};
    }
    if (!transactionalEmailConfigured(environment) ||
        typeof fetchClient !== 'function') throw new EmailDeliveryError('EMAIL_NOT_CONFIGURED');
    const payload = JSON.stringify({from: environment.EMAIL_FROM, to: [to], subject, text});
    for (let attempt = 0; attempt < 3; attempt++) {
      let retry = false;
      try {
        const response = await fetchClient('https://api.resend.com/emails', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
          headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + environment.RESEND_API_KEY,
            'Idempotency-Key': idempotencyKey},
          body: payload
        });
        if (response.ok) {
          const result = await response.json();
          if (typeof result.id !== 'string' || !result.id.trim() || result.id.length > 200) {
            throw new EmailDeliveryError();
          }
          return {provider: 'resend', accepted: true, id: result.id};
        }
        retry = response.status === 408 || response.status === 429 || response.status >= 500;
        if (!retry) throw new EmailDeliveryError();
      } catch (error) {
        if (error instanceof EmailDeliveryError) throw error;
        retry = true; // An ambiguous network outcome reuses the exact payload and key.
      }
      if (!retry || attempt === 2) break;
      await wait(attempt === 0 ? 250 : 750);
    }
    throw new EmailDeliveryError();
  };
}

export async function sendTransactionalEmail(message) {
  return createTransactionalEmailSender()(message);
}
