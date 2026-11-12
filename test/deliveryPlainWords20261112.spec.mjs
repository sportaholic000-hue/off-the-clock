import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {STATUS_WORDS,ERROR_SENTENCES,STATUS_UNAVAILABLE,ERROR_FALLBACK,deliveryStatusWords,deliveryErrorSentence} from '../client/src/deliveryWords.js';
import {fixture,at} from './leadCaptureRepair20261006Fixture.mjs';
import {quoteEmailFixture} from './quoteEmailFixture.mjs';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
import {createOwnerCallService} from '../server/src/ownerCallService.js';

// The Calls page delivery list and the owner alert list show plain words, never
// a stored status or error code. Fakes only: no provider is called.
// Expected before the change: client/src/deliveryWords.js does not exist and the
// lists print FAILED, UNKNOWN, ACCEPTED and codes such as EMAIL_PROVIDER_REJECTED.
const root=fileURLToPath(new URL('..',import.meta.url));
const source=path=>readFileSync(join(root,path),'utf8');
const literals=text=>[...text.matchAll(/'([A-Z][A-Z_]{2,63})'/g)].map(m=>m[1]);

// Hand-written expectations. The first seven are the owner's wording.
const EXPECTED_STATUS={ACCEPTED:'Sent',DELIVERED:'Delivered',BOUNCED:'Email bounced',FAILED:'Not sent',UNKNOWN:'Not confirmed',
  PENDING:'Sending',SENDING:'Sending',DELIVERING:'Sending',BLOCKED:'Not sent',REVIEW:'Not confirmed',CONNECTED:'Connected',CONFIRMED:'Confirmed'};
const EXPECTED_ERROR={
  EMAIL_PROVIDER_REJECTED:'The email service refused this message.',
  EMAIL_REJECTED:'The email service refused this message.',
  EMAIL_NOT_CONFIGURED:'Email sending is not available right now, so this message was not sent.',
  OWNER_EMAIL_MISSING:'Your account has no valid email address to send this alert to.',
  OWNER_EMAIL_CHANGED:'Your account email changed after this message was prepared, so it was held back.',
  ALERT_SOURCE_MISSING:'The saved record behind this alert could not be found, so the alert was not sent.',
  DEDUPE_WINDOW_EXPIRED:'The first attempt could not be confirmed, and sending again now could send a duplicate, so sending stopped.',
  EMAIL_DEDUPE_WINDOW_EXPIRED:'The first attempt could not be confirmed, and sending again now could send a duplicate, so sending stopped.',
  EMAIL_ACCEPTANCE_UNKNOWN:'The email service did not confirm that it accepted this message.',
  EMAIL_OUTCOME_UNKNOWN:'The email service did not answer, so it is not known whether this message was sent.',
  EMAIL_CONFIRMATION_PENDING:'The email service has not confirmed this message yet, and it will be checked again automatically.',
  EMAIL_DELIVERY_UNCONFIRMED:'The email service accepted this message but never confirmed that it reached the inbox.',
  EMAIL_DELIVERY_FAILED:'The email service reported that this message could not be delivered or was marked as spam.'};

// Literals in the delivery services that are never stored as a listed status or code.
const NOT_LISTED=new Set([
  'ALERT_TYPE_UNSUPPORTED',            // thrown inside the message builder; stored as ALERT_SOURCE_MISSING
  'OWNER_ALERT_WORKER_FAILED','QUOTE_EMAIL_WORKER_FAILED', // worker onError callbacks
  'REJECTED',                          // appointment change payload status read for message text
  'STARTED','WORKER_LEASE_EXPIRED',    // ownerAlertAttempts rows, not listed to the owner
  'POST',                              // HTTP method
  'INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY', // quote result types
  // Request errors thrown to the caller by quote email preparation; never stored.
  'EMAIL_CONFIRMATION_REQUIRED','EMAIL_READBACK_CHANGED','INVALID_QUOTE_EMAIL','QUOTE_COPY_NOT_FOUND','QUOTE_EMAIL_ALREADY_QUEUED',
  'QUOTE_EMAIL_BUSINESS_UNAVAILABLE','QUOTE_EMAIL_LINK_UNAVAILABLE','QUOTE_EMAIL_NOT_FOUND','QUOTE_EMAIL_RECIPIENT_UNCONFIRMED',
  'QUOTE_EMAIL_UNAVAILABLE','QUOTE_NOT_FOUND','QUOTE_NOT_PRESENTED','QUOTE_VALIDITY_EXPIRED']);

function storedValuesFromServer(){
  const values=new Set();
  // Owner alerts and quote emails: every upper-case literal in the services and sender.
  for(const path of ['server/src/ownerAlertService.js','server/src/ownerAlertEmail.js','server/src/quoteEmailService.js'])
    for(const value of literals(source(path)))if(!NOT_LISTED.has(value))values.add(value);
  // Table defaults for both lists.
  for(const path of ['server/src/ownerAlertSchema.js','server/src/quoteEmailSchema.js'])
    for(const m of source(path).matchAll(/status TEXT NOT NULL DEFAULT '([A-Z_]+)'/g))values.add(m[1]);
  // Live transfer and booking change rows read outboxEvents.status directly.
  const runtime=source('server/src/voice/voiceToolRuntime.js');
  for(const m of runtime.matchAll(/updateOutbox\(eventId, '([A-Z_]+)'\)/g))values.add(m[1]);
  for(const m of runtime.matchAll(/eventType:'voice\.transfer_requested'[^\n]*status:'([A-Z_]+)'/g))values.add(m[1]);
  values.add(/function writeOutbox\(\{[^}]*status = '([A-Z_]+)'/.exec(runtime)[1]);
  for(const m of source('server/src/voice/voiceProviderAdapters.js').matchAll(/outboxEvents SET status='([A-Z_]+)'/g))values.add(m[1]);
  const booking=/eventType='voice\.appointment_change_requested'"\)\s*\.run\(([^)]*)\)/.exec(source('server/src/bookingService.js'));
  for(const value of literals(booking[1]))values.add(value);
  return values;
}

test('every status the lists can show maps to the agreed words',()=>{
  for(const [status,words] of Object.entries(EXPECTED_STATUS))assert.equal(deliveryStatusWords(status),words,status);
  assert.deepEqual({...STATUS_WORDS},EXPECTED_STATUS);
  for(const other of ['QUEUED','SOMETHING_NEW','',null,undefined,'accepted','toString','__proto__'])assert.equal(deliveryStatusWords(other),STATUS_UNAVAILABLE,String(other));
  assert.equal(STATUS_UNAVAILABLE,'Status unavailable');
});

test('every error code maps to one plain sentence; unknown codes use the fallback; no code prints nothing',()=>{
  assert.deepEqual({...ERROR_SENTENCES},EXPECTED_ERROR);
  for(const [code,sentence] of Object.entries(EXPECTED_ERROR)){
    assert.equal(deliveryErrorSentence(code),sentence,code);
    assert.match(sentence,/^[A-Z][^.]*\.$/,'one sentence: '+code);
    assert.doesNotMatch(sentence,/[A-Z]{2,}_|_[A-Z]{2,}/,'no code inside the sentence: '+code);
  }
  for(const code of ['HTTP_ERROR','SOMETHING_NEW','toString','__proto__'])assert.equal(deliveryErrorSentence(code),ERROR_FALLBACK,code);
  assert.equal(ERROR_FALLBACK,'Something went wrong sending this.');
  for(const empty of [null,undefined,''])assert.equal(deliveryErrorSentence(empty),null);
});

test('every status and code the server can store on these lists has words (read from the server source)',()=>{
  const stored=storedValuesFromServer();
  // Hand-checked inventory of the server code at the time of this change.
  for(const value of ['PENDING','DELIVERING','ACCEPTED','DELIVERED','BOUNCED','FAILED','UNKNOWN','BLOCKED','SENDING','REVIEW','CONNECTED','CONFIRMED',
    'DEDUPE_WINDOW_EXPIRED','EMAIL_NOT_CONFIGURED','OWNER_EMAIL_MISSING','OWNER_EMAIL_CHANGED','ALERT_SOURCE_MISSING','EMAIL_ACCEPTANCE_UNKNOWN',
    'EMAIL_OUTCOME_UNKNOWN','EMAIL_PROVIDER_REJECTED','EMAIL_DEDUPE_WINDOW_EXPIRED','EMAIL_DELIVERY_UNCONFIRMED','EMAIL_CONFIRMATION_PENDING',
    'EMAIL_DELIVERY_FAILED','EMAIL_REJECTED'])assert.ok(stored.has(value),'server source still stores '+value);
  const missing=[...stored].filter(value=>!Object.hasOwn(STATUS_WORDS,value)&&!Object.hasOwn(ERROR_SENTENCES,value));
  assert.deepEqual(missing,[],'stored values without plain words');
});

async function renderers(){
  const result=await build({absWorkingDir:root,bundle:true,write:false,platform:'node',format:'cjs',loader:{'.css':'empty'},
    define:{'process.env.NODE_ENV':'"production"'},
    plugins:[{name:'synthetic-owner-transport',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({loader:'js',contents:
      'export const api=async()=>{throw Error("no transport");};export const go=()=>{};export const getToken=()=>null;'+
      'export const logout=async()=>{};export const setToken=()=>{};export const getSessionKey=()=>"[PLACEHOLDER]";'}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
      import {OwnerAlerts} from './client/src/ownerAlerts.jsx';import {DeliveryActions} from './client/src/deliveryActions.jsx';
      export const alerts=(alerts,timezone)=>renderToStaticMarkup(<OwnerAlerts alerts={alerts} ownerTimezone={timezone} configured={true}/>);
      export const actions=(actions,timezone)=>renderToStaticMarkup(<DeliveryActions actions={actions} ownerTimezone={timezone}/>);`}});
  const directory=mkdtempSync(join(tmpdir(),'otc-delivery-words-'));
  try{writeFileSync(join(directory,'render.cjs'),result.outputFiles[0].text);return createRequire(import.meta.url)(join(directory,'render.cjs'));}
  finally{rmSync(directory,{recursive:true,force:true});}
}
const text=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const RAW=new RegExp('\\b('+[...Object.keys(EXPECTED_STATUS),...Object.keys(EXPECTED_ERROR),'HTTP_ERROR','SOMETHING_NEW'].join('|')+')\\b');

test('the alert list and the delivery list print words for every status and code, never the stored value',async()=>{
  const render=await renderers();
  const base={eventType:'voice.urgent_flagged',aggregateId:'SYNTHETIC',attemptCount:2,createdAt:at,title:'Urgent call'};
  const statuses=[...Object.keys(EXPECTED_STATUS),'SOMETHING_NEW'],codes=[...Object.keys(EXPECTED_ERROR),'SOMETHING_NEW',null];
  const alertRows=statuses.map((status,n)=>({...base,id:'a'+n,status,lastErrorCode:codes[n%codes.length]}));
  const actionRows=statuses.map((status,n)=>({id:'d'+n,eventType:'quote.email_requested',recipient:'caller@example.invalid',status,attemptCount:1,lastErrorCode:codes[n%codes.length],createdAt:at}));
  const alertText=text(render.alerts(alertRows,'America/Los_Angeles')),actionText=text(render.actions(actionRows,'America/Los_Angeles'));
  for(const shown of [alertText,actionText])assert.doesNotMatch(shown,RAW);
  for(const [n,status] of statuses.entries()){
    const words=EXPECTED_STATUS[status]||'Status unavailable',code=codes[n%codes.length],sentence=code===null?null:EXPECTED_ERROR[code]||'Something went wrong sending this.';
    assert.ok(alertText.includes('Urgent call · '+words),status);
    if(sentence)assert.ok(alertText.includes('Attempts: 2 · '+sentence),'alert '+code);
    assert.ok(actionText.includes('Quote email to caller@example.invalid · '+words+' · '),status);
    if(sentence)assert.ok(actionText.includes('1 attempts · '+sentence),'action '+code);
  }
  assert.ok(alertText.includes('Sent means the email service accepted the alert. Inbox delivery and owner reading are not confirmed.'));
  assert.ok(actionText.includes('Sent means the email service accepted the message. Delivered confirms a delivery receipt. Not sent and Not confirmed need your attention.'));
  // The bounced alert still names the address it was sent to.
  assert.match(text(render.alerts([{...base,id:'b',status:'BOUNCED',sentTo:'owner@example.invalid'}])),/Urgent call · Email bounced Sent to owner@example\.invalid/);
});

test('a real provider refusal reaches the Calls page as words: owner alert and quote email from the actual services',async t=>{
  const f=fixture(t),c=f.context();
  await f.voice(c).tool('flagUrgent',{reason:'complaint',summary:'[SYNTHETIC] callback'});
  // Synthetic sender: the same error the production sender throws for a refused message.
  const alertWorker=createOwnerAlertService({database:f.db,ownerQuery:f.ownerQuery,clock:()=>Date.parse(at),ready:()=>true,
    environment:{EMAIL_FROM:'synthetic@example.invalid'},send:async()=>{throw Object.assign(Error('SYNTHETIC refused'),{code:'EMAIL_PROVIDER_REJECTED',definitive:true});},
    readReceipt:async()=>{throw Error('not read');}});
  await alertWorker.dispatchOnce();
  const mail=quoteEmailFixture(t,{base:f,context:c,provider:{send:async()=>{throw Object.assign(Error('SYNTHETIC refused'),{definitive:true});},read:async()=>{throw Error('not read');}}});
  await mail.queue();await mail.emailService().dispatchOnce();
  const callId=f.db.prepare('SELECT id FROM calls WHERE ownerId=? AND callSid=?').get(c.ownerId,c.callSid).id;
  const call=createOwnerCallService({ownerQuery:f.ownerQuery,database:f.db}).detail({ownerId:c.ownerId,id:callId});
  const urgent=call.notifications.find(row=>row.eventType==='voice.urgent_flagged');
  assert.equal(urgent.lastErrorCode,'EMAIL_PROVIDER_REJECTED');
  const email=call.deliveryActions.find(row=>row.eventType==='quote.email_requested');
  assert.deepEqual([email.status,email.lastErrorCode],['FAILED','EMAIL_REJECTED']);
  const render=await renderers();
  const alertText=text(render.alerts(call.notifications,call.ownerTimezone)),actionText=text(render.actions(call.deliveryActions,call.ownerTimezone));
  assert.ok(alertText.includes(deliveryStatusWords(urgent.status)),urgent.status);
  assert.ok(alertText.includes('The email service refused this message.'));
  assert.ok(actionText.includes('Quote email to caller@example.invalid · Not sent · '));
  assert.ok(actionText.includes('The email service refused this message.'));
  for(const shown of [alertText,actionText])assert.doesNotMatch(shown,RAW);
});
