import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {httpFixture,seedViews} from './leadCaptureRepair20261006HttpFixture.mjs';

test('lead capture repairs: real routes, tenant authorization, stored receipts and rendered contact',{timeout:40000},async t=>{
  const f=await httpFixture(t),s=await seedViews(f);
  await t.test('owner/staff call and lead routes preserve notes, urgency and corrected preferred contact',async()=>{
    for(const role of ['synthetic-a','synthetic-staff']){
      const call=await f.request('/api/calls/'+s.c.callSid,role);assert.equal(call.status,200);const lead=call.body.leads[0];assert.equal(lead.notes,s.notes);assert.equal(lead.urgency.reason,'safety');assert.equal(lead.urgency.summary,'[SYNTHETIC] Gate can fall.');assert.equal(lead.contact.email,'preferred@example.invalid');assert.equal(lead.callerNumber,'+19025550199');assert.equal(lead.location.line1,undefined);
      assert.equal(call.body.bookingRequests[0].customer.email,'preferred@example.invalid');assert.equal(call.body.quotes[0].contact.email,'instant@example.invalid');assert.equal(call.body.quotes[0].result.lowEstimate,221.23);
      const one=await f.request('/api/leads/'+s.row.id,role);assert.equal(one.status,200);assert.equal(one.body.contact.email,'preferred@example.invalid');assert.equal(one.body.submittedContact.email,'original@example.invalid');
      if(role==='synthetic-staff')assert.doesNotMatch(JSON.stringify(call.body),/SECRET_COST|SECRET_RATE|internal/);
    }
  });
  await t.test('owner disposition through actual PATCH survives capture correction and exact replay',async()=>{
    assert.equal((await f.request('/api/leads/'+s.row.id,'synthetic-a',{method:'PATCH',body:{status:'DISMISSED'}})).status,200);
    f.advance(2000);await f.voice(s.c).tool('captureLead',{email:'latest@example.invalid'},'latest-contact');await f.voice(s.c).tool('captureLead',{email:'latest@example.invalid'},'latest-contact');
    const {body}=await f.request('/api/leads/'+s.row.id);assert.equal(body.status,'DISMISSED');assert.equal(body.contact.email,'latest@example.invalid');assert.equal(body.contact.phone,'+19025550199');assert.equal(body.followUpSource.kind,'voice_capture');assert.equal(f.lead(s.c).length,1);
  });
  await t.test('wrong owners, staff and missing sessions cannot read or change other tenant records',async()=>{
    for(const id of ['synthetic-a','synthetic-staff']){assert.equal((await f.request('/api/calls/'+s.foreign.callSid,id)).status,404);assert.equal((await f.request('/api/leads/'+f.lead(s.foreign)[0].id,id,{method:'PATCH',body:{status:'DISMISSED'}})).status,404);assert.doesNotMatch(JSON.stringify((await f.request('/api/leads',id)).body),/foreign@example.invalid|OTHER TENANT/);}
    assert.equal((await f.request('/api/calls/'+s.c.callSid,'synthetic-b')).status,404);assert.equal((await f.request('/api/leads/activity',null)).status,401);assert.equal((await f.request('/api/calls?ownerId=synthetic-b')).status,400);
  });
  await t.test('instant quote list exposes safe saved contact from separate submission without recalculation',async()=>{
    const {status,body}=await f.request('/api/quotes','synthetic-staff');assert.equal(status,200);assert.equal(body.quotes[0].contact.email,'instant@example.invalid');assert.equal(body.quotes[0].context,'[SYNTHETIC] After 6');assert.equal(body.quotes[0].result.highEstimate,221.23);assert.doesNotMatch(JSON.stringify(body),/SECRET_COST|SECRET_RATE|internal/);
    assert.equal(f.db.prepare('SELECT resultJson FROM quotes WHERE ownerId=?').get(s.c.ownerId).resultJson,s.receipt);assert.equal(f.db.prepare('SELECT originalSubmissionJson FROM quoteSubmissions WHERE ownerId=?').get(s.c.ownerId).originalSubmissionJson,s.submission);assert.equal(f.db.prepare('SELECT customerJson FROM bookingPreferences WHERE ownerId=?').get(s.c.ownerId).customerJson,s.preference);
  });
  await t.test('activity route updates saved calls, is bounded, tenant-bound and staff-safe',async()=>{
    for(let i=0;i<6;i++)f.context();const {status,body}=await f.request('/api/leads/activity','synthetic-staff');assert.equal(status,200);assert.equal(body.total,7);assert.equal(body.calls.length,5);assert.doesNotMatch(JSON.stringify(body),/SECRET_COST|foreign@example.invalid|OTHER TENANT/);
    assert.equal((await f.request('/api/leads/activity','synthetic-b')).body.total,1);
  });
  await t.test('production Calls direct link and query refresh serve owner app without caching or API fallback',async()=>{
    for(const route of ['/calls','/calls?record='+s.c.callSid]){const res=await fetch(f.base+route);assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');assert.match(await res.text(),/id="root"/);}
    assert.equal((await fetch(f.base+'/api/not-a-real-route')).status,404);
  });
  await t.test('actual route responses render contact, notes, urgency, provenance and exact saved quote for staff',async()=>{
    const vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});
    try{const {CallDetail}=await vite.ssrLoadModule('/src/calls.jsx'),{QuoteRecordsList}=await vite.ssrLoadModule('/src/quotedone.jsx');
      const call=(await f.request('/api/calls/'+s.c.callSid,'synthetic-staff')).body;
      const html=renderToStaticMarkup(React.createElement(CallDetail,{call}));for(const text of [s.notes,'latest@example.invalid','preferred@example.invalid','Gate can fall.','221.23','notification has not been confirmed'])assert.ok(html.includes(text),text);assert.doesNotMatch(html,/SECRET_COST|SECRET_RATE|Owner-only/);
      const quote=renderToStaticMarkup(React.createElement(QuoteRecordsList,{kind:'quotes',rows:(await f.request('/api/quotes','synthetic-staff')).body.quotes}));assert.match(quote,/instant@example.invalid/);assert.match(quote,/19025550188/);assert.match(quote,/221.23/);assert.doesNotMatch(quote,/SECRET_COST|Owner-only/);
    }finally{await vite.close();}
  });
});
