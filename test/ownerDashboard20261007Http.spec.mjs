import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {application} from './fixtures/bookingCalendarApplication20261006.mjs';

test('dashboard repair: actual HTTP booking alerts, call search, review and reports',{timeout:40000},async t=>{
  const s=await application(t),i=s.intent(),prefix='/api/public/bookings/'+i.bookingToken;
  const slots=await s.request(prefix+'/availability',{method:'POST',body:s.filters,publicRequest:true});
  const held=await s.request(prefix+'/holds',{method:'POST',body:{slotId:slots.body.slots[0].slotId},idempotencyKey:randomUUID(),publicRequest:true});
  const booked=await s.request(prefix+'/confirm',{method:'POST',body:{holdId:held.body.holdId,confirmedSlotId:held.body.slot.slotId,explicitConfirmation:true,addressConfirmation:true,customer:s.filters.customer,location:s.filters.location},idempotencyKey:randomUUID(),publicRequest:true});
  assert.equal(booked.status,201);
  await t.test('confirmed booking is visible as an owner dashboard notification',async()=>{
    const dash=await s.request('/api/dashboard');assert.ok(dash.body.callActivity.notifications.some(a=>a.eventType==='booking.confirmed'&&a.aggregateId===booked.body.appointmentId));
    assert.equal((await s.request('/api/dashboard',{owner:'synthetic-b'})).body.callActivity.notifications.some(a=>a.eventType==='booking.confirmed'),false);
  });
  s.db.prepare("UPDATE calls SET minutesBilled=3,transportOutcome='PROVIDER_COMPLETED',transcriptJson=?,summaryText=? WHERE ownerId=? AND id=?").run(JSON.stringify([{role:'caller',text:'[SYNTHETIC] Quiet gate repair'}]),'[SYNTHETIC] Quiet gate repair','synthetic-a','synthetic-a-call');
  await t.test('billing and transport detail are exposed by real HTTP',async()=>{
    const call=await s.request('/api/calls/synthetic-a-call');assert.equal(call.body.minutesBilled,3);assert.equal(call.body.transportOutcome,'PROVIDER_COMPLETED');
  });
  await t.test('search returns the saved transcript with tenant isolation',async()=>{
    const result=await s.request('/api/calls?search=Quiet&spam=exclude');assert.equal(result.status,200);assert.equal(result.body.total,1);
    assert.equal((await s.request('/api/calls?search=Quiet',{owner:'synthetic-b'})).body.total,0);
  });
  s.db.prepare("INSERT INTO leads(id,ownerId,callId,describedService,status,type,collectedInputsJson,createdAt) VALUES('synthetic-review','synthetic-a','synthetic-a-call','Gate repair','NEEDS REVIEW','quote_review','{}',?)").run(s.clock().toISOString());
  await t.test('owner review saves a separate priced receipt and advances only on recorded owner actions',async()=>{
    const review=await s.request('/api/owner-records/leads/synthetic-review/actions',{method:'POST',body:{action:'REVIEW',version:0,idempotencyKey:'synthetic-review-1',note:'[SYNTHETIC] Confirmed gate dimensions',estimate:{low:'100.10',high:'120.20',currency:'CAD',scope:'[SYNTHETIC] Gate labor only',qualifications:'[SYNTHETIC] Customer supplies materials',taxTreatment:'No tax added.',priceUnit:'per job'}}});
    assert.equal(review.status,200,JSON.stringify(review));assert.ok(review.body.workflow.reviewedQuoteId);
    const quotes=await s.request('/api/quotes'),q=quotes.body.quotes.find(q=>q.id===review.body.workflow.reviewedQuoteId);
    assert.equal(q.result.lowEstimate,100.1);assert.equal(q.result.highEstimate,120.2);
    assert.equal(q.status,'INSTANT');assert.equal(q.result.materialQualifications[0],'[SYNTHETIC] Customer supplies materials');
  });
  await t.test('period report is real, tenant-scoped and excludes unpriced bookings from value',async()=>{
    const report=await s.request('/api/reports?period=custom&fromDate=2026-10-31&toDate=2026-11-01');
    assert.equal(report.status,200,JSON.stringify(report));assert.equal(report.body.counts.bookings,1);assert.equal(report.body.counts.calls,1);assert.equal(report.body.afterHours.unknown,1);
    assert.equal(report.body.values.booked.length,0);assert.ok(Array.isArray(report.body.funnel));
    assert.equal((await s.request('/api/reports?ownerId=synthetic-b')).status,403);
  });
});
