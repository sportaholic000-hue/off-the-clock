// One-time build of corpus-additions-20261118b.json (engine v36): inputs for
// the price-book fields the a9761cc1 engine audit found no frozen input
// exercised (finding 8), and for the fixes of that round (installed decking
// and flat-roof details under labor adjustments). Each input is built from a
// fixture an existing test already checks. Results are recorded as the engine
// computes them; the ones worked by hand are in
// test/qeAuditFixesV36_20261118.spec.mjs. Run once; the output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261118b.mjs [out.json]
import {writeFileSync} from 'node:fs';
import {fixture,flooring,concrete,flatRoof} from '../engine-independent/fixtures.mjs';
import {paint,accessoryRoof,confirmAccessories} from '../qe-agent1-core-accuracy-20261018/fixtures.mjs';
import {corpusInputs} from './fingerprint.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {carpet} from '../../test/quoteFlooring20261016Fixture.mjs';
import {fenceFixture} from '../../test/fenceLaneB20261016Fixture.mjs';
import {FLOORING_ADDONS} from '../../server/quote-engine-vnext/flooringPricing.js';

const rows=[];const add=(id,input)=>rows.push({id:'v36:'+id,input:structuredClone(input)});
const corpus=id=>structuredClone(corpusInputs().find(r=>r.id===id).input);
const set=(f,pricing={},customer={})=>{Object.assign(f.ownerPricing.pricing||f.ownerPricing,pricing);for(const [k,v] of Object.entries(customer)){if(v===undefined)delete f.customerInputs[k];else f.customerInputs[k]=v;}return f;};

// --- Concrete: order increment, short load, saw cuts, gravel base and excavation,
// forming labor, isolation joints, reinforcement and placement.
const FULL_SLAB={readyMixOrderIncrementCubicYards:0.5,shortLoadThresholdCubicYards:5,shortLoadPerYard:5000,controlJointPricing:'excluded',controlJointSpacingFt:10,sawCutPerLF:150,
  baseDepthInches:4,baseCompactionAllowance:0.2,baseGravelPerCubicYard:4500,baseExcavationGradingPerSqft:120,formingLaborPricing:'per_linear_foot',formingLaborPerLF:200,
  isolationJointPricing:'per_linear_foot',isolationJointPerLF:300,placementFlat:{pump:50000},placementPerCubicYard:{pump:2000,power_buggy:3000}};
add('concrete-patio-full-rebar-pump',set(concrete(),FULL_SLAB,{reinforcement:'rebar',chuteAccess:'no',placementMethod:'pump',adjoinsExistingConcrete:true,adjoiningEdgeLF:20}));
add('concrete-patio-flat-short-load-wire-buggy',set(concrete(),{...FULL_SLAB,shortLoadPerYard:undefined,shortLoadFlatFee:15000,placementFlat:undefined,placementPerCubicYard:{power_buggy:3000}},{reinforcement:'wire_mesh',chuteAccess:'no',placementMethod:'power_buggy'}));
{const f=set(concrete(),FULL_SLAB,{reinforcement:'rebar',finishType:'stamped',chuteAccess:'yes'});f.serviceType=f.ownerPricing.serviceType=f.ownerPricing.origin.serviceType='CONCRETE_DRIVEWAY';add('concrete-driveway-stamped-rebar',f);
  const g=structuredClone(f);Object.assign(g.customerInputs,{chuteAccess:'no',placementMethod:'pump',adjoinsExistingConcrete:true,adjoiningEdgeLF:20});add('concrete-driveway-pump-isolation',g);}

// --- Flat roof: every separately priced detail, installed deck replacement, additional layers.
const DETAILS={flatRoofDeckPerSheet:[9500,60,'deckSheets',4],flatRoofEdgeMetalPerLF:[1000,40,'edgeMetalLF',20],flatRoofWallFlashingPerLF:[1500,50,'wallFlashingLF',10],
  flatRoofPenetrationEach:[5000,70,'penetrationCount',2],flatRoofCurbEach:[20000,50,'curbCount',1],flatRoofDrainEach:[30000,50,'drainCount',1]};
function detailedFlatRoof(access){
  const f=corpus('v29:flat-roof-installed-insulation-difficult-access'),p=f.ownerPricing.pricing;
  p.flatRoofDeckPriceBasis='installed';p.installedLaborPercent={...p.installedLaborPercent};p.installedMaterialsPercent={...(p.installedMaterialsPercent||{})};
  for(const [rate,[price,labor,field,quantity]] of Object.entries(DETAILS)){p[rate]=price;p.installedLaborPercent[rate]=labor;if(rate!=='flatRoofDeckPerSheet')p.installedMaterialsPercent[rate]=100-labor;f.customerInputs[field]=quantity;}
  f.customerInputs.accessDifficulty=access;return f;
}
for(const access of ['easy','moderate','difficult'])add('flat-roof-every-detail-installed-deck-'+access,detailedFlatRoof(access));
{const f=detailedFlatRoof('easy');f.ownerPricing.pricing.flatRoofAdditionalLayerFactor=0.5;f.customerInputs.existingLayers=2;add('flat-roof-two-layers-additional-layer-factor',f);}
{const f=detailedFlatRoof('moderate');delete f.ownerPricing.pricing.installedLaborPercent.flatRoofDrainEach;add('flat-roof-drain-no-labor-portion-moderate',f);}

// --- Roofing: installed and material-only decking, ice and water barrier by area,
// flashing and vents, pitch adders over 12/12, bundles, the unknown-pitch band.
function deckedRoof(stories,{labor=50,basis='installed'}={}){
  const f=corpus('v29:priced-roofing-earlier-rules'),p=f.ownerPricing.pricing;
  Object.assign(p,{deckingPriceBasis:basis,deckingPerSheet:6000});
  if(basis==='installed'&&labor!==null)Object.assign(p,{installedLaborPercent:{...(p.installedLaborPercent||{}),deckingPerSheet:labor},installedMaterialsPercent:{...(p.installedMaterialsPercent||{}),deckingPerSheet:100-labor}});
  Object.assign(f.customerInputs,{deckingSheets:5,stories});return f;
}
for(const stories of [1,2,3])add('roof-installed-decking-stories-'+stories,deckedRoof(stories));
add('roof-material-only-decking-stories-3',deckedRoof(3,{basis:'material_only'}));
add('roof-installed-decking-no-labor-portion-stories-2',deckedRoof(2,{labor:null}));
{const f=confirmAccessories(accessoryRoof({accessoryPricingMode:'itemized',materialAccessoryBasis:'excludes_itemized_accessories_flashing_vents',starterPerLF:150,dripEdgePerLF:200,ridgeCapPerLF:400,
  iceWaterBarrierUnit:'square_feet',iceWaterBarrierPerSqft:300,valleyPerLF:900,stepFlashingPerLF:1100,pipeJackEach:7500,ridgeVentPerLF:1200}));
  Object.assign(f.customerInputs,{starterLengthLF:120,dripEdgeLengthLF:120,ridgeCapLengthLF:30,iceWaterBarrierSqft:300,valleyLengthLF:20,stepFlashingLengthLF:16,pipeJackCount:2,ridgeVentLengthLF:30});
  add('roof-itemized-accessories-flashing-vents-ice-water-by-area',f);}
{const f=corpus('v29:priced-roofing-earlier-rules');f.ownerPricing.pricing.bundlesPerSquare={asphalt_shingle:3};add('roof-bundles-per-square',f);}
{const f=confirmAccessories(accessoryRoof({accessoryPricingMode:'itemized',materialAccessoryBasis:'excludes_itemized_accessories_flashing_vents',starterPerLF:150,dripEdgePerLF:200,ridgeCapPerLF:400,
  iceWaterBarrierUnit:'linear_feet',iceWaterBarrierPerLF:900,valleyPerLF:900,stepFlashingPerLF:1100,pipeJackEach:7500,ridgeVentPerLF:1200}));
  Object.assign(f.customerInputs,{starterLengthLF:120,dripEdgeLengthLF:120,ridgeCapLengthLF:30,iceWaterBarrierLengthLF:60,valleyLengthLF:20,stepFlashingLengthLF:16,pipeJackCount:2,ridgeVentLengthLF:30});
  add('roof-ice-water-barrier-by-length',f);}
// New roof rules (adopted): a whole roof over 12/12, and an unknown pitch quoted at the owner's band.
{const f=corpus('geometry:roof-footprint-0141');Object.assign(f.ownerPricing.pricing,{pitchInstallationAdderOverTwelve:0.5,pitchRemovalAdderOverTwelve:0.6,roofBuildingCode:'irc',roofProductClass:{asphalt_shingle:'asphalt_shingle'},roofProductMinSlope:{asphalt_shingle:2}});
  Object.assign(f.customerInputs,{roofSizeMethod:'roof_measured',roofSizeInput:2000,pitchBand:'over_twelve',pitchRisePer12:14});add('roof-whole-roof-over-twelve',f);}
{const f=corpus('geometry:roof-footprint-0141');Object.assign(f.ownerPricing.pricing,{unknownPitchBand:'seven_to_nine',roofBuildingCode:'irc',roofProductClass:{asphalt_shingle:'asphalt_shingle'},roofProductMinSlope:{asphalt_shingle:2}});
  Object.assign(f.customerInputs,{roofSizeMethod:'roof_measured',roofSizeInput:2000,pitchMethod:'not_sure',pitchBand:undefined,pitchRisePer12:undefined});
  for(const k of Object.keys(f.customerInputs))if(f.customerInputs[k]===undefined)delete f.customerInputs[k];add('roof-unknown-pitch-owner-band',f);}

// --- Flooring extras: underlayment, transitions, baseboard, furniture, toilets,
// diagonal and herringbone, carpet roll and repeat.
{const f=flooring('tile',200),p=f.ownerPricing.pricing;
  for(const addon of FLOORING_ADDONS){p[addon.rate]=addon.rate==='furnitureMovingPrice'?2500:3000;if(addon.installed){p.installedLaborPercent={...(p.installedLaborPercent||{}),[addon.rate]:60};p.installedMaterialsPercent={...(p.installedMaterialsPercent||{}),[addon.rate]:40};}}
  p.floorLevelingMaxDepthInches=0.25;p.furnitureMovingPriceUnit='per_room';
  Object.assign(f.customerInputs,{baseboardReinstallLF:60,transitionCount:2,furnitureMovingNeeded:true,furnitureMovingRoomCount:2,toiletPullResetCount:1,floorLevelingNeeded:true,floorLevelingSqft:20});
  add('flooring-every-addon',f);}
for(const [pattern,prefix] of [['diagonal_or_pattern','diagonal'],['herringbone_or_chevron','herringbone']]){
  const f=flooring('tile',200);Object.assign(f.ownerPricing.pricing,{[prefix+'LaborMultiplierByType']:{tile:1.25},[prefix+'WasteAdderByType']:{tile:0.05}});f.customerInputs.layoutPattern=pattern;add('flooring-'+prefix+'-by-type',f);}
{const f=flooring('tile',200);f.ownerPricing.pricing.patternWasteAdder={straight:0,diagonal_or_pattern:0.07};f.customerInputs.layoutPattern='diagonal_or_pattern';add('flooring-pattern-waste-fallback',f);}
add('carpet-roll-12-repeat-2',carpet([{lengthFt:12,widthFt:14},{lengthFt:10,widthFt:11}],12,2));
add('carpet-roll-15',carpet([{lengthFt:14,widthFt:14}],15));
{const f=flooring('vinyl_plank',200);Object.assign(f.ownerPricing.pricing,{vinylPlankUnderlaymentRule:'always_included',underlaymentPerSqft:75,underlaymentPriceBasis:'installed_area_sell_price',installedLaborPercent:{underlaymentPerSqft:40},installedMaterialsPercent:{underlaymentPerSqft:60}});add('flooring-vinyl-plank-underlayment-always',f);}

// --- Fencing: offerings with height rows and gates, itemized and installed.
for(const mode of ['itemized','installed'])add('fence-offering-'+mode,fenceFixture(mode));

// --- Painting: settings, surface extras, condition preparation, exterior preparation hours.
{const f=paint();f.customerInputs.trimIncluded=false;for(const k of ['trimLengthLF','trimSurfaceCondition','trimCoats'])delete f.customerInputs[k];Object.assign(f.customerInputs,{surfaceOptionalItems:['doorSides'],paintDoorSides:2});
  Object.assign(f.ownerPricing.pricing,{surfaceExtraRates:{doorSides:10000},installedLaborPercent:{'surfaceExtraRates.doorSides':30},installedMaterialsPercent:{'surfaceExtraRates.doorSides':40}});add('interior-paint-surface-extra-door-sides',f);}
add('interior-paint-trim-condition-prep',paint());
// Exterior extras are surface extras (exterior trim, soffit, fascia, windows, power washing).
{const f=offeringFixture('EXTERIOR_PAINTING','itemized'),p=f.ownerPricing.pricing;
  p.paintingSettings={soffitUnit:'linear_feet'};p.surfaceExtraRates={exteriorTrim:300,soffit:400,fascia:350,windows:4500,powerWashing:25};
  p.installedLaborPercent={...(p.installedLaborPercent||{})};p.installedMaterialsPercent={...(p.installedMaterialsPercent||{})};
  for(const key of Object.keys(p.surfaceExtraRates)){p.installedLaborPercent['surfaceExtraRates.'+key]=70;p.installedMaterialsPercent['surfaceExtraRates.'+key]=30;}
  Object.assign(f.customerInputs,{surfaceOptionalItems:['exteriorTrim','soffit','fascia','windows','powerWashing'],exteriorTrimLengthLF:80,soffitQuantity:60,fasciaLengthLF:60,paintWindows:6,powerWashingAreaSqft:1200});
  add('exterior-paint-surface-extras',f);}
for(const type of ['INTERIOR_PAINTING','EXTERIOR_PAINTING']){
  // At exactly two coats the ratio cancels (2/(1+r) + 2r/(1+r) = 2), so three coats.
  const f=offeringFixture(type,'itemized');f.ownerPricing.pricing.paintingSettings={wallAdditionalCoatRatio:0.8};f.customerInputs.coats=3;
  if(type==='INTERIOR_PAINTING')Object.assign(f.customerInputs,{ceilingCoats:2,ceilingSurfaceCondition:'fair',trimCoats:1,trimSurfaceCondition:'good'});add((type==='INTERIOR_PAINTING'?'interior':'exterior')+'-paint-itemized-additional-coat-ratio',f);
  const g=offeringFixture(type,'installed');add((type==='INTERIOR_PAINTING'?'interior':'exterior')+'-paint-installed',g);}
{const f=offeringFixture('INTERIOR_PAINTING','itemized');Object.assign(f.ownerPricing.pricing.offeringRates,{prepLaborPerSqft_poor:50,prepMaterialPerSqft_poor:20});f.customerInputs.surfaceCondition='poor';add('interior-paint-itemized-poor-preparation',f);}

const out=process.argv[2]?new URL(process.argv[2],'file://'+process.cwd()+'/'):new URL('./corpus-additions-20261118b.json',import.meta.url);
writeFileSync(out,JSON.stringify(rows,null,1)+'\n');
console.log(rows.length+' inputs written');
