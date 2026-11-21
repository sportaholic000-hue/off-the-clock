import {writeFileSync} from 'node:fs';
import {fixture,flooring,concrete,flatRoof,TILE_ON_CONCRETE_SLAB} from '../engine-independent/fixtures.mjs';

// November 21, 2026 (v42): the wrong prices and false holds confirmed in the
// audits of v41, and the two defaults changed before launch.
const cases=[];
const add=(id,input)=>cases.push({id:'v42-20261121:'+id,input:structuredClone(input)});
const D=f=>f.businessDefaults,O=f=>f.ownerPricing;
const season=f=>{delete O(f).peakMonths;delete O(f).peakSurchargePercent;Object.assign(D(f),{peakMonths:[7],peakSurchargePercent:10});f.customerInputs.workMonth='july';return f;};

// Carpet: a room no wider than the roll takes one width.
const PAD={scopeDetails:{floor_underlayment_carpet:{description:'[SYNTHETIC] Carpet pad',mode:'installed_area_sell_price'}},scopeRates:{floor_underlayment_carpet:80}};
const carpet=(rooms,p={})=>fixture('FLOORING_INSTALL',{laborPerSqft:{carpet:100},materialPerSqft:{carpet:300},minimumJob:0,vinylPlankUnderlaymentRule:'never_included',carpetRollWidthFt:12,carpetCrossgrainSeams:'not_allowed',...PAD,...p},
  {sqft:rooms.reduce((s,r)=>s+r.lengthFt*r.widthFt,0),sqftMethod:'exact',newFlooringType:'carpet',existingFloorType:'none',removalNeeded:false,roomCount:rooms.length,layoutPattern:'straight',stairSteps:0,carpetRooms:rooms,carpetConnectedAreas:[],underlaymentScopeConfirmed:true});
add('carpet-12x12',carpet([{lengthFt:12,widthFt:12}]));
add('carpet-12x12-fills-allowed',carpet([{lengthFt:12,widthFt:12}],{carpetCrossgrainSeams:'allowed'}));
add('carpet-12x15',carpet([{lengthFt:12,widthFt:15}]));
add('carpet-hall-3x12',carpet([{lengthFt:12,widthFt:3}]));
add('carpet-hall-3x20',carpet([{lengthFt:20,widthFt:3}]));
add('carpet-12.5x12',carpet([{lengthFt:12.5,widthFt:12}]));
add('carpet-two-rooms-12x12-and-10x11',carpet([{lengthFt:12,widthFt:12},{lengthFt:10,widthFt:11}]));

// Furniture moving priced in one tier only.
{const f=fixture('FLOORING_INSTALL',{laborPerSqft:{tile:600},materialPerSqft:{tile:600},minimumJob:0},{sqft:500,sqftMethod:'exact',newFlooringType:'tile',existingFloorType:'none',removalNeeded:false,roomCount:2,layoutPattern:'straight',stairSteps:0,furnitureMovingNeeded:true,...TILE_ON_CONCRETE_SLAB});
 O(f).tiers=[{name:'Basic',overrides:{materialPerSqft:{tile:400}}},{name:'Full',overrides:{furnitureMovingPrice:20000,furnitureMovingPriceUnit:'flat'}}];add('furniture-moving-full-tier-only',f);}

// A bare deck: no old roof material needed.
const roof=(c={})=>{const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:15000},materialCostPerSquare:{asphalt_shingle:13000},tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:2500},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},bundlesPerSquare:{asphalt_shingle:3},partialPackagePricing:'whole_packages',disposalPerSquare:2000,accessoryPricingMode:'per_square_allin',minimumJob:0},
  {roofSizeMethod:'roof_measured',roofSizeInput:2400,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...c});
  O(f).startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};return f;};
const withoutOld=(f,key)=>{delete f.customerInputs[key];if(f.customerInputs.confirmedFacts){delete f.customerInputs.confirmedFacts[key];if(!Object.keys(f.customerInputs.confirmedFacts).length)delete f.customerInputs.confirmedFacts;}return f;};
add('roof-bare-deck-no-old-material',withoutOld(roof({existingLayers:0}),'existingRoofType'));
add('roof-bare-deck-two-storey-steep',withoutOld(roof({existingLayers:0,stories:2,pitchBand:'ten_to_twelve'}),'existingRoofType'));
add('roof-one-layer-no-old-material',withoutOld(roof(),'existingRoofType'));
{const f=flatRoof();f.customerInputs.existingLayers=0;add('flat-roof-bare-deck-no-old-membrane',withoutOld(f,'membraneType'));}

// Multi-storey footprint: the ground-floor question.
add('roof-footprint-1600-two-storey-unconfirmed',roof({roofSizeMethod:'footprint',roofSizeInput:1600,stories:2,pitchRisePer12:6}));
add('roof-footprint-1600-two-storey-confirmed',roof({roofSizeMethod:'footprint',roofSizeInput:1600,stories:2,pitchRisePer12:6,footprintGroundFloorOnly:true}));

// Busy season on the labor inside a combined preparation price; tax by source.
const sod=(p,c={})=>fixture('LANDSCAPING_SOD',{sodMaterialPerSqft:55,sodInstallLaborPerSqft:60,minimumServiceCharge:0,sodPalletSizeSqft:450,partialPackagePricing:'whole_packages',topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:2,...p},{sodSqft:1000,sqftMethod:'exact',groundPrepNeeded:true,existingLawnToRemove:true,slope:'flat',accessDifficulty:'easy',...c});
add('season-sod-combined-prep-70',season(sod({groundPrepPerSqft:150,groundPrepLaborPercent:70})));
add('season-sod-combined-prep-70-slope-access',season(sod({groundPrepPerSqft:150,groundPrepLaborPercent:70},{slope:'moderate',accessDifficulty:'difficult'})));
add('season-sod-combined-prep-no-share',season(sod({groundPrepPerSqft:150})));
{const f=season(sod({groundPrepPerSqft:150,groundPrepLaborPercent:70}));D(f).markupPercent=20;O(f).priceBasisByCategory.prep='sell_price';add('season-sod-combined-prep-selling-price-markup',f);}
{const f=season(sod({groundPrepPerSqft:150,groundPrepLaborPercent:70}));D(f).taxMode='TAX_MATERIALS';D(f).taxPercent=10;for(const k of Object.keys(O(f).taxabilityByCategory))O(f).taxabilityByCategory[k]=k==='prep';add('season-sod-combined-prep-tax-prep-only',f);}
{const f=concrete();O(f).pricing.basePrepLaborPercent=60;add('season-concrete-base-prep-60',season(f));}
{const f=season(roof());D(f).taxMode='TAX_MATERIALS';D(f).taxPercent=10;for(const k of Object.keys(O(f).taxabilityByCategory))O(f).taxabilityByCategory[k]=k==='removal';add('season-roof-removal-taxable-only',f);}

// Zero imported topsoil is not listed as included.
add('sod-typical-import-zero-not-sure',sod({sodRemovalPerSqft:75,sodGradingPerSqft:60,topsoilPerCubicYard:4000,topsoilTypicalImportDepthInches:0},{usableTopsoilDepthInches:'unknown'}));

// Travel and permit fees and the job minimum.
for(const treatment of [undefined,'fees_in_minimum','travel_permit_on_top']){
  const f=fixture('FLOORING_INSTALL',{laborPerSqft:{tile:100},materialPerSqft:{tile:100},minimumJob:0},{sqft:50,sqftMethod:'exact',newFlooringType:'tile',existingFloorType:'none',removalNeeded:false,roomCount:1,layoutPattern:'straight',stairSteps:0,...TILE_ON_CONCRETE_SLAB});
  Object.assign(D(f),{minimumJobPrice:60000,travelFee:15000,permitFee:20000});O(f).feeRules={...O(f).feeRules,travel:'always',permit:'always'};if(treatment)D(f).minimumFeeTreatment=treatment;
  add('minimum-fees-'+(treatment||'no-choice'),f);
}

// Pump placement by volume in the book's ready-mix unit.
for(const unit of ['cubic_metre','cubic_yard']){const f=concrete();Object.assign(O(f).pricing,{readyMixUnit:unit,placementPerCubicYard:{pump:1000},placementFlat:{pump:20000},defaultPlacementMethod:'pump'});Object.assign(f.customerInputs,{chuteAccess:'no',placementMethod:'pump'});add('pump-by-volume-'+unit,f);}

// Tax choices the tax mode does not read.
for(const mode of ['TAX_ALL','TAX_NONE','TAX_MATERIALS']){const f=flooring('tile');D(f).taxMode=mode;D(f).taxPercent=mode==='TAX_NONE'?0:10;delete O(f).taxabilityByCategory;add('tax-choices-blank-'+mode,f);}
writeFileSync(new URL('./corpus-additions-20261121-v42.json',import.meta.url),JSON.stringify(cases,null,2)+'\n');
console.log(cases.length);
