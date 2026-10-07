import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {httpFixture,seedViews} from './leadCaptureRepair20261006HttpFixture.mjs';
import {completeVoiceCall} from '../server/src/callSummaryService.js';

test('D21/D24 actual owner routes expose old unresolved preferences and factual summaries without tenant leakage',{timeout:40000},async t=>{
 const f=await httpFixture(t),s=await seedViews(f),words='[SYNTHETIC] Please call about the broken gate.';
 f.db.prepare('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'caller',text:words,final:true}]),s.c.ownerId,s.c.callSid);
 completeVoiceCall({database:f.db,ownerId:s.c.ownerId,callId:s.c.callSid,callSid:s.c.callSid,outcome:{status:'completed',reason:'TWILIO_STOP'},streamSid:null,duration:13,at:'2026-10-06T12:00:13.000Z'});
 f.db.prepare('UPDATE bookingPreferences SET preferredWindowsJson=? WHERE ownerId=?').run(JSON.stringify([{date:'2026-09-01',timeOfDay:'morning'}]),s.c.ownerId);
 for(const role of ['synthetic-a','synthetic-staff']){
  const schedule=await f.request('/api/calendar/schedule?fromDate=2026-10-06&days=7',role);assert.equal(schedule.status,200);assert.equal(schedule.body.requests[0].id,'synthetic-followup-preference');
  const call=await f.request('/api/calls/'+s.c.callSid,role);assert.equal(call.status,200);assert.equal(call.body.summaryText,'Caller: '+words);
  const feed=await f.request('/api/leads/activity',role);assert.equal(feed.body.calls.find(v=>v.id===s.c.callSid).summaryText,call.body.summaryText);
 }
 assert.equal((await f.request('/api/calls/'+s.c.callSid,'synthetic-b')).status,404);assert.equal((await f.request('/api/calendar/schedule?fromDate=2026-10-06&days=7','synthetic-b')).body.requests.length,0);
 const vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});try{
  const {CallFeed,CallDetail}=await vite.ssrLoadModule('/src/calls.jsx'),call=(await f.request('/api/calls/'+s.c.callSid)).body;
  for(const html of [renderToStaticMarkup(React.createElement(CallFeed,{calls:[call]})),renderToStaticMarkup(React.createElement(CallDetail,{call}))]){assert.ok(html.includes('Caller: '+words));assert.doesNotMatch(html,/FOREIGN PERSON/);}
 }finally{await vite.close();}
});
