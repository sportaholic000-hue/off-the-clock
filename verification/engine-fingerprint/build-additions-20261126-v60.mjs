import {writeFileSync} from 'node:fs';
import {fixture} from '../engine-independent/fixtures.mjs';

// November 26, 2026 (v60): Neon audit of d712c688, finding 3. Planting never
// reads the mulch ordering overage, so it is neither required nor range-checked
// there. Run once; never edited. Expected amounts are worked out by hand in
// test/qeAuditFixesV60_20261126.spec.mjs.
const cases=[];
const add=(id,input)=>cases.push({id:'v60-20261126:'+id,input:structuredClone(input)});
const planting=(pricing={})=>fixture('LANDSCAPING_PLANTING',{plantingLaborPerPlant:{small:2000,medium:3000,large:5000},plantMaterialAllowance:{small:1500,medium:2500,large:6000},minimumServiceCharge:0,mulchMaterialPerYard:{brown:4500},mulchInstallLaborPerYard:3000,...pricing},{plantsBySize:{small:2,medium:0,large:0},bedCondition:'clean',mulchNeeded:true,mulchYards:2,mulchType:'brown',accessDifficulty:'easy'});
// Planting quotes 220.00 whatever overage is saved on it (before: held for review).
add('planting-overage-above-range',planting({mulchOverageFactor:5}));
add('planting-overage-below-range',planting({mulchOverageFactor:0.5}));
add('planting-overage-zero',planting({mulchOverageFactor:0}));
// None saved at all.
const bare=planting();delete bare.ownerPricing.mulchOverageFactor;if(bare.ownerPricing.pricing)delete bare.ownerPricing.pricing.mulchOverageFactor;
add('planting-no-overage-saved',bare);
// Mulching still checks it: an overage of 5 is held for review; 10% quotes 238.50.
const mulch=(pricing={})=>fixture('LANDSCAPING_MULCH',{mulchMaterialPerYard:{brown:4500},mulchInstallLaborPerYard:3000,minimumServiceCharge:0,mulchOverageFactor:1.10,...pricing},{mulchType:'brown',bedCondition:'clean',edgingNeeded:false,accessDifficulty:'easy',inputMethod:'sqft',mulchArea:324,mulchDepth:3});
add('mulch-overage-above-range-held',mulch({mulchOverageFactor:5}));
writeFileSync(new URL('./corpus-additions-20261126-v60.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
