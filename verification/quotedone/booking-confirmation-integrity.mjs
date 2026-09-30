import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {mowingFixture} from './repair-fixture.mjs';
const [root,evidence,phase='after']=process.argv.slice(2),app=await startApplication(root,evidence,{port:4616,calendarFixture:true});
const db=new Database(path.join(evidence,'application.sqlite')),rows=[];
const fixtureFile=path.join(evidence,'synthetic-calendar-provider.json');
const provider=()=>JSON.parse(fs.readFileSync(fixtureFile,'utf8'));
const change=values=>fs.writeFileSync(fixtureFile,JSON.stringify({...provider(),...values},null,2));
const key=()=>crypto.randomUUID(),customer={name:'[SYNTHETIC] Confirmation check',email:'synthetic-confirmation@example.invalid'},location={addressLine1:'[SYNTHETIC] 123 Example Street',city:'Halifax',region:'NS',postalCode:'B3H 0A1',country:'CA'};
try {
  const f=await mowingFixture(app,'confirmation-integrity',['http://127.0.0.1:4617']);
  const oauth=await app.request('GET','/api/onboarding/calendar/google/start',undefined,f.owner.token),state=new URL(oauth.result.authorizationUrl).searchParams.get('state');
  const callback=await fetch(app.base+'/api/onboarding/calendar/google/callback?state='+encodeURIComponent(state)+'&code=SYNTHETIC-CODE',{redirect:'manual'});assert.equal(callback.status,302);
  await f.call('POST','/api/onboarding/knowledge-base',{sections:[],serviceArea:{mode:'all',cities:[]}});
  await f.call('PUT','/api/booking/settings',{timezone:'America/Halifax',weeklyAvailability:Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(day=>[day,[{start:'08:00',end:'20:00'}]])),blackouts:[],bookingHorizonDays:14,minimumNoticeMinutes:0,slotIncrementMinutes:30,bufferBeforeMinutes:0,bufferAfterMinutes:0,directBookingEnabled:true});
  await f.call('PUT','/api/booking/policies/'+f.id,{bookingMode:'site_visit_first',durationMinutes:30,enabled:true});
  const fromDate=new Date(Date.now()+2*86400000).toISOString().slice(0,10),filters={fromDate,days:3,timeOfDay:'any',scopeConfirmation:'UNCHANGED',customer,location};
  for(const route of ['create','recovery','poll'])for(const variant of ['normal','cancelled','tentative','wrong-day','wrong-duration','wrong-id','missing-status','missing-time']) {
    // Fresh process per four independent synthetic requests keeps the normal
    // production rate limit intact while testing all provider permutations.
    if(rows.length&&rows.length%4===0)await app.restart();
    change({mode:'normal',variant:'normal'});
    const quoteBody=f.submission({intakeFlow:'job-details-v1'}),prepared=await app.request('POST',f.url+'/prepare',quoteBody,undefined,f.headers);
    assert.equal(prepared.status,200);const submitted=await app.request('POST',f.url,{...quoteBody,intakeConfirmation:prepared.result.confirmation},undefined,f.headers);assert.equal(submitted.status,201);assert.equal(submitted.result.midEstimate,50);
    const prefix='/api/public/bookings/'+submitted.result.bookingToken;
    const call=(method,suffix,body,id)=>app.request(method,prefix+suffix,body,undefined,{...f.headers,...(id?{'Idempotency-Key':id}:{})});
    const available=await call('POST','/availability',filters);assert.equal(available.result.status,'AVAILABLE',JSON.stringify(available));const slot=available.result.slots[0];
    const held=await call('POST','/holds',{slotId:slot.slotId},key());assert.equal(held.status,201);
    const body={holdId:held.result.holdId,confirmedSlotId:slot.slotId,explicitConfirmation:true,addressConfirmation:true,customer,location},id=key();
    change({mode:route==='create'?'normal':route==='recovery'?'recover-immediately':'ambiguous',variant});
    const confirmed=await call('POST','/confirm',body,id);
    const retry=await call('POST','/confirm',body,id);assert.deepEqual(retry,confirmed);
    let result=confirmed;
    if(route==='poll') {assert.equal(confirmed.result.status,'PENDING_CONFIRMATION');change({mode:'normal'});result=await call('GET','/confirmations/'+confirmed.result.confirmationId);}
    const appointment=db.prepare('SELECT * FROM appointments WHERE ownerId=? ORDER BY createdAt DESC LIMIT 1').get(f.owner.id);
    const hold=db.prepare('SELECT * FROM bookingHolds WHERE ownerId=? AND id=?').get(f.owner.id,held.result.holdId);
    const outbox=db.prepare("SELECT * FROM outboxEvents WHERE ownerId=? AND eventType='appointment.booked' AND aggregateId=?").all(f.owner.id,appointment.id);
    const correct=variant==='normal'?result.result.status==='CONFIRMED'&&appointment.status==='CONFIRMED'&&outbox.length===1:result.result.status!=='CONFIRMED'&&appointment.status!=='CONFIRMED'&&outbox.length===0;
    rows.push({route,variant,correct,slot,body,confirmed,retry,result,appointment,hold,outbox,provider:provider().events[appointment.providerEventId]});
    if(phase!=='before')assert.equal(correct,true,JSON.stringify(rows.at(-1)));
  }
  const failures=rows.filter(row=>!row.correct).map(({route,variant})=>({route,variant}));
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  if(phase==='before'){assert.ok(failures.some(row=>row.route==='recovery'&&row.variant==='cancelled'));assert.ok(failures.some(row=>row.variant==='wrong-day'));}
  console.log(JSON.stringify({phase,checks:rows.length,failures}));
} finally {fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({phase,rows,provider:provider()},null,2));db.close();await app.stop();}
