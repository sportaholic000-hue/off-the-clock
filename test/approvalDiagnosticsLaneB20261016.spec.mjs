import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fenceFixture} from './fenceLaneB20261016Fixture.mjs';
import {roof} from './opusQuoteFixtures.mjs';
import {publish,bridge,date} from './quoteDeliveryBatch20261015Fixture.mjs';

const saved=f=>publish('SYNTHETIC-approval-diagnostics-'+randomUUID(),f).book;
const status=book=>bridge.applicationStatus(book.services[0],book,date);
const diagnostic=(book,check)=>{
 const s=status(book);assert.equal(s.approvalCurrent,false);const d=s.ownerDiagnostics.find(d=>d.kind==='approval_receipt'&&d.receiptCheck===check);
 assert.ok(d,JSON.stringify(s.ownerDiagnostics));assert.match(d.message,new RegExp(check));return d;
};
test('Oct16 follow-up diagnostic section hashes are not additional approval requirements and never enter customer responses',()=>{
 // Expected BEFORE execution: changing diagnostic-only hashes keeps approval
 // true; forced content mismatch emits owner evidence, no customer price/data.
 const f=fenceFixture('installed'),book=saved(f);book.services[0].quoteDoneApproval.sectionDigests={SYNTHETIC:'not-an-approval-predicate'};
 assert.equal(status(book).approvalCurrent,true);book.services[0].pricing.fenceOfferings.wood.heightRows.six.offeringRates.installedFencePerLF=5000;
 const result=bridge.calculateApplicationQuote(book,book.services[0],{customerInputs:f.customerInputs,customerFeeSelections:{},additionalWork:[],intakeFlow:'job-details-v1'},{ownerId:book.ownerId,preparingIntake:true,...date});
 assert.equal(result.applicationEligibility.approvalCurrent,false);assert.ok(result.applicationEligibility.ownerDiagnostics.some(d=>d.receiptCheck==='contentDigest'));
 assert.equal(result.customerResult.midEstimate,undefined);assert.doesNotMatch(JSON.stringify(result.customerResult),/sectionDigests|expectedDigest|actualDigest|receiptCheck|quoteDoneApproval/);
});
for(const check of ['ownerId','serviceId','engineVersion'])test('Oct16 follow-up owner approval diagnostic names failed '+check+' receipt check',()=>{
 // Expected: approval false, diagnostic names exactly this mismatched receipt check.
 const book=saved(fenceFixture('installed'));book.services[0].quoteDoneApproval[check]='SYNTHETIC-mismatch';diagnostic(book,check);
});
test('Oct16 follow-up approval diagnostic names required roof money unit version; other service approval rules remain identical',()=>{
 // Expected: roof minimum needs the current money version; fences retain today's ignored-version behavior.
 const f=roof();f.ownerPricing.pricing.minimumJob=10000;const book=saved(f);book.services[0].quoteDoneApproval.moneyUnitVersion='SYNTHETIC-old';diagnostic(book,'moneyUnitVersion');
 const fence=saved(fenceFixture('installed'));fence.services[0].quoteDoneApproval.moneyUnitVersion='SYNTHETIC-old';assert.equal(status(fence).approvalCurrent,true);
});
for(const [section,edit]of [
 ['service.pricing',book=>book.services[0].pricing.fenceOfferings.wood.offeringDetails.description+=' [SYNTHETIC] changed'],
 ['service.service',book=>book.services[0].service='[SYNTHETIC] Changed fence'],
 ['businessDefaults',book=>book.defaults.markupPercent=1],
 ['legacySettings',book=>book.defaults.laborHourlyRate=5000],
 ['feeSelections',book=>book.services[0].ownerFeeSelections={travel:true}],
])test('Oct16 follow-up digest diagnostic identifies first differing section '+section,()=>{
 // Expected: contentDigest false, one named section changes; no raw old/current prices are logged.
 const book=saved(fenceFixture('installed'));assert.ok(book.services[0].quoteDoneApproval.sectionDigests);edit(book);
 const d=diagnostic(book,'contentDigest');assert.equal(d.section,section);assert.equal(d.expectedDigest.length,64);assert.equal(d.actualDigest.length,64);
});
test('Oct16 follow-up receipts without section digests validate unchanged; mismatches remain diagnosable without invented section evidence',()=>{
 // Expected: deleting new optional diagnostics never changes approval validity; later price edits still block.
 const book=saved(fenceFixture('installed'));delete book.services[0].quoteDoneApproval.sectionDigests;assert.equal(status(book).approvalCurrent,true);
 book.services[0].pricing.fenceOfferings.wood.heightRows.six.offeringRates.installedFencePerLF=5000;
 const d=diagnostic(book,'contentDigest');assert.equal(d.section,null);assert.equal(d.sectionEvidence,'not_recorded');
});
