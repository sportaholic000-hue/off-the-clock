import {writeFileSync} from 'node:fs';
import {concrete,fixture} from '../engine-independent/fixtures.mjs';

// November 27, 2026 (v61): with no work month, a concrete quote is priced for
// its most expensive single month; a wood siding repair of 20 square feet or
// less is quoted at any building age. Run once; never edited. Expected amounts
// are worked out by hand in test/qeAuditFixesV61_20261127.spec.mjs.
const cases=[];
const add=(id,input)=>cases.push({id:'v61-20261127:'+id,input:structuredClone(input)});
const job=(workMonth,charge,peakMonths=[6,7,8],percent=15)=>{
  const f=concrete();f.currentMonth=11;
  if(peakMonths){f.ownerPricing.peakMonths=peakMonths;f.ownerPricing.peakSurchargePercent=percent;}
  Object.assign(f.ownerPricing.pricing,{winterConcreteChargePerUnit:charge,winterConcreteStart:'11-01',winterConcreteEnd:'04-15'});
  if(workMonth===undefined)delete f.customerInputs.workMonth;else f.customerInputs.workMonth=workMonth;
  return f;
};
// Winter charge 200.00 a yard: January 4,082.10 is quoted (before: the July price, 3,718.89).
add('concrete-not-sure-winter-200',job('not_sure',20000));
add('concrete-no-month-winter-200',job(undefined,20000));
add('concrete-january-winter-200',job('january',20000));
add('concrete-july-winter-200',job('july',20000));
// To the cent: 66.27 a yard keeps the busy month (3,718.89); 66.28 quotes the winter month (3,718.91).
add('concrete-not-sure-winter-66.27',job('not_sure',6627));
add('concrete-not-sure-winter-66.28',job('not_sure',6628));
// A 40% busy season adds 480.00 (July 4,018.89); the 200.00 winter charge adds 543.21 (January 4,082.10), so the winter month is quoted.
add('concrete-not-sure-winter-200-busy-40-percent',job('not_sure',20000,[6,7,8],40));
// Each price option is priced for its own most expensive month.
const tiers=job('not_sure',2000);tiers.ownerPricing.tiers=[{name:'Standard',overrides:{}},{name:'Winter mix',overrides:{winterConcreteChargePerUnit:20000}}];
add('concrete-not-sure-two-options',tiers);
// Small wood siding repairs: 15 sq ft 250.00 and 20 sq ft 500.00 are quoted in an older building;
// 20.01 sq ft, and fiber cement at any size, are held.
const repair=(sidingType,inputs={})=>fixture('SIDING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1_000_000,repairHours:{[sidingType]:{minor:{small:2,medium:4,large:8}}},materialAllowance:{[sidingType]:{minor:{small:5000,medium:10000,large:15000}}}},{sidingType,damageLevel:'minor',affectedArea:40,stories:1,...inputs});
add('siding-repair-wood-15-sqft-before-1978',repair('wood',{affectedArea:15,buildingAge:'before_1978'}));
add('siding-repair-wood-15-sqft-not-sure',repair('wood',{affectedArea:15,buildingAge:'not_sure'}));
add('siding-repair-wood-20-sqft-before-1978',repair('wood',{affectedArea:20,buildingAge:'before_1978'}));
add('siding-repair-wood-20.01-sqft-before-1978',repair('wood',{affectedArea:20.01,buildingAge:'before_1978'}));
add('siding-repair-fiber-cement-15-sqft-before-1978',repair('fiber_cement',{affectedArea:15,buildingAge:'before_1978'}));
writeFileSync(new URL('./corpus-additions-20261127-v61.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
