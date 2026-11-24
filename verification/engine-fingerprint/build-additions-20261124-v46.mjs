import {writeFileSync} from 'node:fs';
import {concrete} from '../engine-independent/fixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {slopeRoof} from '../../test/audit-f1501ff/roofFixture.mjs';
import {roofExcludingFlashingVents,floatingOverlay,concreteBaseIncluded} from '../../test/audit-f1501ff/fixtures.mjs';

// November 24, 2026 (v46): repairs from the Claude audit of f1501ff.
// Frozen inputs that reach each change in what a quote charges or why it is
// held. Run once; the output file is never edited.
const cases=[];
const add=(id,input)=>cases.push({id:'v46-20261124:'+id,input:structuredClone(input)});

// #3 Base wording excludes flashing and vents; no itemized flashing lines.
add('roof-wording-excludes-flashing-vents-no-lines',roofExcludingFlashingVents());
add('roof-wording-excludes-accessories-only',roofExcludingFlashingVents('excludes_itemized_accessories'));
// #6 Caller not sure of the pitch, then gives a band or a rise.
add('roof-not-sure-band-7-9',slopeRoof({pitchMethod:'not_sure',pitchBand:'seven_to_nine'}));
add('roof-not-sure-rise-8',slopeRoof({pitchMethod:'not_sure',pitchBand:undefined,pitchRisePer12:8}));
// #11 Empty short-load band list with a flat short-load fee.
{const f=concrete();Object.assign(f.ownerPricing.pricing,{shortLoadFlatFee:15000,shortLoadThresholdCubicYards:6,shortLoadBands:{}});add('patio-empty-short-load-bands-flat-fee',f);}
// #13 Optional painting item quantities with and without their selection.
for(const [id,answers] of [['windows-selected',{surfaceOptionalItems:['windows'],paintWindows:4}],['windows-not-selected',{surfaceOptionalItems:['doors'],paintDoors:1,paintWindows:4}],['empty-selection-windows',{surfaceOptionalItems:[],paintWindows:4}]]){
  const f=offeringFixture('EXTERIOR_PAINTING','installed');f.ownerPricing.pricing.surfaceExtraRates={windows:5000,doors:8000};Object.assign(f.customerInputs,answers);add('exterior-painting-'+id,f);
}
// #5b and #5c readiness repairs: the jobs themselves (prices unchanged).
add('patio-base-always-included',concreteBaseIncluded());
{const f=concreteBaseIncluded();f.customerInputs.accessDifficulty='difficult';add('patio-base-always-included-difficult-access',f);}
add('floating-vinyl-over-tile-overlay',floatingOverlay());

writeFileSync(new URL('./corpus-additions-20261124-v46.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
