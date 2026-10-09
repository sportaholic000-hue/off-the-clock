import { loadBillingConfig, stripeBillingEnabled } from './billingConfig.js';
import {validLiveModelName} from './voice/liveModelName.js';
import {geminiTextModel,textAIConfiguration} from './geminiTextModel.js';

// Release pin: an older engine must never start serving production quotes.
// Advance deliberately with an approved engine release, not through an env override.
export const EXPECTED_QUOTE_ENGINE_VERSION = 'quote-engine-vnext-date-context-20261006-v7';
export function requireProductionQuoteEngineVersion(engineVersion, env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  if (engineVersion !== EXPECTED_QUOTE_ENGINE_VERSION) {
    throw Object.assign(new Error(`QUOTE_ENGINE_VERSION_MISMATCH: expected ${EXPECTED_QUOTE_ENGINE_VERSION}; production startup refused.`), {
      code: 'QUOTE_ENGINE_VERSION_MISMATCH'
    });
  }
}

const INSECURE_JWT_SECRETS = new Set([
  'change-me', 'changeme', 'secret', 'development', 'replace-me'
]);

const TWILIO_ACCOUNT_SID = /^AC[0-9a-f]{32}$/i;
const TWILIO_API_KEY_SID = /^SK[0-9a-f]{32}$/i;

function bytesFromCredentialKey(value) {
  const raw = String(value || '').trim();
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  try { return Buffer.from(raw, 'base64'); } catch { return Buffer.alloc(0); }
}

export function providerWritesEnabled(env = process.env) {
  return String(env.ALLOW_PROVIDER_WRITES || '').toLowerCase() === 'true';
}

export function voiceRuntimeEnabled(env = process.env) {
  return String(env.VOICE_RUNTIME_ENABLED || '').toLowerCase() === 'true';
}

export function allowedCorsOrigins(env = process.env, { production = env.NODE_ENV === 'production' } = {}) {
  const entries = String(env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const origins = [];
  for (const entry of entries) {
    let parsed;
    try { parsed = new URL(entry); } catch {
      throw new Error('CORS_ALLOWED_ORIGINS must contain valid origins');
    }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.origin !== entry || parsed.username || parsed.password ||
        (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:' && !production))) {
      throw new Error('CORS_ALLOWED_ORIGINS must contain exact HTTPS origins');
    }
    origins.push(parsed.origin);
  }
  return [...new Set(origins)];
}

export function validateRuntimeConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const errors = [];
  if(env.GEMINI_TEXT_MODEL)try{geminiTextModel(env);}catch{errors.push('GEMINI_TEXT_MODEL must be an explicit text generation model, separate from GEMINI_MODEL');}
  const jwtSecret = String(env.JWT_SECRET || '');
  if (!jwtSecret) errors.push('JWT_SECRET is required');
  else if (INSECURE_JWT_SECRETS.has(jwtSecret.toLowerCase()) || jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be a non-default secret of at least 32 characters');
  }

  if (production) {
    if (bytesFromCredentialKey(env.CREDENTIAL_ENCRYPTION_KEY).length !== 32) {
      errors.push('CREDENTIAL_ENCRYPTION_KEY must encode exactly 32 bytes');
    }
    let publicBase;
    try { publicBase = new URL(env.PUBLIC_BASE_URL); } catch { /* handled below */ }
    if (!publicBase || publicBase.protocol !== 'https:' ||
        publicBase.origin !== String(env.PUBLIC_BASE_URL || '').replace(/\/$/, '') ||
        publicBase.username || publicBase.password || publicBase.pathname !== '/' ||
        publicBase.search || publicBase.hash) {
      errors.push('PUBLIC_BASE_URL must be a valid HTTPS origin in production');
    }
    if (String(env.CORS_ALLOWED_ORIGINS || '').trim() === '') errors.push('CORS_ALLOWED_ORIGINS is required in production');
    if (Buffer.byteLength(String(env.BOOKING_SLOT_TOKEN_SECRET || '')) < 32) {
      errors.push('BOOKING_SLOT_TOKEN_SECRET must contain at least 32 bytes');
    }
  }

  try { allowedCorsOrigins(env, { production }); }
  catch (error) { errors.push(error.message); }

  if (providerWritesEnabled(env)) {
    for (const name of ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET']) {
      if (!String(env[name] || '').trim()) errors.push(`${name} is required when provider writes are enabled`);
    }
    if (env.TWILIO_ACCOUNT_SID && !TWILIO_ACCOUNT_SID.test(env.TWILIO_ACCOUNT_SID)) {
      errors.push('TWILIO_ACCOUNT_SID must be a valid Account SID');
    }
    if (env.TWILIO_API_KEY_SID && !TWILIO_API_KEY_SID.test(env.TWILIO_API_KEY_SID)) {
      errors.push('TWILIO_API_KEY_SID must be a valid API Key SID');
    }
  }

  if (voiceRuntimeEnabled(env)) {
    for (const name of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'GEMINI_API_KEY', 'GEMINI_MODEL']) {
      if (!String(env[name] || '').trim()) errors.push(`${name} is required when the voice runtime is enabled`);
    }
    if (env.TWILIO_ACCOUNT_SID && !TWILIO_ACCOUNT_SID.test(env.TWILIO_ACCOUNT_SID)) {
      errors.push('TWILIO_ACCOUNT_SID must be a valid Account SID');
    }
    if (env.GEMINI_MODEL && !validLiveModelName(env.GEMINI_MODEL)) {
      errors.push('GEMINI_MODEL must be an explicit Gemini Live model');
    }
    let voicePublicBase;
    try { voicePublicBase = new URL(env.PUBLIC_BASE_URL); } catch { /* handled below */ }
    if (!voicePublicBase || voicePublicBase.protocol !== 'https:' ||
        voicePublicBase.origin !== String(env.PUBLIC_BASE_URL || '').replace(/\/$/, '') ||
        voicePublicBase.username || voicePublicBase.password || voicePublicBase.pathname !== '/' ||
        voicePublicBase.search || voicePublicBase.hash) {
      errors.push('PUBLIC_BASE_URL must be a valid HTTPS origin when the voice runtime is enabled');
    }
  }

  if (stripeBillingEnabled(env)) {
    try { loadBillingConfig(env); }
    catch (error) { errors.push(error.message); }
  }

  if (errors.length) {
    const error = new Error(`Invalid runtime configuration: ${errors.join('; ')}`);
    error.code = 'INVALID_RUNTIME_CONFIG';
    error.details = errors;
    throw error;
  }
  return {
    production,
    providerWrites: providerWritesEnabled(env),
    voiceRuntime: voiceRuntimeEnabled(env),
    stripeBilling: stripeBillingEnabled(env),
    textAI:textAIConfiguration(env),
    corsOrigins: allowedCorsOrigins(env, { production })
  };
}
