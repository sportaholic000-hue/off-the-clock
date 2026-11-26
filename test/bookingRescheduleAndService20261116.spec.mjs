import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fixture,SECRET,CUSTOMER,LOCATION} from './fixtures/bookingCalendar20261006.mjs';
import {createGoogleCalendarAdapter} from '../server/src/googleCalendarAdapter.js';
import {openSlotToken,sealSlotToken} from '../server/src/bookingTokens.js';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
import {csvRows} from '../server/src/integrationData.js';
import {migrateDatabase} from '../server/src/migrations.js';

// Three booking defects (2026-11-16). Fakes only: the fixture's in-memory
// calendar, then the production Google Calendar adapter over a fake fetch that
// keeps events by ID and answers freeBusy by merging busy events the way
// Google does. Email goes through the production owner alert sender with a fake
// fetch. No call, text message, live calendar or email provider is used.
//
// Expected results, written before running:
// 1. Reschedule and its own time (fails on 8095fdf9 where marked):
//    a. 12:00-12:45 moving: 12:15 and 12:30 are offered [fails today: the first
//       offered start is 12:45]; the current 12:00 is not offered; moving to
//       12:15-13:00 confirms, the row and the Google event move, one "Booking
//       confirmed" alert in all; a new customer is then not offered 12:00 or
//       12:15 [fails today].
//    b. another appointment at 12:45-13:30 still blocks 12:15 and 12:30: they
//       are not offered and a sealed 12:15 slot is refused at hold with
//       SLOT_UNAVAILABLE (passes today).
//    c. a Google-only event at 12:20-12:30, which freeBusy merges into the own
//       event's busy block, still blocks 12:15; 12:30 is offered and the move
//       to 12:30 confirms [fails today: 12:30 is not offered].
//    d. the calendar refuses the event list (403): the own time stays blocked,
//       as today (passes today).
// 2. Reschedule and the quote's terms:
//    a. book_job quote priced off-season (November busy): a reschedule into
//       November is refused with the same code, status, message and details
//       as a new booking of that quote on that date [fails today: CONFIRMED];
//       the appointment and its Google event stay at the original time and the
//       replacement hold is not left held; a move within October still confirms.
//    b. quote valid until 2026-10-07 00:00 UTC: at 23:30 the replacement
//       booking request expires at 00:00, not 00:30 [fails today]; from 00:00
//       a reschedule is refused like a new booking of an expired quote:
//       BOOKING_CONTEXT_EXPIRED 410 "This booking request has expired."
//       [fails today: times are offered].
// 3. The booked service is saved [fails today: serviceType NULL]:
//    the appointment.booked webhook, the bookings CSV, the Calendar page and
//    the "Booking confirmed" email show the quote's service name as written;
//    a lead-sourced booking saves the lead's described service; an existing
//    row saved without a service is filled from its own quote when the
//    database is migrated, and a row of another owner is not touched.
const ownerId='synthetic-a',callSid='CA'+'a'.repeat(32);
const at=minutes=>new Date(Date.parse('2026-10-07T12:00:00.000Z')+minutes*60000).toISOString();
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

function fakeGoogle(f){
  const store=new Map(),state={listAllowed:true},patches=[];let version=1;
  const etag=()=>`"SYNTHETIC-v${version++}"`;
  const seed=(id,start,end,extra={})=>store.set(id,{id,etag:etag(),status:'confirmed',start:{dateTime:start},end:{dateTime:end},...extra});
  for(const e of f.events.values())if(e.status==='CONFIRMED')seed(e.eventId,e.startAtUtc,e.endAtUtc);
  const timed=e=>e.status!=='cancelled'&&e.start?.dateTime&&e.end?.dateTime;
  const fetch=async(url,options)=>{
    const u=new URL(url),path=u.pathname.replace(/^\/calendar\/v3/,'');
    if(path==='/freeBusy'){
      const b=JSON.parse(options.body),min=Date.parse(b.timeMin),max=Date.parse(b.timeMax);
      const rows=[...store.values()].filter(e=>timed(e)&&e.transparency!=='transparent')
        .map(e=>[Math.max(Date.parse(e.start.dateTime),min),Math.min(Date.parse(e.end.dateTime),max)]).filter(([s,e])=>s<e).sort((a,b)=>a[0]-b[0]);
      const merged=[];for(const row of rows){const last=merged.at(-1);if(last&&row[0]<=last[1])last[1]=Math.max(last[1],row[1]);else merged.push([...row]);}
      return response({calendars:{primary:{busy:merged.map(([s,e])=>({start:new Date(s).toISOString(),end:new Date(e).toISOString()}))}}});
    }
    const match=path.match(/^\/calendars\/primary\/events(?:\/([^/]+))?$/);
    if(match&&!match[1]&&options.method==='GET'){
      if(!state.listAllowed)return response({error:{code:403,message:'[SYNTHETIC] insufficient scope'}},403);
      const min=Date.parse(u.searchParams.get('timeMin')),max=Date.parse(u.searchParams.get('timeMax'));
      return response({items:[...store.values()].filter(e=>e.status!=='cancelled'&&(!timed(e)||Date.parse(e.start.dateTime)<max&&Date.parse(e.end.dateTime)>min))});
    }
    if(match&&match[1]&&options.method==='GET'){const e=store.get(decodeURIComponent(match[1]));return e?response(e):response({error:{code:404}},404);}
    if(match&&match[1]&&options.method==='PATCH'){
      const id=decodeURIComponent(match[1]),e=store.get(id);if(!e)return response({error:{code:404}},404);
      if(options.headers['if-match']&&options.headers['if-match']!==e.etag)return response({error:{code:412}},412);
      const body=JSON.parse(options.body);patches.push({id,body});
      const next={...e,...body,etag:etag()};store.set(id,next);return response(next);
    }
    throw Error('[SYNTHETIC] unexpected '+options.method+' '+url);
  };
  const adapter=createGoogleCalendarAdapter({clock:f.clock,requestTimeoutMs:200,clientId:'[SYNTHETIC]-client',clientSecret:'[SYNTHETIC]-secret',
    credentialRepository:{async load(id){return {ownerId:id,provider:'google',status:'connected',calendarId:'primary',expiresAtUtc:'2027-01-01T00:00:00.000Z',
      scopesJson:JSON.stringify(['https://www.googleapis.com/auth/calendar']),credentials:{accessToken:'SYNTHETIC-access-token',refreshToken:null,tokenType:'Bearer'}};},
      async saveRefreshed(){throw Error('[SYNTHETIC] no refresh');}},fetch});
  return {adapter,store,state,patches,seed};
}

// One confirmed appointment at 12:00-12:45 UTC on 2026-10-07 (09:00 in Moncton),
// booked through the fixture calendar, then the calendar becomes Google.
async function booked(t,{mode='site_visit_first',quoteResult=null,before=null}={}){
  const f=fixture(t);
  f.db.prepare('UPDATE bookingPolicies SET bookingMode=? WHERE ownerId=?').run(mode,ownerId);
  const i=f.intent(),quoteId=f.db.prepare('SELECT sourceId FROM bookingIntents WHERE id=?').get(i.intentId).sourceId;
  if(quoteResult)f.db.prepare('UPDATE quotes SET resultJson=? WHERE ownerId=? AND id=?').run(JSON.stringify(quoteResult),ownerId,quoteId);
  if(before)await before(f);
  const slot=(await f.slots(i)).find(s=>s.startUtc===at(0));assert.ok(slot,'12:00 offered for the first booking');
  const confirmed=await f.booking.confirm(f.request(i,f.hold(i,slot)));
  assert.equal(confirmed.body.status,'CONFIRMED');
  const appointment=()=>f.db.prepare('SELECT * FROM appointments WHERE ownerId=? AND bookingIntentId IN (SELECT id FROM bookingIntents WHERE ownerId=? AND sourceId=?)').get(ownerId,ownerId,quoteId);
  const original=appointment();
  f.db.prepare('UPDATE calls SET callSid=? WHERE ownerId=? AND id=?').run(callSid,ownerId,ownerId+'-call');
  const google=fakeGoogle(f);Object.assign(f.calendar,google.adapter);
  const offered=async(filters={fromDate:f.date,days:1})=>{
    const result=await f.booking.appointmentAvailability({ownerId,appointmentId:original.id,callerNumber:CUSTOMER.phone,filters});
    return {intentId:result.intentId,slots:result.body.slots||[]};
  };
  const move=(intentId,slotId)=>f.booking.modifyAppointment({ownerId,callSid,action:'reschedule',appointment:{id:original.id},intentId,slotId,idempotencyKey:randomUUID()});
  const count=type=>f.db.prepare('SELECT COUNT(*) n FROM ownerAlerts WHERE ownerId=? AND eventType=?').get(ownerId,type).n;
  return {f,i,quoteId,original,appointment,google,offered,move,count};
}
const starts=slots=>slots.map(s=>s.startUtc);
// A slot token for a time availability did not offer, to show the hold's own check.
function sealed(slotId,start){
  const ref=openSlotToken(slotId,SECRET);
  return sealSlotToken({...ref,startAtUtc:start,endAtUtc:new Date(Date.parse(start)+45*60000).toISOString(),lockStartAtUtc:start,lockEndAtUtc:new Date(Date.parse(start)+45*60000).toISOString()},SECRET);
}

test('1: a reschedule is not blocked by the appointment\'s own time; everything else still blocks',async t=>{
  await t.test('a. 12:00-12:45 moves to 12:15-13:00',async t2=>{
    const s=await booked(t2),{intentId,slots}=await s.offered();
    assert.ok(starts(slots).includes(at(15)),'12:15 offered');assert.ok(starts(slots).includes(at(30)),'12:30 offered');
    assert.ok(!starts(slots).includes(at(0)),'the current time is not offered as a new time');
    const result=await s.move(intentId,slots.find(x=>x.startUtc===at(15)).slotId);
    assert.equal(result.status,'CONFIRMED');
    const row=s.appointment();
    assert.deepEqual([row.status,row.startAtUtc,row.endAtUtc,row.lockStartAtUtc,row.lockEndAtUtc],['CONFIRMED',at(15),at(60),at(15),at(60)]);
    const event=s.google.store.get(s.original.providerEventId);
    assert.deepEqual([event.start.dateTime,event.end.dateTime],[at(15),at(60)]);
    assert.equal(s.count('booking.confirmed'),1);assert.equal(s.count('booking.released'),0);
    // A new customer is not offered the moved time or the old time it overlaps.
    const other=starts(await s.f.slots(s.f.intent()));
    assert.ok(!other.includes(at(0))&&!other.includes(at(15))&&!other.includes(at(30))&&!other.includes(at(45)),'no overlap offered: '+other.join(' '));
    assert.ok(other.includes(at(60)));
  });
  await t.test('b. another appointment at 12:45-13:30 still blocks 12:15 and 12:30',async t2=>{
    const s=await booked(t2);
    // Book the other appointment through the Google calendar too.
    const j=s.f.intent(),slot=(await s.f.slots(j)).find(x=>x.startUtc===at(45));
    const originalCreate=s.f.calendar.createEvent;
    s.f.calendar.createEvent=async r=>{s.google.seed(r.eventId,r.startAtUtc,r.endAtUtc);return {status:'CONFIRMED',eventId:r.eventId,startAtUtc:r.startAtUtc,endAtUtc:r.endAtUtc};};
    assert.equal((await s.f.booking.confirm(s.f.request(j,s.f.hold(j,slot)))).body.status,'CONFIRMED');
    s.f.calendar.createEvent=originalCreate;
    const {intentId,slots}=await s.offered();
    assert.ok(!starts(slots).includes(at(15))&&!starts(slots).includes(at(30)),'offered: '+starts(slots).join(' '));
    assert.ok(starts(slots).includes(at(90)));
    await assert.rejects(s.move(intentId,sealed(slots[0].slotId,at(15))),e=>e.code==='SLOT_UNAVAILABLE'&&e.statusCode===409);
    assert.equal(s.appointment().startAtUtc,at(0));assert.equal(s.google.patches.length,0);
  });
  await t.test('c. a Google-only event inside the own busy block still blocks',async t2=>{
    const s=await booked(t2);s.google.seed('syntheticpersonal1',at(20),at(30));
    const {intentId,slots}=await s.offered();
    assert.ok(!starts(slots).includes(at(15)),'12:15 overlaps the 12:20 event');
    assert.ok(starts(slots).includes(at(30)),'12:30 offered: '+starts(slots).join(' '));
    assert.equal((await s.move(intentId,slots.find(x=>x.startUtc===at(30)).slotId)).status,'CONFIRMED');
    assert.equal(s.appointment().startAtUtc,at(30));
    // A sealed 12:15 slot passes the local hold, then the calendar's busy check refuses it.
    const again=await s.offered();
    await assert.rejects(s.move(again.intentId,sealed(again.slots[0].slotId,at(15))),e=>e.code==='SLOT_UNAVAILABLE'&&e.message==='That replacement time is no longer available.');
    assert.equal(s.appointment().startAtUtc,at(30));
  });
  await t.test('d. the calendar refuses the event list: the own time stays blocked',async t2=>{
    const s=await booked(t2);s.google.state.listAllowed=false;
    const {slots}=await s.offered();
    assert.equal(starts(slots)[0],at(45));
  });
});

test('2: a reschedule gets the same quote checks as a new booking',async t=>{
  const seasonal={percent:20,configuredMonths:[11],seasonActive:false};
  await t.test('a. into the busy season: refused exactly like a new booking',async t2=>{
    const s=await booked(t2,{mode:'book_job',quoteResult:{calculationRecord:{scenarios:{mid:{seasonal}}}}});
    const refusal=e=>({code:e.code,statusCode:e.statusCode,message:e.message,details:e.details});
    const MESSAGE='This quote was priced for work outside the busy season. The chosen date is in the busy season, so request a new quote for that date before booking the job.';
    // Merged with the price-book branch on November 26, 2026 (audits of v49 and
    // v50): times the quote's price does not hold for are not offered. Asking
    // only for busy-season dates answers with the reason, for a reschedule and
    // for a new booking alike. Expected values written before running.
    const moved=await s.offered({fromDate:'2026-11-04',days:1}).then(r=>({ok:r}),refusal);
    // A new booking of the same quote on the same date.
    const j=s.f.intent();
    s.f.db.prepare('UPDATE quotes SET resultJson=? WHERE ownerId=? AND id=?').run(JSON.stringify({calculationRecord:{scenarios:{mid:{seasonal}}}}),ownerId,s.f.db.prepare('SELECT sourceId FROM bookingIntents WHERE id=?').get(j.intentId).sourceId);
    const fresh=await s.f.booking.availability({...j,filters:{fromDate:'2026-11-04',days:1,location:LOCATION}}).then(r=>({ok:r}),refusal);
    assert.equal(fresh.code,'REQUOTE_REQUIRED');
    assert.deepEqual(moved,fresh);
    assert.equal(moved.message,MESSAGE);
    assert.deepEqual([moved.statusCode,moved.details],[409,{reason:'REQUOTE_REQUIRED',recoveryAction:'REQUEST_NEW_QUOTE'}]);
    // The change itself still refuses a busy-season time that was never offered:
    // an October slot token re-sealed for November 4.
    const october=await s.offered();
    const direct=await s.move(october.intentId,sealed(october.slots[0].slotId,'2026-11-04T15:00:00.000Z')).then(r=>({ok:r}),refusal);
    assert.deepEqual(direct,moved);
    assert.deepEqual([s.appointment().status,s.appointment().startAtUtc],['CONFIRMED',at(0)]);
    assert.equal(s.google.patches.length,0);
    assert.equal(s.f.db.prepare("SELECT COUNT(*) n FROM bookingHolds WHERE ownerId=? AND intentId=? AND status IN ('HELD','CONFIRMING')").get(ownerId,october.intentId).n,0);
    assert.equal((await s.move(october.intentId,october.slots.find(x=>x.startUtc===at(60)).slotId)).status,'CONFIRMED');
  });
  await t.test('b. quote validity: the booking request is capped, then an expired quote is refused',async t2=>{
    const quoteResult={calculationRecord:{quoteDate:{timeZone:'UTC',quoteInstant:'2026-10-01T12:00:00.000Z'},financialInputs:{businessDefaults:{quoteValidityDays:5}}}};
    const s=await booked(t2,{quoteResult});
    s.f.advance(11.5*3600000); // 2026-10-06 23:30 UTC
    const late=await s.offered();
    assert.equal(s.f.db.prepare('SELECT expiresAtUtc FROM bookingIntents WHERE ownerId=? AND id=?').get(ownerId,late.intentId).expiresAtUtc,'2026-10-07T00:00:00.000Z');
    s.f.advance(30*60000); // 2026-10-07 00:00 UTC
    await assert.rejects(s.offered(),e=>e.code==='BOOKING_CONTEXT_EXPIRED'&&e.statusCode===410&&e.message==='This booking request has expired.');
    await assert.rejects(s.move(late.intentId,late.slots.find(x=>x.startUtc===at(60)).slotId),e=>e.code==='BOOKING_CONTEXT_EXPIRED'&&e.statusCode===410);
    assert.deepEqual([s.appointment().status,s.appointment().startAtUtc],['CONFIRMED',at(0)]);
  });
});

test('3: a booking saves its service; webhook, CSV, Calendar page and email show it',async t=>{
  const SERVICE='[SYNTHETIC] Cedar Fence — 6 ft';
  process.env.CREDENTIAL_ENCRYPTION_KEY??=Buffer.alloc(32,7).toString('base64');
  const {createOutboundWebhookService}=await import('../server/src/outboundWebhookService.js');
  await t.test('a quote booking: webhook, CSV, Calendar page and email show its service',async t2=>{
    const f=fixture(t2);
    const hooks=createOutboundWebhookService({database:f.db,resolveDestination:async url=>({url:new URL(url)}),enabled:()=>false});
    await hooks.save(ownerId,{url:'https://receiver.example.invalid/hooks',events:['appointment.booked']});
    const i=f.intent();
    f.db.prepare('UPDATE quotes SET serviceType=?,resultJson=? WHERE ownerId=? AND id=(SELECT sourceId FROM bookingIntents WHERE id=?)')
      .run('FENCE_INSTALL',JSON.stringify({customerResult:{pricedScope:{service:SERVICE}}}),ownerId,i.intentId);
    const [slot]=await f.slots(i);
    assert.equal((await f.booking.confirm(f.request(i,f.hold(i,slot)))).body.status,'CONFIRMED');
    const row=f.db.prepare('SELECT * FROM appointments WHERE ownerId=?').get(ownerId);
    assert.equal(row.serviceType,SERVICE);
    // Webhook
    const delivery=f.db.prepare("SELECT payloadJson FROM webhookDeliveries WHERE ownerId=? AND eventType='appointment.booked'").get(ownerId);
    assert.equal(JSON.parse(delivery.payloadJson).service,SERVICE);
    // CSV
    const csv=[...csvRows(sql=>f.db.prepare(sql),ownerId,'bookings')];
    const header=JSON.parse('['+csv[0].replace('﻿','').trim()+']'),cells=JSON.parse('['+csv[1].trim()+']');
    assert.equal(cells[header.indexOf('service')],SERVICE);
    // Calendar page
    const schedule=f.ownerCalendar.schedule({ownerId,query:{fromDate:'2026-10-07',days:'1'}});
    const record=schedule.appointments.find(a=>a.id===row.id);assert.equal(record.serviceType,SERVICE);
    const vite=await createServer({root:fileURLToPath(new URL('../client',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
    t2.after(()=>vite.close());
    const {RecordCard}=await vite.ssrLoadModule('/src/calendar.jsx');
    const html=renderToStaticMarkup(React.createElement(RecordCard,{record,timezone:'America/Moncton'})).replace(/&amp;/g,'&');
    assert.ok(html.includes(SERVICE+' · Site visit'),html);
    const coded=renderToStaticMarkup(React.createElement(RecordCard,{record:{...record,serviceType:'FENCE_INSTALL'},timezone:'America/Moncton'}));
    assert.ok(coded.includes('Fence install · Site visit'));
    assert.ok(renderToStaticMarkup(React.createElement(RecordCard,{record:{...record,serviceType:null},timezone:'America/Moncton'})).includes('Appointment · Site visit'));
    // Email
    const environment={ALLOW_PROVIDER_WRITES:'true',EMAIL_PROVIDER:'resend',EMAIL_DELIVERY_ENABLED:'true',
      RESEND_API_KEY:'[SYNTHETIC]-resend-key',EMAIL_FROM:'alerts@example.invalid',CLIENT_URL:'https://app.example.invalid/'};
    const requests=[];
    t2.mock.method(globalThis,'fetch',async(url,options)=>{requests.push({url:String(url),options});return {ok:true,status:200,json:async()=>({id:'SYNTHETIC-provider-'+requests.length})};});
    const alerts=createOwnerAlertService({database:f.db,environment,clock:()=>Date.parse('2026-10-06T12:00:00.000Z'),readReceipt:async()=>{throw Error('[SYNTHETIC] not read');}});
    for(let n=0;n<5;n++)if(!await alerts.processOne(ownerId))break;
    const sent=requests.map(r=>JSON.parse(r.options.body)).filter(b=>b.subject==='Off The Clock: Booking confirmed');
    assert.equal(sent.length,1);
    assert.ok(sent[0].text.split('\n').includes('Service: '+SERVICE),sent[0].text);
    assert.ok(requests.every(r=>r.url==='https://api.resend.com/emails'));
  });
  await t.test('a lead-sourced booking saves the lead\'s described service',async t2=>{
    const g=fixture(t2);
    g.db.prepare(`INSERT INTO leads(id,ownerId,customerName,callerNumber,describedService,type,status,createdAt) VALUES('synthetic-lead',?,?,?,?,'voice','NEW',?)`)
      .run(ownerId,CUSTOMER.name,CUSTOMER.phone,'[SYNTHETIC] Gutter cleaning',g.clock().toISOString());
    g.db.prepare(`INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,durationMinutes,enabled,updatedAt) VALUES(?,'voice-appointment','p1','site_visit_first',45,1,?)`).run(ownerId,g.clock().toISOString());
    const intent=g.booking.createIntent({ownerId,sourceType:'lead',sourceId:'synthetic-lead',serviceId:'voice-appointment',resultType:'APPOINTMENT_REQUEST',expiresAtUtc:new Date(Date.parse(g.clock().toISOString())+3600000).toISOString()});
    const j={...intent,ownerId},[first]=await g.slots(j);
    assert.equal((await g.booking.confirm(g.request(j,g.hold(j,first)))).body.status,'CONFIRMED');
    assert.equal(g.db.prepare('SELECT serviceType FROM appointments WHERE ownerId=?').get(ownerId).serviceType,'[SYNTHETIC] Gutter cleaning');
  });
  await t.test('existing rows without a service are filled from their own quote on migration',async t2=>{
    const g=fixture(t2);
    const a=g.intent(),b=g.intent('synthetic-b');
    for(const [owner,intent,name] of [[ownerId,a,'[SYNTHETIC] Deck stain'],['synthetic-b',b,'[SYNTHETIC] Roof repair']])
      g.db.prepare('UPDATE quotes SET resultJson=? WHERE ownerId=? AND id=(SELECT sourceId FROM bookingIntents WHERE id=?)').run(JSON.stringify({customerResult:{pricedScope:{service:name}}}),owner,intent.intentId);
    const [sa]=await g.slots(a);await g.booking.confirm(g.request(a,g.hold(a,sa)));
    const [sb]=await g.slots(b);await g.booking.confirm(g.request(b,g.hold(b,sb)));
    // Saved before this change: no service.
    g.db.prepare('UPDATE appointments SET serviceType=NULL').run();
    // A row with no source to read keeps no service.
    g.db.prepare("UPDATE bookingIntents SET sourceId='synthetic-missing-quote' WHERE ownerId='synthetic-b' AND id=?").run(b.intentId);
    const deliveriesBefore=g.db.prepare('SELECT COUNT(*) n FROM webhookDeliveries').get().n,alertsBefore=g.db.prepare('SELECT COUNT(*) n FROM ownerAlerts').get().n;
    migrateDatabase(g.db);migrateDatabase(g.db);
    const service=owner=>g.db.prepare('SELECT serviceType FROM appointments WHERE ownerId=?').get(owner).serviceType;
    assert.equal(service(ownerId),'[SYNTHETIC] Deck stain');
    assert.equal(service('synthetic-b'),null);
    assert.equal(g.db.prepare('SELECT COUNT(*) n FROM webhookDeliveries').get().n,deliveriesBefore);
    assert.equal(g.db.prepare('SELECT COUNT(*) n FROM ownerAlerts').get().n,alertsBefore);
  });
});
