import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {installSecurityHeaders,OWNER_APP_CSP,DEFAULT_CSP,HSTS} from '../server/src/securityHeaders.js';
import {installOwnerAssets,installWidgetAssets} from '../server/src/productionAssets.js';
import {installQuoteEmailRoutes} from '../server/src/quoteEmailRoutes.js';
import {validateDeploymentConfig} from '../server/src/deploymentConfig.js';
import {transactionalEmailConfigured} from '../server/src/email.js';
import {ownerSignupEnabled} from '../server/src/ownerSignup.js';
import {productionEnv} from './helpers/railwayEnv.mjs';
import {installAuthSessionSchema} from '../server/src/authSessionService.js';
import {installAuthLimitSchema} from '../server/src/authRateLimitService.js';
import {createAuthHandlers} from '../server/src/auth.js';
import {createAuthTokenService,installAuthTokenSchema} from '../server/src/authTokenService.js';

// Expected header values were written by hand before execution.
const EXPECTED_OWNER_CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const EXPECTED_DEFAULT_CSP="default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const LIVE_EMAIL={EMAIL_PROVIDER:'resend',EMAIL_DELIVERY_ENABLED:'true',RESEND_API_KEY:'re_SYNTHETIC_NOT_A_KEY',EMAIL_FROM:'alerts@example.invalid'};

async function serve(t,{production}){
  const dist=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-hardening-dist-'));
  t.after(()=>fs.rmSync(dist,{recursive:true,force:true}));
  fs.mkdirSync(path.join(dist,'assets'));
  fs.writeFileSync(path.join(dist,'index.html'),'<!doctype html><title>SYNTHETIC owner shell</title>');
  fs.writeFileSync(path.join(dist,'widget.js'),'/* SYNTHETIC widget */');
  fs.writeFileSync(path.join(dist,'widget-app.js'),'/* SYNTHETIC widget app */');
  const app=express();installSecurityHeaders(app,{production});
  installWidgetAssets(app,dist);
  app.get('/api/synthetic',(_req,res)=>res.json({ok:true}));
  installQuoteEmailRoutes(app,{service:{publicQuote(){throw Error('SYNTHETIC unavailable');}}});
  installOwnerAssets(app,dist);
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  return 'http://127.0.0.1:'+server.address().port;
}

test('launch hardening: exported policies equal the handwritten expectations',()=>{
  assert.equal(OWNER_APP_CSP,EXPECTED_OWNER_CSP);
  assert.equal(DEFAULT_CSP,EXPECTED_DEFAULT_CSP);
  assert.equal(HSTS,'max-age=31536000; includeSubDomains');
});

test('launch hardening: API, owner page, widget script and 404 all carry the browser security headers in production',async t=>{
  const base=await serve(t,{production:true});
  for(const [route,csp] of [['/api/synthetic',EXPECTED_DEFAULT_CSP],['/dashboard',EXPECTED_OWNER_CSP],['/signup',EXPECTED_OWNER_CSP],['/quote/SYNTHETIC_token',EXPECTED_OWNER_CSP],['/widget.js',EXPECTED_DEFAULT_CSP],['/not-an-owner-page',EXPECTED_DEFAULT_CSP]]){
    const response=await fetch(base+route);await response.arrayBuffer();
    assert.equal(response.headers.get('x-powered-by'),null,route);
    assert.equal(response.headers.get('x-content-type-options'),'nosniff',route);
    assert.equal(response.headers.get('referrer-policy'),'strict-origin-when-cross-origin',route);
    assert.equal(response.headers.get('x-frame-options'),'DENY',route);
    assert.equal(response.headers.get('content-security-policy'),csp,route);
    assert.equal(response.headers.get('strict-transport-security'),'max-age=31536000; includeSubDomains',route);
  }
  const widget=await fetch(base+'/widget.js');await widget.arrayBuffer();
  assert.equal(widget.headers.get('access-control-allow-origin'),'*','the website widget still loads on owner sites');
});

test('launch hardening: HSTS is production-only and the quote copy page keeps its stricter policy',async t=>{
  const base=await serve(t,{production:false});
  const api=await fetch(base+'/api/synthetic');await api.arrayBuffer();
  assert.equal(api.headers.get('strict-transport-security'),null);
  assert.equal(api.headers.get('x-content-type-options'),'nosniff');
  const copy=await fetch(base+'/quote-copy/SYNTHETIC_owner/SYNTHETIC_token');await copy.arrayBuffer();
  assert.equal(copy.status,404);
  assert.equal(copy.headers.get('content-security-policy'),"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  assert.equal(copy.headers.get('referrer-policy'),'no-referrer');
});

test('launch hardening: production refuses open owner signup without live email',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-hardening-volume-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const open=productionEnv(root);delete open.OWNER_SIGNUP_ENABLED;
  assert.throws(()=>validateDeploymentConfig(open),/Owner signup needs live email/);
  assert.throws(()=>validateDeploymentConfig({...open,OWNER_SIGNUP_ENABLED:'true'}),/Owner signup needs live email/);
  for(const key of Object.keys(LIVE_EMAIL)){
    const missing={...open,...LIVE_EMAIL};delete missing[key];
    assert.throws(()=>validateDeploymentConfig(missing),/Owner signup needs live email/,key);
  }
  assert.throws(()=>validateDeploymentConfig({...open,...LIVE_EMAIL,EMAIL_PROVIDER:'console'}),/Owner signup needs live email/);
  assert.throws(()=>validateDeploymentConfig({...open,...LIVE_EMAIL,EMAIL_FROM:'not-an-address'}),/Owner signup needs live email/);
  assert.throws(()=>validateDeploymentConfig({...open,...LIVE_EMAIL,RESEND_API_KEY:'re_SYNTHETIC\nINJECTED'}),/Owner signup needs live email/);
  assert.equal(validateDeploymentConfig({...open,...LIVE_EMAIL}).production,true);
  assert.equal(validateDeploymentConfig({...open,OWNER_SIGNUP_ENABLED:'false'}).production,true);
  assert.throws(()=>validateDeploymentConfig({...open,...LIVE_EMAIL,OWNER_SIGNUP_ENABLED:'no'}),/OWNER_SIGNUP_ENABLED must be true or false/);
  assert.equal(transactionalEmailConfigured(LIVE_EMAIL),true);
  assert.equal(ownerSignupEnabled({}),true);
  assert.equal(ownerSignupEnabled({OWNER_SIGNUP_ENABLED:'false'}),false);
});

test('launch hardening: closed owner signup answers plainly and creates nothing',async t=>{
  const database=new Database(':memory:');t.after(()=>database.close());
  database.exec('CREATE TABLE users(id TEXT PRIMARY KEY, ownerId TEXT, email TEXT UNIQUE, passwordHash TEXT, firstName TEXT, businessName TEXT, plan TEXT, planStatus TEXT, trialEndsAt TEXT, timezone TEXT, role TEXT, createdAt TEXT, emailVerifiedAt TEXT)');
  installAuthTokenSchema(database);installAuthSessionSchema(database);installAuthLimitSchema(database);
  const mail=[],now=()=>new Date('2026-10-29T12:00:00Z');
  const handlers=createAuthHandlers({database,tokenService:createAuthTokenService(database,{clock:now}),now,
    environment:{NODE_ENV:'test',CLIENT_URL:'https://app.example.invalid',JWT_SECRET:'SYNTHETIC_HARDENING_SECRET_ONLY',BCRYPT_COST:12,OWNER_SIGNUP_ENABLED:'false'},
    hashPassword:async p=>'hash:'+p,comparePassword:async(p,h)=>h==='hash:'+p,issueSessionToken:u=>'session:'+u.id,
    sendEmail:async m=>{mail.push(m);return {accepted:true};}});
  const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(payload){this.body=payload;return this;}};
  await handlers.register({method:'POST',ip:'synthetic-ip',body:{email:'owner@example.invalid',password:'original-pass',firstName:'Owner',businessName:'Synthetic business',plan:'Operator'},query:{}},res);
  assert.equal(res.statusCode,503);
  assert.deepEqual(res.body,{error:'Signups are not open yet.'});
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);
  assert.equal(mail.length,0);
});
