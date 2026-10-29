// Builds the frozen input corpus for the engine fingerprint. Run once; the
// output file is never edited, so later fixture edits cannot move the
// fingerprint. Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-corpus.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {cases,fixture,concrete,mowing,flatRoof} from '../engine-independent/fixtures.mjs';
import {explanationCases} from '../../test/customerExplanationFixtures.mjs';
import {measuredScopeCases} from '../../test/measuredScopeFixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {build} from '../qe-agent1-geometry-boundary-repair-20261019/fixtures.mjs';
import {carpet} from '../../test/quoteFlooring20261016Fixture.mjs';
import {input as roofSubtraction} from '../qe-roof-exact-subtraction-20261018/fixture.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url));
const rows=[];
const add=(id,input)=>rows.push({id,input:structuredClone(input)});

for(const row of cases())add('case:'+row.id,row.input);
explanationCases().forEach((row,index)=>add('explanation:'+(row.id||index),row.input));
for(const row of measuredScopeCases())add('scope:'+row.id,row.input);
for(const row of JSON.parse(gunzipSync(read('../everytrade-20261017/base-quotes.json.gz'))))add('everytrade:'+row.id,row.input);
for(const row of [...JSON.parse(read('../qe-agent1-arithmetic-boundaries-20261019/expected-cases-final.json')),...JSON.parse(read('../qe-agent1-geometry-boundary-repair-20261019/extended-expectations.json'))])add('geometry:'+row.id,build(row));
for(const row of JSON.parse(read('../qe-roof-exact-subtraction-20261018/expected-cases.json')))add('roof-subtraction:'+row.id,roofSubtraction(row));

// Targeted inputs for the October 29, 2026 audit fixes.
function roof(customer={},pricing={}){
  const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:2000},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},disposalPerSquare:3000,accessoryPricingMode:'per_square_allin',minimumJob:0,
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70,...pricing},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...customer});
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  return f;
}
for(const rise of [1,2,3,4,6])add('audit:roof-rise-'+rise,roof({pitchRisePer12:rise}));
add('audit:roof-under-four',roof({pitchBand:'under_four'}));
add('audit:roof-steep-two-layers',roof({pitchBand:'ten_to_twelve',existingLayers:2}));
add('audit:roof-area-split',roof({pitchMethod:'area_by_pitch',pitchAreaUpTo6Sqft:1000,pitchArea7To9Sqft:600,pitchArea10To12Sqft:400}));
for(const [length,width] of [[40,10],[20,2],[20,20]])add(`audit:joints-${length}x${width}`,(()=>{const f=concrete();Object.assign(f.ownerPricing.pricing,{controlJointPricing:'excluded',controlJointSpacingFt:10,sawCutPerLF:100});Object.assign(f.customerInputs,{dimensionMethod:'exact',length,width});return f;})());
for(const rooms of [[{lengthFt:12,widthFt:12}],[{lengthFt:12,widthFt:14}],[{lengthFt:11,widthFt:14}],[{lengthFt:15,widthFt:15}]])add('audit:carpet-'+rooms.map(r=>r.lengthFt+'x'+r.widthFt).join('+'),carpet(rooms,12));
add('audit:carpet-two-rooms',carpet([{lengthFt:14,widthFt:12},{lengthFt:12,widthFt:10}],12,0,[[1],[2]]));
for(const [mode,taxable] of [['TAX_MATERIALS',true],['TAX_MATERIALS',false],['TAX_ALL',false]]){
  const f=mowing();Object.assign(f.businessDefaults,{taxMode:mode,taxPercent:8,minimumJobPrice:20000});f.ownerPricing.taxabilityByCategory.labor=taxable;
  add(`audit:minimum-tax-${mode}-${taxable}`,f);
}
for(const taxed of [true,false]){
  const f=offeringFixture('FENCING_INSTALL','installed');f.customerInputs.gates={};f.ownerPricing.pricing.offeringRates.installedFencePerLF=1000;
  Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:8});f.ownerPricing.taxabilityByCategory.material=taxed;
  add('audit:installed-share-material-'+taxed,f);
}
{const f=mowing();f.ownerPricing.feeRules.travel='always';f.businessDefaults.travelFee=2500;f.businessDefaults.travelZones=[{name:'Core',codes:['E2L'],charge:0},{name:'Outer',codes:['E2H'],charge:3500}];
  for(const postal of ['E2L 1A1','E2H 1A1','E3B 5A3']){f.customerInputs.postalCode=postal;add('audit:zone-'+postal,f);}}
add('audit:flat-roof',flatRoof());

writeFileSync(new URL('./corpus-inputs.json.gz',import.meta.url),gzipSync(JSON.stringify(rows)));
console.log(rows.length+' inputs');
