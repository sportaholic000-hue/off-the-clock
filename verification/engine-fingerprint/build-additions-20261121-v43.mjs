import {writeFileSync} from 'node:fs';
import {fixture,mowing,flooring} from '../engine-independent/fixtures.mjs';

// November 21, 2026 (v43): the smaller items from the audits of v41.
const cases=[];
const add=(id,input)=>cases.push({id:'v43-20261121:'+id,input:structuredClone(input)});
const D=f=>f.businessDefaults,O=f=>f.ownerPricing;

// Low-slope roofs with underlayment bought by the roll.
const roofRolls=(c={},p={})=>{const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:50000},materialCostPerSquare:{asphalt_shingle:30000},tearOffPerSquare:{asphalt_shingle:10000},underlaymentPriceBasis:{asphalt_shingle:'cost'},minimumJob:0,accessoryPricingMode:'per_square_allin',
    scopeDetails:{roof_underlayment_asphalt_shingle:{description:'[SYNTHETIC] Explicitly defined roof_underlayment_asphalt_shingle',mode:'package_cost',productKey:'roof_roll',coverage:500,wastePercent:10}},scopeRates:{roof_underlayment_asphalt_shingle:15000},...p},
  {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',roofUnderlaymentScopeConfirmed:true,...c});
  O(f).startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};return f;};
const low={pitchBand:'under_four',pitchRisePer12:3};
add('roof-rolls-5-12',roofRolls());
add('roof-rolls-3-12-two-layers',roofRolls(low,{lowSlopeAssemblyByProduct:{asphalt_shingle:'double_underlayment'}}));
add('roof-rolls-3-12-two-layers-2050',roofRolls({...low,roofSizeInput:2050},{lowSlopeAssemblyByProduct:{asphalt_shingle:'double_underlayment'}}));
add('roof-rolls-3-12-self-adhered',roofRolls(low,{lowSlopeAssemblyByProduct:{asphalt_shingle:'self_adhered_underlayment'},selfAdheredUnderlaymentPerSquare:9000}));
add('roof-rolls-3-12-self-adhered-unpriced',roofRolls(low,{lowSlopeAssemblyByProduct:{asphalt_shingle:'self_adhered_underlayment'}}));

// The busy-season note on each mowing visit's own price.
for(const minimum of [0,12000,40000]){const f=mowing();delete O(f).peakMonths;delete O(f).peakSurchargePercent;Object.assign(D(f),{peakMonths:[5,6,7,8],peakSurchargePercent:10});O(f).pricing.minimumServiceCharge=minimum;Object.assign(f.customerInputs,{serviceFrequency:'weekly',grassCondition:'overgrown'});delete f.customerInputs.workMonth;add('mowing-first-visit-season-minimum-'+minimum,f);}

// One ceiling line for rooms of one height.
{const room=coats=>({lengthFeet:12,widthFeet:12,heightFeet:8,doorCount:1,windowCount:1,coats});
 const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:75,materialPerWallSqftPerCoat:20,ceilingLaborPerSqftPerCoat:60,ceilingMaterialPerSqftPerCoat:20,trimLaborPerLF:150,trimMaterialPerLF:25,minimumJob:0},
   {areaInputMethod:'room_dimensions',rooms:[room(2),room(3)],wallHeight:'standard',surfaceCondition:'good',coats:2,ceilingsIncluded:true,ceilingCoats:1,ceilingSurfaceCondition:'good',trimIncluded:false});
 O(f).priceBasisByCategory.material='sell_price';add('painting-two-rooms-coats-2-and-3',f);}

// Herringbone priced with the book's own additions (starting values are adopted by the owner, not read at quote time).
{const f=flooring('vinyl_plank',700);Object.assign(f.customerInputs,{roomCount:2,layoutPattern:'herringbone_or_chevron'});Object.assign(O(f).pricing,{herringboneWasteAdderByType:{vinyl_plank:0.07},herringboneLaborMultiplierByType:{vinyl_plank:1.75}});O(f).startingValueAdoptions={...(O(f).startingValueAdoptions||{}),flooring_patterns_20261017:{mode:'adopted'}};add('flooring-herringbone-vinyl-plank-7-points',f);}
writeFileSync(new URL('./corpus-additions-20261121-v43.json',import.meta.url),JSON.stringify(cases,null,2)+'\n');
console.log(cases.length);
