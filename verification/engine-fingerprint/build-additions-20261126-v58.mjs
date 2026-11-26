import {writeFileSync} from 'node:fs';
import {concrete,mowing,fixture} from '../engine-independent/fixtures.mjs';

// November 26, 2026 (v58): repairs from the read-only audit of v57. Run once;
// never edited. Expected amounts are worked out by hand in
// test/qeAuditFixesV58_20261126.spec.mjs.
const cases=[];
const add=(id,input)=>cases.push({id:'v58-20261126:'+id,input:structuredClone(input)});
const WINTER={winterConcreteChargePerUnit:2000,winterConcreteStart:'11-01',winterConcreteEnd:'04-15'};
const slab=(workMonth,peakMonths)=>{const f=concrete();f.currentMonth=11;
  if(peakMonths){f.ownerPricing.peakMonths=peakMonths;f.ownerPricing.peakSurchargePercent=15;}
  Object.assign(f.ownerPricing.pricing,WINTER);
  if(workMonth===undefined)delete f.customerInputs.workMonth;else f.customerInputs.workMonth=workMonth;return f;};
// Summer busy season, winter charge, month not given: the busy-season price without the winter charge (3,718.89).
add('concrete-not-sure-summer-busy-winter-charge',slab('not_sure',[6,7,8]));
add('concrete-no-month-summer-busy-winter-charge',slab(undefined,[6,7,8]));
// A busy month in the winter period: both charges, as March pays (3,773.21).
add('concrete-not-sure-spring-busy-winter-charge',slab('not_sure',[3,4,5]));
// No busy season: the winter charge is still included (3,593.21).
add('concrete-not-sure-winter-charge-no-busy-season',slab('not_sure',null));
// A labor multiplier above 10 is refused; 10 quotes (1,040.00).
{const f=mowing();f.ownerPricing.pricing.frequencyMultipliers.weekly=12;add('mowing-frequency-multiplier-above-ceiling',f);}
add('cleanup-debris-multiplier-at-ceiling',fixture('LANDSCAPING_CLEANUP',{cleanupBaseRatePerSqft:10,debrisPricing:{light:{laborMultiplier:1,disposalFlat:2000},moderate:{laborMultiplier:1,disposalFlat:3000},heavy:{laborMultiplier:10,disposalFlat:4000}},minimumServiceCharge:0},{yardSqft:1000,sqftMethod:'exact',debrisLevel:'heavy',slope:'flat',haulAway:false}));
writeFileSync(new URL('./corpus-additions-20261126-v58.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
