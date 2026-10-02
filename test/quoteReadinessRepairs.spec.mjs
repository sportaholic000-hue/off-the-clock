import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ownerFieldCopy} from '../server/priceBookCopy.js';
import {convertApplicationBook,quoteDoneMoneyKind,applicationMetadata} from '../server/src/quoteDoneBridge.js';
import {vNextServiceStatus,generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
import {starterFields,validateInterviewValue} from '../server/src/priceBookAI.js';
import {roofMinimum,wallPainting,bareConcrete,bareMulch,expected} from '../verification/quote-readiness/fixtures.mjs';

test('B1 roof minimum is an exact fixed amount through root, nested and tier editor boundaries',()=>{
 assert.equal(quoteDoneMoneyKind('ROOFING_REPLACEMENT','minimumJob'),'fixed_amount');
 const {ownerPricing, businessDefaults}=roofMinimum();
 const dollars={services:[{...ownerPricing,minimumJob:2500,pricing:{...ownerPricing.pricing,minimumJob:2500},tiers:[{name:'Plus',overrides:{minimumJob:3000}}]}],defaults:businessDefaults};
 const cents=convertApplicationBook(dollars,'toCents');
 assert.equal(cents.services[0].minimumJob,250000);
 assert.equal(cents.services[0].pricing.minimumJob,250000);
 assert.equal(cents.services[0].tiers[0].overrides.minimumJob,300000);
 assert.deepEqual(convertApplicationBook(cents,'toDollars'),dollars);
 assert.throws(()=>convertApplicationBook({...dollars,services:[{...ownerPricing,pricing:{minimumJob:2500.001}}]},'toCents'),/whole-cent/);
});
test('B1 owner floor gives independently calculated $2875 midpoint and lower bound',()=>{
 const f=roofMinimum(); const r=generateQuoteVNext(f);
 assert.equal(r.resultType,'INSTANT_ESTIMATE_READY');
 const c=sanitizeForCustomerVNext(r);assert.equal(c.midEstimate,expected.roof.midDollars);assert.equal(c.lowEstimate,expected.roof.lowDollars);assert.equal(c.highEstimate,expected.roof.highDollars);
});
for(const [name,make,total] of [['wall',()=>wallPainting(),300],['paint packages',()=>wallPainting(true),250],['concrete',bareConcrete,3188.89],['mulch',bareMulch,77.78]]){
 test('M1 '+name+' base service remains active without unrequested extras',()=>{
  const f=make();assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
  const r=generateQuoteVNext(f);assert.equal(r.resultType,'INSTANT_ESTIMATE_READY');assert.equal(sanitizeForCustomerVNext(r).midEstimate,total);
 });
}
for(const [name,make,patch] of [
 ['ceiling',()=>wallPainting(),{ceilingsIncluded:true,ceilingAreaSqft:100,ceilingCoats:2}],
 ['trim',()=>wallPainting(),{trimIncluded:true,trimLengthLF:20}],
 ['paint product',()=>wallPainting(true),{trimIncluded:true,trimLengthLF:20}],
 ['concrete base',bareConcrete,{baseNeeded:true}],
 ['wire mesh',bareConcrete,{reinforcement:'wire_mesh'}],
 ['rebar',bareConcrete,{reinforcement:'rebar'}],
 ['stamped finish',bareConcrete,{finishType:'stamped'}],
 ['mulch edging',bareMulch,{edgingNeeded:true,edgeLF:20}],
 ['mulch bed preparation',bareMulch,{bedCondition:'needs_weeding',bedSqft:96}]
]){
 test('M1 selected unpriced '+name+' never receives a subtotal',()=>{
  const f=make();Object.assign(f.customerInputs,patch);
  const r=generateQuoteVNext(f);assert.equal(r.resultType,'ESTIMATE_REQUIRES_REVIEW');
  for(const key of ['mid','low','high','subtotalCents'])assert.equal(r[key],undefined);
 });
}
test('M1 owner coverage reports absent optional prices before activation',()=>{
 for(const make of [wallPainting,bareConcrete,bareMulch]){
  const f=make(),s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.ok(s.scopeCoverage.some(row=>!row.configurationComplete));
  assert.ok(s.scopeCoverage.filter(row=>!row.configurationComplete).every(row=>/leads/.test(row.message)));
 }
});
test('M6 purchased paint identifies missing trim product rather than a generic coverage error',()=>{
 const f=wallPainting(true);Object.assign(f.customerInputs,{trimIncluded:true,trimLengthLF:20});
 f.ownerPricing.pricing.trimLaborPerLF=100;
 const r=generateQuoteVNext(f);
 assert.equal(r.resultType,'ESTIMATE_REQUIRES_REVIEW');
 assert.match(JSON.stringify(r),/trim paint product/i);
 assert.doesNotMatch(JSON.stringify(r),/Cost-based paint pricing needs product coverage/);
});
test('M2 setup requests an offering instead of unused exterior and fence standard prices',()=>{
 for(const type of ['EXTERIOR_PAINTING','FENCING_INSTALL','FENCING_REPLACEMENT']){
  const m=applicationMetadata().services.find(x=>x.serviceType===type);
  assert.equal(m.requiresOffering,true);
  assert.ok(m.fields.filter(f=>f.type==='number'||f.type==='json').every(f=>f.field==='minimumJob'));
  assert.ok(starterFields(type).every(f=>f.field==='minimumJob'));
 }
});
test('M3/M4 current AI schema accepts engine-used measured fields and typed maps',()=>{
 const interior=starterFields('INTERIOR_PAINTING').map(x=>x.field);
 assert.ok(interior.includes('laborPerWallSqftPerCoat'));assert.ok(!interior.includes('laborPerFloorSqft'));
 assert.equal(validateInterviewValue('ROOFING_REPLACEMENT','minimumJob',2500),2500);
 assert.deepEqual(validateInterviewValue('ROOFING_REPLACEMENT','laborPerSquare',{asphalt_shingle:90}),{asphalt_shingle:90});
 assert.throws(()=>validateInterviewValue('ROOFING_REPLACEMENT','laborPerSquare',90));
 assert.throws(()=>validateInterviewValue('INTERIOR_PAINTING','laborPerFloorSqft',1));
});
test('M5 current flat roof setup requests named membrane rates without an Average fallback',()=>{
 const m=applicationMetadata().services.find(x=>x.serviceType==='FLAT_ROOF_REPLACEMENT');
 for(const field of ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft']){
  const d=m.fields.find(x=>x.field===field);
  assert.doesNotMatch(d.help,/include.*Average/i);
  assert.ok(!d.shapedKeys?.keys?.includes('average'));
 }
});
test('M7 governing interior painting specification uses measured wall area',()=>{
 const spec=fs.readFileSync(new URL('../specs/quote_engine_v2.md',import.meta.url),'utf8');
 assert.doesNotMatch(spec,/BASIS: FLOOR SQUARE FEET/);
 assert.match(spec,/laborPerWallSqftPerCoat/);
});

test('M5 shared flat-roof help never instructs owners to price an unused Average fallback',()=>{
 for(const field of ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft'])assert.doesNotMatch(ownerFieldCopy('FLAT_ROOF_REPLACEMENT',field).help,/Include an Average/);
});
