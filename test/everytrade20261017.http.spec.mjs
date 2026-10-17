import test from 'node:test';
import assert from 'node:assert/strict';
import {httpFixture} from './leadCaptureRepair20261006HttpFixture.mjs';
// Expected before execution: owner200, staff403, foreign404, anonymous401;
// saved customer receipt byte-identical; report coverage n=1, margin33.33%.
export function seedJob(f){
 const id='synthetic-everytrade-job',ownerId='synthetic-a';
 const result={resultType:'INSTANT_ESTIMATE_READY',currency:'CAD',lowEstimate:900,midEstimate:1000,highEstimate:1100,priceDrivers:['[SYNTHETIC] Measured service'],disclaimer:'[SYNTHETIC] No extra scope',priceUnit:'per job',taxTreatment:'No tax added.'};
 const resultJson=JSON.stringify({customerResult:result});
 f.db.prepare('INSERT INTO quotes(id,ownerId,serviceType,status,resultJson,finalInvoiceAmount,createdAt) VALUES(?,?,?,?,?,?,?)').run(id,ownerId,'CUSTOM','INVOICED',resultJson,105000,'2026-10-17T00:00:00Z');return {id,ownerId,resultJson};
}
test('owner job-cost HTTP routes enforce tenant, role and plan boundaries and preserve receipt',async t=>{
 const f=await httpFixture(t),{id,ownerId,resultJson}=seedJob(f),path='/api/owner-records/quotes/'+id+'/job-costs';
 assert.equal((await f.request(path,ownerId)).status,200);
 for(const [who,status] of [['synthetic-staff',403],['synthetic-b',404],[null,401]])for(const method of ['GET','PUT'])assert.equal((await f.request(path,who,{method,...(method==='PUT'?{body:{revision:0,approvedChanges:[]}}:{})})).status,status);
 const saved=await f.request(path,ownerId,{method:'PUT',body:{revision:0,actualLaborHours:'8.5',actualLaborCost:'400',actualMaterialCost:'300',approvedChanges:[]}});assert.equal(saved.status,200);assert.equal(saved.body.actualLaborCostCents,40000);
 const report=await f.request('/api/reports?period=all',ownerId);assert.equal(report.status,200);const metric=report.body.jobMetrics.find(g=>g.service==='CUSTOM');assert.deepEqual(metric.realizedMargin,{count:1,value:'33.33'});
 const staff=await f.request('/api/owner-records/quotes/'+id,'synthetic-staff');assert.equal(staff.status,200);assert.doesNotMatch(JSON.stringify(staff.body),/actualLabor|actualMaterial|jobMetrics/);
 assert.equal(f.db.prepare('SELECT resultJson FROM quotes WHERE ownerId=? AND id=?').get(ownerId,id).resultJson,resultJson);
 const stale=await f.request(path,ownerId,{method:'PUT',body:{revision:0,approvedChanges:[]}});assert.equal(stale.status,409);
 f.db.prepare("UPDATE users SET plan='Starter' WHERE id=? AND role='owner'").run(ownerId);assert.equal((await f.request(path,ownerId)).status,403);
});
