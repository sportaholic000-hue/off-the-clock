import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerCallFixture} from './helpers/ownerCallFixture.mjs';
import {fixture} from './fixtures/bookingCalendar20261006.mjs';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import express from 'express';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {installOwnerAssets} from '../server/src/productionAssets.js';

test('dashboard repair: direct Reports links load the production owner shell',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'SYNTHETIC-reports-assets-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  await writeFile(path.join(directory,'index.html'),'<!doctype html><title>SYNTHETIC owner shell</title>');
  const app=express();installOwnerAssets(app,directory);
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base='http://127.0.0.1:'+server.address().port;
  for(const route of ['/reports','/reports?period=all']){
    const response=await fetch(base+route);assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.match(await response.text(),/SYNTHETIC owner shell/);
  }
  assert.equal((await fetch(base+'/not-an-owner-page')).status,404);
});

// Expected figures were recorded in verification/owner-dashboard-20261007/EXPECTATIONS.md before execution.
test('dashboard repair: confirmed booking creates a durable owner event and an owner-only email',async t=>{
  const f=fixture(t),{i,held}=await f.ready(),request=f.request(i,held);
  await f.booking.confirm(request);await f.booking.confirm(request);
  const rows=f.db.prepare("SELECT * FROM ownerAlerts WHERE ownerId=? AND eventType='booking.confirmed'").all(i.ownerId);
  assert.equal(rows.length,1);
  const sent=[],worker=createOwnerAlertService({database:f.db,ready:()=>true,clock:()=>f.clock().getTime(),environment:{EMAIL_FROM:'owner-alerts@example.invalid'},send:async m=>{sent.push(m);return {accepted:true,id:'SYNTHETIC_'+sent.length};}});
  await worker.processOne(i.ownerId);await worker.processOne(i.ownerId);await worker.dispatchOnce();
  const bookingEmail=sent.filter(m=>m.subject.includes('Booking confirmed'));
  assert.equal(bookingEmail.length,1);assert.equal(bookingEmail[0].to,'synthetic-a@example.invalid');
  assert.match(bookingEmail[0].text,/2026-10-07/);
  assert.ok(f.ownerCalls.dashboard(i.ownerId).notifications.some(row=>row.eventType==='booking.confirmed'));
});
test('dashboard repair: stored billing and transport survive both list and detail',t=>{
  const {db,service}=ownerCallFixture();t.after(()=>db.close());
  db.prepare("UPDATE calls SET minutesBilled=3,transportOutcome='PROVIDER_COMPLETED',callSid='SYNTHETIC_CA',streamSid='SYNTHETIC_MZ',destinationNumber='+19025550199' WHERE ownerId=? AND id=?").run('synthetic-a','synthetic-a-call');
  for(const call of [service.list({ownerId:'synthetic-a'}).calls.find(c=>c.id==='synthetic-a-call'),service.detail({ownerId:'synthetic-a',id:'synthetic-a-call'})]){
    assert.equal(call.minutesBilled,3);assert.equal(call.transportOutcome,'PROVIDER_COMPLETED');assert.equal(call.callSid,'SYNTHETIC_CA');assert.equal(call.streamSid,'SYNTHETIC_MZ');
  }
});
test('dashboard repair: search and status filters include the saved transcript and isolate tenants',t=>{
  const {db,service}=ownerCallFixture();t.after(()=>db.close());
  const page=service.list({ownerId:'synthetic-a',query:{search:'repair my gate',status:'COMPLETED',spam:'exclude'}});
  assert.equal(page.total,1);assert.equal(page.calls[0].id,'synthetic-a-call');
  assert.equal(service.list({ownerId:'synthetic-b',query:{search:'synthetic-a'}}).total,0);
});
test('dashboard repair: billing, transport, transcript exports and follow-up are reachable in the owner components',async t=>{
  const {db,service}=ownerCallFixture();t.after(()=>db.close());
  const vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});t.after(()=>vite.close());
  const {CallDetail}=await vite.ssrLoadModule('/src/calls.jsx'),{QuoteRecordsList}=await vite.ssrLoadModule('/src/quotedone.jsx');
  const detail=service.detail({ownerId:'synthetic-a',id:'synthetic-a-call'});
  const html=renderToStaticMarkup(React.createElement(CallDetail,{call:detail}));
  for(const label of ['Billed minutes','Transport outcome','Download transcript','Print transcript'])assert.ok(html.includes(label),label);
  const leads=renderToStaticMarkup(React.createElement(QuoteRecordsList,{rows:detail.leads,kind:'leads'}));
  for(const label of ['Call back','Owner review','Follow-up'])assert.ok(leads.includes(label),label);
  assert.match(leads,/aria-label="Follow-up action"/);
});
