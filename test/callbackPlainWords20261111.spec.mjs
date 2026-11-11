import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fixture,secret,at} from './leadCaptureRepair20261006Fixture.mjs';
import {harness,TO} from './voiceLifecycle20261006Fixture.mjs';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';

// After a transfer that is not placed, the "Callback requested" alert says why
// in plain words, and no owner alert or Calls page line prints the stored codes
// caller_requested, urgent, escalation or transfer_failed. Which alerts are
// sent, and every other line in them, stay as they were.
// Expected wording written before execution.
const NO_NUMBER='The caller asked for you, but no separate transfer number is saved.';
const OUTSIDE='The caller asked for you outside your transfer hours.';
const NOT_PLACED='The transfer could not be placed.';
const NOT_CONFIRMED='The caller did not confirm the transfer.';
const SAVED_BEFORE='The transfer was not placed.';
const ASKED='The caller asked to speak with you.',URGENT='The receptionist marked the call urgent.',ESCALATED='The receptionist escalated the call to you.';
const PLAIN={caller_requested:ASKED,urgent:URGENT,escalation:ESCALATED};
const CODES=/caller_requested|transfer_failed|escalation|: urgent$|· urgent\b/m;
const BUSINESS='+19025550199',RECEPTIONIST='+19025550101',DIRECT='+19025550188';
const words='[SYNTHETIC] Please put me through about the gate.';
const allDay=Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(day=>[day,[{start:'00:00',end:'23:59'}]]));
const env={EMAIL_FROM:'alerts@example.invalid'};

function setup(t,kb){const f=fixture(t),c=f.context();f.db.prepare('UPDATE businessProfiles SET existingPhoneNumber=?,twilioNumber=?,knowledgeBaseJson=? WHERE ownerId=?').run(BUSINESS,RECEPTIONIST,JSON.stringify(kb),c.ownerId);return {f,c};}
function tool(f,c,providers={}){const r=createVoiceToolRuntime({database:f.db,callContext:c,handleSecret:secret,clock:()=>new Date(at),providers});const d=createVoiceToolDispatcher({handlers:r.handlers,callContext:c,idempotencyStore:r.idempotencyStore});return (name,args,id='synthetic-'+name)=>d.dispatch({name,args,toolCallId:id});}
async function sent({db:database,ownerQuery}){
  const out=[];const w=createOwnerAlertService({database,ownerQuery,environment:env,ready:()=>true,send:async m=>{out.push(m);return {accepted:true,id:'SYNTHETIC-'+out.length};}});
  for(let i=0;i<12;i++)await w.dispatchOnce();return out;
}
const callbackAlert=list=>list.find(m=>m.subject==='Off The Clock: Callback requested');
const textLines=m=>m.text.split('\n').filter(line=>!line.startsWith('Open saved record:'));

for(const [label,kb,providers,why] of [
  ['no transfer number saved',{transferWindows:allDay},{},NO_NUMBER],
  ['the business line saved as the transfer number',{transferWindows:allDay,transferNumber:BUSINESS},{},NO_NUMBER],
  ['the receptionist number saved as the transfer number',{transferWindows:allDay,transferNumber:RECEPTIONIST},{},NO_NUMBER],
  ['outside transfer hours',{transferNumber:DIRECT,transferWindows:{tue:[{start:'13:00',end:'14:00'}]}},{},OUTSIDE],
  ['the transfer call failing',{transferWindows:allDay,transferNumber:DIRECT},{transferCall:async()=>{throw Error('SYNTHETIC');}},NOT_PLACED],
  ['the transfer not connecting',{transferWindows:allDay,transferNumber:DIRECT},{transferCall:async()=>({status:'FAILED'})},NOT_CONFIRMED]
])test('callback alert after '+label+': says why in plain words, other lines and alerts unchanged',async t=>{
  const {f,c}=setup(t,kb);
  await tool(f,c,providers)('transferCall',{reason:'caller_requested',customerConfirmed:true,notes:words});
  const out=await sent(f);
  assert.deepEqual(out.map(m=>m.subject).sort(),['Off The Clock: Callback requested','Off The Clock: New lead'],'the same two alerts');
  assert.deepEqual(textLines(callbackAlert(out)),['Callback requested','Phone: +19025550100','Notes: '+words,'Reason: '+ASKED,'Why no transfer: '+why]);
  assert.deepEqual(textLines(out.find(m=>m.subject==='Off The Clock: New lead')),['New lead','Phone: +19025550100','Job: Callback requested after an unsuccessful transfer','Notes: '+words]);
  for(const m of out)assert.doesNotMatch(m.text,CODES);
});

for(const reason of ['urgent','escalation'])test('callback alert: the '+reason+' reason is in plain words',async t=>{
  const {f,c}=setup(t,{transferWindows:allDay});
  await tool(f,c)('transferCall',{reason,customerConfirmed:true,notes:words});
  const lines=textLines(callbackAlert(await sent(f)));
  assert.equal(lines.find(l=>l.startsWith('Reason: ')),'Reason: '+PLAIN[reason]);
  assert.equal(lines.at(-1),'Why no transfer: '+NO_NUMBER);
});

test('callback alert: a callback the caller asked for (not a transfer) is unchanged',async t=>{
  const {f,c}=setup(t,{transferWindows:allDay});
  await tool(f,c)('captureLead',{callbackRequested:true,notes:words});
  assert.deepEqual(textLines(callbackAlert(await sent(f))),['Callback requested','Phone: +19025550100','Notes: '+words]);
});

test('callback notes corrected alert: reason in plain words, no new line',async t=>{
  const {f,c}=setup(t,{transferWindows:allDay});
  const v=tool(f,c);
  await v('transferCall',{reason:'urgent',customerConfirmed:true,notes:words},'synthetic-1');
  await v('transferCall',{reason:'urgent',customerConfirmed:true,notes:'[SYNTHETIC] Correction: after six.'},'synthetic-2');
  const corrected=(await sent(f)).find(m=>m.subject==='Off The Clock: Callback notes corrected');
  assert.deepEqual(textLines(corrected),['Callback notes corrected','Phone: +19025550100','Notes: [SYNTHETIC] Correction: after six.','Reason: '+URGENT]);
});

test('callback saved before this change still displays, without stored codes',async t=>{
  const {f,c}=setup(t,{transferWindows:allDay});
  await tool(f,c)('transferCall',{reason:'escalation',customerConfirmed:true,notes:words});
  // A stored request from before the outcome was kept: history entries hold at,notes,source,reason.
  const row=f.db.prepare('SELECT id,historyJson FROM callbackRequests WHERE ownerId=?').get(c.ownerId);
  f.db.prepare('UPDATE callbackRequests SET historyJson=? WHERE ownerId=? AND id=?').run(JSON.stringify(JSON.parse(row.historyJson).map(({transferOutcome,...entry})=>entry)),c.ownerId,row.id);
  assert.deepEqual(textLines(callbackAlert(await sent(f))),['Callback requested','Phone: +19025550100','Notes: '+words,'Reason: '+ESCALATED,'Why no transfer: '+SAVED_BEFORE]);
  const request=f.service.detail({ownerId:c.ownerId,id:c.callSid}).callbackRequests[0];
  assert.equal(request.sourceText,SAVED_BEFORE);assert.equal(request.reasonText,ESCALATED);assert.equal(request.notes,words);
});

test('Calls page: the callback line uses the same plain words and never the stored codes',async t=>{
  const {f,c}=setup(t,{transferWindows:allDay});
  const v=tool(f,c);
  await v('transferCall',{reason:'caller_requested',customerConfirmed:true,notes:words,inquiryNumber:1},'synthetic-1');
  await v('transferCall',{reason:'urgent',customerConfirmed:true,notes:words,inquiryNumber:2},'synthetic-2');
  await v('captureLead',{callbackRequested:true,notes:'[SYNTHETIC] Call me back tomorrow.'},'synthetic-3');
  const call=f.service.detail({ownerId:c.ownerId,id:c.callSid,role:'owner'});
  assert.deepEqual(call.callbackRequests.map(r=>[r.sourceText,r.reasonText]).sort(),[['The caller asked for a callback.',null],[NO_NUMBER,ASKED],[NO_NUMBER,URGENT]].sort());
  const vite=await createServer({root:fileURLToPath(new URL('../client',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try{
    const {CallDetail}=await vite.ssrLoadModule('/src/calls.jsx');
    const html=renderToStaticMarkup(React.createElement(CallDetail,{call:{...call,notifications:null}}));
    const section=html.slice(html.indexOf('Callback requests'));
    const lines=[...section.matchAll(/<section class="editor-section"[^>]*><p>([^<]*)<\/p>/g)].map(m=>m[1].replace(/&#x27;|&#39;/g,"'").split(' · ').slice(1));
    assert.deepEqual(lines.sort(),[['The caller asked for a callback.'],[NO_NUMBER,ASKED],[NO_NUMBER,URGENT]].sort());
    assert.doesNotMatch(section.slice(0,section.indexOf('<h3>',20)),/caller_requested|transfer_failed|escalation|· urgent/);
  }finally{await vite.close();}
});

test('Twilio: owner declines and the call is not answered, the callback alert says the transfer could not be placed',async t=>{
  const h=await harness(t),c=await h.connect();
  await h.tool(c.callback,'transferCall',{reason:'caller_requested',customerConfirmed:true,notes:words});
  const update=h.writes.find(w=>w[0]==='call')[2].twiml,accept=new URL(update.match(/<Number url="([^"]+)"/)[1]).pathname,result=new URL(update.match(/ action="([^"]+)"/)[1]).pathname;
  const child={AccountSid:c.params.AccountSid,ParentCallSid:c.params.CallSid,CallSid:'CA'+'d'.repeat(32),From:TO,To:DIRECT,Direction:'outbound-dial'};
  await h.post(accept,child);await h.post(accept,{...child,Digits:'2'});
  await h.post(result,{...c.params,DialCallStatus:'no-answer'});
  const out=await sent({db:h.db});
  const lines=textLines(callbackAlert(out));
  assert.equal(lines.find(l=>l.startsWith('Reason: ')),'Reason: '+ASKED);
  assert.equal(lines.at(-1),'Why no transfer: '+NOT_PLACED);
  for(const m of out)assert.doesNotMatch(m.text,CODES);
});
