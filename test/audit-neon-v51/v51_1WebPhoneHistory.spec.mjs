// Neon audit of v51, V51-1 (November 26, 2026): a website quote from a
// Canadian or US business's customer who typed "(506) 555-0123" was linked to
// the customer (V50-3) but the raw number stayed in the lead and submission,
// so a call from +15065550123 found the customer and none of the quote,
// request or open lead. Expected, written before the fix:
// - after the web quote, history for +15065550123 has the quote, the request
//   and the open lead;
// - the lead stores +15065550123;
// - a quote saved before the fix (lead holding the raw number) is still found
//   through its customer link.
import '../pricebookTestEnv.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mowing} from '../../verification/engine-independent/fixtures.mjs';
import {publish,fixture as webFixture,date,db} from '../quoteDeliveryBatch20261015Fixture.mjs';
import {loadPricebook} from '../../server/priceBookService.js';
import * as bridge from '../../server/src/quoteDoneBridge.js';
import {submitQuote} from '../../server/src/quoteDoneRoutes.js';
import {customerHistory} from '../../server/src/customerHistoryService.js';

const cleanup=[];webFixture({after:fn=>cleanup.push(fn)},process.env.DATABASE_PATH);after(()=>{for(const fn of cleanup.reverse())fn();});
function webQuote(phone){
  const f=mowing();f.businessDefaults={...f.businessDefaults,businessCountry:'CA',businessProvince:'NB'};
  publish('synthetic-a',f);const service=loadPricebook('synthetic-a').services[0];
  db.prepare("INSERT OR IGNORE INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,enabled,updatedAt) VALUES(?,?,'SYNTHETIC','site_visit_first',0,?)").run('synthetic-a',service.id,date.quoteInstant);
  const body={requestId:randomUUID(),serviceId:service.id,serviceRequest:service.service,customerInputs:structuredClone(f.customerInputs),customerFeeSelections:{},additionalWork:[],contact:{phone},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'};
  const prepared=bridge.prepareApplicationIntake('synthetic-a',body,date);assert.equal(prepared.status,'ready');
  const r=submitQuote('synthetic-a',{...body,intakeConfirmation:prepared.confirmation},{clock:()=>new Date(date.quoteInstant)});assert.equal(r.status,201);
  return db.prepare('SELECT recordId FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get('synthetic-a',body.requestId).recordId;
}
const history=from=>customerHistory(db,{ownerId:'synthetic-a',from,callSid:'CA-synthetic-history'},{now:Date.parse(date.quoteInstant)+60000});
test('V51-1: a web quote typed (506) 555-0123 is in the caller history of +15065550123',()=>{
  const id=webQuote('(506) 555-0123');
  assert.equal(db.prepare('SELECT callerNumber FROM leads WHERE ownerId=? AND id=?').get('synthetic-a',id).callerNumber,'+15065550123');
  const h=history('+15065550123');
  assert.ok(h.customer,'customer');assert.ok(h.recentQuotes.length>=1,'quotes');assert.ok(h.quoteRequests.length>=1,'requests');assert.ok(h.openLeads.length>=1,'leads');
});
test('V51-1: a quote saved before the fix is found through its customer link',()=>{
  const id=webQuote('(506) 555-0124');
  db.prepare('UPDATE leads SET callerNumber=? WHERE ownerId=? AND id=?').run('(506) 555-0124','synthetic-a',id);
  const h=history('+15065550124');
  assert.ok(h.recentQuotes.length>=1,'quotes');assert.ok(h.quoteRequests.length>=1,'requests');assert.ok(h.openLeads.length>=1,'leads');
});
