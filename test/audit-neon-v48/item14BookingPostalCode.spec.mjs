// Neon audit of v48 #14 (November 25, 2026): a quote taxed at its job
// location (Ontario 13%) was booked with a blank postal code and the tax-rate
// check was skipped. Expected, written before the fix:
// - location-taxed quote, blank booking postal code: refused, asking for it;
// - same quote at an Alberta code: TAX_RATE_MISMATCH (unchanged);
// - same quote at its own Ontario code: allowed (unchanged);
// - a quote taxed at the business rate with no job location: a blank code is
//   allowed (unchanged).
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkStoredQuoteBookingAddress} from '../../server/src/quoteBookingLocation.js';

const quoteRow=location=>({resultJson:{submittedCustomerInputs:{postalCode:'M4B 1B3'},calculationRecord:{financialInputs:{businessDefaults:{businessCountry:'CA',businessProvince:'ON',taxMode:'TAX_ALL',taxPercent:13,taxByJobLocation:true}},ownerConfiguration:{},options:[{scenarios:{mid:{tax:{location}}},lineItems:[]}]}}});
const onTax={place:'ON',percent:13,source:'province'};
test('Neon v48 #14: a location-taxed quote needs the booking postal code',()=>{
  const r=checkStoredQuoteBookingAddress({quoteRow:quoteRow(onTax),bookingPostalCode:''});
  assert.equal(r.ok,false);assert.equal(r.reason,'POSTAL_CODE_REQUIRED');
  assert.equal(checkStoredQuoteBookingAddress({quoteRow:quoteRow(onTax),bookingPostalCode:'T2P 1J9'}).reason,'TAX_RATE_MISMATCH');
  assert.equal(checkStoredQuoteBookingAddress({quoteRow:quoteRow(onTax),bookingPostalCode:'M4B 1B3'}).ok,true);
});
test('Neon v48 #14: a business-rate quote with no job location books without a code',()=>{
  assert.equal(checkStoredQuoteBookingAddress({quoteRow:quoteRow({place:null,percent:13,source:'business_rate'}),bookingPostalCode:''}).ok,true);
});
