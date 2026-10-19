import {fixture,flooring,flatRoof,flatRepair,mowing,siding,custom} from '../engine-independent/fixtures.mjs';
import {concreteFixture,sodFixture,plantingFixture} from '../../test/quoteConcreteLandscape20261016Fixture.mjs';
import {cleanupFixture} from '../../test/landscapeLaneB20261016Fixture.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {carpet} from '../../test/quoteFlooring20261016Fixture.mjs';
import {roof} from '../qe-roof-zero-adjustments-20261018/fixture.mjs';
export function repair(type){
 if(type==='FLAT_ROOF_REPAIR')return flatRepair();
 if(type==='ROOFING_REPAIR')return fixture(type,{laborHourlyRate:100,repairMinimum:0,largeRepairMaxSqft:1000000,repairHours:{asphalt_shingle:{shingle_patch:{small:1.005,medium:1.005,large:1.005}}},repairMaterialAllowance:{asphalt_shingle:{shingle_patch:{small:1000,medium:1000,large:1000}}}},{repairType:'shingle_patch',affectedArea:10,roofType:'asphalt_shingle',pitch:'low',stories:1,leakPresent:false});
 return fixture(type,{laborHourlyRate:100,repairMinimum:0,largeRepairMaxSqft:1000000,repairHours:{vinyl:{minor:{small:1.005,medium:1.005,large:1.005}}},materialAllowance:{vinyl:{minor:{small:1000,medium:1000,large:1000}}}},{sidingType:'vinyl',damageLevel:'minor',affectedArea:10,stories:1});
}
export function build(row){
 const a=row.params,n=k=>Number(a[k]);let f,p,c;
 if(row.family.startsWith('floor-')){
  f=flooring('tile',row.family==='floor-half'?1:n('area'));p=f.ownerPricing.pricing;c=f.customerInputs;
  f.serviceType=f.ownerPricing.serviceType=f.ownerPricing.origin.serviceType=a.type;
  Object.assign(p,{laborPerSqft:{tile:row.family==='floor-half'?n('rate'):100},materialPerSqft:{tile:row.family==='floor-half'?n('rate'):row.family==='floor-carton'?123.45:100},wasteFactorByType:{...p.wasteFactorByType,tile:0},roomComplexityMultiplier:row.family==='floor-room'?{small:1.2,medium:1.1,large:1}:{small:1,medium:1,large:1}});
  if(row.family==='floor-carton')p.cartonCoverageSqft={tile:20};if(a.type==='FLOORING_REPLACEMENT')c.subfloorIssues=false;
 }else if(row.family.startsWith('concrete-')){
  f=concreteFixture(row.family==='concrete-line'?1:row.family==='concrete-increment'?n('area'):n('length'),row.family==='concrete-joint'?10:1);p=f.ownerPricing.pricing;c=f.customerInputs;
  f.serviceType=f.ownerPricing.serviceType=f.ownerPricing.origin.serviceType=a.type;
  Object.assign(p,{laborPerSqft:row.family==='concrete-line'?n('rate'):1,concreteCostPerCubicYard:row.family==='concrete-increment'?18000:324,formworkPerLF:100,concreteWasteFactor:0});delete p.readyMixOrderIncrementCubicYards;
  if(row.family==='concrete-line')p.finishMultiplier.broom=1.5;
  if(row.family==='concrete-increment'){Object.assign(p,{readyMixOrderIncrementCubicYards:1,shortLoadThresholdCubicYards:2,shortLoadPerYard:2000,placementPerCubicYard:{pump:1000}});c.chuteAccess='no';}
  if(row.family.includes('joint'))Object.assign(p,{controlJointPricing:'excluded',controlJointSpacingFt:10,sawCutPerLF:100});
  if(row.family==='concrete-square-joint'){delete c.length;delete c.width;Object.assign(c,{dimensionMethod:'measured_area_perimeter',areaSqft:n('area'),perimeterLF:100});}
 }else if(row.family==='sod-depth'){
  f=sodFixture();p=f.ownerPricing.pricing;c=f.customerInputs;Object.assign(p,{sodWasteFactor:0,topsoilPerCubicYard:5000,topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:1});Object.assign(c,{sodSqft:324,usableTopsoilDepthInches:n('existing')});
 }else if(row.family.startsWith('mulch-')){
  f=fixture('LANDSCAPING_MULCH',{mulchMaterialPerYard:{brown:5000},mulchInstallLaborPerYard:3000,minimumServiceCharge:0,mulchOverageFactor:1.15,mulchOrderIncrementCubicYards:{brown:.25}},{inputMethod:row.family==='mulch-stated'?'yards':'sqft',mulchArea:row.family==='mulch-stated'?n('qty'):n('area'),mulchDepth:3,mulchType:'brown',bedCondition:'clean',edgingNeeded:false,accessDifficulty:'easy'});
 if(row.family==='mulch-stated')delete f.customerInputs.mulchDepth;
 }else if(row.family==='cleanup-load'){
  f=cleanupFixture();f.customerInputs.yardSqft=n('area');
 }else if(row.family==='fence-span'){
  f=offeringFixture(a.type,'itemized');p=f.ownerPricing.pricing;c=f.customerInputs;Object.assign(p,{fenceWasteFactor:0,postSpacingLF:8});Object.assign(c,{linearFeet:n('length'),gates:{},oldFenceRemoval:false});delete c.removalLengthLF;if(a.type==='FENCING_INSTALL')delete c.oldFenceRemoval;
 }else if(row.family==='carpet-cut'){
  f=carpet([{lengthFt:n('side'),widthFt:n('side')}]);p=f.ownerPricing.pricing;delete f.customerInputs.sqft;Object.assign(p,{laborPerSqft:{carpet:100},roomComplexityMultiplier:{small:1,medium:1,large:1}});
 }else if(row.family==='paint-coats'){
  f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:n('rate'),materialPerWallSqftPerCoat:10,paintWasteFactor:0,minimumJob:0,paintingSettings:{wallAdditionalCoatRatio:.5}},{areaInputMethod:'wall_sqft',wallAreaSqft:1,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false});f.ownerPricing.priceBasisByCategory.material='sell_price';
 }else if(row.family==='paint-package'){
  f=offeringFixture(a.type,'itemized');p=f.ownerPricing.pricing;c=f.customerInputs;f.ownerPricing.priceBasisByCategory.material='cost';
  Object.assign(c,{[a.type==='INTERIOR_PAINTING'?'wallAreaSqft':'exteriorAreaSqft']:n('area'),ceilingsIncluded:false,trimIncluded:false,stories:1,paintProductsConfirmed:true});delete c.ceilingAreaSqft;delete c.trimLengthLF;
  Object.assign(p,{paintWasteFactor:0,primerWasteFactor:0,prepMaterialWasteFactor:0,scopeDetails:Object.fromEntries(['paint_wall','paint_primer','paint_prep'].map(key=>[key,{description:'[SYNTHETIC] '+key,mode:'package_cost',productKey:key,coverage:200,wastePercent:0}])),scopeRates:{paint_wall:4000,paint_primer:2000,paint_prep:1000}});
  if(a.type==='INTERIOR_PAINTING')delete c.stories;else{delete c.ceilingsIncluded;delete c.trimIncluded;}
 }else if(row.family==='siding-half'){
  f=siding();p=f.ownerPricing.pricing;Object.assign(p,{laborPerSqft:{vinyl:1},materialPerSqft:{vinyl:1},wasteFactorByType:{...p.wasteFactorByType,vinyl:0}});f.customerInputs.sidingAreaSqft=n('area');
 }else if(row.family.startsWith('repair-')){
  f=repair(a.type);p=f.ownerPricing.pricing;c=f.customerInputs;
  const m=c.roofType||c.membraneType||c.sidingType,k=c.repairType||c.damageLevel;
  if(row.family==='repair-hour'){
   p.laborHourlyRate=n('rate');for(const root of ['repairHours','patchRepairHours'])if(p[root])p[root][m][k]={small:1.005,medium:1.005,large:1.005};
   for(const root of ['repairMaterialAllowance','patchMaterialAllowance','materialAllowance'])if(p[root])p[root][m][k]={small:1000,medium:1000,large:1000};
  }else{
   c.affectedArea=n('area');Object.assign(p,{repairPricingUnit:{[m]:{[k]:'square_feet'}},repairFirstAreaSqft:{[m]:{[k]:10}},repairUnitPrice:{[m]:{[k]:100.5}},repairAreaMinimum:{[m]:{[k]:25000}},installedLaborPercent:{['repairUnitPrice.'+m+'.'+k]:60,['repairAreaMinimum.'+m+'.'+k]:60}});
  }
 }else if(row.family==='flat-partial'){
  f=flatRoof();p=f.ownerPricing.pricing;c=f.customerInputs;Object.assign(c,{roofSqft:300.03,serviceScope:'partial',partialPercent:n('pct'),existingLayers:2});Object.assign(p,{laborPerSqft:{epdm:100.5},membraneCostPerSqft:{epdm:200.25},tearOffPerSqft:{epdm:50.125},membraneWasteFactor:.1});
 }else if(row.family==='roof-footprint'||row.family==='roof-package'){
  f=roof({roofSizeMethod:'footprint',roofSizeInput:n('footprint'),pitchRisePer12:a.rise,pitchBand:'up_to_six'},{laborPerSquare:{asphalt_shingle:10000},materialCostPerSquare:{asphalt_shingle:100},tearOffPerSquare:{asphalt_shingle:100},disposalPerSquare:100,wasteFactorByComplexity:{simple:0,moderate:0,complex:0}});
 if(row.family==='roof-package'){Object.assign(f.ownerPricing.pricing,{underlaymentPriceBasis:{asphalt_shingle:'cost'},scopeDetails:{roof_underlayment_asphalt_shingle:{description:'[SYNTHETIC] measured roof underlayment',mode:'package_cost',productKey:'roof_roll',coverage:n('coverage'),wastePercent:0}},scopeRates:{roof_underlayment_asphalt_shingle:15000}});f.customerInputs.roofUnderlaymentScopeConfirmed=true;}
 }else if(row.family==='plant-count'){
  f=plantingFixture();f.customerInputs.plantsBySize={small:a.count,medium:0,large:0};
 }else if(row.family==='mow-pipeline'){
  f=mowing();p=f.ownerPricing.pricing;c=f.customerInputs;Object.assign(c,{yardSqft:1,bagClippings:true});Object.assign(p,{mowingBaseRatePerSqft:n('rate'),baggingSurchargePercent:10,minimumServiceCharge:a.minimum});
  Object.assign(f.ownerPricing,{peakMonths:[1,10],peakSurchargePercent:10});f.ownerPricing.taxabilityByCategory.disposal=true;
  Object.assign(f.businessDefaults,{taxMode:a.taxMode,taxPercent:a.taxMode==='TAX_NONE'?0:10,markupMode:a.markupMode,markupPercent:20});
 }else if(row.family==='custom-split'){
  f=custom();Object.assign(f.ownerPricing.pricing,{price:a.amount,installedMaterialsPercent:{price:n('share')}});Object.assign(f.ownerPricing,{peakMonths:[1,10],peakSurchargePercent:10});Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:10});
 }else if(row.family==='custom-measured'){
  f=custom();Object.assign(f.ownerPricing.pricing,{unit:'per_sqft',price:100.5});Object.assign(f.customerInputs,{unit:'per_sqft',areaSqft:n('qty')});
 }else throw Error('Unknown family '+row.family);
 return f;
}
