import {exactAdd,exactMultiply,exactFromEvidence} from './exactMath.js';

// Adjust the measured component before its one line-level cent rounding. Fixed
// allowances, installed prices and purchased package quantities are excluded.
export function tradeAdjustment(type,c,p,line) {
  const path=line.calculation?.ratePath;
  if(line.calculation?.evidenceVariant!=='quantity_rate')return null;
  let wastePath=null,factorPath=null;
  if(type==='ROOFING_REPLACEMENT'&&['starterPerLF','dripEdgePerLF','ridgeCapPerLF'].includes(path))wastePath='accessoryWasteFactor.'+path;
  if(type==='FLAT_ROOF_REPLACEMENT'&&path?.startsWith('membraneCostPerSqft.'))wastePath='membraneWasteFactor';
  if(type.startsWith('FENCING_')&&path==='offeringRates.fenceMaterialPerLF')wastePath='fenceWasteFactor';
  if(type.startsWith('CONCRETE_')){
    if(path==='wireReinforcementPerSqft')wastePath='reinforcementWasteFactor.wire_mesh';
    if(path==='rebarReinforcementPerSqft')wastePath='reinforcementWasteFactor.rebar';
    if(path==='stampedMaterialPerSqft')wastePath='stampedMaterialWasteFactor';
  }
  if(['INTERIOR_PAINTING','EXTERIOR_PAINTING'].includes(type)){
    if(['materialPerWallSqftPerCoat','ceilingMaterialPerSqftPerCoat','trimMaterialPerLF','materialPerSqftPerCoat'].includes(path)||/^offeringRates.(wallMaterial|ceilingMaterial)/.test(path))wastePath='paintWasteFactor';
    if(/^offeringRates.(primerMaterial|ceilingPrimerMaterial)/.test(path))wastePath='primerWasteFactor';
    if(/^offeringRates.prepMaterial/.test(path))wastePath='prepMaterialWasteFactor';
    if((line.category==='labor'||line.category==='prep')&&(path.startsWith('offeringRates.')||path==='ceilingLaborPerSqftPerCoat')){
      if(type==='EXTERIOR_PAINTING')factorPath='storyMultiplier.'+c.stories;
      else if(!line.calculation.multipliers.some(m=>m.path?.startsWith('wallHeightLaborMultiplier.')))factorPath='wallHeightLaborMultiplier.'+c.wallHeight;
    }
  }
  if(type.startsWith('FLOORING_')&&path?.startsWith('laborPerSqft.'))factorPath='layoutLaborMultiplier.'+c.layoutPattern;
  if(type.startsWith('FENCING_')&&line.category==='labor')factorPath='terrainLaborMultiplier.'+c.terrainSlope;
  if(['FLAT_ROOF_REPAIR','LANDSCAPING_MULCH','LANDSCAPING_PLANTING'].includes(type)&&line.category==='labor')factorPath='accessMultiplier.'+c.accessDifficulty;
  if(!wastePath&&!factorPath)return null;
  const value=key=>key.split('.').reduce((object,key)=>object?.[key],p);
  const quantity=exactFromEvidence(line.calculation.exactQuantity);
  return {
    quantity:wastePath?exactMultiply(quantity,exactAdd(1,value(wastePath))):quantity,
    multipliers:[...line.calculation.multipliers,...(factorPath?[{name:'Labor adjustment',path:factorPath,value:value(factorPath)}]:[])],
    wastePath,waste:wastePath?value(wastePath):null,originalQuantity:line.calculation.quantity
  };
}
