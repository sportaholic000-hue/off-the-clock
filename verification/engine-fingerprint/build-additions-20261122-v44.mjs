import {writeFileSync} from 'node:fs';
import {fixture} from '../engine-independent/fixtures.mjs';

// November 22, 2026 (v44): a low-slope roof where one self-adhered layer
// replaces the regular underlayment asks for no roll confirmation.
const cases=[];
const add=(id,input)=>cases.push({id:'v44-20261122:'+id,input:structuredClone(input)});
const O=f=>f.ownerPricing;
const roof=(c={},p={})=>{const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:50000},materialCostPerSquare:{asphalt_shingle:30000},tearOffPerSquare:{asphalt_shingle:10000},minimumJob:0,accessoryPricingMode:'per_square_allin',...p},
  {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...c});
  O(f).startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};return f;};
const rolls={underlaymentPriceBasis:{asphalt_shingle:'cost'},scopeDetails:{roof_underlayment_asphalt_shingle:{description:'[SYNTHETIC] Explicitly defined roof_underlayment_asphalt_shingle',mode:'package_cost',productKey:'roof_roll',coverage:500,wastePercent:10}},scopeRates:{roof_underlayment_asphalt_shingle:15000}};
const selfAdhered={lowSlopeAssemblyByProduct:{asphalt_shingle:'self_adhered_underlayment'},selfAdheredUnderlaymentPerSquare:9000};
const low={pitchBand:'under_four',pitchRisePer12:3};
for(const rise of [2,3,3.99,4,5])add('roof-rolls-self-adhered-rise-'+rise+'-unconfirmed',roof({pitchBand:rise<4?'under_four':'up_to_six',pitchRisePer12:rise},{...rolls,...selfAdhered}));
add('roof-rolls-self-adhered-3-12-stale-confirmation',roof({...low,roofUnderlaymentScopeConfirmed:true},{...rolls,...selfAdhered}));
{const f=roof(low,{...rolls,...selfAdhered});delete O(f).pricing.underlaymentPerSquare;add('roof-rolls-self-adhered-3-12-no-per-square-price',f);}
{const f=roof(low,{underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},...selfAdhered});delete O(f).pricing.underlaymentPerSquare;add('roof-per-square-self-adhered-3-12-no-per-square-price',f);}
add('roof-rolls-two-layers-3-12-unconfirmed',roof(low,{...rolls,lowSlopeAssemblyByProduct:{asphalt_shingle:'double_underlayment'}}));
writeFileSync(new URL('./corpus-additions-20261122-v44.json',import.meta.url),JSON.stringify(cases,null,2)+'\n');
console.log(cases.length);
