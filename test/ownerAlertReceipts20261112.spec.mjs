import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {fixture,at} from './leadCaptureRepair20261006Fixture.mjs';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
import {createOwnerCallService} from '../server/src/ownerCallService.js';

// Owner alert emails read the same Resend receipt as billing emails. Fakes only:
// send and readReceipt are synthetic, nothing reaches Resend.
// Expected before the change: alerts stay ACCEPTED whatever the receipt says,
// and a bounced alert is not listed as unresolved or shown as "Email bounced".
const root=fileURLToPath(new URL('..',import.meta.url));

async function acceptedAlert(t,receipt){
  const f=fixture(t),c=f.context();
  await f.voice(c).tool('flagUrgent',{reason:'complaint',summary:'[SYNTHETIC] callback'});
  const reads=[];let sent=0;
  const worker=createOwnerAlertService({database:f.db,ownerQuery:f.ownerQuery,clock:()=>Date.parse(at),ready:()=>true,
    environment:{EMAIL_FROM:'synthetic@example.invalid'},send:async()=>({accepted:true,id:'SYNTHETIC-provider-'+(++sent)}),
    readReceipt:async id=>{reads.push(id);return receipt(id,f.db,c.ownerId);}});
  // First pass sends; its receipt pass is the first read of the provider receipt.
  await worker.dispatchOnce();
  const alert=()=>f.db.prepare("SELECT * FROM ownerAlerts WHERE ownerId=? AND eventType='voice.urgent_flagged'").get(c.ownerId);
  // The call's lead alert is delivered; the urgent alert carries the receipt under test.
  const urgentReads=()=>reads.filter(id=>id===alert().providerId).length;
  return {f,c,worker,alert,reads,urgentReads};
}
const sentReceipt=lastEvent=>(id,db,ownerId)=>{
  const row=db.prepare("SELECT eventType,messageJson FROM ownerAlerts WHERE ownerId=? AND providerId=?").get(ownerId,id),message=JSON.parse(row.messageJson);
  return {id,to:[message.to],subject:message.subject,last_event:row.eventType==='voice.urgent_flagged'?lastEvent:'delivered'};
};

test('an accepted owner alert becomes DELIVERED on a delivered receipt',async t=>{
  const {alert,urgentReads}=await acceptedAlert(t,sentReceipt('delivered'));
  assert.equal(urgentReads(),1);
  assert.equal(alert().status,'DELIVERED');
  assert.match(alert().providerId,/^SYNTHETIC-provider-\d$/);
});

test('an accepted owner alert becomes BOUNCED on a bounced receipt',async t=>{
  const {alert}=await acceptedAlert(t,sentReceipt('bounced'));
  assert.equal(alert().status,'BOUNCED');
});

for(const [label,receipt] of [
  ['no final event yet',sentReceipt('sent')],
  ['receipt not readable yet',(id,db,ownerId)=>{if(db.prepare('SELECT eventType FROM ownerAlerts WHERE ownerId=? AND providerId=?').get(ownerId,id).eventType==='voice.urgent_flagged')throw Error('Email receipt unavailable.');return sentReceipt('delivered')(id,db,ownerId);}],
  ['receipt for a different message',(id,db,ownerId)=>({...sentReceipt('delivered')(id,db,ownerId),to:['someone-else@example.invalid']})],
])test(`an accepted owner alert stays ACCEPTED with ${label}`,async t=>{
  const {alert,worker,urgentReads}=await acceptedAlert(t,receipt);
  assert.equal(alert().status,'ACCEPTED');
  assert.equal(alert().nextAttemptAt,Date.parse(at)+60000);
  // Not read again before the recheck time; the alert is never resent.
  await worker.dispatchOnce();
  assert.equal(urgentReads(),1);
  assert.equal(alert().attemptCount,1);
});

test('a bounced alert is unresolved, names the address it was sent to, and is not resent by retry',async t=>{
  const {f,c,worker,alert}=await acceptedAlert(t,sentReceipt('bounced'));
  const sentTo=JSON.parse(alert().messageJson).to;
  assert.equal(sentTo,c.ownerId+'@example.invalid');
  const unresolved=worker.list({ownerId:c.ownerId,status:'unresolved'});
  assert.equal(unresolved.total,1);
  assert.equal(unresolved.alerts[0].status,'BOUNCED');
  assert.equal(unresolved.alerts[0].sentTo,sentTo);
  const dashboard=createOwnerCallService({ownerQuery:f.ownerQuery}).dashboard(c.ownerId);
  assert.equal(dashboard.unresolvedNotifications,1);
  assert.equal(dashboard.notifications.find(row=>row.id===alert().id).sentTo,sentTo);
  assert.deepEqual(worker.retry(c.ownerId,alert().id),{status:'BOUNCED'});
  assert.equal(alert().status,'BOUNCED');
});

test('a delivered alert is resolved like an accepted one',async t=>{
  const {c,worker}=await acceptedAlert(t,sentReceipt('delivered'));
  assert.equal(worker.list({ownerId:c.ownerId,status:'unresolved'}).total,0);
  assert.equal(worker.list({ownerId:c.ownerId,status:'all'}).alerts[0].sentTo,null);
});

test('the owner alert list shows a bounced alert as "Email bounced" with the address',async()=>{
  const result=await build({absWorkingDir:root,bundle:true,write:false,platform:'node',format:'cjs',loader:{'.css':'empty'},
    define:{'process.env.NODE_ENV':'"production"'},
    plugins:[{name:'synthetic-owner-transport',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({loader:'js',contents:
      'export const api=async()=>{throw Error("no transport");};export const go=()=>{};export const getToken=()=>null;'+
      'export const logout=async()=>{};export const setToken=()=>{};export const getSessionKey=()=>"[PLACEHOLDER]";'}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
      import {OwnerAlerts} from './client/src/ownerAlerts.jsx';
      export const render=alerts=>renderToStaticMarkup(<OwnerAlerts alerts={alerts} configured={true}/>);`}});
  const directory=mkdtempSync(join(tmpdir(),'otc-alert-render-'));
  let render;
  try{writeFileSync(join(directory,'render.cjs'),result.outputFiles[0].text);({render}=createRequire(import.meta.url)(join(directory,'render.cjs')));}
  finally{rmSync(directory,{recursive:true,force:true});}
  const base={eventType:'voice.urgent_flagged',aggregateId:'SYNTHETIC',attemptCount:1,createdAt:at,title:'Urgent call'};
  const html=render([{...base,id:'a',status:'BOUNCED',sentTo:'owner@example.invalid'},{...base,id:'b',status:'DELIVERED',sentTo:null}]);
  const text=html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  assert.match(text,/Urgent call · Email bounced Sent to owner@example\.invalid/);
  assert.match(text,/Urgent call · Delivered/);
  assert.equal((text.match(/Sent to/g)||[]).length,1);
});
