import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {httpFixture} from './leadCaptureRepair20261006HttpFixture.mjs';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
const words='[SYNTHETIC] Call me after six about the garage door.';
test('owner alert repairs: actual routes and rendered callback/delivery visibility',{timeout:40000},async t=>{
  const f=await httpFixture(t),c=f.context();await f.voice(c).tool('captureLead',{notes:words,callbackRequested:true,email:'synthetic-caller@example.invalid'});
  const lead=f.lead(c)[0],alerts=f.db.prepare('SELECT id FROM ownerAlerts WHERE ownerId=?').all(c.ownerId);
  f.db.prepare("UPDATE ownerAlerts SET status='FAILED',lastErrorCode='SYNTHETIC_EMAIL_REJECTED' WHERE ownerId=?").run(c.ownerId);
  await t.test('owner and staff see exact callback notes, stored delivery failures and honest acceptance wording',async()=>{
    for(const role of ['synthetic-a','synthetic-staff']){const call=await f.request('/api/calls/'+c.callSid,role);assert.equal(call.status,200);assert.equal(call.body.callbackRequests[0].notes,words);assert.equal(call.body.notifications.length,2);assert.ok(call.body.notifications.every(a=>a.status==='FAILED'));assert.equal(call.body.canRetryOwnerAlerts,role==='synthetic-a');assert.doesNotMatch(JSON.stringify(call.body.notifications),/messageJson|SYNTHETIC_KEY|synthetic-caller@example.invalid/);
      const request=await f.request('/api/leads/'+lead.id,role);assert.equal(request.body.callbackRequests[0].notes,words);const all=await f.request('/api/owner-alerts?status=unresolved',role);assert.equal(all.body.total,2);assert.match(all.body.deliveryMeaning,/not confirmed/);
    }
  });
  await t.test('foreign owners cannot read, mark seen or retry alerts; staff cannot mutate alerts',async()=>{
    assert.equal((await f.request('/api/calls/'+c.callSid,'synthetic-b')).status,404);assert.equal((await f.request('/api/owner-alerts','synthetic-b')).body.total,0);
    for(const op of ['retry','seen']){assert.equal((await f.request('/api/owner-alerts/'+alerts[0].id+'/'+op,'synthetic-b',{method:'POST',body:{}})).status,404);assert.equal((await f.request('/api/owner-alerts/'+alerts[0].id+'/'+op,'synthetic-staff',{method:'POST',body:{}})).status,403);}
    assert.equal((await f.request('/api/owner-alerts',null)).status,401);const foreignSelector=await f.request('/api/owner-alerts?ownerId=synthetic-b');assert.equal(foreignSelector.status,403);assert.deepEqual(foreignSelector.body,{error:'Forbidden'});
  });
  await t.test('owner retry route plus fake worker recovers once and accepted alerts do not resend',async()=>{
    const accepted=new Map(),worker=createOwnerAlertService({database:f.db,ownerQuery:f.ownerQuery,ready:()=>true,environment:{EMAIL_FROM:'alerts@example.invalid'},send:async m=>{const old=accepted.get(m.idempotencyKey);if(old){assert.deepEqual(old.message,m);return old.result;}const result={accepted:true,id:'SYNTHETIC_'+accepted.size};accepted.set(m.idempotencyKey,{message:m,result});return result;}});
    for(const alert of alerts)assert.equal((await f.request('/api/owner-alerts/'+alert.id+'/retry',c.ownerId,{method:'POST',body:{}})).status,200);
    await worker.dispatchOnce();assert.equal(accepted.size,2);
    for(const alert of alerts){const r=await f.request('/api/owner-alerts/'+alert.id+'/retry',c.ownerId,{method:'POST',body:{}});assert.equal(r.body.status,'ACCEPTED');}await worker.dispatchOnce();assert.equal(accepted.size,2);
    assert.equal((await f.request('/api/owner-alerts/'+alerts[0].id+'/seen',c.ownerId,{method:'POST',body:{}})).body.seen,true);
  });
  await t.test('failure inbox remains paginated beyond the dashboard limit and belongs to the current tenant',async()=>{
    for(let n=0;n<55;n++)f.db.prepare("INSERT INTO ownerAlerts(id,ownerId,eventKey,eventType,aggregateId,status,createdAt,updatedAt) VALUES(?, ?,?,'lead.created',?,'FAILED','2026-10-01','2026-10-01')").run('synthetic-old-alert-'+n,c.ownerId,'synthetic-old-'+n,lead.id);
    const first=await f.request('/api/owner-alerts?status=unresolved&offset=0'),next=await f.request('/api/owner-alerts?status=unresolved&offset=50');assert.equal(first.body.total,55);assert.equal(first.body.alerts.length,50);assert.equal(next.body.alerts.length,5);assert.equal((await f.request('/api/owner-alerts?status=unresolved&offset=50','synthetic-b')).body.total,0);
  });
  await t.test('actual route data renders caller words, failed and accepted email state, and staff-safe views',async()=>{
    const vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});
    try{const {CallDetail}=await vite.ssrLoadModule('/src/calls.jsx');const {QuoteRecordsList}=await vite.ssrLoadModule('/src/quotedone.jsx');const call=(await f.request('/api/calls/'+c.callSid,'synthetic-staff')).body;
      const html=renderToStaticMarkup(React.createElement(CallDetail,{call}));assert.ok(html.includes(words));assert.match(html,/ACCEPTED/);assert.match(html,/Inbox delivery and owner reading are not confirmed/);assert.doesNotMatch(html,/Retry owner alert|Owner-only|SYNTHETIC_KEY/);
      const leadHtml=renderToStaticMarkup(React.createElement(QuoteRecordsList,{kind:'leads',rows:[(await f.request('/api/leads/'+lead.id,'synthetic-staff')).body]}));assert.match(leadHtml,/Callback requests/);assert.ok(leadHtml.includes(words));
    }finally{await vite.close();}
  });
});
