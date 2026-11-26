import {writeFileSync} from 'node:fs';
import {fixture} from '../engine-independent/fixtures.mjs';

// November 26, 2026 (v59): open audit items decided by industry standard.
// Run once; never edited. Expected amounts are worked out by hand in
// test/qeStandardsV59_20261126.spec.mjs.
const cases=[];
const add=(id,input)=>cases.push({id:'v59-20261126:'+id,input:structuredClone(input)});
const mulch=(inputs,pricing={})=>fixture('LANDSCAPING_MULCH',{mulchMaterialPerYard:{brown:4500},mulchInstallLaborPerYard:3000,minimumServiceCharge:0,mulchOverageFactor:1.10,...pricing},{mulchType:'brown',bedCondition:'clean',edgingNeeded:false,accessDifficulty:'easy',...inputs});
// Stated yards are bought as stated (375.00; 403.50 with half-yard orders); calculated yards take the overage (238.50).
add('mulch-stated-5-yards',mulch({inputMethod:'yards',mulchArea:5}));
add('mulch-stated-5.2-yards-half-yard-orders',mulch({inputMethod:'yards',mulchArea:5.2},{mulchOrderIncrementCubicYards:{brown:0.5}}));
add('mulch-area-324-depth-3',mulch({inputMethod:'sqft',mulchArea:324,mulchDepth:3}));
// Planting mulch is the stated yards (220.00).
add('planting-stated-2-yards',fixture('LANDSCAPING_PLANTING',{plantingLaborPerPlant:{small:2000,medium:3000,large:5000},plantMaterialAllowance:{small:1500,medium:2500,large:6000},minimumServiceCharge:0,mulchMaterialPerYard:{brown:4500},mulchInstallLaborPerYard:3000,mulchOverageFactor:1.10},{plantsBySize:{small:2,medium:0,large:0},bedCondition:'clean',mulchNeeded:true,mulchYards:2,mulchType:'brown',accessDifficulty:'easy'}));
// Siding repair screening (500.00 when quoted).
const repair=(sidingType,inputs={},pricing={})=>fixture('SIDING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1_000_000,repairHours:{[sidingType]:{minor:{small:2,medium:4,large:8}}},materialAllowance:{[sidingType]:{minor:{small:5000,medium:10000,large:15000}}},...pricing},{sidingType,damageLevel:'minor',affectedArea:40,stories:1,...inputs});
add('siding-repair-vinyl-no-age',repair('vinyl'));
add('siding-repair-wood-no-age',repair('wood'));
add('siding-repair-wood-before-1978',repair('wood',{buildingAge:'before_1978'}));
add('siding-repair-fiber-cement-not-sure',repair('fiber_cement',{buildingAge:'not_sure'}));
add('siding-repair-wood-1991-or-later',repair('wood',{buildingAge:'1991_or_later'}));
add('siding-repair-wood-before-1978-exclusion-policy',repair('wood',{buildingAge:'before_1978'},{olderMaterialRemoval:'exclude'}));
writeFileSync(new URL('./corpus-additions-20261126-v59.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
