import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {httpFixture} from './leadCaptureRepair20261006HttpFixture.mjs';
import {createVoiceSmsService} from '../server/src/voiceSmsService.js';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import {secret,at} from './leadCaptureRepair20261006Fixture.mjs';
test('D19/D20: actual owner routes and rendered views retain delivery information beyond recent limits',{timeout:40000},async t=>{
  const f=await httpFixture(t),c=f.context(),lead=await f.voice(c).tool('captureLead',{description:'[SYNTHETIC] Delivery visibility',notes:'[SYNTHETIC] Caller words.'});
  const sms=createVoiceSmsService({database:f.db,ownerQuery:f.ownerQuery,provider:{send:async()=>{throw Error('SYNTHETIC_PRIVATE_ERROR');}}}),runtime=createVoiceToolRuntime({database:f.db,callContext:c,handleSecret:secret,clock:()=>new Date(at),providers:{smsDelivery:sms}});
  await createVoiceToolDispatcher({handlers:runtime.handlers,callContext:c,idempotencyStore:runtime.idempotencyStore}).dispatch({name:'sendSms',args:{template:'callback',recordHandle:lead.leadHandle},toolCallId:'synthetic-http-text'});
  const leadId=f.lead(c)[0].id;
  await t.test('owner/staff see safe voice failure on call and saved request; foreign tenant cannot',async()=>{
    for(const owner of ['synthetic-a','synthetic-staff'])for(const path of ['/api/calls/'+c.callSid,'/api/leads/'+leadId]){const response=await f.request(path,owner);assert.equal(response.status,200);assert.equal(response.body.deliveryActions[0].status,'UNKNOWN');assert.equal(response.body.deliveryActions[0].attemptCount,1);assert.equal(response.body.deliveryActions[0].lastErrorCode,'SMS_OUTCOME_UNKNOWN');assert.doesNotMatch(JSON.stringify(response.body.deliveryActions),/PRIVATE|requestJson|callbackToken|body/);}
    assert.equal((await f.request('/api/leads/'+leadId,'synthetic-b')).status,404);assert.equal((await f.request('/api/calls/'+c.callSid,'synthetic-b')).status,404);
  });
  const w=f.webhook();await w.save(c.ownerId,{url:'https://synthetic.example.invalid/hook',events:['lead.created']});const version=f.db.prepare('SELECT version FROM webhookEndpoints WHERE ownerId=?').get(c.ownerId).version;
  for(let n=0;n<105;n++)f.db.prepare("INSERT INTO webhookDeliveries(id,ownerId,eventType,aggregateId,endpointVersion,payloadJson,status,nextAttemptAt,lastErrorCode,createdAt,updatedAt) VALUES(?,?,'lead.created',?,?,'{}',?,0,?,?,?)").run('SYNTHETIC-archive-'+String(n).padStart(3,'0'),c.ownerId,'SYNTHETIC-archive-lead-'+n,version,n===0?'FAILED':'PENDING',n===0?'HTTP_ERROR':null,new Date(Date.parse(at)+n*1000).toISOString(),at);
  await t.test('all/unresolved pagination reaches oldest failure; foreign tenant, staff and extra owner parameters rejected',async()=>{
    const recent=await f.request('/api/integrations/webhook');assert.equal(recent.body.deliveries.length,20);const first=await f.request('/api/integrations/webhook/deliveries?status=unresolved'),last=await f.request('/api/integrations/webhook/deliveries?status=all&offset=100');assert.equal(first.body.total,105);assert.equal(first.body.nextOffset,50);assert.ok(last.body.deliveries.some(d=>d.id==='SYNTHETIC-archive-000'&&d.status==='FAILED'));assert.doesNotMatch(JSON.stringify(last),/signingSecret|payloadJson|credentials|SYNTHETIC_PRIVATE_ERROR/);
    assert.equal((await f.request('/api/integrations/webhook/deliveries','synthetic-b')).body.total,0);assert.equal((await f.request('/api/integrations/webhook/deliveries','synthetic-staff')).status,403);assert.equal((await f.request('/api/integrations/webhook/deliveries',null)).status,401);
    const foreignSelector=await f.request('/api/integrations/webhook/deliveries?ownerId=synthetic-b');assert.equal(foreignSelector.status,403);assert.deepEqual(foreignSelector.body,{error:'Forbidden'});
    for(const query of ['offset=-1','status=bad','offset=0&offset=1'])assert.equal((await f.request('/api/integrations/webhook/deliveries?'+query)).status,400);
  });
  await t.test('rendered actual route data exposes safe delivery errors and old webhook failures',async()=>{
    const vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});
    try{const {QuoteRecordsList}=await vite.ssrLoadModule('/src/quotedone.jsx'),{WebhookDeliveryHistory}=await vite.ssrLoadModule('/src/ownerIntegrations.jsx');const request=(await f.request('/api/leads/'+leadId,'synthetic-staff')).body;
      const html=renderToStaticMarkup(React.createElement(QuoteRecordsList,{kind:'leads',rows:[request]}));assert.match(html,/UNKNOWN/);assert.match(html,/SMS_OUTCOME_UNKNOWN/);assert.match(html,/not resent automatically/);assert.doesNotMatch(html,/Owner-only|SYNTHETIC_PRIVATE_ERROR|callbackToken/);
      const archive=(await f.request('/api/integrations/webhook/deliveries?offset=100')).body,history=renderToStaticMarkup(React.createElement(WebhookDeliveryHistory,{deliveries:archive.deliveries}));assert.match(history,/SYNTHETIC-archive-000/);assert.match(history,/FAILED/);assert.match(history,/Retry delivery/);
    }finally{await vite.close();}
  });
});
