// Neon audit of v48 #7 (November 25, 2026): a caller with a withheld number
// ('anonymous') passed call admission, but getQuote sent 'anonymous' as the
// callback contact; intake refused it (422) and the runtime answered
// QUOTE_BOUNDARY_FAILED, so such a caller could never get a quote. Expected,
// written before the fix:
// - withheld number, no callback: needs_details asking for a callback number;
// - with callbackPhone: the quote is priced (installed exterior painting
//   fixture, 318000 cents = $3,180);
// - a caller with a real number is unchanged (no callback asked).
import '../pricebookTestEnv.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {bridge,date,fixture,quoteEmailFixture} from '../quoteDeliveryBatch20261015Fixture.mjs';
import {loadPricebook} from '../../server/priceBookService.js';

const cleanup=[],base=fixture({after:fn=>cleanup.push(fn)},process.env.DATABASE_PATH);
after(()=>{for(const fn of cleanup.reverse())fn();});
function publish(f){
  const service=structuredClone(f.ownerPricing);delete service.origin;
  const draft=bridge.convertApplicationBook({services:[service],defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
  bridge.saveApplicationBook('synthetic-a',{...draft,revision:bridge.readApplicationBook('synthetic-a').revision},date);
  const saved=bridge.readApplicationBook('synthetic-a');
  bridge.approveApplicationService('synthetic-a',service.id,{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true},date);
  const book=loadPricebook('synthetic-a');assert.equal(bridge.bookStatuses(book,date)[0].status,'QUOTING LIVE');return book;
}
async function quote(t,from,extra={}){
  const f=offeringFixture('EXTERIOR_PAINTING','installed'),book=publish(f),service=book.services[0];
  const context={...base.context(),...(from?{from}:{})};
  base.db.prepare('UPDATE calls SET callerNumber=? WHERE ownerId=? AND id=?').run(context.from,context.ownerId,context.callSid);
  const h=quoteEmailFixture(t,{base,context});
  const match=await h.tool('matchService',{query:service.service});assert.equal(match.status,'matched');
  const args={serviceHandle:match.serviceHandle,customerInputs:f.customerInputs,customerConfirmed:true,additionalWork:[],...extra};
  let v=await h.tool('getQuote',args);
  if(v.questionContract?.fields.some(x=>x.confirmationToken)&&v.status!=='needs_details'){args.scopeConfirmations=Object.fromEntries(v.questionContract.fields.filter(x=>x.confirmationToken).map(x=>[x.field,x.confirmationToken]));v=await h.tool('getQuote',args);}
  return v;
}
test('Neon v48 #7: a withheld caller is asked for a callback number instead of failing',async t=>{
  const v=await quote(t,'anonymous');
  assert.equal(v.status,'needs_details',JSON.stringify(v));
  assert.match(v.followUps.join(' '),/callback phone number/);
});
test('Neon v48 #7: with a callback number the withheld caller gets the quote',async t=>{
  const v=await quote(t,'anonymous',{callbackPhone:'+19025550199'});
  assert.notEqual(v.status,'needs_details',JSON.stringify(v));
  assert.equal(v.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(v).slice(0,400));
});
test('Neon v48 #7: a caller with a number is not asked for a callback',async t=>{
  const v=await quote(t,null);
  assert.equal(v.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(v).slice(0,400));
});
