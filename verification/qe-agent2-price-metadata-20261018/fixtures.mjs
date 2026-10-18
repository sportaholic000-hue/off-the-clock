import {randomUUID} from 'node:crypto';
import {fixture} from '../engine-independent/fixtures.mjs';
import {synchronizeDependentLinesVNext,roofFlashingVentDefinitionVNext} from '../../server/quote-engine-vnext/priceGroundwork.js';

// Handwritten expectations. Do not derive these categories/kinds from the
// production enumerator or its definitions: this is the independent oracle.
export const PAINTING_EXPECTED = {
  primerLaborPerSqftPerCoat:'labor',primerMaterialPerSqftPerCoat:'material',
  ceilingPrimerLaborPerSqftPerCoat:'labor',ceilingPrimerMaterialPerSqftPerCoat:'material',
  trimLaborPerLFPerCoat:'labor',trimMaterialPerLFPerCoat:'material',
  trimPrimerLaborPerLFPerCoat:'labor',trimPrimerMaterialPerLFPerCoat:'material',
  trimPrepLaborPerLF_good:'prep',trimPrepMaterialPerLF_good:'material',
  trimPrepLaborPerLF_fair:'prep',trimPrepMaterialPerLF_fair:'material',
  trimPrepLaborPerLF_poor:'prep',trimPrepMaterialPerLF_poor:'material'
};
export const SURFACES = [
  {type:'INTERIOR_PAINTING',painting:true,extras:{doorSides:'fixed_amount',doorFrames:'fixed_amount',windows:'fixed_amount',cabinetFaces:'fixed_amount'},control:'materialPerWallSqftPerCoat'},
  {type:'EXTERIOR_PAINTING',painting:true,extras:{windows:'fixed_amount',doors:'fixed_amount',shutters:'fixed_amount',garageDoors:'fixed_amount',exteriorTrim:'unit_rate',soffit:'unit_rate',fascia:'unit_rate',powerWashing:'unit_rate'},control:'materialPerSqftPerCoat'},
  ...['linear_feet','square_feet'].map(unit=>({type:'SIDING_REPLACEMENT',unit,extras:{soffit:'unit_rate',fascia:'unit_rate'},control:'materialPerSqft.vinyl'}))
];
export const ROOF_EXPECTED = [
  ['iceWaterBarrierPerSqft','material','unit_rate'],['iceWaterBarrierPerLF','material','unit_rate'],
  ['valleyPerLF','material','unit_rate'],['stepFlashingPerLF','material','unit_rate'],
  ['pipeJackEach','material','fixed_amount'],['ridgeVentPerLF','material','unit_rate']
];
export const CONCRETE_EXPECTED = [
  ['shortLoadPerYard','material','unit_rate'],['shortLoadFlatFee','material','fixed_amount'],
  ['sawCutPerLF','labor','unit_rate'],['baseGravelPerCubicYard','material','unit_rate'],
  ['baseExcavationGradingPerSqft','labor','unit_rate'],['placementFlat.pump','addon','fixed_amount'],
  ['placementPerCubicYard.pump','addon','unit_rate']
];
export const SOD_EXPECTED = [['sodGradingPerSqft','labor','unit_rate'],['topsoilPerCubicYard','material','unit_rate']];
export const F21_CASES = [
  {type:'ROOFING_REPLACEMENT',rows:ROOF_EXPECTED,control:'materialCostPerSquare.asphalt_shingle',settings:{iceWaterBarrierUnit:'linear_feet',pitchInstallationAdderOverTwelve:0.5}},
  ...['CONCRETE_PATIO_SLAB','CONCRETE_DRIVEWAY'].map(type=>({type,rows:CONCRETE_EXPECTED,control:'concreteCostPerCubicYard',settings:{shortLoadThresholdCubicYards:5,baseDepthInches:4,baseCompactionAllowance:0.2,controlJointPricing:'excluded',controlJointSpacingFt:10}})),
  {type:'LANDSCAPING_SOD',rows:SOD_EXPECTED,control:'sodMaterialPerSqft',settings:{topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:2}}
];
export const OLD='2026-07-10T12:00:00.000Z',NOW='2026-10-18T12:00:00.000Z',LATER='2026-10-19T12:00:00.000Z';
export const clock=instant=>()=>new Date(instant);
export function setPath(object,path,value){const keys=path.split('.');for(const key of keys.slice(0,-1))object=object[key]??={};object[keys.at(-1)]=value;}
export function getPath(object,path){return path.split('.').reduce((value,key)=>value?.[key],object);}
export const keyFor=(scope,path)=>scope==='service'?path:'tiers.0.overrides.'+path;
export function surfaceRows(spec){return [
  ...Object.entries(spec.painting?PAINTING_EXPECTED:{}).map(([path,category])=>['paintingRates.'+path,category,'unit_rate']),
  ...Object.entries(spec.extras).map(([path,kind])=>['surfaceExtraRates.'+path,'addon',kind,'sell_price'])
];}
export function metadataFixture(spec,rows,source='MANUAL'){
  const pricing=structuredClone(spec.settings||{}),overrides={};
  if(spec.unit)pricing.sidingSettings={soffitUnit:spec.unit};
  for(const [path,,kind] of rows){
    setPath(pricing,path,kind==='fixed_amount'?1234:123.45);
    setPath(overrides,path,kind==='fixed_amount'?2345:234.56);
  }
  setPath(pricing,spec.control,345.67);setPath(overrides,spec.control,456.78);
  return {id:randomUUID(),serviceType:spec.type,service:'[SYNTHETIC] Agent 2 metadata',source,active:false,
    pricing,tiers:[{name:'[SYNTHETIC] Explicit tier',overrides},{name:'[SYNTHETIC] Inherited tier',overrides:{}}],
    priceBasisByCategory:{material:'cost',labor:'cost',prep:'cost',addon:'cost'}};
}
export const withControl=(spec,rows)=>[...rows,[spec.control,'material','unit_rate']];
export const scopes=['service','tier'];
export function targetFor(service,scope){return scope==='service'?service:service.tiers[0];}
export function pricesFor(service,scope){return scope==='service'?service.pricing:service.tiers[0].overrides;}
export const noteFor=(scope,path)=>'[SYNTHETIC] '+scope+' source for '+path;
export function attachNotes(service,rows,date){
  for(const scope of scopes)targetFor(service,scope).priceMetadata=Object.fromEntries(rows.map(([path])=>[path,{sourceNote:noteFor(scope,path),...(date?{changedAt:date}:{})}]));
  return service;
}

export function roofFixture(unit='linear_feet'){
  const f=fixture('ROOFING_REPLACEMENT',{
    laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:15000},
    tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:1000},
    underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},
    disposalPerSquare:2000,accessoryPricingMode:'itemized',minimumJob:0,
    materialAccessoryBasis:'excludes_itemized_accessories_flashing_vents',iceWaterBarrierUnit:unit,
    iceWaterBarrierPerSqft:100.5,iceWaterBarrierPerLF:100.5,valleyPerLF:100.5,
    stepFlashingPerLF:100.5,pipeJackEach:101,ridgeVentPerLF:100.5,
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},
    pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},
    complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70
  },{
    roofSizeMethod:'roof_measured',roofSizeInput:1000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',
    pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',
    starterLengthLF:0,dripEdgeLengthLF:0,ridgeCapLengthLF:0,
    [unit==='square_feet'?'iceWaterBarrierSqft':'iceWaterBarrierLengthLF']:3,
    valleyLengthLF:3,stepFlashingLengthLF:3,pipeJackCount:3,ridgeVentLengthLF:3
  });
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  const definition=roofFlashingVentDefinitionVNext('asphalt_shingle');
  f.ownerPricing=synchronizeDependentLinesVNext(f.ownerPricing,[definition],{
    ownerId:f.ownerPricing.origin.ownerId,reenteredIds:[definition.id],confirmIds:[definition.id],now:NOW
  });
  return f;
}
