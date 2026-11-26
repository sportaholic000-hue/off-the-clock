// Verdicts on the deployment and v54 audits, item 1.1 (V54-1): onboarding saves
// the business country in the business profile, not in the price book, and
// the web quote route read the country from the price book only. For a real
// onboarded business a phone typed "(506) 555-0123" stayed as typed, no
// customer was linked, and a later call from +15065550123 found nothing.
// Expected, written before the change (country only in the business profile):
// - Canada, "(506) 555-0123": the lead stores +15065550123, a customer exists,
//   and the caller history finds the customer, the quote, the request and the
//   open lead;
// - United States, "512-555-0144": the same, +15125550144.
import '../pricebookTestEnv.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mowing} from '../../verification/engine-independent/fixtures.mjs';
import {publish,fixture as webFixture,date,db} from '../quoteDeliveryBatch20261015Fixture.mjs';
import {loadPricebook} from '../../server/priceBookService.js';
import * as bridge from '../../server/src/quoteDoneBridge.js';
import {submitQuote} from '../../server/src/quoteDoneRoutes.js';
import {registerQuoteDateDatabase} from '../../server/src/quoteDate.js';
import {customerHistory} from '../../server/src/customerHistoryService.js';

const cleanup=[];webFixture({after:fn=>cleanup.push(fn)},process.env.DATABASE_PATH);after(()=>{registerQuoteDateDatabase(undefined);for(const fn of cleanup.reverse())fn();});
const OWNER='synthetic-a';
function webQuote(country,region,phone){
  registerQuoteDateDatabase(db);
  db.prepare('INSERT INTO businessProfiles(ownerId,country,region,updatedAt) VALUES(?,?,?,?) ON CONFLICT(ownerId) DO UPDATE SET country=excluded.country,region=excluded.region').run(OWNER,country,region,date.quoteInstant);
  const f=mowing();delete f.businessDefaults.businessCountry;delete f.businessDefaults.businessProvince;
  publish(OWNER,f);const book=loadPricebook(OWNER),service=book.services[0];
  assert.equal(book.defaults.businessCountry,undefined,'the price book carries no country, as after onboarding');
  db.prepare("INSERT OR IGNORE INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,enabled,updatedAt) VALUES(?,?,'SYNTHETIC','site_visit_first',0,?)").run(OWNER,service.id,date.quoteInstant);
  const body={requestId:randomUUID(),serviceId:service.id,serviceRequest:service.service,customerInputs:structuredClone(f.customerInputs),customerFeeSelections:{},additionalWork:[],contact:{phone},intakeFlow:'job-details-v1'};
  const prepared=bridge.prepareApplicationIntake(OWNER,body,date);assert.equal(prepared.status,'ready',JSON.stringify(prepared).slice(0,300));
  const r=submitQuote(OWNER,{...body,intakeConfirmation:prepared.confirmation},{clock:()=>new Date(date.quoteInstant)});assert.equal(r.status,201);
  return db.prepare('SELECT recordId FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(OWNER,body.requestId).recordId;
}
const history=from=>customerHistory(db,{ownerId:OWNER,from,callSid:'CA-synthetic-history'},{now:Date.parse(date.quoteInstant)+60000});
for(const [country,region,typed,e164] of [['CA','NB','(506) 555-0123','+15065550123'],['US','TX','512-555-0144','+15125550144']])
  test('V54-1: '+country+' business onboarded through the profile links a web quote typed '+typed,()=>{
    const id=webQuote(country,region,typed);
    assert.equal(db.prepare('SELECT callerNumber FROM leads WHERE ownerId=? AND id=?').get(OWNER,id).callerNumber,e164);
    const h=history(e164);
    assert.ok(h.customer,'customer');assert.ok(h.recentQuotes.length>=1,'quotes');assert.ok(h.quoteRequests.length>=1,'requests');assert.ok(h.openLeads.length>=1,'leads');
  });
