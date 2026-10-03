import {scopeRateDefinitions} from './scopeConfiguration.js';

// Installed bundles, not ordinary material selling rates or package purchases.
export function installedPriceDefinitions(type,p={}) {
  const fields={};
  for(const key of Object.keys(p.offeringRates||{})) {
    const active=key.startsWith('gate_')&&Object.hasOwn(p.offeringDetails?.gates||{},key.slice(5))
      ||key==='removalPerLF'&&p.offeringDetails?.removalOffered
      ||key==='installedTrimPerLF'&&p.offeringDetails?.trimOffered
      ||p.offeringMode==='installed'&&(key==='installedFencePerLF'||key==='installedWallPerSqft'||key==='installedCeilingPerSqft'&&p.offeringDetails?.ceilingsOffered);
    if(active)fields['offeringRates.'+key]=key.replace(/^installed/,'').replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ');
  }
  if(type==='ROOFING_REPLACEMENT')for(const [key,basis] of Object.entries(p.underlaymentPriceBasis||{}))if(basis==='installed_area_sell_price')fields['underlaymentPerSquare.'+key]=key.replaceAll('_',' ')+' installed roof underlayment';
  if(type.startsWith('FLOORING_')&&p.underlaymentPriceBasis==='installed_area_sell_price')fields.underlaymentPerSqft='Installed vinyl-plank underlayment';
  for(const [key,definition] of Object.entries(scopeRateDefinitions(type,p)))if(key.endsWith('_installed')||p.scopeDetails?.[definition.scopeKey]?.mode==='installed_area_sell_price')fields['scopeRates.'+key]=definition.label;
  return fields;
}

export function installedLaborFactorPath(type,c) {
  if(type.startsWith('FENCING_'))return 'terrainLaborMultiplier.'+c.terrainSlope;
  if(type==='INTERIOR_PAINTING')return 'wallHeightLaborMultiplier.'+c.wallHeight;
  if(type==='EXTERIOR_PAINTING')return 'storyMultiplier.'+c.stories;
  return null;
}
