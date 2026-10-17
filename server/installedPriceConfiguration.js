import {FLAT_ROOF_ITEMS,REPAIR_SERVICES,repairUnitRows,repairRatePaths,hasSurfacePrice,remainingMaterialsShare} from './quote-engine-vnext/flatRoofRepairPricing.js';
import {offeringRateDefinitions} from './quote-engine-vnext/configuredOfferings.js';
import {scopeRateDefinitions} from './scopeConfiguration.js';
import {FLOORING_ADDONS,pricePresent} from './quote-engine-vnext/flooringPricing.js';

// Installed bundles, not ordinary material selling rates or package purchases.
export function installedPriceDefinitions(type,p={}) {
  const fields={};
  if(type==='FLAT_ROOF_REPLACEMENT')for(const item of FLAT_ROOF_ITEMS)if(hasSurfacePrice(p[item.rate])&&(item.field!=='deckSheets'||p.flatRoofDeckPriceBasis==='installed'))fields[item.rate]=item.label;
  if(REPAIR_SERVICES.includes(type))for(const {material,repair} of repairUnitRows(p))for(const path of repairRatePaths(type,{roofType:material,membraneType:material,sidingType:material,repairType:repair,damageLevel:repair},p))fields[path]=material.replaceAll('_',' ')+' '+repair.replaceAll('_',' ')+' '+(path.startsWith('repairAreaMinimum.')?'minimum':'unit price');
  for(const key of Object.keys(p.offeringRates||{})) {
    const active=key.startsWith('gate_')&&Object.hasOwn(p.offeringDetails?.gates||{},key.slice(5))
      ||key==='removalPerLF'&&p.offeringDetails?.removalOffered
      ||key==='installedTrimPerLF'&&p.offeringDetails?.trimOffered
      ||p.offeringMode==='installed'&&(key==='installedFencePerLF'||key==='installedWallPerSqft'||key==='installedCeilingPerSqft'&&p.offeringDetails?.ceilingsOffered);
    if(active&&positiveInstalledPrice(p.offeringRates[key]))fields['offeringRates.'+key]=offeringRateDefinitions(type,p)[key]?.label||key.replaceAll('_',' ');
  }
  if(type==='ROOFING_REPLACEMENT')for(const [key,basis] of Object.entries(p.underlaymentPriceBasis||{}))if(basis==='installed_area_sell_price'&&positiveInstalledPrice(p.underlaymentPerSquare?.[key]))fields['underlaymentPerSquare.'+key]=key.replaceAll('_',' ')+' installed roof underlayment';
  if(type==='ROOFING_REPLACEMENT'&&p.deckingPriceBasis==='installed'&&positiveInstalledPrice(p.deckingPerSheet))fields.deckingPerSheet='Installed decking replacement';
  // Zero rates still need valid free/included classification at the pricing
  // boundary. They carry no separate installed amount to allocate for tax.
  if(type.startsWith('FLOORING_')&&p.underlaymentPriceBasis==='installed_area_sell_price'&&positiveInstalledPrice(p.underlaymentPerSqft))fields.underlaymentPerSqft='Installed vinyl-plank underlayment';
  if(type.startsWith('FLOORING_'))for(const addon of FLOORING_ADDONS)if(addon.installed&&pricePresent(p[addon.rate]))fields[addon.rate]=addon.label;
  for(const [key,definition] of Object.entries(scopeRateDefinitions(type,p)))if((key.endsWith('_installed')||p.scopeDetails?.[definition.scopeKey]?.mode==='installed_area_sell_price')&&positiveInstalledPrice(p.scopeRates?.[key]))fields['scopeRates.'+key]=definition.label;
  return fields;
}

// Allocation percentages describe how a billed installed amount is split.
// Exact zero has no amount to split. Keep every finite positive rate here,
// including a fractional-cent unit rate that may round to zero for a tiny job;
// its positive pricing semantics and allocation requirements must not change.
function positiveInstalledPrice(value) {
  return typeof value==='number'&&Number.isFinite(value)&&value>0;
}

export function installedLaborFactorPath(type,c,ratePath) {
  // Wall height changes wall and ceiling labor, never separately measured trim.
  if(type==='INTERIOR_PAINTING'&&ratePath==='offeringRates.installedTrimPerLF')return null;
  if(type.startsWith('FENCING_'))return 'terrainLaborMultiplier.'+c.terrainSlope;
  if(type==='INTERIOR_PAINTING')return 'wallHeightLaborMultiplier.'+c.wallHeight;
  if(type==='EXTERIOR_PAINTING')return 'storyMultiplier.'+c.stories;
  return null;
}

// These new installed prices explicitly split the whole charge between labor
// and material. Historical installed-price allocations keep their old rules.
export function repairOrDeckInstalled(type,path,p){
  return type==='FLAT_ROOF_REPLACEMENT'&&path==='flatRoofDeckPerSheet'&&p.flatRoofDeckPriceBasis==='installed'||REPAIR_SERVICES.includes(type)&&/^(repairUnitPrice|repairAreaMinimum)\./.test(path);
}
export function installedMaterialsShare(type,p,path){
  const labor=p.installedLaborPercent?.[path];
  return repairOrDeckInstalled(type,path,p)&&typeof labor==='number'?remainingMaterialsShare(labor):p.installedMaterialsPercent?.[path];
}
