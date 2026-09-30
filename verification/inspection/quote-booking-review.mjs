import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import Database from 'better-sqlite3';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {offeringApplicationFixture} from '../quotedone/offering-application-fixture.mjs';
import {mowingFixture} from '../quotedone/repair-fixture.mjs';

const [root, evidence] = process.argv.slice(2);
const afterWriteClaim = process.argv.includes('--after-write-claim');
process.env.NODE_OPTIONS = '--import=' + pathToFileURL(path.join(root, 'verification/inspection/provider-boundary.mjs')).href;
const app = await startApplication(root, evidence, {port:4872, calendarFixture:true});
const db = new Database(path.join(evidence, 'application.sqlite'));
const results = [], key = () => crypto.randomUUID();
const providerFile = path.join(evidence, 'synthetic-calendar-provider.json');
const provider = () => JSON.parse(fs.readFileSync(providerFile, 'utf8'));
function setProvider(changes) { fs.writeFileSync(providerFile, JSON.stringify({...provider(), ...changes}, null, 2)); }
const writes = () => provider().calls.filter(x => x.method === 'POST' && new URL(x.url).pathname.endsWith('/events')).length;
const customer = {name:'[SYNTHETIC] Independent booking review', email:'synthetic-review@example.invalid', phone:''};
const location = {addressLine1:'[SYNTHETIC] Example property', addressLine2:'', city:'Halifax', region:'NS', postalCode:'B3H 0A1', country:'CA'};
const fromDate = new Date(Date.now() + 2*86400000).toISOString().slice(0,10);
const filters = {fromDate, days:3, timeOfDay:'any', scopeConfirmation:'UNCHANGED', customer, location};
const summary = r => ({httpStatus:r.status, status:r.result.status, code:r.result.code, resultType:r.result.resultType, midEstimate:r.result.midEstimate, reason:r.result.reason});
async function check(name, expected, fn) {
  const entry = {name, expected}; results.push(entry);
  try { entry.observed = await fn(); entry.passed = true; }
  catch (error) { entry.passed = false; entry.error = {code:error.code || null, message:error.message.slice(0,1000)}; }
  console.log(JSON.stringify({check:name, passed:entry.passed, ...(entry.error?{error:entry.error}:{})}));
}
async function submit(f, body) {
  const prepared = await app.request('POST', f.url+'/prepare', body, undefined, f.headers);
  assert.equal(prepared.status,200);
  const payload = {...body, ...(prepared.result.status==='ready'?{intakeConfirmation:prepared.result.confirmation}:{reviewRequested:true})};
  return {prepared, payload, reply:await app.request('POST', f.url, payload, undefined, f.headers)};
}
async function bookCall(f, q, method, suffix, body, id) {
  return app.request(method, '/api/public/bookings/'+q.bookingToken+suffix, body, undefined, {...f.headers,...(id?{'Idempotency-Key':id}:{})});
}
async function connect(f, serviceId, bookingMode='book_job', durationMinutes=90) {
  const started = await app.request('GET','/api/onboarding/calendar/google/start',undefined,f.owner.token);
  assert.equal(started.status,200);
  const state = new URL(started.result.authorizationUrl).searchParams.get('state');
  const callback = await fetch(app.base+'/api/onboarding/calendar/google/callback?state='+encodeURIComponent(state)+'&code=SYNTHETIC-CODE',{redirect:'manual'});
  assert.equal(callback.status,302);
  await f.call('POST','/api/onboarding/knowledge-base',{sections:[],serviceArea:{mode:'cities',cities:[{city:'Halifax',region:'NS',country:'CA'}]}});
  await f.call('PUT','/api/booking/settings',{timezone:'America/Halifax',weeklyAvailability:Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(d=>[d,[{start:'09:00',end:'17:00'}]])),blackouts:[],bookingHorizonDays:14,minimumNoticeMinutes:0,slotIncrementMinutes:30,bufferBeforeMinutes:0,bufferAfterMinutes:0,directBookingEnabled:true});
  await f.call('PUT','/api/booking/policies/'+serviceId,{bookingMode,durationMinutes,enabled:true});
}
const confirmation = (held, slot) => ({holdId:held.result.holdId, confirmedSlotId:slot.slotId, explicitConfirmation:true, addressConfirmation:true, customer, location});
function intent(q) {return db.prepare('SELECT * FROM bookingIntents WHERE tokenHash=?').get(crypto.createHash('sha256').update(q.bookingToken).digest('hex'));}
let f, first, firstQ;
try {
  f = await offeringApplicationFixture(app,'independent-qbook','http://127.0.0.1:4873');
  const controls = [
    {type:'FENCING_INSTALL',inputs:{linearFeet:123.5,gates:{walk:1}},cents:519000},
    {type:'FENCING_REPLACEMENT',inputs:{linearFeet:123.5,gates:{walk:1},removalLengthLF:17.25},cents:532800},
    {type:'INTERIOR_PAINTING',inputs:{wallAreaSqft:177.25,ceilingAreaSqft:80.5,trimLengthLF:17.75},cents:134050},
    {type:'EXTERIOR_PAINTING',inputs:{exteriorAreaSqft:311.25},cents:186750}
  ];
  for (const control of controls) await check('parity-'+control.type,'Three application paths match '+control.cents+' independently calculated cents; persisted request/revision and no public pricing internals',async()=>{
    const entry=f.cases.find(x=>x.type===control.type && x.mode==='installed');
    const body=f.submission(entry);Object.assign(body.customerInputs,control.inputs);
    const preview=await f.call('POST','/api/pricebook/preview',{serviceId:entry.id,revision:f.book.revision,customerInputs:body.customerInputs});
    const authBody={...body,requestId:key()},authPrepare=await f.call('POST','/api/quote/prepare',authBody);
    const authenticated=await f.call('POST','/api/quote/calculate',{...authBody,intakeConfirmation:authPrepare.confirmation},201);
    const publicRun=await submit(f,body);assert.equal(publicRun.reply.status,201);
    for(const value of [preview,authenticated,publicRun.reply.result]) {assert.equal(value.resultType,'INSTANT_ESTIMATE_READY');assert.equal(Math.round(value.midEstimate*100),control.cents);}
    const forbidden=new Set(['lineItems','rateCents','costCents','offeringRates','bookSnapshot','markupPercent','priceBasisByCategory']);
    if(publicRun.reply.result.priceDrivers!==undefined)assert.ok(Array.isArray(publicRun.reply.result.priceDrivers)&&publicRun.reply.result.priceDrivers.every(x=>typeof x==='string'),'Customer explanations must be plain text');
    function scan(v){if(v && typeof v==='object')for(const [k,x]of Object.entries(v)){assert.equal(forbidden.has(k),false,'Public field '+k);scan(x);}}scan(publicRun.reply.result);
    const saved=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,body.requestId);
    assert.equal(saved.bookRevision,f.book.revision);assert.deepEqual(JSON.parse(saved.originalSubmissionJson),publicRun.payload);
    const retry=await app.request('POST',f.url,publicRun.payload,undefined,f.headers);assert.equal(retry.status,200);assert.deepEqual(retry.result,publicRun.reply.result);
    if(control.type==='FENCING_INSTALL'){first=entry;firstQ=publicRun.reply.result;}
    return {cents:control.cents,preview:preview.midEstimate,authenticated:authenticated.midEstimate,public:publicRun.reply.result.midEstimate,persisted:true,retry:retry.status};
  });
  assert.ok(first && firstQ,'Fence positive control is required for booking checks');
  await check('signed-input-tamper','Changed selected-job measurements under a prior confirmation reject without persistence',async()=>{
    const body=f.submission(first),p=await app.request('POST',f.url+'/prepare',body,undefined,f.headers);
    const before=db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n;
    const r=await app.request('POST',f.url,{...body,customerInputs:{...body.customerInputs,linearFeet:999},intakeConfirmation:p.result.confirmation},undefined,f.headers);
    assert.equal(r.status,409);assert.equal(db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n,before);return summary(r);
  });
  await check('approval-revision-change','Book change after prepare rejects the prior signed confirmation, then owner explicitly reapproves restored configuration',async()=>{
    const body=f.submission(first),p=await app.request('POST',f.url+'/prepare',body,undefined,f.headers);
    let book=await f.call('GET','/api/pricebook/'+f.owner.id);book.services.find(s=>s.id===first.id).pricing.offeringRates.installedFencePerLF=41;
    await f.call('POST','/api/pricebook/save',book);
    const r=await app.request('POST',f.url,{...body,intakeConfirmation:p.result.confirmation},undefined,f.headers);assert.equal(r.status,409);
    book=await f.call('GET','/api/pricebook/'+f.owner.id);book.services.find(s=>s.id===first.id).pricing.offeringRates.installedFencePerLF=40;
    await f.call('POST','/api/pricebook/save',book);book=await f.call('GET','/api/pricebook/'+f.owner.id);
    await f.call('POST','/api/pricebook/services/'+first.id+'/approve',{revision:book.revision,confirmConfiguration:true});return summary(r);
  });
  await connect(f,first.id);
  const quote=async(extra={})=>{const body=f.submission(first);Object.assign(body,extra);const r=await submit(f,body);assert.equal(r.reply.status,201);return r.reply.result;};
  const q1=await quote(),q2=await quote();
  let winningQ,winningHold,winningSlot;
  await check('concurrent-holds','Two booking intents offered the same interval produce exactly one held slot',async()=>{
    const a=await bookCall(f,q1,'POST','/availability',filters),b=await bookCall(f,q2,'POST','/availability',filters);
    assert.equal(a.result.status,'AVAILABLE');assert.equal(b.result.status,'AVAILABLE');
    const sa=a.result.slots[0],sb=b.result.slots.find(s=>s.startUtc===sa.startUtc);assert.ok(sb);
    const pair=await Promise.all([bookCall(f,q1,'POST','/holds',{slotId:sa.slotId},key()),bookCall(f,q2,'POST','/holds',{slotId:sb.slotId},key())]);
    assert.deepEqual(pair.map(x=>x.status).sort(),[201,409]);const i=pair.findIndex(x=>x.status===201);winningQ=[q1,q2][i];winningHold=pair[i];winningSlot=[sa,sb][i];
    return pair.map(summary);
  });
  assert.ok(winningHold,'Held positive control required');
  const validBody=confirmation(winningHold,winningSlot);
  await check('confirmation-required','False explicit confirmation rejects before any provider event write',async()=>{
    const before=writes(),r=await bookCall(f,winningQ,'POST','/confirm',{...validBody,explicitConfirmation:false},key());assert.equal(r.status,400);assert.equal(writes(),before);return summary(r);
  });
  await check('scope-change','Changed work rejects before availability or provider writes',async()=>{
    const before=provider().calls.length,r=await bookCall(f,winningQ,'POST','/availability',{...filters,scopeConfirmation:'CHANGED'});assert.equal(r.status,409);assert.equal(r.result.code,'REQUOTE_REQUIRED');assert.equal(provider().calls.length,before);return summary(r);
  });
  await check('foreign-owner-and-origin','Foreign owner and unapproved website cannot use the booking intent',async()=>{
    const other=await app.owner('qbook-foreign'),i=intent(winningQ),before=provider().calls.length;
    const r=await app.request('POST','/api/bookings/'+i.id+'/availability',filters,other.token);assert.ok([403,404].includes(r.status));
    const o=await app.request('POST','/api/public/bookings/'+winningQ.bookingToken+'/availability',filters,undefined,{Origin:'https://unapproved.example.invalid'});assert.equal(o.status,403);assert.equal(provider().calls.length,before);return {foreign:summary(r),origin:summary(o)};
  });
  await check('confirm-and-retry','Confirmed job uses exact held instants, persists one event/outbox and exact retry creates nothing more',async()=>{
    const before=writes(),k=key(),r=await bookCall(f,winningQ,'POST','/confirm',validBody,k);assert.equal(r.status,201);assert.equal(r.result.status,'CONFIRMED');assert.equal(r.result.startUtc,winningSlot.startUtc);assert.equal(r.result.endUtc,winningSlot.endUtc);
    const again=await bookCall(f,winningQ,'POST','/confirm',validBody,k);assert.deepEqual(again.result,r.result);assert.equal(writes(),before+1);
    const stored=db.prepare('SELECT * FROM appointments WHERE id=? AND ownerId=?').get(r.result.appointmentId,f.owner.id);assert.equal(stored.status,'CONFIRMED');assert.equal(stored.quoteId,intent(winningQ).sourceId);
    assert.equal(db.prepare('SELECT count(*) n FROM outboxEvents WHERE aggregateId=? AND ownerId=?').get(stored.id,f.owner.id).n,1);
    const changed=await bookCall(f,winningQ,'POST','/confirm',{...validBody,customer:{...customer,name:'[SYNTHETIC] changed'}},k);assert.equal(changed.status,409);assert.equal(writes(),before+1);
    return {confirmed:summary(r),retry:summary(again),changedRetry:summary(changed),providerWrites:1};
  });
  await check('same-intent-second-appointment','A reopened booking link must preserve one appointment for the original job',async()=>{
    const i=intent(winningQ),before=db.prepare('SELECT count(*) n FROM appointments WHERE bookingIntentId=? AND status=?').get(i.id,'CONFIRMED').n;
    const a=await bookCall(f,winningQ,'POST','/availability',filters);
    if(a.status>=400||a.result.status!=='AVAILABLE')return {rejected:summary(a),confirmedAppointments:before};
    const s=a.result.slots.find(s=>s.startUtc>=winningSlot.endUtc);assert.ok(s);
    const h=await bookCall(f,winningQ,'POST','/holds',{slotId:s.slotId},key());
    if(h.status>=400)return {rejected:summary(h),confirmedAppointments:before};
    const c=await bookCall(f,winningQ,'POST','/confirm',confirmation(h,s),key());
    const after=db.prepare('SELECT count(*) n FROM appointments WHERE bookingIntentId=? AND status=?').get(i.id,'CONFIRMED').n;
    results.at(-1).observed={secondConfirmation:summary(c),before,after,distinctTimes:true};assert.equal(after,1,'Same quote/booking intent confirmed '+after+' separate appointments');return results.at(-1).observed;
  });
  await check('review-is-site-visit-only','Unquoted fence scope cannot directly book a job, but can obtain site-visit slots',async()=>{
    const body=f.submission(first);body.customerInputs.fenceHeight=8;const rr=await submit(f,body);assert.equal(rr.reply.result.resultType,'ESTIMATE_REQUIRES_REVIEW');
    const before=writes(),a=await bookCall(f,rr.reply.result,'POST','/availability',filters);assert.equal(a.result.status,'UNAVAILABLE');assert.equal(a.result.reason,'REVIEW_REQUIRES_SITE_VISIT');assert.equal(writes(),before);
    await f.call('PUT','/api/booking/policies/'+first.id,{bookingMode:'site_visit_first',durationMinutes:45,enabled:true});
    const b=await bookCall(f,rr.reply.result,'POST','/availability',filters);assert.equal(b.result.status,'AVAILABLE');assert.equal(b.result.durationMinutes,45);return {job:summary(a),visit:summary(b)};
  });
  await check('policy-change-invalidates-hold','Changed owner booking policy rejects the old hold before provider event creation',async()=>{
    const q=await quote(),a=await bookCall(f,q,'POST','/availability',filters),s=a.result.slots[0],h=await bookCall(f,q,'POST','/holds',{slotId:s.slotId},key());assert.equal(h.status,201);
    await f.call('PUT','/api/booking/policies/'+first.id,{bookingMode:'site_visit_first',durationMinutes:60,enabled:true});
    const before=writes(),r=await bookCall(f,q,'POST','/confirm',confirmation(h,s),key());assert.equal(r.status,409);assert.equal(r.result.code,'SCHEDULE_CHANGED');assert.equal(writes(),before);
    await bookCall(f,q,'DELETE','/holds/'+h.result.holdId,{},key());return summary(r);
  });
  await check('busy-after-hold','An interval becoming busy after hold rejects without creating a provider event',async()=>{
    const q=await quote(),a=await bookCall(f,q,'POST','/availability',filters),s=a.result.slots[0],h=await bookCall(f,q,'POST','/holds',{slotId:s.slotId},key());assert.equal(h.status,201);
    setProvider({busy:[{start:s.startUtc,end:s.endUtc}]});const before=writes(),r=await bookCall(f,q,'POST','/confirm',confirmation(h,s),key());assert.equal(r.status,409);assert.equal(r.result.code,'SLOT_UNAVAILABLE');assert.equal(writes(),before);setProvider({busy:[]});return summary(r);
  });
  await check('wrong-provider-event-pending','Wrong-day event stays pending and emits no booked outbox; corrected matching event confirms once',async()=>{
    const q=await quote(),a=await bookCall(f,q,'POST','/availability',filters),s=a.result.slots[0],h=await bookCall(f,q,'POST','/holds',{slotId:s.slotId},key());assert.equal(h.status,201);
    setProvider({variant:'wrong-day'});const r=await bookCall(f,q,'POST','/confirm',confirmation(h,s),key());assert.equal(r.status,202);assert.equal(r.result.status,'PENDING_CONFIRMATION');
    assert.equal(db.prepare('SELECT count(*) n FROM outboxEvents WHERE aggregateId=?').get(r.result.appointmentId).n,0);
    const pending=await bookCall(f,q,'GET','/confirmations/'+r.result.confirmationId);assert.equal(pending.result.status,'PENDING_CONFIRMATION');
    const p=provider(),event=Object.values(p.events).find(e=>e.extendedProperties?.private?.offTheClockAppointmentId===r.result.appointmentId)||Object.values(p.events).at(-1);
    assert.ok(event);event.start.dateTime=s.startUtc;event.end.dateTime=s.endUtc;p.variant=null;fs.writeFileSync(providerFile,JSON.stringify(p,null,2));
    const correct=await bookCall(f,q,'GET','/confirmations/'+r.result.confirmationId);assert.equal(correct.result.status,'CONFIRMED');
    await bookCall(f,q,'GET','/confirmations/'+r.result.confirmationId);assert.equal(db.prepare('SELECT count(*) n FROM outboxEvents WHERE aggregateId=?').get(r.result.appointmentId).n,1);return {wrong:summary(r),poll:summary(pending),corrected:summary(correct)};
  });
  await check(afterWriteClaim?'crash-after-write-marker-before-request':'crash-before-calendar-write','Durable pending confirmation with no provider event must recover or fail terminally and release its time',async()=>{
    const g=await mowingFixture(app,'crash-recovery',['http://127.0.0.1:4873']);await connect(g,g.id,'book_job',60);
    const sr=await submit(g,g.submission({intakeFlow:'job-details-v1'}));assert.equal(sr.reply.status,201);const q=sr.reply.result;
    const a=await bookCall(g,q,'POST','/availability',filters),s=a.result.slots[0],h=await bookCall(g,q,'POST','/holds',{slotId:s.slotId},key());assert.equal(h.status,201);
    const b=confirmation(h,s),k=key(),before=writes();setProvider({inspectionPauseBeforeWrite:!afterWriteClaim,inspectionPauseAfterWriteClaim:afterWriteClaim,inspectionReachedPause:false});
    const interrupted=bookCall(g,q,'POST','/confirm',b,k).catch(error=>({connectionInterrupted:true,code:error.cause?.code||error.name}));
    const deadline=Date.now()+10000;while(!provider().inspectionReachedPause&&Date.now()<deadline)await delay(50);
    assert.equal(provider().inspectionReachedPause,true,'Crash barrier must be reached');assert.equal(writes(),before);
    const row=db.prepare('SELECT * FROM appointments WHERE ownerId=? AND bookingIntentId=?').get(g.owner.id,intent(q).id);assert.equal(row.status,'PENDING_PROVIDER');
    assert.equal(row.providerEventStatus,afterWriteClaim?'PENDING_PROVIDER':'PREPARING');
    setProvider({inspectionPauseBeforeWrite:false,inspectionPauseAfterWriteClaim:false});await app.restart();await interrupted;
    const retry=await bookCall(g,q,'POST','/confirm',b,k),polls=[];
    for(let n=0;n<3;n++){polls.push(await bookCall(g,q,'GET','/confirmations/'+retry.result.confirmationId));await delay(100);}
    const last=db.prepare('SELECT * FROM appointments WHERE id=?').get(row.id);
    const other=await submit(g,g.submission({intakeFlow:'job-details-v1'})),fresh=await bookCall(g,other.reply.result,'POST','/availability',filters);
    const stillBlocked=!fresh.result.slots?.some(x=>x.startUtc===s.startUtc);
    const observed={crashPhase:afterWriteClaim?'after provider-write marker, before sending provider request':'after durable pending receipt, before provider-write marker',retry:summary(retry),polls:polls.map(summary),appointmentStatus:last.status,providerEventsForAppointment:Object.values(provider().events).filter(e=>e.id===row.providerEventId).length,providerWritesSinceCrash:writes()-before,originalTimeBlocked:stillBlocked};
    results.at(-1).observed=observed;assert.notEqual(last.status,'PENDING_PROVIDER','Crash leaves a PENDING_PROVIDER appointment with no event or recoverable retry');return observed;
  });
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
} catch(error) {
  results.push({name:'review-harness',passed:false,error:{code:error.code||null,message:error.message.slice(0,1000)}});
} finally {
  const passed=results.filter(x=>x.passed).length,failed=results.filter(x=>!x.passed).length;
  fs.writeFileSync(path.join(evidence,'REVIEW_RESULTS.json'),JSON.stringify({reviewBaselineCommit:'1013190bd8e62e5df3aa70750399873bc050e447',testedSourceBinding:'source-binding.json',passed,failed,results,boundary:'Real isolated application/HTTP/SQLite, intercepted synthetic Google provider only; no voice/live provider/deployment acceptance'},null,2));
  db.close();await app.stop();console.log(JSON.stringify({passed,failed,total:results.length}));process.exitCode=failed?1:0;
}
