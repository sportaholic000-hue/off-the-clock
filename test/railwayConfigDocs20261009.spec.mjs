import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDeploymentConfig} from '../server/src/deploymentConfig.js';
import {voiceAdmissionConfig} from '../server/src/voice/voiceAdmission.js';
import {geminiTextModel} from '../server/src/geminiTextModel.js';

const read = name => readFileSync(new URL('../'+name, import.meta.url), 'utf8');
const template = read('deployment/railway.env.example');
// Handwritten expectations, before execution: 12 core Railway settings and
// 24 conditional settings (6 Twilio/voice, 12 Stripe, 3 OAuth, 2 admin, 1 demo).
// Text drafting has no default but is NOT mandatory for production startup.
const REQUIRED = [
  'NODE_ENV', 'RAILWAY_ENVIRONMENT_ID', 'JWT_SECRET', 'BOOKING_SLOT_TOKEN_SECRET',
  'CREDENTIAL_ENCRYPTION_KEY', 'PUBLIC_BASE_URL', 'CLIENT_URL', 'CORS_ALLOWED_ORIGINS',
  'TRUST_PROXY', 'APP_DATA_DIR', 'RAILWAY_VOLUME_MOUNT_PATH', 'RAILWAY_DEPLOYMENT_DRAINING_SECONDS',
  'TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET',
  'TWILIO_AUTH_TOKEN', 'GEMINI_API_KEY', 'GEMINI_MODEL',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'STRIPE_STARTER_MONTHLY_PRICE_ID', 'STRIPE_STARTER_ANNUAL_PRICE_ID',
  'STRIPE_OPERATOR_MONTHLY_PRICE_ID', 'STRIPE_OPERATOR_ANNUAL_PRICE_ID',
  'STRIPE_QUOTEDONE_MONTHLY_PRICE_ID', 'STRIPE_QUOTEDONE_ANNUAL_PRICE_ID',
  'STRIPE_CHECKOUT_SUCCESS_URL', 'STRIPE_CHECKOUT_CANCEL_URL', 'STRIPE_PORTAL_RETURN_URL',
  'STRIPE_INTEGRATION_IDENTIFIER', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALENDAR_REDIRECT_URI', 'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'DEMO_ALLOWED_ORIGINS',
];
// Syntax-only synthetic values. No server, provider client, network, DB or mount is opened.
const FIXTURE = {
  NODE_ENV:'production', RAILWAY_ENVIRONMENT_ID:'SYNTHETIC_RAILWAY',
  JWT_SECRET:'SYNTHETIC-jwt-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  BOOKING_SLOT_TOKEN_SECRET:'SYNTHETIC-booking-abcdefghijklmnopqrstuvwxyz-0123456789',
  CREDENTIAL_ENCRYPTION_KEY:Buffer.from(Array.from({length:32}, (_,i)=>i)).toString('hex'),
  PUBLIC_BASE_URL:'https://synthetic.example', CLIENT_URL:'https://synthetic.example',
  CORS_ALLOWED_ORIGINS:'https://synthetic.example', TRUST_PROXY:'railway',
  APP_DATA_DIR:'/synthetic/app', RAILWAY_VOLUME_MOUNT_PATH:'/synthetic',
  RAILWAY_DEPLOYMENT_DRAINING_SECONDS:'120',
  ALLOW_PROVIDER_WRITES:'true', VOICE_RUNTIME_ENABLED:'true', STRIPE_BILLING_ENABLED:'true', DEMO_ENABLED:'true',
  TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32), TWILIO_API_KEY_SID:'SK'+'2'.repeat(32),
  TWILIO_API_KEY_SECRET:'SYNTHETIC_API_SECRET', TWILIO_AUTH_TOKEN:'SYNTHETIC_AUTH_TOKEN',
  GEMINI_API_KEY:'SYNTHETIC_GOOGLE_KEY', GEMINI_MODEL:'synthetic-live-model',
  GEMINI_TEXT_MODEL:'synthetic-text-model',
  STRIPE_SECRET_KEY:'sk_live_SYNTHETIC_NOT_A_KEY', STRIPE_WEBHOOK_SECRET:'whsec_SYNTHETIC',
  STRIPE_STARTER_MONTHLY_PRICE_ID:'price_SYNTHETIC_SM', STRIPE_STARTER_ANNUAL_PRICE_ID:'price_SYNTHETIC_SA',
  STRIPE_OPERATOR_MONTHLY_PRICE_ID:'price_SYNTHETIC_OM', STRIPE_OPERATOR_ANNUAL_PRICE_ID:'price_SYNTHETIC_OA',
  STRIPE_QUOTEDONE_MONTHLY_PRICE_ID:'price_SYNTHETIC_QM', STRIPE_QUOTEDONE_ANNUAL_PRICE_ID:'price_SYNTHETIC_QA',
  STRIPE_CHECKOUT_SUCCESS_URL:'https://synthetic.example/success',
  STRIPE_CHECKOUT_CANCEL_URL:'https://synthetic.example/cancel',
  STRIPE_PORTAL_RETURN_URL:'https://synthetic.example/billing',
  STRIPE_INTEGRATION_IDENTIFIER:'synthetic_AbCdEfGh',
  GOOGLE_CLIENT_ID:'SYNTHETIC_CLIENT', GOOGLE_CLIENT_SECRET:'SYNTHETIC_SECRET',
  GOOGLE_CALENDAR_REDIRECT_URI:'https://synthetic.example/api/onboarding/calendar/google/callback',
  ADMIN_EMAIL:'synthetic@example.invalid', ADMIN_PASSWORD_HASH:'$2b$12$'+'S'.repeat(53),
  DEMO_ALLOWED_ORIGINS:'https://synthetic.example',
};
function documented(text, name) {
  // Accept assignments (including commented optional ones) and explicitly named
  // Railway-supplied metadata. Do not mistake arbitrary prose for a setting.
  return new RegExp('^\\s*(?:#\\s*)?'+name+'=', 'm').test(text) ||
    (['RAILWAY_ENVIRONMENT_ID','RAILWAY_VOLUME_MOUNT_PATH'].includes(name) &&
     new RegExp('^#.*\\b'+name+'\\b', 'm').test(text));
}
function configurationFrom(text) {
  const env = Object.fromEntries(Object.entries(FIXTURE).filter(([name])=>documented(text,name)));
  for (const name of REQUIRED) assert.ok(documented(text,name), 'Railway template omits '+name);
  assert.equal(env.NODE_ENV,'production');
  assert.equal(validateDeploymentConfig(env).production,true);
  voiceAdmissionConfig(env);
  return env;
}

test('Railway template covers every handwritten production startup requirement, including enabled feature groups', () => {
  assert.equal(REQUIRED.length,36);
  configurationFrom(template);
});

test('removing any required Railway setting is detected', async t => {
  for (const name of REQUIRED) await t.test(name, () => {
    const without = template.replace(new RegExp('\\b'+name+'\\b','g'),'REMOVED_SETTING');
    assert.throws(()=>configurationFrom(without), new RegExp('Railway template omits '+name));
  });
});

test('both environment templates and deployment guides explicitly cover the independent text model', () => {
  for (const file of ['deployment/railway.env.example','.env.example','docs/RAILWAY_SETUP.md','docs/live-demo/GO_LIVE.md']) {
    const text = read(file);
    assert.match(text,/\bGEMINI_TEXT_MODEL\b/,file+' must name GEMINI_TEXT_MODEL');
    if (file.endsWith('.example')) assert.ok(documented(text,'GEMINI_TEXT_MODEL'),file);
  }
});

test('text model is optional at startup, has no fallback, and rejects a Live model', () => {
  const env = {...FIXTURE}; delete env.GEMINI_TEXT_MODEL;
  assert.equal(validateDeploymentConfig(env).production,true);
  assert.throws(()=>geminiTextModel(env),{code:'TEXT_AI_UNAVAILABLE'});
  assert.equal(geminiTextModel(FIXTURE),'synthetic-text-model');
  assert.throws(()=>validateDeploymentConfig({...env,GEMINI_TEXT_MODEL:'synthetic-live-model'}),/GEMINI_TEXT_MODEL/);
});

test('deprecated demo knobs cannot be presented as working configuration', () => {
  assert.doesNotMatch(read('.env.example'),/^\s*(?:#\s*)?(?:DEMO_DAILY_BUDGET_USD|DEMO_CONCURRENT_MAX)=/m);
  assert.doesNotMatch(read('docs/live-demo/GO_LIVE.md'),/number of proxies in front of the app/);
  assert.throws(()=>validateDeploymentConfig({...FIXTURE,DEMO_TRUSTED_PROXY_HOPS:'1'}),/Remove DEMO_TRUSTED_PROXY_HOPS/);
});

import {loadBillingConfig} from '../server/src/billingConfig.js';
// Owner-approved expected list, written by hand before execution; never derive it from code/templates.
const expectedPrices=['STRIPE_STARTER_MONTHLY_PRICE_ID','STRIPE_STARTER_ANNUAL_PRICE_ID','STRIPE_OPERATOR_MONTHLY_PRICE_ID','STRIPE_OPERATOR_ANNUAL_PRICE_ID','STRIPE_QUOTEDONE_MONTHLY_PRICE_ID','STRIPE_QUOTEDONE_ANNUAL_PRICE_ID'];
for(const name of expectedPrices){
 test(`Railway three-plan configuration documents ${name}`,()=>{
  for(const path of ['deployment/railway.env.example','.env.example'])assert.match(readFileSync(new URL('../'+path,import.meta.url),'utf8'),new RegExp('^\\s*(?:#\\s*)?'+name+'=', 'm'),path);
  assert.ok(readFileSync(new URL('../docs/RAILWAY_SETUP.md',import.meta.url),'utf8').includes(name));
 });
 test(`Stripe enabled refuses missing ${name}`,()=>{
  const env={NODE_ENV:'production',STRIPE_BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_live_SYNTHETIC',STRIPE_WEBHOOK_SECRET:'whsec_SYNTHETIC',STRIPE_INTEGRATION_IDENTIFIER:'synthetic_abcdefgh',STRIPE_CHECKOUT_SUCCESS_URL:'https://synthetic.example.invalid/success',STRIPE_CHECKOUT_CANCEL_URL:'https://synthetic.example.invalid/cancel',STRIPE_PORTAL_RETURN_URL:'https://synthetic.example.invalid/billing',...Object.fromEntries(expectedPrices.map((key,index)=>[key,'price_SYNTHETIC_'+index]))};
  assert.equal(Object.keys(loadBillingConfig(env).priceIds).length,3);delete env[name];assert.throws(()=>loadBillingConfig(env),new RegExp(name+' is required'));
 });
}
