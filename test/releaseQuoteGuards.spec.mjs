import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import express from 'express';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer as createViteServer} from 'vite';
import {mowing} from '../verification/engine-independent/fixtures.mjs';

process.env.JWT_SECRET='synthetic-release-quote-guard-session-secret'.padEnd(64,'x');
const {db,migrate}=await import('../server/src/db.js');
const {savePricebook,loadPricebook,pricebookDirectory}=await import('../server/priceBookService.js');
const bridge=await import('../server/src/quoteDoneBridge.js');
const {installQuoteDoneRoutes}=await import('../server/src/quoteDoneRoutes.js');
const {createAuthSessionService}=await import('../server/src/authSessionService.js');
migrate();
const staleMessage='Pricing rules changed — review and re-approve this service before customer quotes resume.';
// Handwritten before execution in RELEASE_BRANCH_INTEGRATION_20261006.md:
// 5,000 sqft x $0.02 = $100. October 10% adds $10 => $110.
// Invalid zones / stale approval => review, no estimate. Re-approval => $100.
function owner(zone,{seasonal=true}={}) {
  const id='synthetic-release-guard-'+randomUUID(),key=randomUUID(),at='2026-10-06T00:00:00.000Z';
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'synthetic','Synthetic','[SYNTHETIC] Guard Co','QuoteDone','active',?,'owner',?)")
    .run(id,id+'@example.invalid',zone,at);
  const fixture=mowing(),raw=structuredClone(fixture.ownerPricing);delete raw.origin;
  raw.peakMonths=seasonal?[10]:[];raw.peakSurchargePercent=seasonal?10:0;
  savePricebook(id,{services:[raw],defaults:{...fixture.businessDefaults,currency:'CAD',quoteTimeZone:'Invalid/Book'}});
  let book=loadPricebook(id);
  bridge.approveApplicationService(id,raw.id,{revision:bridge.bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true},{timeZone:zone});
  book=loadPricebook(id);
  db.prepare('INSERT INTO quoteAccessKeys(ownerId,publicKey,allowedOriginsJson,createdAt) VALUES(?,?,?,?)')
    .run(id,key,JSON.stringify(['https://synthetic.example']),at);
  const token=createAuthSessionService(db).create(db.prepare('SELECT * FROM users WHERE id=?').get(id)).token;
  return {id,key,token,fixture,book,filename:path.join(pricebookDirectory(),id+'.json')};
}
async function routes(t) {
  const app=express();app.use(express.json());
  installQuoteDoneRoutes(app,{asyncHandler:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next),requirePriceBookPlan:(_req,_res,next)=>next()});
  app.use((error,_req,res,_next)=>res.status(error.statusCode||500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const request=async(url,options)=>{const response=await fetch(base+url,options);const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;};
  return {
    catalog:o=>request('/api/public/quote/'+o.key,{headers:{origin:'https://synthetic.example'}}),
    status:async o=>(await request('/api/pricebook/validate',{method:'POST',headers:{authorization:'Bearer '+o.token,'content-type':'application/json'},body:JSON.stringify(bridge.readApplicationBook(o.id))})).statuses[0]
  };
}
function quote(o,instant) {
  const book=loadPricebook(o.id);
  return bridge.calculateApplicationQuote(book,book.services[0],{serviceId:book.services[0].id,customerInputs:o.fixture.customerInputs},{ownerId:o.id,quoteInstant:new Date(instant)});
}
for(const [label,instant,first,second,before,after] of [
  ['west','2026-11-01T06:30:00.000Z','America/Los_Angeles','UTC',110,100],
  ['east','2026-09-30T15:30:00.000Z','UTC','Asia/Tokyo',100,110]
])test('release guard: '+label+' profile changes refresh public catalog/status without saving prices',async t=>{
  const api=await routes(t),a=owner(first),b=owner('UTC'),bytes=fs.readFileSync(a.filename);
  assert.equal((await api.status(a)).status,'QUOTING LIVE');assert.equal((await api.catalog(a)).services.length,1);
  assert.equal(quote(a,instant).customerResult.midEstimate,before);
  db.prepare('UPDATE users SET timezone=? WHERE id=?').run('Invalid/Profile',a.id);
  assert.equal((await api.status(a)).status,'NEEDS PRICING');assert.deepEqual((await api.catalog(a)).services,[]);
  const stopped=quote(a,instant);assert.equal(stopped.customerResult.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(stopped.customerResult.midEstimate,undefined);
  assert.equal((await api.status(b)).status,'QUOTING LIVE');assert.equal((await api.catalog(b)).services.length,1);
  db.prepare('UPDATE users SET timezone=? WHERE id=?').run(second,a.id);
  assert.equal((await api.status(a)).status,'QUOTING LIVE');assert.equal((await api.catalog(a)).services.length,1);
  const changed=quote(a,instant);assert.equal(changed.customerResult.midEstimate,after);
  assert.deepEqual(changed.internalResult.calculationRecord.quoteDate,{timeZone:second,quoteInstant:instant});
  assert.deepEqual(fs.readFileSync(a.filename),bytes);
});
test('release guard: stale approval explains re-approval, blocks quotes and restores exactly $100',async t=>{
  const api=await routes(t),a=owner('UTC',{seasonal:false});
  a.book.services[0].quoteDoneApproval.engineVersion='quote-engine-vnext-launch-fixes-20261005-v6';savePricebook(a.id,a.book);
  const status=await api.status(a);assert.equal(status.status,'NEEDS PRICING');assert.equal(status.approvalCurrent,false);
  assert.ok(status.applicationIssues.includes(staleMessage),JSON.stringify(status.applicationIssues));
  assert.ok(status.validationErrors.includes(staleMessage));assert.deepEqual((await api.catalog(a)).services,[]);
  const stopped=quote(a,'2026-10-06T12:00:00.000Z');assert.equal(stopped.customerResult.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(stopped.customerResult.midEstimate,undefined);
  const saved=loadPricebook(a.id);
  bridge.approveApplicationService(a.id,saved.services[0].id,{revision:bridge.bookRevision(saved),confirmConfiguration:true,confirmLegacySettings:true});
  assert.equal((await api.status(a)).approvalCurrent,true);assert.equal((await api.catalog(a)).services.length,1);
  assert.equal(quote(a,'2026-10-06T12:00:00.000Z').customerResult.midEstimate,100);
});
test('release guard: owner notice does not promise silent UTC fallback',async()=>{
  const vite=await createViteServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});
  try {
    const {ServiceRules}=await vite.ssrLoadModule('/src/quoteDoneControls.jsx');
    const html=renderToStaticMarkup(React.createElement(ServiceRules,{service:{serviceType:'CUSTOM'},meta:{},defaults:{peakMonths:[10],peakSurchargePercent:10},onService(){},onDefault(){}}));
    assert.ok(html.includes('Choose a business time zone for peak pricing.'));
    assert.ok(html.includes('Quotes use a valid saved profile time zone; if neither time zone is valid, quotes with a busy-season surcharge are paused.'));
    assert.doesNotMatch(html,/UTC if none is available/);
  } finally {await vite.close();}
});
