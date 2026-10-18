import {fixture} from '../engine-independent/fixtures.mjs';
export const OLD_VERSION='quote-engine-vnext-accuracy-20261018-v8';
export const NEW_VERSION='quote-engine-vnext-accuracy-20261018-v9';
export function roof(customer={},pricing={}){
  const f=fixture('ROOFING_REPLACEMENT',{
    laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:10000},
    tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:100},
    underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},
    installedLaborPercent:{'underlaymentPerSquare.asphalt_shingle':0},
    installedMaterialsPercent:{'underlaymentPerSquare.asphalt_shingle':100},
    disposalPerSquare:2000,accessoryPricingMode:'per_square_allin',minimumJob:0,
    pitchInstallationAdderOverTwelve:.5,pitchRemovalAdderOverTwelve:.6,
    unknownPitchBand:'seven_to_nine',...pricing
  },{
    roofSizeMethod:'roof_measured',roofSizeInput:1000,existingRoofType:'asphalt_shingle',
    replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'ten_to_twelve',
    stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...customer
  });
  f.ownerPricing.priceBasisByCategory.material='sell_price';
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  if(f.customerInputs.pitchMethod!=='whole_roof')delete f.customerInputs.pitchBand;
  return f;
}
export const pitchBands=[
  {band:'seven_to_nine',install:40000,remove:20800,positive:451800},
  {band:'ten_to_twelve',install:62000,remove:32800,positive:485800},
  {band:'over_twelve',install:100000,remove:48000,positive:539000}
];
export function setAdder(f,band,kind,value){
  const p=f.ownerPricing.pricing,key=kind==='install'?'pitchInstallationAdder':'pitchRemovalAdder';
  if(band==='over_twelve')p[key+'OverTwelve']=value;
  else p[key][band]=value;
}
export const total=q=>q.lineItems.reduce((sum,line)=>sum+line.amountCents,0);
