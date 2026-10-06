import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerCallFixture,at} from './helpers/ownerCallFixture.mjs';
import {storedQuoteView,storedLeadView} from '../server/src/ownerRecordViews.js';

test('stored calls, outcomes, summary and transcript are returned without repricing',()=>{
  const {db,service}=ownerCallFixture();try{
    const before=db.prepare('SELECT resultJson FROM quotes WHERE id=?').get('synthetic-a-quote').resultJson;
    const result=service.detail({ownerId:'synthetic-a',id:'synthetic-a-call'});
    assert.equal(result.summaryText,'[SYNTHETIC] synthetic-a gate repair');assert.equal(result.outcome,'CALL_ENDED');
    assert.equal(result.transcript.length,2);assert.match(result.transcript[0].text,/synthetic-a/);
    assert.equal(result.quotes[0].result.lowEstimate,221.23);assert.match(result.quotes[0].result.priceDrivers[0],/measured gate labor/);
    assert.equal(db.prepare('SELECT resultJson FROM quotes WHERE id=?').get('synthetic-a-quote').resultJson,before);
    assert.equal(result.leads[0].contact.email,'synthetic-a@example.invalid');assert.equal(result.leads[0].location.city,'Synthetic City');
    assert.equal(result.bookings.length,2);assert.equal(result.bookingRequests.length,1);assert.equal(result.bookingRequests[0].note,'[SYNTHETIC] Morning request');
    assert.equal(result.quoteRequests[0].describedService,'[SYNTHETIC] Gate repair');
  }finally{db.close();}
});
test('list, detail, source joins and counters isolate tenants including corrupt cross-tenant links',()=>{
  const {db,service}=ownerCallFixture();try{
    const page=service.list({ownerId:'synthetic-a'});assert.equal(page.total,3);assert.ok(page.calls.every(row=>row.id.startsWith('synthetic-a')));
    assert.throws(()=>service.detail({ownerId:'synthetic-a',id:'synthetic-b-call'}),{statusCode:404});
    const detail=service.detail({ownerId:'synthetic-a',id:'synthetic-a-call'});assert.doesNotMatch(JSON.stringify(detail),/synthetic-b|foreign-booking|wrong-source-booking|wrong-intent-booking/);
    const dash=service.dashboard('synthetic-a');assert.equal(dash.counts.calls,3);assert.equal(dash.counts.quotes,1);assert.equal(dash.counts.answered,1);assert.equal(dash.counts.seconds,120);
    assert.equal(dash.counts.bookings,3); // Tenant-owned counters do not imply a call linkage.
  }finally{db.close();}
});
test('pagination reaches all stored calls deterministically and rejects owner overrides',()=>{
  const {db,service}=ownerCallFixture();try{
    const first=service.list({ownerId:'synthetic-a',limit:2});assert.equal(first.nextOffset,2);
    const next=service.list({ownerId:'synthetic-a',limit:2,query:{offset:'2'}});assert.equal(next.calls.length,1);assert.equal(next.nextOffset,null);
    assert.equal(new Set([...first.calls,...next.calls].map(row=>row.id)).size,3);
    for(const query of [{ownerId:'synthetic-b'},{offset:'-1'},{offset:'1.5'},{offset:['1','2']}])assert.throws(()=>service.list({ownerId:'synthetic-a',query}),{statusCode:400});
  }finally{db.close();}
});
test('review leads retain original voice measurements and the saved reason',()=>{
  const {db,service}=ownerCallFixture();try{
    const lead=service.detail({ownerId:'synthetic-a',id:'synthetic-a-review-call'}).leads[0];
    assert.equal(lead.customerInputs.height,4);assert.equal(lead.explicitUnknowns,'[SYNTHETIC] Height uncertain');assert.equal(lead.reviewReason,'[SYNTHETIC] Height needs confirmation.');
    const staff=service.detail({ownerId:'synthetic-a',id:'synthetic-a-call',role:'staff'});assert.equal(staff.quotes[0].internal,undefined);assert.equal(staff.leads[0].internal,undefined);
  }finally{db.close();}
});
test('fallbacks, transcriptTurns, missing and malformed stored data are honest',()=>{
  const {db,service}=ownerCallFixture();try{
    const fallback=service.detail({ownerId:'synthetic-a',id:'synthetic-a-fallback'});assert.equal(fallback.failureCode,'VOICE_DISABLED');assert.deepEqual(fallback.quotes,[]);assert.deepEqual(fallback.bookings,[]);
    db.prepare('INSERT INTO transcriptTurns(id,ownerId,callId,sequence,role,text,createdAt) VALUES(?,?,?,?,?,?,?)').run('turn','synthetic-a','synthetic-a-fallback',0,'caller','[SYNTHETIC] Persisted turn',at);
    assert.equal(service.detail({ownerId:'synthetic-a',id:'synthetic-a-fallback'}).transcript[0].text,'[SYNTHETIC] Persisted turn');
    db.prepare("UPDATE calls SET transcriptJson='broken' WHERE id='synthetic-a-review-call'").run();assert.equal(service.detail({ownerId:'synthetic-a',id:'synthetic-a-review-call'}).transcriptAvailable,false);
    assert.equal(storedQuoteView({id:'bad',resultJson:'broken'},'owner').result,null);assert.equal(storedLeadView({collectedInputsJson:'broken'},'owner').customerInputs,null);
    const ordinary={id:'ordinary',resultJson:JSON.stringify({customerResult:{lowEstimate:10.25}})};assert.equal(storedQuoteView(ordinary,'owner').result.lowEstimate,10.25);
  }finally{db.close();}
});
