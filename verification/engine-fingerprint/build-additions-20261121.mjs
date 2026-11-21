// Hand calculations for these immutable inputs live in test/qeAuditPricingV38.spec.mjs.
import {writeFileSync} from 'node:fs';
import {fixture,mowing,concrete} from '../engine-independent/fixtures.mjs';

const rows=[];
const add=(id,input)=>rows.push({id:'audit-20261121:'+id,input:structuredClone(input)});

const paint=fixture('INTERIOR_PAINTING',{
  laborPerWallSqftPerCoat:75,materialPerWallSqftPerCoat:30,minimumJob:0,ceilingLaborPerSqftPerCoat:60,ceilingMaterialPerSqftPerCoat:20,
  trimLaborPerLF:150,trimMaterialPerLF:10,paintingSettings:{wallAdditionalCoatRatio:0.8,ceilingAdditionalCoatRatio:0.8,trimAdditionalCoatRatio:0.33}
},{areaInputMethod:'wall_sqft',wallAreaSqft:384,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:1,ceilingsIncluded:true,
  ceilingAreaSqft:144,ceilingCoats:1,ceilingSurfaceCondition:'good',trimIncluded:true,trimLengthLF:100,trimCoats:1,trimSurfaceCondition:'good'});
paint.ownerPricing.priceBasisByCategory.material='sell_price';add('one-coat',paint);

const sod=fixture('LANDSCAPING_SOD',{sodMaterialPerSqft:85,sodInstallLaborPerSqft:45,minimumServiceCharge:0,groundPrepPerSqft:150,sodGradingPerSqft:60},
  {sodSqft:1000,sqftMethod:'exact',groundPrepNeeded:true,existingLawnToRemove:true,slope:'flat',accessDifficulty:'easy'});
add('sod-lawn',sod);sod.customerInputs.existingLawnToRemove=false;add('sod-bare',sod);

const minimum=mowing();
Object.assign(minimum.businessDefaults,{travelFee:15000,permitFee:20000,minimumJobPrice:60000,minimumFeeTreatment:'travel_permit_on_top'});
Object.assign(minimum.ownerPricing.feeRules,{travel:'always',permit:'always'});add('minimum-on-top',minimum);

const accent=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0,
  scopeDetails:{paint_wall:{description:'[SYNTHETIC] Wall paint',mode:'package_cost',productKey:'paint',coverage:400,wastePercent:10}},scopeRates:{paint_wall:5000}},
  {areaInputMethod:'wall_sqft',wallAreaSqft:400,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false,
   doorCount:2,windowCount:2,paintProductsConfirmed:true,wallColorCount:2,wallColorAreas:[{areaSqft:300},{areaSqft:30}]});
add('accent-wall',accent);

const slab=concrete();
Object.assign(slab.customerInputs,{length:20,width:20,baseNeeded:false,chuteAccess:'yes'});
slab.ownerPricing.pricing.readyMixOrderIncrementCubicYards=0.25;delete slab.ownerPricing.pricing.partialPackagePricing;
slab.businessDefaults.businessCountry='CA';add('ready-mix-unstated',slab);

const cleanup=fixture('LANDSCAPING_CLEANUP',{cleanupBaseRatePerSqft:30,minimumServiceCharge:0,haulAwayFee:10000,disposalPerBag:300,disposalPerLoad:6000,
  zeroWasteHaulAway:'haul_away_only',debrisPricing:{light:{laborMultiplier:1,disposalFlat:5000},moderate:{laborMultiplier:1.2,disposalFlat:5000},heavy:{laborMultiplier:1.5,disposalFlat:5000}}},
  {yardSqft:1000,sqftMethod:'exact',debrisLevel:'light',slope:'flat',haulAway:true,wasteBags:0});
add('cleanup-haul-only',cleanup);

writeFileSync(new URL('./corpus-additions-20261121.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
