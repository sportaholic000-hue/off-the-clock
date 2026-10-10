import test from 'node:test';
import assert from 'node:assert/strict';
import {httpFixture,seedViews} from './leadCaptureRepair20261006HttpFixture.mjs';
const estimate={low:'100.10',high:'120.20',currency:'CAD',scope:'[SYNTHETIC] Gate labor',qualifications:'[SYNTHETIC] Customer supplies materials',taxTreatment:'No tax added.',priceUnit:'per job'};
test('owner dashboard endpoints enforce tenant, role, idempotency and stale version boundaries',{timeout:40000},async t=>{
  const f=await httpFixture(t),s=await seedViews(f),route='/api/owner-records/leads/'+s.row.id;
  const body={action:'REVIEW',version:0,idempotencyKey:'synthetic-http-review',note:'[SYNTHETIC] Scope checked',estimate};
  await t.test('signed-out, foreign owner and staff cannot review',async()=>{
    assert.equal((await f.request(route+'/actions',null,{method:'POST',body})).status,401);
    assert.equal((await f.request(route+'/actions','synthetic-b',{method:'POST',body})).status,404);
    assert.equal((await f.request(route+'/actions','synthetic-staff',{method:'POST',body})).status,403);
    assert.equal((await f.request(route,'synthetic-b')).status,404);
  });
  await t.test('review replay is exact and the original stored request remains unchanged',async()=>{
    const before=f.db.prepare('SELECT collectedInputsJson FROM leads WHERE ownerId=? AND id=?').get(s.c.ownerId,s.row.id).collectedInputsJson;
    const one=await f.request(route+'/actions','synthetic-a',{method:'POST',body}),two=await f.request(route+'/actions','synthetic-a',{method:'POST',body});assert.equal(one.status,200);assert.deepEqual(two.body,one.body);
    assert.equal(f.db.prepare('SELECT collectedInputsJson FROM leads WHERE ownerId=? AND id=?').get(s.c.ownerId,s.row.id).collectedInputsJson,before);
    const staff=await f.request('/api/owner-records/quotes/'+one.body.workflow.reviewedQuoteId,'synthetic-staff');assert.equal(staff.status,200);assert.equal(staff.body.internal,undefined);assert.equal(staff.body.result.lowEstimate,100.1);
  });
  await t.test('stale, mismatched replay, unknown keys and foreign selectors fail closed',async()=>{
    for(const [change,status] of [[{idempotencyKey:'synthetic-stale'},409],[{note:'[SYNTHETIC] changed'},409],[{ownerId:'synthetic-b'},403],[{actorId:'synthetic-b'},400]])assert.equal((await f.request(route+'/actions','synthetic-a',{method:'POST',body:{...body,...change}})).status,status);
  });
  await t.test('reports and hours are owner-only, tenant-scoped and version checked',async()=>{
    const hours={weeklyHours:Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(day=>[day,[]])),revision:0};
    assert.equal((await f.request('/api/reports/hours','synthetic-staff',{method:'PUT',body:hours})).status,403);
    assert.equal((await f.request('/api/reports/hours','synthetic-a',{method:'PUT',body:hours})).status,200);
    assert.equal((await f.request('/api/reports/hours','synthetic-a',{method:'PUT',body:hours})).status,409);
    const foreign=await f.request('/api/reports?period=all','synthetic-b');assert.equal(foreign.body.settings.revision,0);assert.doesNotMatch(JSON.stringify(foreign),/Original|synthetic-http-quote|SECRET_COST/);
    const staff=await f.request('/api/reports?period=all','synthetic-staff');assert.equal(staff.status,403);
  });
  await t.test('legacy dismissal uses the same progression rules and cannot reopen a completed review',async()=>{
    assert.equal((await f.request('/api/leads/'+s.row.id,'synthetic-a',{method:'PATCH',body:{status:'NEEDS REVIEW'}})).status,409);
    assert.equal((await f.request('/api/leads/'+s.row.id,'synthetic-a',{method:'PATCH',body:{status:'DISMISSED'}})).status,409);
  });
});
