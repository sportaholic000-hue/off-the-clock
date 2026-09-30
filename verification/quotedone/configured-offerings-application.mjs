import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {offeringApplicationFixture} from './offering-application-fixture.mjs';
const [root,evidence]=process.argv.slice(2),app=await startApplication(root,evidence,{port:4614}),rows=[];
try {
  const f=await offeringApplicationFixture(app,'configured-offerings','http://127.0.0.1:4615');
  async function submit(body){const p=await app.request('POST',f.url+'/prepare',body,undefined,f.headers);if(p.status!==200)return p;return app.request('POST',f.url,{...body,...(p.result.status==='ready'?{intakeConfirmation:p.result.confirmation}:{reviewRequested:true})},undefined,f.headers);}
  const catalog=await app.request('GET',f.url,undefined,undefined,f.headers);
  assert.equal(catalog.status,200);assert.equal(JSON.stringify(catalog).includes('offeringRates'),false);
  for(const entry of f.cases) {
    const body=f.submission(entry),prepared=await app.request('POST',f.url+'/prepare',body,undefined,f.headers);
    assert.equal(prepared.status,200,JSON.stringify(prepared));assert.equal(prepared.result.status,'ready',JSON.stringify(prepared));
    const preview=await f.call('POST','/api/pricebook/preview',{serviceId:entry.id,revision:f.book.revision,customerInputs:body.customerInputs});
    const authBody={...body,requestId:crypto.randomUUID()},authPrepared=await f.call('POST','/api/quote/prepare',authBody);
    const authenticated=await f.call('POST','/api/quote/calculate',{...authBody,intakeConfirmation:authPrepared.confirmation},201);
    const publicResult=await app.request('POST',f.url,{...body,intakeConfirmation:prepared.result.confirmation},undefined,f.headers);
    assert.equal(publicResult.status,201,JSON.stringify(publicResult));
    rows.push({name:entry.name,body,prepared,preview,authenticated,publicResult});
    for(const result of [preview,authenticated,publicResult.result]){assert.equal(result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(result));assert.equal(result.midEstimate,entry.expected);assert.ok(result.disclaimer.includes('[SYNTHETIC]'));}
    assert.equal(publicResult.result.lineItems,undefined);assert.equal(JSON.stringify(publicResult.result).includes('rateCents'),false);
    const repeated=await app.request('POST',f.url,{...body,intakeConfirmation:prepared.result.confirmation},undefined,f.headers);assert.equal(repeated.status,200);assert.deepEqual(repeated.result,publicResult.result);
    const mismatch=f.submission(entry);mismatch.customerInputs[entry.type.startsWith('FENCING_')?'fenceHeight':'coats']=entry.type.startsWith('FENCING_')?8:3;
    const rejected=await submit(mismatch);assert.equal(rejected.status,201,JSON.stringify(rejected));assert.equal(rejected.result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(rejected.result.midEstimate,undefined);
    rows.push({name:entry.name+' mismatched scope',body:mismatch,response:rejected});
  }
  const first=f.cases[0],partial=f.submission(first);partial.additionalWork=['[SYNTHETIC] Separate hedge job for an on-site price'];
  const partialResult=await submit(partial);assert.equal(partialResult.status,201);assert.equal(partialResult.result.resultType,'PARTIAL_ESTIMATE_READY');assert.equal(partialResult.result.pricedEstimate.midEstimate,4500);rows.push({name:'Supported fence plus separate on-site work',body:partial,response:partialResult});
  const bad=f.submission(first);bad.customerInputs.gates={walk:{count:2,extraWork:'[SYNTHETIC] unpriced'}};
  const nested=await submit(bad);assert.ok([400,201].includes(nested.status));assert.equal(nested.result.midEstimate,undefined);assert.notEqual(nested.result.resultType,'INSTANT_ESTIMATE_READY');rows.push({name:'Nested gate data stays unquoted',body:bad,response:nested});
  const db=new Database(path.join(evidence,'application.sqlite'),{readonly:true});
  try {
    const records=Object.fromEntries(['quotes','leads','quoteSubmissions'].map(table=>[table,db.prepare('SELECT * FROM '+table+' WHERE ownerId=?').all(f.owner.id)]));
    // Separate on-site work produces its own preserved follow-up lead as well.
    assert.equal(records.quotes.length,17);assert.equal(records.leads.length,nested.status===201?10:9);
    fs.writeFileSync(path.join(evidence,'stored-records.json'),JSON.stringify(records,null,2));
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  } finally {db.close();}
  fs.writeFileSync(path.join(evidence,'saved-book.json'),JSON.stringify(f.book,null,2));
  console.log(JSON.stringify({passed:true,positiveControls:24,scopeChecks:10,retryChecks:8}));
} finally {fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(rows,null,2));await app.stop();}
