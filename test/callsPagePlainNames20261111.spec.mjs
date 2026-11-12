import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fixture,secret,at} from './leadCaptureRepair20261006Fixture.mjs';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
import * as ownerMessageFormat from '../server/src/ownerMessageFormat.js';
const ownerAlertTitle=args=>ownerMessageFormat.ownerAlertTitle?.(args);

// The Calls page names each alert by its email title and each delivery or
// transfer attempt in plain words; no name with a dot in it is printed.
// Expected wording written before execution.
const allDay=Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(day=>[day,[{start:'00:00',end:'23:59'}]]));
const env={EMAIL_FROM:'alerts@example.invalid'};
const DOTTED=/\b[a-z]+(?:_[a-z]+)*\.[a-z]+(?:_[a-z]+)*\b/;
const TITLES={
  'booking.confirmed':'Booking confirmed','voice.caller_throttled':'Repeated caller — review requested','lead.created':'New lead',
  'lead.contact_updated':'Callback contact updated','callback.requested':'Callback requested','callback.updated':'Callback notes corrected',
  'quote.created':'New quote','quote.requested':'Quote review requested','booking.preference_requested':'Preferred-time request (not booked)',
  'appointment.booked':'Booking confirmed','appointment.changed':'Booking changed','voice.settings_invalid':'Receptionist setting needs correction',
  'voice.quoting_unavailable':'Quoting is paused. Answering remains available.','voice.urgent_flagged':'Urgent caller request','call.completed':'Call ended'
};

async function call(t){
  const f=fixture(t),c=f.context();
  f.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({transferWindows:allDay,transferNumber:'+19025550188'}),c.ownerId);
  const r=createVoiceToolRuntime({database:f.db,callContext:c,handleSecret:secret,clock:()=>new Date(at),providers:{transferCall:async()=>{throw Error('SYNTHETIC');}}});
  const d=createVoiceToolDispatcher({handlers:r.handlers,callContext:c,idempotencyStore:r.idempotencyStore});
  await d.dispatch({name:'transferCall',args:{reason:'caller_requested',customerConfirmed:true,notes:'[SYNTHETIC] Put me through.'},toolCallId:'synthetic-1'});
  await d.dispatch({name:'flagUrgent',args:{reason:'flooding',summary:'[SYNTHETIC] Water in the basement.'},toolCallId:'synthetic-2'});
  return {f,c};
}
const service=f=>createOwnerAlertService({database:f.db,ownerQuery:f.ownerQuery,environment:env,ready:()=>true,send:async m=>({accepted:true,id:'SYNTHETIC-'+m.idempotencyKey})});
function pageText(html){return html.replace(/<[^>]+>/g,' ').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,'&').replace(/\S+@\S+/g,' ').replace(/https?:\/\/\S+/g,' ');}

test('every alert type is named by its email title',()=>{
  for(const [eventType,title] of Object.entries(TITLES))assert.equal(ownerAlertTitle({eventType}),title,eventType);
  assert.equal(ownerAlertTitle({eventType:'appointment.changed',changeStatus:'REJECTED'}),'Booking change not applied');
  assert.equal(ownerAlertTitle({eventType:'appointment.changed',changeStatus:'APPLIED'}),'Booking changed');
  assert.equal(ownerAlertTitle({eventType:'some.future_type'}),'Owner alert');
});

test('Calls page alert list: each alert title equals the subject of the email it sent',async t=>{
  const {f,c}=await call(t),alerts=service(f);
  for(let i=0;i<10;i++)await alerts.dispatchOnce();
  const sent=f.db.prepare('SELECT id,eventType,messageJson FROM ownerAlerts WHERE ownerId=?').all(c.ownerId);
  assert.deepEqual(sent.map(a=>a.eventType).sort(),['callback.requested','lead.created','lead.created','voice.urgent_flagged'],'the transfer callback and the urgent flag each save a lead');
  const listed=new Map(f.service.detail({ownerId:c.ownerId,id:c.callSid,role:'owner'}).notifications.map(n=>[n.id,n.title]));
  for(const a of sent)assert.equal('Off The Clock: '+listed.get(a.id),JSON.parse(a.messageJson).subject,a.eventType);
  assert.deepEqual([...listed.values()].sort(),['Callback requested','New lead','New lead','Urgent caller request']);
});

test('Calls page: alert list and delivery list print plain names and no name with a dot',async t=>{
  const {f,c}=await call(t);
  const detail=f.service.detail({ownerId:c.ownerId,id:c.callSid,role:'owner'});
  assert.deepEqual(detail.deliveryActions.map(a=>a.eventType),['voice.transfer_requested']);
  const vite=await createServer({root:fileURLToPath(new URL('../client',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try{
    const {CallDetail}=await vite.ssrLoadModule('/src/calls.jsx');
    const html=renderToStaticMarkup(React.createElement(CallDetail,{call:detail,onRefresh:async()=>{}}));
    const text=pageText(html);
    for(const title of ['Callback requested','New lead','Urgent caller request'])assert.match(text,new RegExp(title+' · '),title);
    assert.match(text,/Live transfer · Didn’t connect/);assert.doesNotMatch(text,/FAILED/);
    assert.doesNotMatch(text,DOTTED);
  }finally{await vite.close();}
});

test('Dashboard and the full alert list carry the same titles',async t=>{
  const {f,c}=await call(t);
  assert.deepEqual(f.service.dashboard(c.ownerId).notifications.map(n=>n.title).sort(),['Callback requested','New lead','New lead','Urgent caller request']);
  const archive=service(f).list({ownerId:c.ownerId,status:'all'});
  assert.deepEqual(archive.alerts.map(n=>n.title).sort(),['Callback requested','New lead','New lead','Urgent caller request']);
  for(const n of archive.alerts)assert.equal(Object.hasOwn(n,'changeStatus'),false);
});

test('a booking change that was not applied is named as its email names it',async t=>{
  const {f,c}=await call(t),now=new Date().toISOString();
  for(const [id,status] of [['synthetic-change-rejected','REJECTED'],['synthetic-change-applied','APPLIED']])
    f.db.prepare("INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt) VALUES(?,?,'appointment.changed',?,?,'PENDING',?,?)").run(id,c.ownerId,'synthetic-appointment',JSON.stringify({status}),now,now);
  const byId=new Map(service(f).list({ownerId:c.ownerId,status:'all'}).alerts.filter(a=>a.eventType==='appointment.changed').map(a=>[a.aggregateId,a.title]));
  assert.equal(byId.get('synthetic-change-rejected'),'Booking change not applied');
  assert.equal(byId.get('synthetic-change-applied'),'Booking changed');
});

test('delivery list names each attempt in plain words',async t=>{
  const vite=await createServer({root:fileURLToPath(new URL('../client',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try{
    const {DeliveryActions}=await vite.ssrLoadModule('/src/deliveryActions.jsx');
    const actions=[['quote.email_requested','Quote email'],['voice.transfer_requested','Live transfer'],['voice.appointment_change_requested','Booking change'],['some.future_type','Other attempt']]
      .map(([eventType],i)=>({id:'a'+i,eventType,status:'FAILED',createdAt:'2026-10-06T12:00:00.000Z'}));
    const text=pageText(renderToStaticMarkup(React.createElement(DeliveryActions,{actions,ownerTimezone:'UTC'})));
    for(const [name,words] of [['Quote email','Not sent'],['Live transfer','Didn’t connect'],['Booking change','Not made'],['Other attempt','Not sent']])assert.match(text,new RegExp(name+' · '+words));
    assert.doesNotMatch(text,/FAILED/);
    assert.doesNotMatch(text,DOTTED);
  }finally{await vite.close();}
});
