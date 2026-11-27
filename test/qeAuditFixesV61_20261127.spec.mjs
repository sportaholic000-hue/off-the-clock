// November 27, 2026 (v61). An audit of db0c1b27 forwarded by the owner:
// 1. with no work month, a concrete quote could be lower than the job costs
//    in a winter month;
// 2. every wood siding repair in a building built in 1990 or earlier went to
//    review, including small repairs the EPA lead-paint rule leaves out.
// Every expected value is worked out by hand in the comments before the run.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {concrete} from '../verification/engine-independent/fixtures.mjs';
import {checkStoredQuoteBookingTerms} from '../server/src/quoteBookingTerms.js';
import {customerContextFields} from '../server/customerContextFields.js';
import {fixture} from '../verification/engine-independent/fixtures.mjs';
import {SMALL_PAINTED_REPAIR_MAX_SQFT} from '../server/quote-engine-vnext/buildingAgeRules.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {CLASS2_DEFINITIONS} from '../server/quote-engine-vnext/contracts.js';
import {getVNextPriceBookMetadata} from '../server/quote-engine-vnext/index.js';

const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.missingCustomerFields,q.invalidCustomerFields]));return q;};
const mid=(q,option=0)=>q.options[option].calculationRecord.scenarios.mid;
const line=(q,name,option=0)=>mid(q,option).lineItems.find(l=>l.name===name);
const total=(q,option=0)=>mid(q,option).finalTotalCents;

test('the engine is v61',()=>{assert.equal(ENGINE_VERSION,'quote-engine-vnext-accuracy-20261127-v61');});

// ---------------------------------------------------------------------------
// With no work month the quote is priced for its most expensive single month.
// v58 always took the busy-season month. When the winter concrete charge is
// larger than the busy-season surcharge, a winter month costs more than that,
// so the customer saw a price below what a winter pour costs, and the quote
// said "the price is lower outside the busy months", which was not true.
//
// The slab (the v58 one): 20 x 10 ft, 4 in thick, base preparation, no markup, no tax.
//   Concrete labor      200 sq ft x 6.00                      = 1,200.00
//   Ready-mix concrete  200 x 4/12 / 27 x 1.10 = 880/324 = 2.716049 yd3
//                       2.716049 x 180.00                      =   488.89
//   Formwork            60 ft x 25.00                         = 1,500.00
//   Base preparation    200 sq ft x 1.75                      =   350.00
//   Neither charge                                            = 3,538.89
//   Busy season (June to August) 15% of labor 1,200.00        =   180.00   July    3,718.89
//   Winter charge 200.00 a yard: 2.716049 x 200.00            =   543.21   January 4,082.10
//   Winter charge  20.00 a yard: 2.716049 x  20.00            =    54.32   January 3,593.21
//   Winter charge  66.27 a yard: 2.716049 x  66.27 = 179.9926 =   179.99   January 3,718.88
//   Winter charge  66.28 a yard: 2.716049 x  66.28 = 180.0198 =   180.02   January 3,718.91
// ---------------------------------------------------------------------------
const winter=cents=>({winterConcreteChargePerUnit:cents,winterConcreteStart:'11-01',winterConcreteEnd:'04-15'});
const job=(workMonth,pricing,peakMonths=[6,7,8],percent=15)=>{
  const f=concrete();f.currentMonth=11;
  if(peakMonths){f.ownerPricing.peakMonths=peakMonths;f.ownerPricing.peakSurchargePercent=percent;}
  Object.assign(f.ownerPricing.pricing,pricing);
  if(workMonth===undefined)delete f.customerInputs.workMonth;else f.customerInputs.workMonth=workMonth;
  return f;
};
const book=(q,start,tierName=null)=>checkStoredQuoteBookingTerms({quoteRow:{resultJson:JSON.stringify({internalResult:q})},startAtUtc:start,timeZone:'America/Toronto',tierName});
const INCLUDED_UNKNOWN='Includes the winter concrete charge because no work month was given. The price is lower if the concrete is poured outside November 1 to April 15.';
const NOT_INCLUDED='This price does not include the winter concrete charge. That charge is added if the concrete is poured from November 1 to April 15.';
const BUSY_ASSUMED='Priced at the busy-season rate because no work month was given. The price is lower if the work is scheduled outside June, July, August.';
const BUSY_IN='This quote was priced for work outside the busy season. The chosen date is in the busy season, so request a new quote for that date before booking the job.';
const BUSY_OUT='This quote was priced for busy-season work. The chosen date is outside the busy season, so request a new quote for that date before booking the job.';
const WINTER_OUT='This quote was priced for concrete work in the winter period. The chosen date is outside the winter period, so request a new quote for that date before booking the job.';

test('a chosen month is priced as before at the larger winter charge (July 3,718.89, January 4,082.10, October 3,538.89)',()=>{
  assert.equal(total(ready(job('july',winter(20000)))),371889);
  const january=ready(job('january',winter(20000)));
  assert.equal(total(january),408210);assert.equal(line(january,'Winter concrete charge').amountCents,54321);assert.equal(line(january,'Peak season adjustment'),undefined);
  assert.equal(total(ready(job('october',winter(20000)))),353889);
});

test('month not given, winter charge larger than the busy-season surcharge: the winter month is quoted (4,082.10)',()=>{
  for(const workMonth of ['not_sure',undefined]){
    const q=ready(job(workMonth,winter(20000)));
    assert.equal(total(q),408210,String(workMonth));
    assert.equal(line(q,'Winter concrete charge').amountCents,54321);assert.equal(line(q,'Peak season adjustment'),undefined);
    const disclaimer=q.options[0].disclaimer;
    assert.ok(disclaimer.includes(INCLUDED_UNKNOWN),disclaimer);
    assert.ok(!disclaimer.includes('Priced at the busy-season rate'),disclaimer);assert.ok(!disclaimer.includes('does not include the winter concrete charge'),disclaimer);
    const rule=q.options[0].calculationRecord.ruleApplications.find(r=>r.name==='winterConcreteCharge');
    assert.equal(rule.result.applied,true);assert.equal(rule.result.monthGiven,false);assert.deepEqual(rule.inputs.busySeasonMonthsCompared,[6,7,8]);
    const seasonal=mid(q).seasonal;assert.equal(seasonal.seasonActive,false);assert.deepEqual(seasonal.configuredMonths,[6,7,8]);
    // The price holds for a winter date. A busy-season date or a date in
    // neither period is cheaper, so each asks for a new quote.
    assert.deepEqual(book(q,'2027-01-15T15:00:00Z'),{ok:true});
    assert.deepEqual(book(q,'2027-07-15T15:00:00Z'),{ok:false,code:'REQUOTE_REQUIRED',message:BUSY_IN});
    assert.deepEqual(book(q,'2027-10-15T15:00:00Z'),{ok:false,code:'REQUOTE_REQUIRED',message:WINTER_OUT});
  }
});

test('month not given, busy-season surcharge larger than the winter charge: the busy month is quoted, as in v58 (3,718.89)',()=>{
  const q=ready(job('not_sure',winter(2000)));
  assert.equal(total(q),371889);assert.equal(line(q,'Winter concrete charge'),undefined);assert.equal(line(q,'Peak season adjustment').amountCents,18000);
  const disclaimer=q.options[0].disclaimer;
  assert.ok(disclaimer.includes(BUSY_ASSUMED),disclaimer);assert.ok(disclaimer.includes(NOT_INCLUDED),disclaimer);
  assert.deepEqual(book(q,'2027-07-15T15:00:00Z'),{ok:true});
  assert.deepEqual(book(q,'2027-01-15T15:00:00Z'),{ok:false,code:'REQUOTE_REQUIRED',message:BUSY_OUT});
});

test('the higher of the two months is quoted to the cent (66.27 a yard: busy 3,718.89; 66.28 a yard: winter 3,718.91)',()=>{
  const below=ready(job('not_sure',winter(6627)));
  assert.equal(total(ready(job('january',winter(6627)))),371888);
  assert.equal(total(below),371889);assert.equal(line(below,'Peak season adjustment').amountCents,18000);assert.equal(line(below,'Winter concrete charge'),undefined);
  const above=ready(job('not_sure',winter(6628)));
  assert.equal(total(ready(job('january',winter(6628)))),371891);
  assert.equal(total(above),371891);assert.equal(line(above,'Winter concrete charge').amountCents,18002);assert.equal(line(above,'Peak season adjustment'),undefined);
});

test('no month costs more than the quote, whatever the two charges are',()=>{
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  for(const cents of [2000,6627,6628,20000])for(const [peak,percent] of [[[6,7,8],15],[[3,4,5],15],[[12,1,2],10],[[6,7,8],40]]){
    const quoted=total(ready(job('not_sure',winter(cents),peak,percent)));
    const dearest=Math.max(...months.map(month=>total(ready(job(month,winter(cents),peak,percent)))));
    assert.equal(quoted,dearest,JSON.stringify({cents,peak,percent}));
  }
});

test('a busy month inside the winter period, or no busy season: unchanged (both charges; the winter charge)',()=>{
  // Busy March to May at 20.00 a yard: March pays both, 3,538.89 + 180.00 + 54.32 = 3,773.21.
  const both=ready(job('not_sure',winter(2000),[3,4,5]));
  assert.equal(total(both),377321);assert.equal(line(both,'Winter concrete charge').amountCents,5432);assert.equal(line(both,'Peak season adjustment').amountCents,18000);
  // No busy season: 3,538.89 + 54.32 = 3,593.21.
  const none=ready(job('not_sure',winter(2000),null));
  assert.equal(total(none),359321);assert.ok(none.options[0].disclaimer.includes(INCLUDED_UNKNOWN));
});

test('each price option is priced for its own most expensive month',()=>{
  const f=job('not_sure',winter(2000));
  f.ownerPricing.tiers=[{name:'Standard',overrides:{}},{name:'Winter mix',overrides:{winterConcreteChargePerUnit:20000}}];
  const q=ready(f);
  assert.deepEqual(q.options.map(option=>option.tierName),['Standard','Winter mix']);
  assert.equal(total(q,0),371889);assert.equal(line(q,'Peak season adjustment',0).amountCents,18000);assert.equal(line(q,'Winter concrete charge',0),undefined);
  assert.equal(total(q,1),408210);assert.equal(line(q,'Winter concrete charge',1).amountCents,54321);assert.equal(line(q,'Peak season adjustment',1),undefined);
  // Each option is booked on the dates its own price holds for.
  assert.deepEqual(book(q,'2027-07-15T15:00:00Z','Standard'),{ok:true});
  assert.deepEqual(book(q,'2027-01-15T15:00:00Z','Winter mix'),{ok:true});
  assert.deepEqual(book(q,'2027-01-15T15:00:00Z','Standard'),{ok:false,code:'REQUOTE_REQUIRED',message:BUSY_OUT});
  assert.deepEqual(book(q,'2027-07-15T15:00:00Z','Winter mix'),{ok:false,code:'REQUOTE_REQUIRED',message:BUSY_IN});
});

test('the customer is told the most expensive month is shown when a busy season and a winter charge are both set',()=>{
  const raw={serviceType:'CONCRETE_PATIO_SLAB'},prices=concrete().ownerPricing.pricing;
  const details=(pricing,defaults)=>customerContextFields(raw,pricing,defaults).find(field=>field.name==='workMonth').details;
  assert.deepEqual(details({...prices,...winter(2000)},{peakMonths:[6,7,8],peakSurchargePercent:15}),[
    'Busy-season pricing follows the month the work is done. If you are not sure, the price for the most expensive month is shown.',
    'The winter concrete charge follows the month the concrete is poured. If you are not sure, the quote says whether it is included.']);
  // Unchanged: a winter charge alone, and a busy season alone.
  assert.deepEqual(details({...prices,...winter(2000)},{peakMonths:[],peakSurchargePercent:0}),['The winter concrete charge follows the month the concrete is poured. If you are not sure, it is included.']);
  assert.deepEqual(details(prices,{peakMonths:[6,7,8],peakSurchargePercent:15}),['Busy-season pricing follows the month the work is done. If you are not sure, the busy-season price is shown.']);
});

// ---------------------------------------------------------------------------
// 2. Small wood siding repairs. The EPA Renovation, Repair and Painting rule
// (40 CFR 745.83) leaves out exterior work that disturbs 20 square feet or
// less of painted surface, when no painted part is destroyed in taking it off
// and no prohibited practice is used. Health Canada gives precautions and no
// size of its own. A wood repair of 20 square feet or less is quoted at any
// building age, with the sentence every quoted siding repair carries. Larger
// wood repairs and every fiber cement repair (asbestos has no size exemption)
// are held as before. The year-built question is still asked.
//   Labor 100.00 an hour; minor repair: small 2 h + 50.00, medium 4 h + 100.00.
//   Under 20 sq ft is a small repair, 20 to 80 a medium one (the starting bands).
//   15 sq ft:    2 x 100.00 +  50.00 = 250.00
//   20 sq ft:    4 x 100.00 + 100.00 = 500.00 (medium band, and at the limit)
//   20.01 sq ft: held in an older building
// ---------------------------------------------------------------------------
const repair=(sidingType,inputs={},pricing={})=>fixture('SIDING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1_000_000,repairHours:{[sidingType]:{minor:{small:2,medium:4,large:8}}},materialAllowance:{[sidingType]:{minor:{small:5000,medium:10000,large:15000}}},...pricing},{sidingType,damageLevel:'minor',affectedArea:40,stories:1,...inputs});
const EXCLUSION='Repair does not include testing for or removing asbestos or lead paint. Older siding can contain them; if found, that work is priced separately.';
const HELD='Siding in a building built in 1990 or earlier can contain asbestos or lead paint, so it is checked before the repair. The business will confirm the price.';
const OLDER=['before_1978','1978_to_1990','not_sure'];

test('2: the limit is 20 square feet',()=>{assert.equal(SMALL_PAINTED_REPAIR_MAX_SQFT,20);});

test('2: a wood repair of 20 square feet or less is quoted at any building age, with the exclusion sentence',()=>{
  for(const age of [...OLDER,'1991_or_later']){
    const small=ready(repair('wood',{affectedArea:15,buildingAge:age}));
    assert.equal(total(small),25000,age);assert.ok(small.options[0].disclaimer.includes(EXCLUSION),age);
    const limit=ready(repair('wood',{affectedArea:20,buildingAge:age}));
    assert.equal(total(limit),50000,age);assert.ok(limit.options[0].disclaimer.includes(EXCLUSION),age);
  }
});

test('2: a wood repair over 20 square feet in an older building is held, as before',()=>{
  for(const age of OLDER)for(const affectedArea of [20.01,40]){
    const q=generateQuoteVNext(repair('wood',{affectedArea,buildingAge:age}));
    assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',age+' '+affectedArea);assert.equal(q.reviewReason,HELD);assert.equal(q.options,undefined);
  }
  assert.equal(total(ready(repair('wood',{affectedArea:40,buildingAge:'1991_or_later'}))),50000);
});

test('2: fiber cement is held at every size in an older building',()=>{
  for(const age of OLDER)for(const affectedArea of [1,15,20]){
    const q=generateQuoteVNext(repair('fiber_cement',{affectedArea,buildingAge:age}));
    assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',age+' '+affectedArea);assert.equal(q.reviewReason,HELD);
  }
});

test('2: the year built is still asked for a small wood repair, and a repair given by its length and width is measured the same way',()=>{
  const unanswered=generateQuoteVNext(repair('wood',{affectedArea:15}));
  assert.equal(unanswered.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(unanswered.missingCustomerFields,['buildingAge']);
  // 4 ft x 5 ft = 20 sq ft: quoted. 5 ft x 5 ft = 25 sq ft: held.
  const byDimensions=(length,width)=>{const f=repair('wood',{buildingAge:'before_1978',repairAreaMethod:'dimensions',repairLengthFt:length,repairWidthFt:width});delete f.customerInputs.affectedArea;return generateQuoteVNext(f);};
  const twenty=byDimensions(4,5);
  assert.equal(twenty.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([twenty.reviewReason,twenty.invalidCustomerFields,twenty.missingCustomerFields]));
  assert.equal(total(twenty),50000);
  const twentyFive=byDimensions(5,5);
  assert.equal(twentyFive.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(twentyFive.reviewReason,HELD);
});

test('2: the owner setting says small wood repairs are quoted',()=>{
  const help=bridge.applicationMetadata().services.find(m=>m.serviceType==='SIDING_REPAIR').fields.find(f=>f.field==='olderMaterialRemoval').help;
  assert.ok(help.includes('A wood siding repair of 20 square feet or less is quoted at any age, with the note that testing and removal are not included.'),help);
});

// ---------------------------------------------------------------------------
// 3. Two guards for the kinds of defect the last two audits found, so the
// next change that leaves one behind fails here.
//   a. "Not sure" is never cheaper than a month the customer could pick: for
//      a service with a busy season, the quote with no work month equals the
//      highest of its twelve monthly prices. (The concrete cases above cover
//      the winter charge as well.)
//   b. Every setting the engine checks is offered in the price book. A
//      setting that is checked but not shown can hold a service with no field
//      to correct (the planting overage, fixed in v60). Only a setting marked
//      unused is left out, and it is not checked.
// ---------------------------------------------------------------------------
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
const seasonalJobs={
  LANDSCAPING_MULCH:()=>fixture('LANDSCAPING_MULCH',{mulchMaterialPerYard:{brown:4500},mulchInstallLaborPerYard:3000,minimumServiceCharge:0,mulchOverageFactor:1.10},{mulchType:'brown',bedCondition:'clean',edgingNeeded:false,accessDifficulty:'easy',inputMethod:'yards',mulchArea:5}),
  LANDSCAPING_PLANTING:()=>fixture('LANDSCAPING_PLANTING',{plantingLaborPerPlant:{small:2000,medium:3000,large:5000},plantMaterialAllowance:{small:1500,medium:2500,large:6000},minimumServiceCharge:0,mulchMaterialPerYard:{brown:4500},mulchInstallLaborPerYard:3000},{plantsBySize:{small:2,medium:0,large:0},bedCondition:'clean',mulchNeeded:true,mulchYards:2,mulchType:'brown',accessDifficulty:'easy'}),
  SIDING_REPAIR:()=>repair('vinyl'),
  CONCRETE_PATIO_SLAB:()=>concrete()
};
test('3a: with a busy season, the quote with no work month equals the highest of the twelve monthly prices',()=>{
  for(const [type,build] of Object.entries(seasonalJobs))for(const [peak,percent] of [[[6,7,8],15],[[12,1,2],25],[[4],5]]){
    const at=workMonth=>{const f=build();f.currentMonth=11;f.ownerPricing.peakMonths=peak;f.ownerPricing.peakSurchargePercent=percent;if(workMonth)f.customerInputs.workMonth=workMonth;return total(ready(f));};
    const dearest=Math.max(...MONTHS.map(at));
    assert.equal(at('not_sure'),dearest,type+' '+JSON.stringify(peak));assert.equal(at(undefined),dearest,type+' no answer '+JSON.stringify(peak));
    // The season changes the price here, so the comparison is a real one.
    assert.ok(dearest>Math.min(...MONTHS.map(at)),type+' '+JSON.stringify(peak));
  }
});
test('3b: every setting the engine checks is offered in the price book',()=>{
  const engine=new Map(getVNextPriceBookMetadata().map(meta=>[meta.serviceType,meta]));
  const app=new Map(bridge.applicationMetadata().services.map(meta=>[meta.serviceType,meta]));
  let checked=0;
  for(const [type,definitions] of Object.entries(CLASS2_DEFINITIONS))for(const [name,definition] of Object.entries(definitions)){
    if(definition.unused)continue;
    checked++;
    assert.ok(engine.get(type).class2Fields.some(field=>field.name===name),type+'.'+name+' is checked by the engine but not in its price-book list');
    const service=app.get(type);
    assert.ok(service.class2Fields.some(field=>(field.name||field.field)===name)||service.fields.some(field=>field.field===name)||(service.legacyClass2Fields||[]).some(field=>(field.name||field.field)===name),
      type+'.'+name+' is checked by the engine but not offered in the price book');
  }
  assert.ok(checked>=68,String(checked));
});
