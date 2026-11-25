// Neon re-audit of v49, NEW-1 (November 25, 2026): a repair priced per foot
// or per item with no area (allowed since v49 #2) told the customer
// "undefined affected square feet" and stored an empty area measurement.
// Expected, written before the fix (flat roof repair fixture):
// - 100 ft seam reseal, no area: drivers start with "100 linear feet", no
//   driver mentions square feet or undefined, no affectedAreaSqft measurement,
//   total still 90000 cents;
// - 3 pipe boots, no area: first driver "3 items", total 25500 cents;
// - per-foot repair WITH an area given: the area is still recorded (it is
//   checked against the largest-repair limit) but the driver is the length;
// - area-priced repair unchanged: "10 affected square feet" (the first
//   version of this check used the default fixture, which has no per-unit
//   price and never reaches this code; corrected to set a per-square-foot
//   price).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {flatRepair} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

function units(f,unit,rate){const p=f.ownerPricing.pricing,c=f.customerInputs,m=c.membraneType,r=c.repairType;p.repairPricingUnit={[m]:{[r]:unit}};p.repairUnitPrice={[m]:{[r]:rate}};p.installedLaborPercent={['repairUnitPrice.'+m+'.'+r]:60};return f;}
const ready=q=>{assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);return q;};
const rec=q=>q.options[0].calculationRecord;
const drivers=q=>q.priceDrivers||q.options[0].priceDrivers||rec(q).priceDrivers;

test('NEW-1: per-foot repair with no area shows the length, never "undefined"',()=>{
  const f=units(flatRepair(),'linear_feet',900);f.customerInputs.repairLengthLF=100;delete f.customerInputs.affectedArea;
  const q=ready(generateQuoteVNext(f));
  assert.equal(rec(q).scenarios.mid.finalTotalCents,90000);
  const d=drivers(q);assert.equal(d[0],'100 linear feet');
  assert.ok(!d.some(s=>/undefined|square feet/.test(s)),d.join(' | '));
  assert.ok(!JSON.stringify(q).includes('undefined'));
  assert.ok(!(rec(q).measurements||[]).some(m=>m.name==='affectedAreaSqft'));
});
test('NEW-1: per-item repair with no area shows the count',()=>{
  const f=flatRepair();f.customerInputs.repairType='pipe_boot';const id=randomUUID();f.ownerPricing.knownOfferings.repairType.pipe_boot=id;f.customerInputs.confirmedFacts.repairType={status:'identified',field:'repairType',value:'pipe_boot',offeringId:id};
  units(f,'each',8500);f.customerInputs.repairItemCount=3;delete f.customerInputs.affectedArea;
  const q=ready(generateQuoteVNext(f));
  assert.equal(rec(q).scenarios.mid.finalTotalCents,25500);
  assert.equal(drivers(q)[0],'3 items');
  assert.ok(!JSON.stringify(q).includes('undefined'));
});
test('NEW-1: per-foot repair with an area keeps the area on record, driver is the length',()=>{
  const f=units(flatRepair(),'linear_feet',900);f.customerInputs.repairLengthLF=100;f.customerInputs.affectedArea=40;
  const q=ready(generateQuoteVNext(f));
  assert.equal(drivers(q)[0],'100 linear feet');
  assert.ok(rec(q).measurements.some(m=>m.name==='affectedAreaSqft'&&m.value===40));
});
test('NEW-1: area-priced repair unchanged',()=>{
  const f=units(flatRepair(),'square_feet',1200);const p=f.ownerPricing.pricing,c=f.customerInputs,m=c.membraneType,r=c.repairType;
  p.repairAreaMinimum={[m]:{[r]:30000}};p.repairFirstAreaSqft={[m]:{[r]:5}};p.installedLaborPercent['repairAreaMinimum.'+m+'.'+r]=60;
  const q=ready(generateQuoteVNext(f));
  assert.equal(drivers(q)[0],'10 affected square feet');
  assert.ok(rec(q).measurements.some(x=>x.name==='affectedAreaSqft'&&x.value===10));
});
