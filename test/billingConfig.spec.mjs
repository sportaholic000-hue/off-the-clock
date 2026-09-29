import assert from 'node:assert/strict';
import test from 'node:test';

import { loadBillingConfig, stripeBillingEnabled } from '../server/src/billingConfig.js';

function completeEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    STRIPE_BILLING_ENABLED: 'true',
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
    STRIPE_INTEGRATION_IDENTIFIER: 'offtheclock_abcdefgh',
    ...overrides
  };
}

test('billing stays fully disabled unless explicitly enabled', () => {
  assert.equal(stripeBillingEnabled({}), false);
  assert.deepEqual(loadBillingConfig({}), { enabled: false });
});

test('one validated configuration drives Checkout and webhook price authority', () => {
  const config = loadBillingConfig(completeEnv());
  assert.equal(config.enabled, true);
  assert.equal(config.priceIds.QuoteDone.annual, 'price_quote_year');
  assert.deepEqual(config.pricePlanMap.get('price_quote_year'), { plan: 'QuoteDone', kind: 'base' });
  assert.equal(config.pricePlanMap.size, 6);
});

test('billing rejects test credentials in production and malformed signing secrets', () => {
  assert.throws(() => loadBillingConfig(completeEnv({ STRIPE_SECRET_KEY: 'sk_test_nope' })), /live-mode/);
  assert.throws(() => loadBillingConfig(completeEnv({ STRIPE_WEBHOOK_SECRET: 'not-a-secret' })), /webhook signing/);
});

test('billing rejects missing, duplicate, or unsafe price and redirect configuration', () => {
  assert.throws(() => loadBillingConfig(completeEnv({ STRIPE_SCALE_ANNUAL_PRICE_ID: '' })), /required/);
  assert.throws(() => loadBillingConfig(completeEnv({
    STRIPE_SCALE_ANNUAL_PRICE_ID: 'price_scale_month'
  })), /distinct/);
  assert.throws(() => loadBillingConfig(completeEnv({
    STRIPE_PORTAL_RETURN_URL: 'https://evil.example/settings/billing'
  })), /share one trusted/);
});

test('loopback HTTP billing URLs are development-only', () => {
  const dev = completeEnv({
    NODE_ENV: 'development',
    STRIPE_SECRET_KEY: 'sk_test_backendOnly',
    STRIPE_CHECKOUT_SUCCESS_URL: 'http://localhost:5173/settings/billing?checkout=success',
    STRIPE_CHECKOUT_CANCEL_URL: 'http://localhost:5173/settings/billing?checkout=cancel',
    STRIPE_PORTAL_RETURN_URL: 'http://localhost:5173/settings/billing'
  });
  assert.doesNotThrow(() => loadBillingConfig(dev));
  assert.throws(() => loadBillingConfig({ ...dev, NODE_ENV: 'production' }), /live-mode|HTTPS/);
});

