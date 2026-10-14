import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {migrateDatabase} from '../server/src/migrations.js';
import {createBookingService} from '../server/src/bookingService.js';
import {installBookingRoutes} from '../server/src/bookingRoutes.js';
import {hasOperatorAccess} from '../server/src/planAccess.js';

const OWNER = 'SYNTHETIC-booking-A', OTHER = 'SYNTHETIC-booking-B';
const ORIGIN = 'https://synthetic.example.invalid';
const SECRET = 'SYNTHETIC-booking-service-end-20261014-secret';
const LOCATION = {addressLine1:'[SYNTHETIC] 1 Test Street',addressLine2:'',city:'Halifax',region:'NS',postalCode:'B3H 0A1',country:'CA'};
const CUSTOMER = {name:'[SYNTHETIC] Caller',phone:'+15065550123',email:'caller@example.invalid'};
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
const confirmed = r => ({status:'CONFIRMED',eventId:r.eventId,startAtUtc:r.startAtUtc,endAtUtc:r.endAtUtc});

async function fixture(t) {
  let time = Date.parse('2026-10-14T12:00:00.000Z');
  // The actual route uses the centralized decision's default clock. The
  // service receives the same deterministic clock; no sleeps or fake timers.
  t.mock.method(Date, 'now', () => time);
  const clock = () => new Date(time);
  const directory = mkdtempSync(join(tmpdir(), 'SYNTHETIC-booking-service-end-'));
  const filename = join(directory, 'fixture.sqlite');
  let db = new Database(filename), booking, server;
  db.pragma('foreign_keys = ON'); db.pragma('journal_mode = WAL'); migrateDatabase(db);
  const operations = [], originalWrites = [], abandoned = [], events = new Map();
  const calendar = {
    idempotentCreateByEventId:true,
    async getEvent(r) { operations.push({op:'getEvent',...r}); return events.get(r.eventId) || null; },
    async listBusy(r) { operations.push({op:'listBusy',...r}); return []; },
    async createEvent(r) { operations.push({op:'createEvent',...r}); const result=confirmed(r); events.set(r.eventId,result); return result; }
  };
  const construct = () => createBookingService({db,calendar,slotTokenSecret:SECRET,clock});
  for (const owner of [OWNER, OTHER]) {
    db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,role,createdAt)
      VALUES(?,?,'SYNTHETIC','[SYNTHETIC]','[SYNTHETIC]','Operator','active','owner',?)`).run(owner,owner+'@example.invalid',clock().toISOString());
    db.prepare(`INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt)
      VALUES(?,?,?,?,?)`).run(owner,'cus_'+owner,clock().toISOString(),clock().toISOString(),clock().toISOString());
    db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(owner);
    assert.equal(hasOperatorAccess(db.prepare('SELECT * FROM users WHERE id=?').get(owner),{now:clock()}),true);
    db.prepare('INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,?,?)')
      .run(owner,JSON.stringify({serviceArea:{mode:'all',cities:[]}}),clock().toISOString());
    const weekly = Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(day=>[day,[{start:'09:00',end:'17:00'}]]));
    db.prepare(`INSERT INTO bookingSettings(ownerId,revision,timezone,provider,calendarId,weeklyAvailabilityJson,blackoutsJson,
      bookingHorizonDays,minimumNoticeMinutes,slotIncrementMinutes,bufferBeforeMinutes,bufferAfterMinutes,directBookingEnabled,updatedAt)
      VALUES(?,'s1','UTC','google','primary',?,'[]',30,0,15,0,0,1,?)`).run(owner,JSON.stringify(weekly),clock().toISOString());
    db.prepare(`INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,durationMinutes,enabled,updatedAt)
      VALUES(?,'voice-appointment','p1','site_visit_first',45,1,?)`).run(owner,clock().toISOString());
    db.prepare(`INSERT INTO leads(id,ownerId,customerName,callerNumber,type,status,createdAt)
      VALUES(?,?,'[SYNTHETIC] Caller',?,'voice','NEW',?)`).run(owner+'-lead',owner,CUSTOMER.phone,clock().toISOString());
    db.prepare('INSERT INTO quoteAccessKeys(ownerId,publicKey,allowedOriginsJson,createdAt) VALUES(?,?,?,?)')
      .run(owner,owner+'-key',JSON.stringify([ORIGIN]),clock().toISOString());
  }
  booking = construct();
  function snapshot(owner=OWNER) {
    return Object.fromEntries(['appointments','bookingHolds','bookingIdempotency','outboxEvents'].map(table=>
      [table,db.prepare(`SELECT * FROM ${table} WHERE ownerId=? ORDER BY rowid`).all(owner)]));
  }
  async function pending(owner=OWNER) {
    const intent = booking.createIntent({ownerId:owner,sourceType:'lead',sourceId:owner+'-lead',serviceId:'voice-appointment',
      resultType:'APPOINTMENT_REQUEST',expiresAtUtc:'2026-10-20T12:00:00.000Z'});
    const available = await booking.availability({ownerId:owner,intentId:intent.intentId,filters:{fromDate:'2026-10-15',days:1,location:LOCATION}});
    const held = booking.hold({ownerId:owner,intentId:intent.intentId,idempotencyKey:randomUUID(),slotId:available.body.slots[0].slotId});
    const request = {ownerId:owner,intentId:intent.intentId,idempotencyKey:randomUUID(),body:{holdId:held.body.holdId,
      confirmedSlotId:held.body.slot.slotId,explicitConfirmation:true,addressConfirmation:true,customer:CUSTOMER,location:LOCATION}};
    const reached = deferred(), dispatched = deferred(), previous = calendar.createEvent;
    calendar.createEvent = async r => { originalWrites.push(r); reached.resolve(r); return dispatched.promise; };
    const connection = db, promise = booking.confirm(request);
    const providerRequest = await reached.promise;
    calendar.createEvent = previous;
    abandoned.push({connection,dispatched,promise});
    const receipt = JSON.parse(db.prepare("SELECT responseJson FROM bookingIdempotency WHERE ownerId=? AND operation='confirm'").get(owner).responseJson);
    assert.equal(db.prepare('SELECT status FROM appointments WHERE ownerId=?').get(owner).status,'PENDING_PROVIDER');
    booking = construct(); // A new service instance, not a process restart.
    operations.length = 0;
    return {request,receipt,providerRequest,poll:{bookingToken:intent.bookingToken,confirmationId:receipt.confirmationId},
      finish: async () => { dispatched.resolve(confirmed(providerRequest)); return promise; }};
  }
  async function http(poll, {origin=ORIGIN, query='', method='GET', endpoint}={}) {
    if (!server) {
      const app=express();app.use(express.json());
      installBookingRoutes(app,{bookingService:booking,database:db,requireAuth:()=>((_req,res)=>res.sendStatus(401)),
        asyncHandler:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next)});
      app.use((error,_req,res,_next)=>res.status(error.statusCode||500).json({error:error.message,code:error.code}));
      server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    }
    const route=endpoint||`/api/public/bookings/${poll.bookingToken}/confirmations/${poll.confirmationId}`;
    const response=await fetch(`http://127.0.0.1:${server.address().port}${route}${query}`,{method,
      headers:{Origin:origin,'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
    return {status:response.status,body:await response.json()};
  }
  t.after(async()=>{
    for (const item of abandoned) if (item.connection.open) {
      item.dispatched.resolve({status:'PENDING_CONFIRMATION'});await item.promise;
    }
    // After reopen, old unresolved synthetic writes have no timer, socket or
    // callback. They are deliberately not resumed against the closed database.
    if (server) {server.closeAllConnections();await new Promise(r=>server.close(r));}
    db.close();rmSync(directory,{recursive:true,force:true});
  });
  return {get db(){return db;},get booking(){return booking;},calendar,operations,originalWrites,events,pending,http,snapshot,
    now:()=>time,advance:ms=>{time+=ms;},end:()=>db.prepare('UPDATE users SET serviceEndsAt=? WHERE id=?').run(clock().toISOString(),OWNER),
    reopen(){assert.equal(server,undefined);db.close();db=new Database(filename);db.pragma('foreign_keys = ON');booking=construct();}};
}

for (const denial of ['service-ended','expired-trial','lost-booking-plan']) {
  test(`booking service end: public polling and direct recovery deny ${denial}`,{timeout:10000},async t=>{
    const s=await fixture(t),p=await s.pending(),other=s.snapshot(OTHER);
    if (denial==='service-ended')s.end();
    if (denial==='expired-trial')s.db.prepare("UPDATE users SET planStatus='trialing',trialEndsAt=? WHERE id=?").run(new Date(s.now()).toISOString(),OWNER);
    if (denial==='lost-booking-plan')s.db.prepare("UPDATE users SET plan='Starter' WHERE id=?").run(OWNER);
    const before=s.snapshot();
    assert.deepEqual(await s.http(p.poll),{status:403,body:{error:'This business is currently unavailable.',code:'BOOKING_UNAVAILABLE'}});
    assert.deepEqual(s.operations,[],'Route denial must not contact the provider');
    const direct=await s.booking.getConfirmationStatus(p.poll);
    assert.equal(direct.body.status,'PENDING_CONFIRMATION');
    assert.equal(s.operations.filter(r=>r.op==='createEvent').length,0);
    assert.deepEqual(s.snapshot(),before,'Pending slot, receipts and notifications remain unchanged');
    assert.deepEqual(s.snapshot(OTHER),other);
  });
}

for (const offset of [-1,0]) test(`booking service end: public recovery at deadline offset ${offset}ms`,{timeout:10000},async t=>{
  const s=await fixture(t),p=await s.pending(),deadline=s.now()+1000;
  s.db.prepare('UPDATE users SET serviceEndsAt=? WHERE id=?').run(new Date(deadline).toISOString(),OWNER);
  s.advance(1000+offset);
  const result=await s.http(p.poll);
  assert.equal(result.status,offset<0?200:403);
  assert.equal(s.operations.filter(r=>r.op==='createEvent').length,offset<0?1:0);
  assert.equal(s.snapshot().outboxEvents.length,offset<0?1:0);
});

for (const read of ['getEvent','listBusy']) for (const loss of ['deadline','plan-change']) {
  test(`booking service end: ${loss} during awaited ${read} prevents recovery write`,{timeout:10000},async t=>{
    const s=await fixture(t),p=await s.pending(),started=deferred(),release=deferred(),deadline=s.now()+1000;
    s.db.prepare('UPDATE users SET serviceEndsAt=? WHERE id=?').run(new Date(deadline).toISOString(),OWNER);
    const before=s.snapshot();
    s.calendar[read]=async r=>{s.operations.push({op:read,...r});started.resolve();await release.promise;return read==='getEvent'?null:[];};
    const pending=s.http(p.poll);await started.promise;
    if(loss==='deadline')s.advance(1000);else s.db.prepare("UPDATE users SET plan='Starter' WHERE id=?").run(OWNER);
    release.resolve();const response=await pending;
    assert.equal(response.status,200);assert.equal(response.body.status,'PENDING_CONFIRMATION');
    assert.equal(s.operations.filter(r=>r.op==='createEvent').length,0);
    assert.deepEqual(s.snapshot(),before);
  });
}

test('booking service end: active recovery reuses saved event, preserves receipt and confirms once',{timeout:10000},async t=>{
  const s=await fixture(t),p=await s.pending(),other=s.snapshot(OTHER);
  const results=await Promise.all([s.booking.getConfirmationStatus(p.poll),s.booking.getConfirmationStatus(p.poll)]);
  assert.ok(results.some(r=>r.body.status==='CONFIRMED'));
  assert.deepEqual(s.operations.filter(r=>r.op==='createEvent').map(r=>r.eventId),[p.providerRequest.eventId]);
  const result=await s.http(p.poll);assert.equal(result.body.status,'CONFIRMED');
  assert.deepEqual((await s.booking.confirm(p.request)).body,p.receipt);
  assert.equal(s.snapshot().outboxEvents.length,1);assert.equal(s.snapshot().appointments.length,1);
  assert.equal(s.snapshot().bookingHolds[0].status,'CONFIRMED');
  const before=s.snapshot();assert.deepEqual(await s.http(p.poll),result);assert.deepEqual(s.snapshot(),before);
  assert.deepEqual(s.snapshot(OTHER),other);
});

test('booking service end: existing provider event reconciles without creation or duplicate notification',{timeout:10000},async t=>{
  const s=await fixture(t),p=await s.pending();s.events.set(p.providerRequest.eventId,confirmed(p.providerRequest));
  const result=await s.http(p.poll);assert.equal(result.body.status,'CONFIRMED');
  assert.deepEqual(await s.http(p.poll),result);
  assert.equal(s.operations.filter(r=>r.op==='createEvent').length,0);assert.equal(s.snapshot().outboxEvents.length,1);
  assert.deepEqual((await s.booking.confirm(p.request)).body,p.receipt);
});

test('booking service end: lookup error stays uncertain and retains pending receipt/slot',{timeout:10000},async t=>{
  const s=await fixture(t),p=await s.pending(),before=s.snapshot();
  s.calendar.getEvent=async()=>{throw Error('SYNTHETIC lookup timeout');};
  const result=await s.http(p.poll);assert.equal(result.status,200);assert.equal(result.body.status,'PENDING_CONFIRMATION');
  assert.equal(s.operations.filter(r=>r.op==='createEvent').length,0);assert.deepEqual(s.snapshot(),before);
});

for (const entitled of [false,true]) test(`booking service end: database reopen/service reconstruction ${entitled?'allows entitled':'blocks expired'} recovery`,{timeout:10000},async t=>{
  const s=await fixture(t),p=await s.pending();if(!entitled)s.end();
  const before=s.snapshot();s.reopen();assert.deepEqual(s.snapshot(),before);
  const direct=await s.booking.getConfirmationStatus(p.poll);
  assert.equal(direct.body.status,entitled?'CONFIRMED':'PENDING_CONFIRMATION');
  assert.equal(s.operations.filter(r=>r.op==='createEvent').length,entitled?1:0);
  assert.equal((await s.http(p.poll)).status,entitled?200:403);
  if(!entitled)assert.deepEqual(s.snapshot(),before);
});

for (const dispatched of ['original','recovery']) test(`booking service end: already-dispatched ${dispatched} write can settle after deadline`,{timeout:10000},async t=>{
  const s=await fixture(t),p=await s.pending();let result;
  if(dispatched==='original') {s.end();result=await p.finish();}
  else {
    const started=deferred(),release=deferred();
    s.calendar.createEvent=async r=>{s.operations.push({op:'createEvent',...r});started.resolve();await release.promise;return confirmed(r);};
    const pending=s.http(p.poll);await started.promise;s.end();release.resolve();result=await pending;
  }
  assert.equal(result.body.status,'CONFIRMED');assert.equal(s.snapshot().outboxEvents.length,1);
  assert.equal(s.snapshot().bookingHolds[0].status,'CONFIRMED');
  const before=s.snapshot(),operations=s.operations.slice();
  assert.deepEqual(await s.http(p.poll),{status:200,body:result.body},'Completed receipt remains read-only after service end');
  assert.deepEqual(s.operations,operations,'Reading the completed receipt must not contact the provider');
  assert.equal((await s.booking.getConfirmationStatus(p.poll)).body.status,'CONFIRMED');assert.deepEqual(s.snapshot(),before);
  assert.equal(s.operations.filter(r=>r.op==='createEvent').length,dispatched==='original'?0:1);
});

test('booking service end: tenant, origin, token and confirmation-handle denials preserve both owners',{timeout:10000},async t=>{
  const s=await fixture(t),a=await s.pending(),b=await s.pending(OTHER),beforeA=s.snapshot(),beforeB=s.snapshot(OTHER);
  for(const [poll,options,status] of [
    [a.poll,{origin:'https://other.example.invalid'},403],
    [a.poll,{query:'?ownerId='+OTHER},403],
    [{...a.poll,bookingToken:'invalid'}, {},404],
    [{...a.poll,confirmationId:'invalid'}, {},404],
    [{...b.poll,confirmationId:a.poll.confirmationId}, {},404]
  ]) assert.equal((await s.http(poll,options)).status,status);
  assert.deepEqual(s.operations,[]);assert.deepEqual(s.snapshot(),beforeA);assert.deepEqual(s.snapshot(OTHER),beforeB);
  s.end();assert.equal((await s.http(a.poll)).status,403);
  assert.equal((await s.http(b.poll)).body.status,'CONFIRMED','A ending must not deny entitled B');
  assert.deepEqual(s.snapshot(),beforeA);
});
