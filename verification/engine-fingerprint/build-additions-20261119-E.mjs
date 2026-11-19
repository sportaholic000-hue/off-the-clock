// One-time build of corpus-additions-20261119-E.json: inputs for the November 19
// painting and siding fixes (lane E) that no frozen input reaches: trim coats on
// the basic painting setup (E1), story adjustment of soffit, fascia and exterior
// trim prices (E2), wall coats per room (E3), wall colors bought by the can (E4),
// the door and window note on packaged paint (E5), preparation bought for each
// surface condition (E7) and separate siding labor and material areas (E8).
// Each input is built from a fixture an existing test already checks. Results
// are recorded as the engine computes them; the ones worked by hand are in
// test/qeLaunchE_20261119.spec.mjs. Run once; the output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261119-E.mjs [out.json]
import {writeFileSync} from 'node:fs';
import {fixture,siding} from '../engine-independent/fixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';

const rows=[];const add=(id,input)=>rows.push({id:'e20261119:'+id,input:structuredClone(input)});
const purchase=(productKey,coverage)=>({mode:'package_cost',productKey,coverage,wastePercent:10});
const packaged=(f,scopes)=>{const p=f.ownerPricing.pricing;f.ownerPricing.priceBasisByCategory.material='cost';p.scopeDetails={...(p.scopeDetails||{})};p.scopeRates={...(p.scopeRates||{})};
  for(const [key,productKey,coverage,rate] of scopes){p.scopeDetails[key]={description:'[SYNTHETIC] Explicitly defined '+key,...purchase(productKey,coverage)};p.scopeRates[key]=rate;}
  f.customerInputs.paintProductsConfirmed=true;return f;};
const basicInterior=(customer={})=>{const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0,trimLaborPerLF:150,trimMaterialPerLF:10},
  {areaInputMethod:'wall_sqft',wallAreaSqft:800,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false,...customer});
  f.ownerPricing.priceBasisByCategory.material='sell_price';return f;};
const rooms=(f,list,extra={})=>{const c=f.customerInputs;for(const k of ['wallAreaSqft','ceilingAreaSqft','wallScopeUniform','doorCount','windowCount'])delete c[k];Object.assign(c,{areaInputMethod:'room_dimensions',rooms:list,...extra});return f;};
const ROOMS=[{lengthFeet:12,widthFeet:14,heightFeet:8,doorCount:1,windowCount:2},{lengthFeet:10,widthFeet:10,heightFeet:8,doorCount:1,windowCount:1,coats:3}];

// --- E1: trim coats on the basic setup.
add('interior-basic-trim-two-coats',basicInterior({trimIncluded:true,trimLengthLF:200,trimCoats:2}));
add('interior-basic-trim-one-coat',basicInterior({trimIncluded:true,trimLengthLF:200,trimCoats:1}));
add('interior-basic-trim-three-coats',basicInterior({trimIncluded:true,trimLengthLF:200,trimCoats:3}));
add('interior-basic-trim-coats-not-given',basicInterior({trimIncluded:true,trimLengthLF:200}));
add('interior-basic-trim-cans-three-coats',packaged(basicInterior({trimIncluded:true,trimLengthLF:200,trimCoats:3,wallColorCount:1}),[['paint_wall','wall',400,5000],['paint_trim','trim',100,2000]]));
{const f=offeringFixture('INTERIOR_PAINTING','installed');add('interior-installed-trim-price-no-trim-coats',f);}

// --- E2: soffit, fascia and exterior trim take the stories on their labor share.
function sidingExtras(stories,labor=60){
  const f=siding(),p=f.ownerPricing.pricing;p.surfaceExtraRates={soffit:900,fascia:700};p.sidingSettings={soffitUnit:'linear_feet'};
  if(labor!==null){p.installedLaborPercent={'surfaceExtraRates.soffit':labor,'surfaceExtraRates.fascia':labor};p.installedMaterialsPercent={'surfaceExtraRates.soffit':100-labor,'surfaceExtraRates.fascia':100-labor};}
  Object.assign(f.customerInputs,{stories,surfaceOptionalItems:['soffit','fascia'],soffitQuantity:150,fasciaLengthLF:150});return f;
}
for(const stories of [1,2,3])add('siding-soffit-fascia-stories-'+stories,sidingExtras(stories));
add('siding-soffit-fascia-no-labor-portion-stories-3',sidingExtras(3,null));
add('siding-soffit-fascia-no-labor-portion-stories-1',sidingExtras(1,null));
function exteriorExtras(stories,labor=60){
  const f=offeringFixture('EXTERIOR_PAINTING','itemized'),p=f.ownerPricing.pricing;
  p.paintingSettings={soffitUnit:'linear_feet'};p.surfaceExtraRates={exteriorTrim:300,soffit:300,fascia:250,windows:4500,doors:9000,shutters:3000,garageDoors:20000,powerWashing:25};
  p.installedLaborPercent={...(p.installedLaborPercent||{})};p.installedMaterialsPercent={...(p.installedMaterialsPercent||{})};
  for(const key of Object.keys(p.surfaceExtraRates))if(labor!==null){p.installedLaborPercent['surfaceExtraRates.'+key]=labor;p.installedMaterialsPercent['surfaceExtraRates.'+key]=100-labor;}
  Object.assign(f.customerInputs,{stories,surfaceOptionalItems:Object.keys(p.surfaceExtraRates),exteriorTrimLengthLF:150,soffitQuantity:150,fasciaLengthLF:150,paintWindows:6,paintDoors:2,paintShutters:4,paintGarageDoors:1,powerWashingAreaSqft:1200});
  return f;
}
for(const stories of [1,2,3])add('exterior-paint-every-extra-stories-'+stories,exteriorExtras(stories));
add('exterior-paint-every-extra-no-labor-portion-stories-3',exteriorExtras(3,null));
{const f=offeringFixture('EXTERIOR_PAINTING','installed'),p=f.ownerPricing.pricing;p.paintingSettings={soffitUnit:'linear_feet'};p.surfaceExtraRates={soffit:300};
  p.installedLaborPercent={...p.installedLaborPercent,'surfaceExtraRates.soffit':60};p.installedMaterialsPercent={...p.installedMaterialsPercent,'surfaceExtraRates.soffit':40};
  Object.assign(f.customerInputs,{stories:3,surfaceOptionalItems:['soffit'],soffitQuantity:150});add('exterior-paint-installed-soffit-stories-3',f);}

// --- E3: wall coats room by room.
add('interior-basic-rooms-own-coats',rooms(basicInterior(),ROOMS));
add('interior-basic-rooms-coats-equal-job',rooms(basicInterior(),ROOMS.map(r=>({...r,coats:2}))));
add('interior-basic-rooms-mixed-coats-outside-opening',rooms(basicInterior(),ROOMS,{largeOpenings:[{widthFeet:6,heightFeet:7}]}));
{const f=rooms(offeringFixture('INTERIOR_PAINTING','itemized'),ROOMS,{ceilingsIncluded:true,ceilingCoats:2,ceilingSurfaceCondition:'fair',trimIncluded:false});delete f.customerInputs.trimLengthLF;add('interior-itemized-rooms-own-coats-ceilings',f);}
{const f=rooms(offeringFixture('INTERIOR_PAINTING','installed'),ROOMS,{ceilingsIncluded:false,trimIncluded:false});delete f.customerInputs.trimLengthLF;add('interior-installed-rooms-coats-differ-from-offering',f);}
{const f=rooms(offeringFixture('INTERIOR_PAINTING','installed'),ROOMS.map(r=>({...r,coats:2})),{ceilingsIncluded:false,trimIncluded:false});delete f.customerInputs.trimLengthLF;add('interior-installed-rooms-coats-match-offering',f);}
add('interior-basic-direct-area-mixed-coats',basicInterior({wallScopeUniform:false}));

// --- E4 and E5: wall colors bought by the can; door and window note.
for(const colors of [1,2,3])add('interior-cans-wall-colors-'+colors,packaged(basicInterior({wallAreaSqft:400,doorCount:2,windowCount:2,wallColorCount:colors}),[['paint_wall','paint',400,5000]]));
add('interior-cans-wall-colors-not-given',packaged(basicInterior({wallAreaSqft:400,doorCount:2,windowCount:2}),[['paint_wall','paint',400,5000]]));
add('interior-cans-rooms-own-colors',packaged(rooms(basicInterior(),[{lengthFeet:20,widthFeet:15,heightFeet:8,doorCount:1,windowCount:2,wallColor:1},{lengthFeet:12,widthFeet:10,heightFeet:8,doorCount:1,windowCount:1,wallColor:1},{lengthFeet:8,widthFeet:6,heightFeet:8,doorCount:1,windowCount:0,wallColor:2}],{wallColorCount:2}),[['paint_wall','paint',400,5000]]));
add('interior-cans-rooms-colors-split-evenly',packaged(rooms(basicInterior(),[{lengthFeet:20,widthFeet:15,heightFeet:8,doorCount:1,windowCount:2},{lengthFeet:12,widthFeet:10,heightFeet:8,doorCount:1,windowCount:1},{lengthFeet:8,widthFeet:6,heightFeet:8,doorCount:1,windowCount:0}],{wallColorCount:2}),[['paint_wall','paint',400,5000]]));
add('interior-cans-rooms-some-colors-missing',packaged(rooms(basicInterior(),[{lengthFeet:20,widthFeet:15,heightFeet:8,doorCount:1,windowCount:2,wallColor:1},{lengthFeet:12,widthFeet:10,heightFeet:8,doorCount:1,windowCount:1}],{wallColorCount:2}),[['paint_wall','paint',400,5000]]));
{const f=offeringFixture('INTERIOR_PAINTING','itemized');packaged(f,[['paint_wall','finish',400,5000],['paint_ceiling','finish',400,5000],['paint_primer','primer',400,4000],['paint_ceiling_primer','primer',400,4000],['paint_prep','prep',100,2000]]);
  f.customerInputs.wallColorCount=2;add('interior-itemized-cans-two-wall-colors-shared-ceiling-product',f);}
{const f=offeringFixture('EXTERIOR_PAINTING','itemized');packaged(f,[['paint_wall','body',350,6000],['paint_primer','primer',400,4000],['paint_prep','prep',100,2000]]);
  Object.assign(f.customerInputs,{wallColorCount:2,exteriorAreaSqft:1200});add('exterior-itemized-cans-two-wall-colors',f);}

// --- E7: preparation bought for each surface condition.
function prepByCondition(perCondition,ceilingCondition='good'){
  const f=offeringFixture('INTERIOR_PAINTING','itemized');Object.assign(f.ownerPricing.pricing.offeringRates,{prepLaborPerSqft_good:50,prepMaterialPerSqft_good:10,prepLaborPerSqft_poor:150,prepMaterialPerSqft_poor:30});
  packaged(f,[['paint_wall','finish',400,5000],['paint_ceiling','finish',400,5000],['paint_primer','primer',400,4000],['paint_ceiling_primer','primer',400,4000],['paint_prep','prep',100,2000],...(perCondition?[['paint_prep_fair','prep',60,2000],['paint_prep_good','prep',300,2000]]:[])]);
  Object.assign(f.customerInputs,{wallColorCount:1,ceilingSurfaceCondition:ceilingCondition,trimIncluded:false});delete f.customerInputs.trimLengthLF;return f;
}
add('interior-itemized-cans-prep-shared',prepByCondition(false));
add('interior-itemized-cans-prep-by-condition',prepByCondition(true));
add('interior-itemized-cans-prep-by-condition-same-condition',prepByCondition(true,'fair'));
add('interior-itemized-cans-prep-by-condition-falls-back-for-poor',prepByCondition(true,'poor'));

// --- E8: siding labor and material areas.
function sidingAreas(settings,customer){const f=siding();f.ownerPricing.pricing.sidingSettings=settings;delete f.customerInputs.sidingAreaSqft;Object.assign(f.customerInputs,customer);return f;}
const BUILDING={areaInputMethod:'building_dimensions',buildingPerimeterFeet:160,wallHeightFeet:10,doorCount:2,windowCount:10,garageDoorCount:1,garageDoorWidthFeet:16,garageDoorHeightFeet:7,gables:[{widthFeet:30,heightFeet:6}]};
for(const [labor,material] of [['openings_left_in','openings_subtracted'],['openings_left_in','large_openings_subtracted'],['large_openings_subtracted','openings_subtracted'],['openings_subtracted','openings_left_in']])
  add('siding-building-labor-'+labor+'-material-'+material,sidingAreas({areaConventionByType:{vinyl:labor},materialAreaConventionByType:{vinyl:material}},BUILDING));
add('siding-building-material-convention-not-chosen',sidingAreas({areaConventionByType:{vinyl:'openings_left_in'}},BUILDING));
add('siding-direct-differing-conventions-with-openings',sidingAreas({areaConventionByType:{vinyl:'openings_left_in'},materialAreaConventionByType:{vinyl:'openings_subtracted'}},{areaInputMethod:'sqft',sidingAreaSqft:1600,doorCount:2,windowCount:10,garageDoorCount:0}));
add('siding-direct-differing-conventions-openings-not-given',sidingAreas({areaConventionByType:{vinyl:'openings_left_in'},materialAreaConventionByType:{vinyl:'openings_subtracted'}},{areaInputMethod:'sqft',sidingAreaSqft:1600}));
add('siding-direct-same-conventions',sidingAreas({areaConventionByType:{vinyl:'openings_subtracted'},materialAreaConventionByType:{vinyl:'openings_subtracted'}},{areaInputMethod:'sqft',sidingAreaSqft:1600}));

const out=process.argv[2]?new URL(process.argv[2],'file://'+process.cwd()+'/'):new URL('./corpus-additions-20261119-E.json',import.meta.url);
writeFileSync(out,JSON.stringify(rows,null,1)+'\n');
console.log(rows.length+' inputs written');
