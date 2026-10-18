import {fixture} from '../engine-independent/fixtures.mjs';

export const scopeKey='roof_underlayment_asphalt_shingle';
export function roofFixture({mode='adopted',customer={},pricing={}}={}) {
  const f=fixture('ROOFING_REPLACEMENT',{
    laborPerSquare:{asphalt_shingle:10000},materialCostPerSquare:{asphalt_shingle:10000},
    tearOffPerSquare:{asphalt_shingle:1000},underlaymentPriceBasis:{asphalt_shingle:'cost'},
    accessoryPricingMode:'per_square_allin',minimumJob:0,unknownPitchBand:'seven_to_nine',
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},
    pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},
    complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70,
    scopeDetails:{[scopeKey]:{description:'[SYNTHETIC] Roof underlayment rolls.',mode:'package_cost',productKey:'synthetic_roof_roll',coverage:500,wastePercent:10}},
    scopeRates:{[scopeKey]:15000},...pricing
  },{
    roofSizeMethod:'footprint',roofSizeInput:1500,pitchRisePer12:12,
    existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',
    pitchMethod:'whole_roof',pitchBand:'ten_to_twelve',stories:1,existingLayers:1,
    roofComplexity:'simple',serviceScope:'full',roofUnderlaymentScopeConfirmed:true,...customer
  });
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode}};
  return f;
}
