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
// Changed by Neon v49 NEW-8 (November 25, 2026): this case (a Canadian
// business taxing by job location, quote at the business rate) is NOT safe
// without a code, since another province has another rate. It now needs the
// code; a business-rate quote whose rate cannot change with the address is in
// test/audit-neon-v49/new08BookingPostalCodeTaxRate.spec.mjs.
test('Neon v48 #14 (changed by v49 NEW-8): a business-rate quote whose rate depends on the address needs the code',()=>{
  assert.equal(checkStoredQuoteBookingAddress({quoteRow:quoteRow({place:null,percent:13,source:'business_rate'}),bookingPostalCode:''}).reason,'POSTAL_CODE_REQUIRED');
});
