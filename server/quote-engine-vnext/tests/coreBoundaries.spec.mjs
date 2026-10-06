import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,vNextServiceStatus} from '../index.js';
import {activationScenarios,activationReviewScenarios} from '../priceBook.js';
import {scopeActivationInputs} from '../scopePricing.js';
import {repairBoundaryMeasurements} from '../activationBoundaries.js';
import {floor,fixture,slab,stairs,demolition} from './coreFixtures.mjs';
// Handwritten amounts and band conventions are in CORE_FIXES_20261005.md.
const ready=(f,expected)=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.midEstimate,expected);return q;};

for(const [sqft,expected,band] of [[449.97,989.93,'small'],[450,990,'small'],[450.03,945.06,'medium'],[899.97,1889.94,'medium'],[900,1890,'medium'],[900.03,1800.06,'large']])test(`core 1 room boundary: ${sqft}/3 is ${band} ($${expected})`,()=>{
 const f=floor(sqft,3),q=ready(f,expected);
 assert.ok(q.options[0].calculationRecord.ruleApplications.some(r=>r.rule?.includes('averageRoomSqft')&&r.result===band));
});
test('core 1 activation includes both sides and exact room thresholds',()=>{
 const f=floor(),values=activationScenarios(f.ownerPricing).map(c=>c.sqft/c.roomCount);
 for(const n of [149.99,150,150.01,299.99,300,300.01])assert.ok(values.includes(n),String(n));
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
});

function repair(type){
 const roof=type==='ROOFING_REPAIR',flat=type==='FLAT_ROOF_REPAIR';
 const size={small:1,medium:2,large:3},amount={small:1000,medium:2000,large:3000};
 return fixture(type,{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:roof?250:100,
  [flat?'patchRepairHours':'repairHours']:{[flat?'epdm':roof?'asphalt_shingle':'vinyl']:{[flat?'seam_patch':roof?'shingle_patch':'minor']:size}},
  [flat?'patchMaterialAllowance':roof?'repairMaterialAllowance':'materialAllowance']:{[flat?'epdm':roof?'asphalt_shingle':'vinyl']:{[flat?'seam_patch':roof?'shingle_patch':'minor']:amount}}},
  roof?{repairType:'shingle_patch',affectedArea:50,roofType:'asphalt_shingle',pitch:'low',stories:1,leakPresent:false}:flat?{repairType:'seam_patch',affectedArea:20,membraneType:'epdm',leakPresent:false,pondingWater:false,accessDifficulty:'easy'}:{sidingType:'vinyl',damageLevel:'minor',affectedArea:20,stories:1});
}
for(const type of ['ROOFING_REPAIR','FLAT_ROOF_REPAIR','SIDING_REPAIR']){
 const cases=type==='ROOFING_REPAIR'?[[49.99,110],[50,220],[50.01,220],[199.99,220],[200,220],[200.01,330],[249.99,330],[250,330],[250.01,null]]:[[19.99,110],[20,220],[20.01,220],[79.99,220],[80,220],[80.01,330],[99.99,330],[100,330],[100.01,null]];
 for(const [area,expected] of cases)test(`core 1 ${type} repair boundary ${area}: ${expected===null?'review':'$'+expected}`,()=>{
  const f=repair(type);f.customerInputs.affectedArea=area;
  if(expected===null)assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');else ready(f,expected);
 });
 test(`core 1 ${type} activation covers every supported repair boundary`,()=>{
  const f=repair(type),values=activationScenarios(f.ownerPricing).map(c=>c.affectedArea);
  for(const [area,expected] of cases)if(expected!==null)assert.ok(values.includes(area),String(area));
  assert.ok(repairBoundaryMeasurements(type,f.ownerPricing.pricing.largeRepairMaxSqft).includes(cases.at(-1)[0]));
  assert.ok(activationReviewScenarios(f.ownerPricing).some(c=>c.affectedArea===cases.at(-1)[0]));
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
 });
}
function stairBands(){const f=floor(),p=f.ownerPricing.pricing;p.scopeDetails={stairs__narrow:stairs(2,3),stairs__wide:stairs(3,4)};p.scopeRates={stairs__narrow_installed:1000,stairs__wide_installed:2000};Object.assign(f.customerInputs,{stairSteps:5,stairScopeConfirmed:true,floorAreaExcludesStairs:true,stairRemovalNeeded:false,stairDisposalNeeded:false});return f;}
for(const [width,expected] of [[1.99,null],[2,null],[2.01,470],[2.99,470],[3,470],[3.01,520],[3.99,520],[4,520],[4.01,null]])test(`core 1 stair width ${width}: ${expected===null?'review':'$'+expected}`,()=>{
 const f=stairBands();f.customerInputs.stairWidthLF=width;
 if(expected===null)assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');else ready(f,expected);
});
test('core 1 activation preserves real stair boundary widths',()=>{
 const f=stairBands(),values=activationScenarios(f.ownerPricing).filter(c=>c.stairSteps>0).map(c=>scopeActivationInputs(f.serviceType,c,f.ownerPricing.pricing,f.ownerPricing).stairWidthLF);
 for(const n of [2.01,2.99,3,3.01,3.99,4])assert.ok(values.includes(n),String(n));
 for(const n of [1.99,2,4.01])assert.ok(activationReviewScenarios(f.ownerPricing).some(c=>c.stairWidthLF===n),String(n));
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
});
function demolitionBands(){const f=slab(),p=f.ownerPricing.pricing;p.scopeDetails={demolition__thin:demolition(2,4),demolition__thick:demolition(4,6)};p.scopeRates={demolition__thin_installed:200,demolition__thick_installed:300};Object.assign(f.customerInputs,{demolitionNeeded:true,demolitionAreaSqft:100,demolitionReinforcement:'none',demolitionAccessDifficulty:'easy',demolitionScopeConfirmed:true});return f;}
for(const [thickness,expected] of [[1.99,null],[2,null],[2.01,440],[3.99,440],[4,440],[4.01,540],[5.99,540],[6,540],[6.01,null]])test(`core 1 demolition thickness ${thickness}: ${expected===null?'review':'$'+expected}`,()=>{
 const f=demolitionBands();f.customerInputs.demolitionThickness=thickness;
 if(expected===null)assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');else ready(f,expected);
});
test('core 1 activation preserves real demolition boundary thicknesses',()=>{
 const f=demolitionBands(),values=activationScenarios(f.ownerPricing).filter(c=>c.demolitionNeeded).map(c=>scopeActivationInputs(f.serviceType,c,f.ownerPricing.pricing,f.ownerPricing).demolitionThickness);
 for(const n of [2.01,3.99,4,4.01,5.99,6])assert.ok(values.includes(n),String(n));
 for(const n of [1.99,2,6.01])assert.ok(activationReviewScenarios(f.ownerPricing).some(c=>c.demolitionThickness===n),String(n));
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
});
