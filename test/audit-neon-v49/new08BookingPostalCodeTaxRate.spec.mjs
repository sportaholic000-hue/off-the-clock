// Neon re-audit of v49, NEW-8 (November 25, 2026): v49 #14 required the
// booking postal or ZIP code only for quotes taxed at a province rate, a tax
// zone or outside the country. A quote taxed at the business rate whose rate
// still depends on the job address skipped the check with a blank code.
// Rule, decided before the fix: the code is required whenever the rate at the
// booking address could differ from the quoted rate. Expected:
// - Texas, tax by job location, base 6.25%, Austin 787 zone 8.25%, quote at
//   78610 (outside zones, business rate 6.25%): blank -> POSTAL_CODE_REQUIRED;
//   78701 -> TAX_RATE_MISMATCH; 78610 -> allowed (Neon's case);
// - Ontario business, tax not by job location, own-province quote at the
//   business rate 13%: blank -> POSTAL_CODE_REQUIRED (another province has
//   another HST: Nova Scotia B3H -> TAX_RATE_MISMATCH); M4B -> allowed;
// - a US business that does not tax by job location: the rate cannot change
//   with the address, blank allowed;
// - a 0% service rate is 0% everywhere: blank allowed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkStoredQuoteBookingAddress} from '../../server/src/quoteBookingLocation.js';

const row=(defaults,postalCode,location,serviceRate)=>({resultJson:{submittedCustomerInputs:{postalCode},calculationRecord:{financialInputs:{businessDefaults:defaults},ownerConfiguration:serviceRate===undefined?{}:{taxPercent:serviceRate},options:[{scenarios:{mid:{tax:{location}}}}]}}});
const check=(r,code)=>checkStoredQuoteBookingAddress({quoteRow:r,bookingPostalCode:code});
const tx={businessCountry:'US',businessRegion:'TX',taxMode:'TAX_ALL',taxPercent:6.25,taxByJobLocation:true,taxOutsideZones:'business_rate',taxZones:[{name:'Austin',codes:['787'],percent:8.25}]};
const on={businessCountry:'CA',businessProvince:'ON',taxMode:'TAX_ALL',taxPercent:13};

test('NEW-8: Texas business-rate quote under tax by job location needs the ZIP',()=>{
  const r=row(tx,'78610',{place:null,percent:6.25,source:'business_rate'});
  assert.equal(check(r,'').reason,'POSTAL_CODE_REQUIRED');
  assert.equal(check(r,'78701').reason,'TAX_RATE_MISMATCH');
  assert.equal(check(r,'78610').ok,true);
});
test('NEW-8: Ontario own-province business-rate quote needs the postal code',()=>{
  const r=row(on,'M4B 1B3',{place:null,percent:13,source:'business_rate'});
  assert.equal(check(r,'').reason,'POSTAL_CODE_REQUIRED');
  assert.equal(check(r,'B3H 1A1').reason,'TAX_RATE_MISMATCH');
  assert.equal(check(r,'M4B 1B3').ok,true);
});
test('NEW-8: where the rate cannot change with the address, a blank code is allowed',()=>{
  const us={businessCountry:'US',businessRegion:'TX',taxMode:'TAX_ALL',taxPercent:6.25};
  assert.equal(check(row(us,'78610',{place:null,percent:6.25,source:'business_rate'}),'').ok,true);
  assert.equal(check(row(tx,'78701',{place:null,percent:0,source:'service_rate'},0),'').ok,true);
});
