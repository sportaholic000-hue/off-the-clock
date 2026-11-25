// Neon audit of v50, V50-3 (November 26, 2026), server side. Expected,
// written before the fix:
// - northAmericanPhone: "(512) 555-0144", "512-555-0144", "1 512 555 0144"
//   -> "+15125550144"; "+44 20 7946 0958" kept as "+442079460958";
//   "555-0144" (7 digits), "012-555-0144" (area code cannot start 0/1),
//   "020 7946 0958" (not North American) and "call me" -> null;
// - a website quote from a Canadian business with phone "(506) 555-0123" is
//   linked to the customer +15065550123 (it was left unlinked).
import '../pricebookTestEnv.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {northAmericanPhone} from '../../server/phoneNumbers.js';
import {mowing} from '../../verification/engine-independent/fixtures.mjs';
import {publish,fixture as webFixture,date,db} from '../quoteDeliveryBatch20261015Fixture.mjs';
import {loadPricebook} from '../../server/priceBookService.js';
import * as bridge from '../../server/src/quoteDoneBridge.js';
import {submitQuote} from '../../server/src/quoteDoneRoutes.js';

const cleanup=[];webFixture({after:fn=>cleanup.push(fn)},process.env.DATABASE_PATH);after(()=>{for(const fn of cleanup.reverse())fn();});
test('V50-3: North American numbers in international form',()=>{
  for(const v of ['(512) 555-0144','512-555-0144','1 512 555 0144','+1 (512) 555-0144'])assert.equal(northAmericanPhone(v),'+15125550144',v);
  assert.equal(northAmericanPhone('+44 20 7946 0958'),'+442079460958');
  for(const v of ['555-0144','012-555-0144','020 7946 0958','call me','',undefined])assert.equal(northAmericanPhone(v),null,String(v));
});
test('V50-3: a website quote with (506) 555-0123 is linked to the customer',()=>{
  const f=mowing();f.businessDefaults={...f.businessDefaults,businessCountry:'CA',businessProvince:'NB'};
  publish('synthetic-a',f);const service=loadPricebook('synthetic-a').services[0];
  db.prepare("INSERT OR IGNORE INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,enabled,updatedAt) VALUES(?,?,'SYNTHETIC','site_visit_first',0,?)").run('synthetic-a',service.id,date.quoteInstant);
  const body={requestId:randomUUID(),serviceId:service.id,serviceRequest:service.service,customerInputs:structuredClone(f.customerInputs),customerFeeSelections:{},additionalWork:[],contact:{phone:'(506) 555-0123'},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'};
  const prepared=bridge.prepareApplicationIntake('synthetic-a',body,date);assert.equal(prepared.status,'ready',JSON.stringify(prepared));
  const r=submitQuote('synthetic-a',{...body,intakeConfirmation:prepared.confirmation},{clock:()=>new Date(date.quoteInstant)});assert.equal(r.status,201,JSON.stringify(r));
  const internal=JSON.parse(db.prepare('SELECT internalOutcomeJson FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get('synthetic-a',body.requestId).internalOutcomeJson);
  assert.ok(internal.customerId,'quote not linked');
  assert.equal(db.prepare('SELECT phoneE164 FROM customers WHERE ownerId=? AND id=?').get('synthetic-a',internal.customerId).phoneE164,'+15065550123');
});
