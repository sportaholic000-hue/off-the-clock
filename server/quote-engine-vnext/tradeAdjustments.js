import {exactAdd,exactMultiply,exactFromEvidence} from './exactMath.js';
import {flooringLayoutValue} from './flooringPricing.js';
import {boardSizeOf} from './flatRoofRepairPricing.js';
import {purchasedQuantityVNext} from './scopePricing.js';
import {ACCESSORY_PACKAGE_FIELDS} from './contracts.js';
import {infillRollLF} from './configuredOfferings.js';

// A waste-adjusted quantity is no longer the measured quantity; say so in its unit.
export const wasteAdjustedUnit=unit=>typeof unit!=='string'||/^waste-adjusted /.test(unit)?unit:'waste-adjusted '+unit.replace(/^measured /,'');

// Adjust the measured component before its one line-level cent rounding. Fixed
// allowances, installed prices and purchased package quantities are excluded.
export function tradeAdjustment(type,c,p,line) {
  const path=line.calculation?.ratePath;
  if(line.calculation?.evidenceVariant!=='quantity_rate')return null;
  let wastePath=null,factorPath=null;
  if(type==='ROOFING_REPLACEMENT'&&['starterPerLF','dripEdgePerLF','ridgeCapPerLF'].includes(path))wastePath='accessoryWasteFactor.'+path;
  if(type==='FLAT_ROOF_REPLACEMENT'&&path?.startsWith('membraneCostPerSqft.'))wastePath='membraneWasteFactor';
  // Itemized insulation and cover board material only: never their labor or an installed price.
  if(type==='FLAT_ROOF_REPLACEMENT'&&/^scopeRates\.(?:insulation|coverboard)_material$/.test(path||''))wastePath='insulationWasteFactor';
  if(type.startsWith('FENCING_')&&path==='offeringRates.fenceMaterialPerLF')wastePath='fenceWasteFactor';
  if(type.startsWith('CONCRETE_')){
    if(path==='wireReinforcementPerSqft')wastePath='reinforcementWasteFactor.wire_mesh';
    if(path==='rebarReinforcementPerSqft')wastePath='reinforcementWasteFactor.rebar';
    if(path==='stampedMaterialPerSqft')wastePath='stampedMaterialWasteFactor';
  }
  if(['INTERIOR_PAINTING','EXTERIOR_PAINTING'].includes(type)){
    if(/^paintingRates\.trimMaterial/.test(path))wastePath='paintWasteFactor';
    if(/^paintingRates\.(?:primerMaterial|ceilingPrimerMaterial|trimPrimerMaterial)/.test(path))wastePath='primerWasteFactor';
    if(/^paintingRates\.trimPrepMaterial/.test(path))wastePath='prepMaterialWasteFactor';
    if(['materialPerWallSqftPerCoat','ceilingMaterialPerSqftPerCoat','trimMaterialPerLF','materialPerSqftPerCoat'].includes(path)||/^offeringRates.(wallMaterial|ceilingMaterial)/.test(path))wastePath='paintWasteFactor';
    if(/^offeringRates.(primerMaterial|ceilingPrimerMaterial)/.test(path))wastePath='primerWasteFactor';
    if(/^offeringRates.prepMaterial/.test(path))wastePath='prepMaterialWasteFactor';
    if((line.category==='labor'||line.category==='prep')&&(path.startsWith('offeringRates.')||path==='ceilingLaborPerSqftPerCoat'||/^paintingRates\.(?:primerLabor|ceilingPrimerLabor)/.test(path))){
      if(type==='EXTERIOR_PAINTING')factorPath='storyMultiplier.'+c.stories;
      else if(!line.calculation.multipliers.some(m=>m.path?.startsWith('wallHeightLaborMultiplier.')))factorPath='wallHeightLaborMultiplier.'+c.wallHeight;
    }
  }
  const flooringFactor=type.startsWith('FLOORING_')&&path?.startsWith('laborPerSqft.')?flooringLayoutValue(c,p,'labor'):null;
  if(flooringFactor)factorPath=flooringFactor.path;
  if(type.startsWith('FENCING_')&&line.category==='labor')factorPath='terrainLaborMultiplier.'+c.terrainSlope;
  if(['FLAT_ROOF_REPAIR','LANDSCAPING_MULCH','LANDSCAPING_PLANTING'].includes(type)&&line.category==='labor')factorPath='accessMultiplier.'+c.accessDifficulty;
  if(!wastePath&&!factorPath)return null;
  const value=key=>key.split('.').reduce((object,key)=>object?.[key],p);
  const quantity=exactFromEvidence(line.calculation.exactQuantity);
  const accessoryLength=type==='ROOFING_REPLACEMENT'&&ACCESSORY_PACKAGE_FIELDS[path]?p[ACCESSORY_PACKAGE_FIELDS[path]]:undefined;
  const board=wastePath==='insulationWasteFactor'?boardSizeOf(p,path.endsWith('coverboard_material')?'coverboard':'insulation'):typeof accessoryLength==='number'&&accessoryLength>0&&accessoryLength<=1000?accessoryLength:wastePath==='fenceWasteFactor'?infillRollLF(p):undefined;
  return {
    quantity:board!==undefined?purchasedQuantityVNext(quantity,value(wastePath),board).purchasedQuantity:wastePath?exactMultiply(quantity,exactAdd(1,value(wastePath))):quantity,
    multipliers:[...line.calculation.multipliers,...(factorPath?[{name:'Labor adjustment',path:factorPath,value:value(factorPath)}]:[])],
    ...(wastePath?{unit:wasteAdjustedUnit(line.calculation.unit)}:{}),
    wastePath,waste:wastePath?value(wastePath):null,originalQuantity:line.calculation.quantity
  };
}
