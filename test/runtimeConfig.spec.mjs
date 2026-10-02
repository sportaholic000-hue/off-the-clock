import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowedCorsOrigins,
  providerWritesEnabled,
  validateRuntimeConfig,
  voiceRuntimeEnabled
} from '../server/src/runtimeConfig.js';

const secureProduction = {
  NODE_ENV: 'production',
  JWT_SECRET: 'j'.repeat(48),
  CREDENTIAL_ENCRYPTION_KEY: '11'.repeat(32),
  BOOKING_SLOT_TOKEN_SECRET: 'b'.repeat(48),
  PUBLIC_BASE_URL: 'https://api.example.com',
  CORS_ALLOWED_ORIGINS: 'https://app.example.com,https://widget.example.com',
  ALLOW_PROVIDER_WRITES: 'false',
  VOICE_RUNTIME_ENABLED: 'false'
};

test('production runtime accepts only complete secure base configuration', () => {
  assert.deepEqual(validateRuntimeConfig(secureProduction), {
    production: true,
    providerWrites: false,
    voiceRuntime: false,
    stripeBilling: false,
    corsOrigins: ['https://app.example.com', 'https://widget.example.com']
  });
  for (const [field, value] of [
    ['JWT_SECRET', 'change-me'],
    ['CREDENTIAL_ENCRYPTION_KEY', 'short'],
    ['BOOKING_SLOT_TOKEN_SECRET', 'short'],
    ['PUBLIC_BASE_URL', 'http://api.example.com'],
    ['CORS_ALLOWED_ORIGINS', 'http://app.example.com']
  ]) {
    assert.throws(
      () => validateRuntimeConfig({ ...secureProduction, [field]: value }),
      error => error.code === 'INVALID_RUNTIME_CONFIG' && error.details.length > 0,
      field
    );
  }
});

test('enabled Stripe billing must have one complete validated configuration', () => {
  const enabled = {
    ...secureProduction,
    STRIPE_BILLING_ENABLED: 'true',
    STRIPE_USAGE_ENABLED: 'true',
    STRIPE_OVERAGE_MONTHLY_PRICE_ID: 'price_usage_month',
    STRIPE_USAGE_METER_ID: 'mtr_usage',
    STRIPE_USAGE_EVENT_NAME: 'otc_voice_overage',
    STRIPE_SECRET_KEY: 'rk_live_backendOnly',
    STRIPE_WEBHOOK_SECRET: 'whsec_signingSecret',
    STRIPE_OPERATOR_MONTHLY_PRICE_ID: 'price_operator_month',
    STRIPE_OPERATOR_ANNUAL_PRICE_ID: 'price_operator_year',
    STRIPE_QUOTEDONE_MONTHLY_PRICE_ID: 'price_quote_month',
    STRIPE_QUOTEDONE_ANNUAL_PRICE_ID: 'price_quote_year',
    STRIPE_SCALE_MONTHLY_PRICE_ID: 'price_scale_month',
    STRIPE_SCALE_ANNUAL_PRICE_ID: 'price_scale_year',
    STRIPE_CHECKOUT_SUCCESS_URL: 'https://app.example.com/settings/billing?checkout=success',
    STRIPE_CHECKOUT_CANCEL_URL: 'https://app.example.com/settings/billing?checkout=cancel',
    STRIPE_PORTAL_RETURN_URL: 'https://app.example.com/settings/billing',
    STRIPE_INTEGRATION_IDENTIFIER: 'offtheclock_abcdefgh'
  };
  assert.equal(validateRuntimeConfig(enabled).stripeBilling, true);
  assert.throws(
    () => validateRuntimeConfig({ ...enabled, STRIPE_WEBHOOK_SECRET: '' }),
    error => error.code === 'INVALID_RUNTIME_CONFIG' && error.details.some(item => item.includes('STRIPE_WEBHOOK_SECRET'))
  );
});

test('configured URLs are exact origins and local HTTP is development-only', () => {
  assert.deepEqual(
    allowedCorsOrigins({ NODE_ENV: 'development', CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:3000' }),
    ['http://localhost:5173', 'http://127.0.0.1:3000']
  );
  assert.throws(() => allowedCorsOrigins({
    NODE_ENV: 'production',
    CORS_ALLOWED_ORIGINS: 'https://app.example.com/path'
  }));
});

test('provider REST writes require well-formed Twilio API-key credentials', () => {
  const enabled = {
    ...secureProduction,
    ALLOW_PROVIDER_WRITES: 'true',
    TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
    TWILIO_API_KEY_SID: `SK${'b'.repeat(32)}`,
    TWILIO_API_KEY_SECRET: 'provider-secret'
  };
  assert.equal(providerWritesEnabled(enabled), true);
  assert.doesNotThrow(() => validateRuntimeConfig(enabled));
  assert.throws(() => validateRuntimeConfig({ ...enabled, TWILIO_API_KEY_SID: 'bad' }));
  assert.throws(() => validateRuntimeConfig({ ...enabled, TWILIO_API_KEY_SECRET: '' }));
});

test('voice runtime has a separate inbound-signature credential gate', () => {
  const enabled = {
    ...secureProduction,
    VOICE_RUNTIME_ENABLED: 'true',
    TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
    TWILIO_AUTH_TOKEN: 'signature-secret',
    GEMINI_API_KEY: 'gemini-secret',
    GEMINI_MODEL: 'gemini-3.8-live'
  };
  assert.equal(voiceRuntimeEnabled(enabled), true);
  assert.doesNotThrow(() => validateRuntimeConfig(enabled));
  assert.throws(() => validateRuntimeConfig({ ...enabled, TWILIO_AUTH_TOKEN: '' }));
  assert.throws(() => validateRuntimeConfig({ ...enabled, GEMINI_API_KEY: '' }));
  assert.throws(() => validateRuntimeConfig({ ...enabled, GEMINI_MODEL: 'gemini-2.5-flash' }));
  assert.throws(() => validateRuntimeConfig({ ...enabled, PUBLIC_BASE_URL: 'http://localhost:3000' }));
});
