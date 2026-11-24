import {writeFileSync} from 'node:fs';
import {flooring,fixture} from '../engine-independent/fixtures.mjs';
import {slopeRoof} from '../../test/audit-f1501ff/roofFixture.mjs';
import {roofRepairByArea,zeroPolicy} from '../../test/audit-f1501ff/fixtures.mjs';

// November 24, 2026 (v47): the remaining audit f1501ff repairs that change a
// quote (#12 core $0 repair prices and included low-slope prices; #15
// leveling disclosure and repair dimensions). Run once; never edited.
const cases=[];
const add=(id,input)=>cases.push({id:'v47-20261124:'+id,input:structuredClone(input)});

// #12 Repair priced by area: $0 unit price unclassified, included, and $5.00.
add('roof-repair-area-unit-zero-unclassified',roofRepairByArea(0));
{const f=roofRepairByArea(0);f.ownerPricing.zeroPricePolicy=zeroPolicy(f,{'repairUnitPrice.asphalt_shingle.shingle_patch':'repairAreaMinimum.asphalt_shingle.shingle_patch'});add('roof-repair-area-unit-zero-included',f);}
add('roof-repair-area-unit-500',roofRepairByArea(500));
// #12 $0 self-adhered underlayment included in the shingle price.
{const f=slopeRoof({pitchBand:'under_four',pitchRisePer12:3},{lowSlopeAssemblyByProduct:{asphalt_shingle:'self_adhered_underlayment'},selfAdheredUnderlaymentPerSquare:0});f.ownerPricing.priceBasisByCategory.material='sell_price';f.ownerPricing.zeroPricePolicy=zeroPolicy(f,{selfAdheredUnderlaymentPerSquare:'materialCostPerSquare.asphalt_shingle'});add('roof-3-12-self-adhered-zero-included',f);}
// #15a Leveling asked for, no area, no leveling price.
{const f=flooring();Object.assign(f.customerInputs,{floorLevelingNeeded:true});add('tile-leveling-yes-no-area-unpriced',f);}
// #15b Repair by length and width, width missing; and complete.
const repair=answers=>fixture('ROOFING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1000,repairHours:{asphalt_shingle:{shingle_patch:{small:2,medium:4,large:6}}},repairMaterialAllowance:{asphalt_shingle:{shingle_patch:{small:5000,medium:8000,large:12000}}},pitchMultiplier:{low:1,medium:1,steep:1,very_steep:1},storyMultiplier:{1:1,2:1,3:1}},{repairType:'shingle_patch',roofType:'asphalt_shingle',pitch:'low',stories:1,leakPresent:false,...answers});
add('roof-repair-dimensions-width-missing',repair({repairAreaMethod:'dimensions',repairLengthFt:10}));
add('roof-repair-dimensions-10x6',repair({repairAreaMethod:'dimensions',repairLengthFt:10,repairWidthFt:6}));

writeFileSync(new URL('./corpus-additions-20261124-v47.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
