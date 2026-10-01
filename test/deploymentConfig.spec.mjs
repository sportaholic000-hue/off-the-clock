import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {productionEnv} from './helpers/railwayEnv.mjs';
import {validateDeploymentConfig,prepareDeploymentEnvironment} from '../server/src/deploymentConfig.js';

function volume(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'otc-deploy-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return root;
}
test('production derives database, price books, backups and temporary writes from the volume',t=>{
  const root=volume(t),env=productionEnv(root,{APP_DATA_DIR:path.join(root,'app')});
  const config=prepareDeploymentEnvironment(env);
  assert.equal(env.DATABASE_PATH,path.join(root,'app','off-the-clock.sqlite'));
  assert.equal(env.PRICEBOOK_PATH,path.join(root,'app','pricebooks'));
  assert.equal(env.TMPDIR,path.join(root,'app','tmp'));
  assert.equal(env.TEMP,env.TMPDIR);assert.equal(env.TMP,env.TMPDIR);
  assert.equal(config.backupPath,path.join(root,'app','backups'));
  assert.ok(fs.statSync(config.backupPath).isDirectory());
  assert.equal(config.backupRetentionDays,30);
  assert.equal(config.backupIntervalMs,21600000);
});
test('production refuses missing required settings before a persistent file opens',t=>{
  const root=volume(t);
  for(const key of ['JWT_SECRET','CREDENTIAL_ENCRYPTION_KEY','BOOKING_SLOT_TOKEN_SECRET','PUBLIC_BASE_URL','CLIENT_URL','CORS_ALLOWED_ORIGINS','TRUST_PROXY','APP_DATA_DIR','RAILWAY_VOLUME_MOUNT_PATH','RAILWAY_DEPLOYMENT_DRAINING_SECONDS']) {
    const env=productionEnv(root);delete env[key];
    assert.throws(()=>validateDeploymentConfig(env),new RegExp(key));
  }
});
test('production refuses unsafe paths, settings, origins and ambiguous proxy configuration',t=>{
  const root=volume(t);
  const changes=[
    {JWT_SECRET:'x'.repeat(64)},{BOOKING_SLOT_TOKEN_SECRET:'0'.repeat(64)},{CREDENTIAL_ENCRYPTION_KEY:'00'.repeat(32)},
    {APP_DATA_DIR:'relative'}, {APP_DATA_DIR:path.dirname(root)}, {DATABASE_PATH:path.join(root,'other.sqlite')},
    {PRICEBOOK_PATH:'pricebooks'}, {TRUST_PROXY:'true'}, {TRUST_PROXY:'2'},
    {TRUST_PROXY:'railway'}, {DEMO_TRUSTED_PROXY_HOPS:'0'},
    {CORS_ALLOWED_ORIGINS:'https://other.invalid'}, {CLIENT_URL:'https://other.invalid'},
    {PUBLIC_BASE_URL:'https://app.offtheclockai.com/'},{PORT:'NaN'},{PORT:'0'},
    {SHUTDOWN_TIMEOUT_SECONDS:'120'},{RAILWAY_DEPLOYMENT_DRAINING_SECONDS:'110'},
    {BACKUP_INTERVAL_SECONDS:'0'},{BACKUP_INTERVAL_SECONDS:'86401'},{BACKUP_RETENTION_DAYS:'29'},
    {STRIPE_BILLING_ENABLED:'yes'},{DEMO_ENABLED:'True'},{LOCAL_PREVIEW_MODE:'true'},
    {GOOGLE_CLIENT_ID:'only-one'},{ADMIN_EMAIL:'admin@example.invalid'},
    {ADMIN_EMAIL:'admin@example.invalid',ADMIN_PASSWORD_HASH:'plaintext'},
    {DEMO_ENABLED:'true',GEMINI_API_KEY:'synthetic',DEMO_ALLOWED_ORIGINS:'http://demo.invalid'}
  ];
  for(const patch of changes)assert.throws(()=>validateDeploymentConfig(productionEnv(root,patch)),undefined,JSON.stringify(patch));
});
test('a missing volume is never created as an ephemeral fallback',t=>{
  const root=volume(t),missing=path.join(root,'missing');
  assert.throws(()=>prepareDeploymentEnvironment(productionEnv(missing)),/volume is missing/);
  assert.equal(fs.existsSync(missing),false);
});
test('production storage rejects a symlink that escapes the declared volume',t=>{
  const root=volume(t),outside=volume(t),link=path.join(root,'escape');
  fs.symlinkSync(outside,link,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>prepareDeploymentEnvironment(productionEnv(root,{APP_DATA_DIR:link})),/symlink/);
  assert.equal(fs.existsSync(path.join(outside,'pricebooks')),false);
});
test('development keeps its existing storage behavior and trusts no proxy by default',()=>{
  assert.deepEqual(validateDeploymentConfig({NODE_ENV:'test'}),{production:false,mode:'none'});
});

test('Google Calendar validates the existing onboarding callback without changing its route',t=>{
  const root=volume(t),env=productionEnv(root,{GOOGLE_CLIENT_ID:'SYNTHETIC_GOOGLE_CLIENT',GOOGLE_CLIENT_SECRET:'SYNTHETIC_GOOGLE_SECRET',GOOGLE_CALENDAR_REDIRECT_URI:'https://app.offtheclockai.com/api/onboarding/calendar/google/callback'});
  assert.equal(validateDeploymentConfig(env).production,true);
  assert.throws(()=>validateDeploymentConfig({...env,GOOGLE_CALENDAR_REDIRECT_URI:'https://app.offtheclockai.com/api/oauth/google/callback'}),/GOOGLE_CALENDAR_REDIRECT_URI/);
});

test('Railway cannot accidentally boot with development storage defaults',()=>{
  assert.throws(()=>validateDeploymentConfig({RAILWAY_ENVIRONMENT_ID:'SYNTHETIC_RAILWAY_ENVIRONMENT',NODE_ENV:'development'}),/NODE_ENV=production/);
});
